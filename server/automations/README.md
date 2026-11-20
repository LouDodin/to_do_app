# Vikunja Automation

> **Since 10 Oct 2026 these automations are split between two machines** (see `docs/AUTOMATIONS.md`):
> - **PC** (`Documents\todo-server\automations`, role `server`): sections 1-10 (labels, dates, pending
>   projects, saved filters, daily label merge). Runs 24/7 next to Vikunja as the scheduled task
>   "Tasks automations" (`run_poller.py`). Token: `state\automation-token.txt`. State:
>   `state\automations\`. Log: `logs\automations.log`. Problems reach the hourly health check (Windows
>   notification, app banner, phone).
> - **Mac** (`~/vikunja-automation`, role `folders`): section 11 (project folders) and the weekly report,
>   because the folders are on the Mac.
>
> The rest of this README describes the automations themselves and is still accurate; the paths,
> LaunchAgents and macOS notifications it mentions are the Mac side.


A background service that watches your Vikunja instance and applies a set
of small GTD-style automations. Runs continuously on this Mac via a
macOS LaunchAgent — no changes needed on the Vikunja/Docker side beyond
API access.

**This file is kept up to date whenever the automation changes — check
here first before re-reading the script.**

## How it works (architecture)

- **Polling, not webhooks.** Vikunja's webhook feature was tried first,
  but Vikunja has a built-in SSRF protection that blocks it from
  delivering to `host.docker.internal` (which resolves to a private
  `192.168.0.0/16` address from inside the Docker container). That's a
  deliberate security feature, not something to work around — so the
  script instead **polls the Vikunja API once every 60 seconds**
  (`POLL_INTERVAL_SECONDS` in the script) asking "what changed since I
  last checked?".
- Runs as a single long-lived Python process (`webhook_listener.py` —
  name is a holdover from the original webhook attempt, kept so the
  LaunchAgent plist doesn't need updating).
- Managed by launchd: `~/Library/LaunchAgents/com.loudodin.vikunja-automation.plist`,
  set to `RunAtLoad` + `KeepAlive`, so it starts on login and restarts if
  it crashes.
- Logs everything to `/tmp/vikunja_automation.log` (NOT persistent
  across reboots — state that needs to persist lives in
  `~/vikunja-automation/` instead, see below).

## State files (in this folder)

- `last_check.txt` — ISO timestamp (`YYYY-MM-DDTHH:MM:SSZ`) of the last
  successful poll. Drives the "what's changed since last time" queries.
  Deleting this file resets the checkpoint to "now" on next run.
- `weekly_last_run.txt` — ISO date of the last weekly report run. If
  missing, the weekly checks run immediately on next poll.
- `/Users/loudodin/Partage_One_plus_nord_CE_2/areas/report_<date>.txt` —
  output of the weekly checks (see below). Deliberately written outside
  this folder, into the shared `areas` folder, so the reports are
  visible/synced alongside your other areas.
- `heartbeat.txt` — ISO timestamp written unconditionally at the end of
  **every** poll cycle, success or failure. Checked by `watchdog.py`
  (see #12) to detect the poller having stopped entirely.
- `errors.log` — every problem reported via `notify_error()`, one line
  each, kept separate from the much noisier main log so you can `tail`
  or grep just the problems (see #12).
- `notify_last_sent.json` / `watchdog_last_sent.json` — when each
  distinct problem was last notified about, so repeat notifications for
  the same ongoing issue are rate-limited to once per 30 minutes rather
  than spamming every poll (see #12).

## API token

Uses the Vikunja "Full Access" personal API token (covers Tasks,
Filters, Projects, Caldav, Feeds — everything the script could ever
need). Stored in plaintext in `webhook_listener.py` as `API_TOKEN`.

History: this started as a narrowly-scoped Tasks-only token, then a
second token was added for Filters access, which then turned out to
still be missing Projects scope (needed for PENDING detection and for
re-parenting a project during graduation, #8) and caused a run of 401s
on 2026-09-20. Rather than keep discovering missing scopes one at a
time, switched to the single "Full Access" token going forward.

## Automations implemented

### 1. Label cleanup on completion
When a task is marked done, it loses `next-action`, `today`,
`overdue`, and `last-day` automatically. These labels only mean
something while a task is active.

**Known limitation (accepted, not fixed):** marking a task done,
having the automation react, then un-marking it done does not
automatically retract what it did — reversal logic was intentionally
skipped as not worth the complexity/risk trade-off.

### 2. Successor `next-action` labeling
When a task is marked done, walks its "Precedes" relations. For each
successor, checks its "Follows" (predecessor) list — if *every*
predecessor is now done, the successor gets `next-action`
automatically.

### 3. `start_date` backfill
Any task created since the last poll that still has Vikunja's "unset"
date sentinel (`0001-01-01T00:00:00Z`) for `start_date` gets it set to
"now". Needed because the Today/Tomorrow saved filters require every
task to have an explicit `start_date` (Vikunja treats an unset date as
NULL in comparisons, never true).

### 4. Weekly next-action coverage report
Once every 7 days, checks every real project for whether it has at
least one active (`done = false`) task labeled `next-action`.

Exclusions applied:
- **INBOX** and **SINGLE TASKS** are never checked — they aren't
  "projects" in the GTD sense.
- A project with **zero tasks assigned directly to it** (i.e. a pure
  parent/container project whose actual work lives in its
  sub-projects — e.g. PHD, which holds sub-projects like
  `prepare_meetings` but has no tasks of its own) is skipped entirely,
  rather than being incorrectly flagged as "needs a next-action".
  Only projects that have at least one task directly under them, but
  none of them active-and-next-action-labeled, get reported.

Output: `/Users/loudodin/Partage_One_plus_nord_CE_2/areas/report_<date>.txt`.

### 5. Overdue / last-day labels
Every poll, every non-done task with a real due date is classified:
- Due date passed → `overdue` (color matches `p1`, `#ff473d`).
- Due date is today → `last-day` (color `#ffab40`, arbitrary — change
  freely in Vikunja's Labels page).
- Due date in the future → neither (removed if previously applied).

Both labels are referenced by **hardcoded label IDs**
(`OVERDUE_LABEL_ID = 112`, `LAST_DAY_LABEL_ID = 113`), the same way
`next-action` and `today` already were. If you ever recreate these
labels in Vikunja (delete + re-add), update these two constants to
match the new IDs — see "Known quirks" below for why this matters.

### 6. Relation integrity check
Runs alongside the weekly report (same report file in
`/Users/loudodin/Partage_One_plus_nord_CE_2/areas/`).
Checks the whole `precedes` graph for:
- **Dangling relations** — a relation pointing at a task ID that no
  longer resolves.
- **Cycles** — A precedes B precedes ... eventually precedes A again.

### 7. PENDING project shielding
Any project titled **PENDING**, plus every subproject nested under it
(any depth, recomputed fresh every poll via `parent_project_id` —
moving a subproject out takes effect on the next cycle, no restart
needed), is treated as "not yet active" by every other automation:

- **No `start_date` backfill** (#3) — kept dateless on purpose, since
  Vikunja's Today/Tomorrow saved filters never match an unset date.
  This is the main mechanism keeping PENDING tasks out of filters.
- **No automatic `overdue`/`last-day` labelling** (#5), even if a due
  date is set.
- **No automatic `next-action` labelling** (#2) — a task inside
  PENDING is never auto-labeled next-action even if all its
  predecessors are done.
- **Excluded from the weekly next-action coverage report** (#4), the
  same way INBOX/SINGLE TASKS are.
- **Excluded from being reported in the relation integrity check**
  (#6) — a PENDING task is never the subject of a dangling-relation or
  cycle line, though it's still a valid target so a real relation
  from an active task into PENDING isn't misreported as dangling.

**Manual labelling is untouched** — you can still put `next-action` or
any other label on a PENDING task by hand at any time; none of this
stops you from doing that, it only stops the *automation* from doing
it or from making the task otherwise visible.

### 8. PENDING graduation (start_date-triggered)
Every poll, every task inside a PENDING-tree project is checked: if its
`start_date` has been manually set and has arrived (≤ today, local
time), two things happen:

1. That task gets `next-action` (if it doesn't already have it).
2. **The whole containing project graduates out of PENDING** — as soon
   as *any* one of its tasks reaches its start date, not all of them.

Graduation means re-parenting the project (`parent_project_id`) from
wherever it currently sits under PENDING to the **equivalent location
in the real project tree**, found by mirroring the folder path:

- Take the chain of folder titles from PENDING down to the project's
  immediate parent (e.g. `PENDING → PHD → prepare_meetings` gives the
  path `["PHD"]` for a project living directly under that "PHD"
  placeholder).
- Walk that same sequence of titles through the **real** (non-PENDING)
  tree, matching one title per level.
- If every segment resolves, the project's parent becomes whatever
  real project is at the end of that path (an empty path — a project
  sitting directly under PENDING — graduates to the top level).
- If any segment doesn't exist in the real tree yet, the project is
  left in PENDING and a line is logged — nothing is ever attached to a
  guessed location. **You need to have already created the matching
  real parent project(s)** before the mirrored PENDING subproject can
  graduate into them — this is the "create the parent folders that
  allow its automatic displacement" step.

**Important caveats:**
- If a graduating project has its own subprojects still nested under
  it, they move along with it as a whole unit — their tasks then
  immediately become subject to normal automation too, even if those
  deeper tasks have their own later `start_date`. Keep this in mind if
  you nest multiple "waves" inside one PENDING placeholder.
- Manually setting a `start_date` on a PENDING task is unaffected by
  anything else in this script — #7 only stops the *automatic*
  backfill, it never blocks you from setting one yourself.

Once you re-parent a subproject out of PENDING (manually, or via this
graduation logic), it rejoins every automation in #7 on the very next
poll.

### 7b. Pause an active project by dragging it into PENDING
Dragging an **already-active** project (or a whole branch of them) into
PENDING is supported, but it needed a safeguard: without it, a task
with a `start_date` of today-or-earlier would immediately trigger #8's
graduation logic on the very next poll and bounce straight back out —
sometimes to a different real location than it started, if the
mirrored PENDING path didn't exactly match.

The safeguard is **task-level**, not project-level (revised
2026-09-20 — see change log): every poll, the current set of task IDs
sitting inside any PENDING-tree project is compared against what it
was last poll (persisted in `pending_task_ids_last.txt`). For any task
that's newly part of that set — whether because its whole project just
got dragged in, it was individually moved into a project already
inside PENDING, or it was created there directly with a backdated
date — its `start_date` gets **cleared** if it's today or earlier. A
`start_date` still in the **future** is left alone on purpose — that's
read as "I set this on purpose, bring the project back out on that
date", and #8 will do exactly that when it arrives.

This runs *before* #8's graduation check in the same poll cycle, which
is what prevents the immediate bounce-back: by the time graduation
looks, nothing newly-pending this cycle still has a reached date
unless it was meant to.

**Known residual gap:** pre-existing `next-action`/`overdue`/`last-day`
labels on a task are never stripped when it enters PENDING (only the
`start_date` is touched) — accepted as-is; revisit if it becomes
annoying in practice.

### 9. Saved-filter PENDING exclusion
Every poll, every saved filter (Vikunja represents these as pseudo-
projects with negative IDs — e.g. `Today`, `Tomorrow`, `Waiting for`)
gets a managed clause appended to its raw filter query:
`&& (project_id not in <current PENDING project ids>)`.

- The clause is **found and replaced by a fixed regex
  (`PENDING_FILTER_CLAUSE_RE`)** each time, so it always reflects the
  *current* PENDING set — never stacks, never goes stale.
- Everything else you wrote in a filter (`done = false && labels in
  5`, sort order, etc.) is read in full and written back byte-for-byte
  unchanged; only the trailing clause is touched.
- If PENDING is empty (no `PENDING` project, or it has no
  subprojects), the clause is removed entirely rather than left as a
  no-op `not in ()`.
- Applies to **every** saved filter, not just date-based ones — you
  asked for "never show tasks that are under PENDING" across the
  board.
- Uses `GET/POST /api/v1/filters/{id}`, a **different endpoint** from
  the `/api/v1/projects` listing that merely displays them — the
  latter returns filter queries as empty strings regardless of token
  scope; only `/api/v1/filters/{id}` has the real content. Filter ids
  are the pseudo-project's negative id, off by one:
  `filter_id = -pseudo_project_id - 1`.
- Raw filter query fields are **snake_case** (`due_date`, `start_date`,
  `project_id`) even though the Vikunja UI displays some of them
  differently (e.g. `labels in 5` renders as `labels in today` — it's
  showing the label's title for a numeric id, not a different stored
  format).

### 10. Daily label maintenance
Once a day (`DAILY_INTERVAL_DAYS`, checked via `daily_last_run.txt`):

- **Merge duplicate-titled labels.** If two or more labels share the
  exact same title (as happened with `overdue`/`last-day`, see the
  change log), all tasks are reassigned onto the **oldest** one (lowest
  ID = created first) and the newer duplicates are deleted.

Logged to `/tmp/vikunja_automation.log` (label name, ID, what
happened) — no separate report file for this one, unlike the weekly
checks.

**Safety rail:** `next-action`, `today`, `overdue`, and `last-day`
(`PROTECTED_LABEL_IDS`) are never merged away by this check, regardless
of duplicate status — even though they're plain labels to Vikunja, the
rest of the script depends on their exact IDs staying put. If one of
these ever ends up duplicated again, it always wins as the keeper.

**"Delete unused labels" was tried and reverted the same day** — see
the change log below. `delete_unused_labels()` still exists in the
script but is no longer called from `run_daily_checks()`. If you ever
want it back, it should only run with a grace period (e.g. unused for
90+ days), not "zero tasks right now" — a lot of labels here (people,
places) are legitimately kept ready and unused for a while.

### 11. Local Finder-folder mirroring
Runs on **every poll** (not gated behind daily/weekly), right after
`get_projects_and_pending()`, so a new project gets its folder within
about a minute of being created.

Mirrors the Vikunja project tree as folders on disk under two roots:

- `/Users/loudodin/Partage_One_plus_nord_CE_2/ongoing_projects/` — for
  every project **not** under PENDING.
- `/Users/loudodin/Partage_One_plus_nord_CE_2/pending_projects/` — for
  every project under the `PENDING` tree.

Each project gets one folder, nested to match its Vikunja parent chain
(stopping at the PENDING root for pending projects, so the pending
folder tree doesn't itself contain a `PENDING/` layer). `INBOX`,
`SINGLE TASKS`, archived projects, the `PENDING` root itself, and
pseudo-projects (saved filters, which have negative IDs) never get a
folder.

**Naming convention:**
- A project whose title is **all caps** (a "category" folder, e.g.
  `HEALTH`, `TRANSIDENTITY`) gets a folder named exactly after its
  title — no date prefix.
- Any other project gets `YYMMDD_title`, where `YYMMDD` is the
  project's Vikunja **creation date**.

**Create-only, never renamed.** This automation only ever creates a
missing folder — it never renames, moves, or touches the date prefix
of a folder that already exists for a project. A project counts as
"already has a folder" if a folder exists whose name is exactly the
project's title, or ends with `_<title>` — regardless of what (if any)
date prefix it currently carries. This match is deliberately
format-agnostic: a folder that's been manually renamed (a corrected
date, a day appended, a different prefix altogether) still counts as
existing and is left completely alone. The assumption is that any
folder not in clean `YYMMDD_title`/`TITLE` form was auto-created once
and then manually edited afterwards — so the safe move is always "do
nothing", never "fix it back".

Because of this, there's no separate weekly "reconcile" step: the
same create-only logic running on every poll already satisfies "don't
touch folders dated in the future" and "don't touch folders without a
day" — it was never going to touch them in the first place, since it
only ever creates folders that don't exist yet.

**One-time initialisation (2026-09-20):** before this automation went
live, 8 existing folders were manually brought into clean `YYMMDD_`
form so the format-agnostic matching above wouldn't misfire on them
going forward:
- 6 folders missing the day component (`YYMM_title`) were completed
  with `01` as the day.
- 1 folder (`.../PHD/2610_participate_to_INTP_autumn_school`) was
  dated in the future relative to its actual creation; per instruction,
  day `12` was appended (`261012_...`) rather than defaulting to `01`.
- 1 folder (`.../pending_projects/PERSONAL DEVELOPMENT/maintain_CV_publi_etc`)
  had no date prefix at all; it was prefixed with the date of the
  rename itself (`260920_...`), not a historical date.

Logged to `/tmp/vikunja_automation.log` (one line per folder created,
or per failure with the OS error).

**Keeping every project's folder on the correct side.** On every poll,
before the create-missing step above runs, the script checks — for
every LEAF project — whether a folder matching its title exists on the
**wrong** side (the side that does not match its current live PENDING
membership) and, if so, relocates/merges it onto the correct side:

- This is a **live check, not a change-detection check**. It doesn't
  ask "did this project's membership change since last poll?" — it
  asks "is this project's folder on the correct side right now?",
  every single poll, for every project. That's deliberate: an
  earlier, change-detection-only version could only ever fix a mismatch
  at the exact moment it appeared, and had no way to notice or correct
  one introduced any other way — which is exactly what let both
  incidents below go unfixed until you spotted them by eye. This
  version is self-healing: however a project's folder ends up on the
  wrong side, it won't stay there past the next poll.
- The wrong-side folder is found by **searching that whole root
  (`ongoing_projects` or `pending_projects`) recursively for a folder
  matching the project's title**, rather than by recomputing where it
  "should" be — because there's no reliable record of where a folder
  used to live, only where it currently does.
- Its own folder name (date prefix and all) is **never changed** by
  the move — only relocated. Same "don't touch a name a human might
  have edited" principle as the create step.
- **If a folder with the same project title already exists at the
  correct destination too** (typically an empty one the create step
  made before the real one was found) — the two are **merged** rather
  than left as a duplicate: files move into whichever of the two
  folder names is kept, and the emptied one is removed. The name
  that's kept is whichever has the **earlier** `YYMMDD` date prefix;
  if only one of the two has a date prefix at all, the undated one is
  assumed to be manually named and wins regardless of the other's
  date. A same-named file that exists in both folders is left in
  place on both sides (not overwritten) and logged for you to check
  by hand — this is the only case that needs manual attention.
- A whole pending sub-tree (a project and its own subprojects) sitting
  on the wrong side needs no special handling: relocating the top
  project's folder naturally carries its nested subproject folders
  with it on disk. If a subproject gets checked afterwards, there's
  simply nothing left to find on the wrong side — safe no-op.
- **All-caps category projects are never eligible for this check.** A
  category folder (`PHD`, `HEALTH`, ...) exists **twice on purpose** —
  once as a real top-level project, once as its same-titled mirror
  directly under `PENDING` — so an all-caps title existing on both
  sides is expected, not a mismatch. Matching these by title would
  grab the *other* project's folder entirely. Only dated (leaf)
  projects are ever candidates. See the incidents below for why this
  matters.

**Incident 1 (2026-09-20): category folders wrongly merged.** The
first version of this check only ran once, on the first poll after
being deployed, treating every current PENDING member as having "just
entered". That included the PENDING category mirrors themselves (`PHD`
id 34, `TRANSIDENTITY` id 35, etc.) — its "old folder" search matched
by title alone, found the **real** `PHD`/`TRANSIDENTITY`/etc. category
folder (a *different* project entirely) and merged its whole contents
into the PENDING mirror. This moved several real (non-pending) leaf
projects' folders — `help_friends`, `do_sports`,
`optimize_my_online_environment`, `prepare_meetings`,
`participate_to_BB`, `other_people`, `start_taking_hormones`,
`get_mastectomy`, `keep_in_touch`, `send_news_of_canada`,
`take_care_of_my_body`, `optimize_my_physical_environment`,
`think_about_my_future`, `inform_myself` — into `pending_projects`. No
real files were lost: every one was still empty (freshly created
minutes earlier by this same feature going live); the create step
re-created correct copies back under `ongoing_projects` in the same
poll, and the 14 stray empty duplicates left under `pending_projects`
were manually deleted after verifying each was empty. Fixed, first, by
excluding all-caps titles (see above).

**Incident 2 (2026-09-20): real projects' folders stranded under
`pending_projects`.** After fixing incident 1, you noticed
`attend_clarte_maximale` and `attend_productivite_legendaire` had real
content sitting under `pending_projects` while Vikunja showed them
filed under "general" (real, non-pending). Checking against a live
project dump confirmed **seven** projects were misplaced this way —
`obtain_ALD_31`, `change_pronouns_to_he_him`, `attend_clarte_maximale`,
`attend_productivite_legendaire`, `write_trans_review`,
`participate_to_INTP_autumn_school`, `offer_canadian_gifts` — all real
projects (only `maintain_CV_publi_etc` is genuinely pending). Most of
these were swept sideways by incident 1's category-merge bug;
`participate_to_INTP_autumn_school` specifically was missed during
that incident's cleanup because its folder had a *different* date
prefix (`261012`) than the empty duplicate the create step had made
(`260918`), so it wasn't recognised as the same project by eye. Fixed
by (a) manually moving all seven back to `ongoing_projects`, keeping
each folder's original name, after removing the empty auto-created
duplicate that had been sitting at the correct location; and (b)
replacing the change-detection-only check with the live, every-poll
self-healing version described above, precisely so a mismatch that
slips past a one-time fix — for whatever reason — gets caught and
corrected on its own from then on, rather than requiring another
manual audit. A leaf project can in principle still collide by title
if you ever give two *different* leaf projects the exact same name on
both sides — a much narrower, unlikely case compared to the
categories, which collided by design every time.

### 12. Error notification — no silent failures
Added 2026-09-20 after a full review of the script turned up several
places where a problem could pass with only a log line you'd have to
go looking for, or in a couple of cases no line at all. The design:

**Every real problem goes through one function, `notify_error(source,
message)`.** It always does three things:
1. Logs full detail to the main log (`/tmp/vikunja_automation.log`),
   including a traceback when called from inside an `except` block.
2. Appends a one-line entry to `errors.log` in this folder — a quiet,
   focused place to check, since the main log is otherwise full of
   routine "Created folder" / "Synced filter" activity.
3. Fires a **native macOS notification** (Notification Center, with a
   sound) — rate-limited per distinct problem to once every 30 minutes,
   so a persisting issue doesn't spam you but a genuinely new kind of
   problem always alerts immediately.

**Every pipeline step is isolated.** Before this, `poll_once()` was one
big `try`/`except` around the entire cycle — a single bad item (e.g. a
task whose successor had been deleted, leaving a dangling relation)
would throw partway through and silently skip everything scheduled
after it in that same cycle: due-date labels, saved-filter sync,
PENDING graduation, all silently not run, with only a generic "Error
during poll" logged and no indication anything downstream was affected.
Now each major step (folder placement, folder create, pending-task
tracking, start_date backfill, due-date labels, filter sync, PENDING
graduation, weekly checks, daily checks) runs through `run_step()`,
which catches and reports a failure in that ONE step without touching
the others. The loops that process multiple independent items — newly-
done tasks and their successors, PENDING projects being checked for
graduation, projects being checked for correct folder placement — are
similarly isolated per item, so one bad task or project can't block the
rest of the batch.

**The "since" checkpoint (`last_check.txt`) always advances** once the
project list was successfully fetched, rather than only after every
single downstream step also succeeded. Previously, a persistent failure
anywhere in the poll meant the checkpoint never moved, so the "what
changed since last time" window kept growing on every future poll —
each one reprocessing an ever-larger backlog instead of a fresh ~60
seconds. Each step now protects its own correctness independently
(most are naturally idempotent — relabeling an already-labeled task is
a no-op), so decoupling the checkpoint from their individual outcomes
is safe.

**The poller can't go silently unresponsive.** `webhook_listener.py`
writes `heartbeat.txt` at the end of every single cycle, unconditionally
— the one thing that doesn't depend on anything else going right. A
separate, independent script, `watchdog.py`, runs on its own schedule
(every 3 minutes, via its own LaunchAgent) and fires a macOS
notification if that heartbeat is more than 5 minutes old — meaning the
poller has crashed, hit a bug that broke it at import time, or launchd
has stopped trying to restart it. `watchdog.py` deliberately does not
import `webhook_listener.py`, so a bug in the main script can never
take the watchdog down with it. This closes the worst blind spot: the
main script reporting its own errors is no help if the whole process
has stopped running.

**Setting up the watchdog** (one-time, since I can't write directly
into `~/Library/LaunchAgents` from here):
```bash
mv ~/vikunja-automation/com.loudodin.vikunja-watchdog.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.loudodin.vikunja-watchdog.plist
launchctl list | grep vikunja-watchdog
```

**What still can't be caught:** if the Mac itself is asleep, off, or the
`osascript` notification is somehow suppressed system-wide, nothing
above will reach you — there's no channel here that leaves the Mac
(you chose macOS notifications only; ntfy.sh/email were the
alternatives if that changes). Also, `notify_error` calls made from
inside `find_project_folder_anywhere`/`project_local_path` etc. when
called from `sync_project_folders`/`sync_project_folder_placement` are
per-project, but a systemic problem (e.g. the whole
`Partage_One_plus_nord_CE_2` folder becoming unreachable — unmounted,
iCloud eviction, permissions) would currently generate one notification
per affected project rather than a single "the whole folder is gone"
summary; each individual notification is still rate-limited, so this is
noisy-but-bounded rather than silent, but a smarter summary could be
added later if it becomes annoying in practice.

**Bugs found during this review and fixed the same day** (see the
change log for the full list): `.DS_Store` files silently blocking
folder cleanup after every merge; the whole-poll try/except swallowing
unrelated steps after one bad task; `remove_label_from_task`/
`delete_label` silently swallowing every kind of API error, not just
"already gone"; a silently-skipped saved filter on fetch failure; and
the checkpoint-never-advances issue described above.

## Extra: local label-filter panel (`label_filter.html`)

A standalone tool, separate from the automations above — a small local
web page for browsing tasks by any combination of labels at once, with
an instant Any-label (OR) / All-labels (AND) toggle.

**Why it's a local file, not a Claude artifact:** the first version of
this was published as a Claude artifact (a hosted page on claude.ai),
but Claude's own artifact sandbox enforces a Content Security Policy
that only allows it to call back to Claude's own servers — it can
never `fetch()` an arbitrary external server, including this Vikunja
instance, no matter how Vikunja's own CORS is configured. So instead
it's a plain HTML file living right here in `~/vikunja-automation/`,
opened directly in a browser (double-click it, or `open
label_filter.html`), which is under no such restriction.

**How to use it:** open `label_filter.html` in a browser. The first
time, it asks for your Vikunja base URL (`http://localhost:3456`, or
the Tailscale URL) and your API token — both are stored only in that
browser's local storage, never sent anywhere but your own Vikunja
instance. It then loads every task and label once and does all
filtering client-side, so ticking label chips updates the list
instantly with no further requests. **Default match mode is All
labels (AND)**, not Any (OR) — flip the segmented control at the top
of the sidebar to switch.

**Data is a snapshot, not live** — it does not poll or auto-refresh.
A change made in Vikunja after loading (new task, relabeled task,
marked done, etc.) only shows up after clicking the refresh icon
(circular arrow next to the settings gear); that re-fetches without
losing your current label selection or Any/All mode. A full page
reload isn't needed for this.

**Sidebar layout:** the Match toggle shows All labels (AND) on the
left, Any label (OR) on the right (AND is also the default — see
above). A "Selected labels" strip below shows only the labels
currently picked, each removable with one click — no search box,
since with the colour boxes below there's rarely more than a handful
of colours to scan. Below that, "Labels by colour" groups all labels
into one always-visible box per exact hex colour (sorted in
rainbow/hue order) — no header, no swatch icons, no colour name: the
box itself IS the colour, via CSS custom properties (`--h`/`--s` set
inline per box) that drive its background tint, border and text all
as shades of that one hue, redefined for dark mode so it still reads
correctly there. Each box is a fixed height of about 2 label rows,
scrollable inside itself for colours holding more than that — no
click-to-expand, every box is visible and independently scrollable at
once.


**CORS:** since the page calls Vikunja's API cross-origin from the
browser, `docker-compose.yml` now sets
`VIKUNJA_CORS_ENABLE: "true"` / `VIKUNJA_CORS_ORIGINS: "*"` — needs
`docker compose up -d --force-recreate` in `~/vikunja` to take effect
if it hasn't already.

**API note:** uses `/api/v1/tasks` (paginated, `sort_by[]=id`), not
`/api/v1/tasks/all` — see the known quirk below about why.

**Known front-end gotcha (fixed):** being a plain local file rather
than a Claude artifact, it doesn't get the Artifact platform's own
injected `[hidden] { display: none !important; }` rule, so any element
toggled via the `hidden` DOM property needs its own explicit
`[hidden]` CSS rule if it also has an unconditional `display` set on
the same class (the connect modal hit this — it wasn't closing).
Likewise, an absolutely-positioned decorative element painted after
an input in the DOM (e.g. a custom toggle switch's track/thumb) will
silently swallow its clicks unless given `pointer-events: none`
(the "Hide completed tasks" switch hit this). Worth remembering if
extending this file further.

## Known quirks / hard-won API lessons

- Bulk task listing is `/api/v1/tasks`, **not** `/api/v1/tasks/all` —
  the latter always 400s with a generic, unhelpful error regardless of
  parameters.
- Date literals in filters must be plain `YYYY-MM-DDTHH:MM:SSZ` — no
  microseconds, no `+00:00` offset.
- `null` is not a valid filter comparison value for date fields — no
  clean server-side way to filter "date is unset"; this script instead
  fetches broadly and checks the `0001-01-01T00:00:00Z` sentinel in
  Python.
- Adding/removing a label on a task is `PUT`/`DELETE` on
  `/api/v1/tasks/{id}/labels` (`/labels/{label_id}` for delete) — a
  different endpoint from updating the task itself, which uses
  `POST /api/v1/tasks/{id}` (not `PUT`) for partial updates.
- Vikunja's per-project webhooks (full event list, incl.
  `task.updated`) are separate from the account-level "Webhook
  Notifications" settings page (overdue/reminder events only).
- **`GET /api/v1/labels` is paginated**, same as `/tasks`. The original
  `get_or_create_label()` helper called it with no `page`/`per_page`
  params, so on an account with many labels it only ever saw the first
  page. Every time the script restarted (crash, reboot, sleep/wake),
  its in-memory label cache reset, and if `overdue`/`last-day` weren't
  on that first page, the script couldn't find them and created brand
  new duplicate labels — resulting in several orange `last-day` labels
  and several `overdue` labels over time. Fixed by removing the
  lookup entirely in favour of hardcoded IDs (see above); duplicates
  were merged onto one surviving label each and deleted.

## How to check on it / troubleshoot

```bash
launchctl list | grep vikunja-automation
tail -50 /tmp/vikunja_automation.log

# just the problems, not the routine activity (see #12):
tail -50 ~/vikunja-automation/errors.log

# is the poller actually still alive?
cat ~/vikunja-automation/heartbeat.txt

# watchdog (checks the above automatically, every 3 min):
launchctl list | grep vikunja-watchdog
tail -20 /tmp/vikunja_watchdog.log

# after editing webhook_listener.py:
launchctl unload ~/Library/LaunchAgents/com.loudodin.vikunja-automation.plist
launchctl load ~/Library/LaunchAgents/com.loudodin.vikunja-automation.plist
```

## Change log

- **2026-09-19**: Initial version — successor `next-action` labeling on
  task completion (via polling, after webhook delivery was blocked by
  Vikunja's SSRF protection). Extended same day with: label cleanup on
  completion, `start_date` backfill, weekly next-action coverage
  report, overdue/last-day due-date labels, weekly relation integrity
  check. Later refined: report output moved from `reports/` to
  `~/vikunja-automation/areas/`, then to the shared folder
  `/Users/loudodin/Partage_One_plus_nord_CE_2/areas/`; INBOX and SINGLE TASKS excluded from the coverage check;
  parent/container projects with no tasks of their own (e.g. PHD) no
  longer incorrectly flagged as missing a next-action.
- **2026-09-20**: Fixed a bug where `overdue`/`last-day` labels could
  end up duplicated (a fresh one created on every automation restart
  because the label lookup wasn't paginated). Merged the existing
  duplicates onto one label each (`overdue` = id 112, `last-day` =
  id 113, both kept in their original red — the manually-created
  `last-day` colour was preserved over the automation's orange one)
  and switched the script to reference these by hardcoded ID instead
  of looking them up by title, so this can't recur.
- **2026-09-20 (later)**: Added daily label maintenance — merges
  duplicate-titled labels (keeping the oldest), and deletes labels with
  zero tasks attached. Runs once a day, independent of the weekly
  report. `next-action`, `today`, `overdue`, and `last-day` are
  hardcoded as protected and are never merged away or deleted by this
  check.
- **2026-09-20 (incident)**: The daily "delete unused labels" check
  deleted 60 labels (mostly people/place names) that had zero tasks at
  the time but were intentionally kept for future use. Recovered all
  60 with their original titles and exact colours by reading them
  straight out of the SQLite database's write-ahead log (the delete
  hadn't been checkpointed yet, so the pre-delete rows were still on
  disk) and recreating them via the API (`restore_labels.py`, used
  once then deleted). **`delete_unused_labels()` is now disabled** —
  `run_daily_checks()` only does the duplicate-title merge. The
  function is left in the script, unused, in case a safer opt-in
  version (e.g. a 90-day grace period) is wanted later.
- **2026-09-20 (later still)**: Added PENDING project shielding — any
  project titled PENDING and everything nested under it (recomputed
  each poll from `parent_project_id`) is now skipped by start_date
  backfill, overdue/last-day labelling, automatic next-action
  labelling, the weekly coverage report, and the relation integrity
  report. Manual labelling still works as normal; only the automation
  stays hands-off until a subproject is moved out of PENDING.
- **2026-09-20 (later still, x2)**: Added PENDING graduation —
  manually setting a `start_date` on a task inside a PENDING project
  now triggers, once that date arrives: `next-action` on the task, and
  the whole containing project re-parenting out of PENDING to the
  matching location in the real tree (found by mirroring the folder
  path of titles). Requires the matching real parent project(s) to
  already exist; unresolvable paths are left alone and logged rather
  than guessed.
- **2026-09-20 (later still, x3)**: Added saved-filter PENDING
  exclusion — every saved filter now gets an auto-managed
  `&& (project_id not in ...)` clause kept in sync with the live
  PENDING project set every poll, via a new token scoped to add
  `Filters: Read One, Update` alongside the existing `Tasks` scope.
  Discovered along the way: saved-filter query content is only
  readable/writable through `/api/v1/filters/{id}` (positive id,
  `= -pseudo_project_id - 1`), not through the `/api/v1/projects`
  listing, which always shows it blank.
- **2026-09-20 (later still, x4)**: Added pause-on-drag support for
  moving an already-active project into PENDING — any task whose
  start_date has already arrived gets it cleared the moment its
  project newly joins the PENDING tree (tracked via
  pending_ids_last.txt), while a future start_date is preserved as the
  deliberate "resume on this date" signal for graduation (#8). This
  also fixes what would otherwise be an immediate bounce-back the
  first poll after dragging an active project in.
- **2026-09-20 (later still, x5)**: Diagnosed (not an automation bug)
  — the "Waiting for" filter had `filter_include_nulls: true`, which
  made unlabeled tasks slip through a labels-based filter regardless
  of the label condition. Unrelated to anything this script writes;
  fixed manually via the API. Worth checking the same on any other
  label-only saved filter.
- **2026-09-20 (later still, x6)**: The Tasks+Filters-scoped token
  started 401ing on `/api/v1/projects` and `/api/v1/labels` (it was
  also missing `Projects` scope, needed for PENDING detection and for
  #8's re-parenting). Switched `API_TOKEN` to the "Full Access" token
  to stop chasing individual missing scopes.
- **2026-09-20 (later still, x7)**: Reworked #7b's pause safeguard from
  project-level to **task-level** tracking (`pending_task_ids_last.txt`
  replaces `pending_ids_last.txt`). The old version only caught a
  whole project being dragged into PENDING; it missed a single task
  being moved into a project already sitting in PENDING, or a new task
  created there directly with a backdated start_date — both of which
  could still trigger an unwanted immediate graduation. Also removed
  an empty-looking `reports/` folder that turned out to hold one real
  (superseded) old report file — deleted; recoverable via the same
  WAL-snapshot approach used for the labels incident if needed.
- **2026-09-20 (later still, x8)**: Added automation #11, local
  Finder-folder mirroring, and wired `sync_project_folders()` into the
  main poll loop. Manually brought 8 pre-existing folders into clean
  `YYMMDD_title` form first (see #11) so the create-only matching
  wouldn't skip them incorrectly or, conversely, create a duplicate
  folder alongside a manually-renamed one.
- **2026-09-20 (later still, x9)**: Added the folder move/merge logic
  to #11 — a project's local folder now moves with it when it crosses
  the basic/PENDING boundary (either direction, including automatic
  #8 graduation), instead of a fresh empty folder being created at the
  destination and the real one left behind. Merges with a pre-existing
  destination folder of the same title if one's there, keeping the
  earlier-dated name; a genuine same-named-file conflict is left
  untouched on both sides and logged rather than risking data loss.
- **2026-09-20 (later still, x10)**: Fixed the category-folder merge bug
  described in the incident note above — all-caps (category) projects
  are now excluded from the boundary-crossing move/merge logic in
  #11, since they exist identically-titled on both sides by design and
  were never meant to be matched against each other. Manually deleted
  the 14 stray empty duplicate folders the bug had left under
  `pending_projects`, after confirming each was empty and that
  `ongoing_projects` already held the correct real copies.
- **2026-09-20 (later still, x11)**: Found and fixed incident 2 above —
  7 real projects' folders (`obtain_ALD_31`, `change_pronouns_to_he_him`,
  `attend_clarte_maximale`, `attend_productivite_legendaire`,
  `write_trans_review`, `participate_to_INTP_autumn_school`,
  `offer_canadian_gifts`) had real content stranded under
  `pending_projects` despite being filed under "general" in Vikunja.
  Manually moved all 7 back to `ongoing_projects`. Replaced the
  transition-detection version of #11's boundary check with a stateless,
  every-poll, self-healing version (`sync_project_folder_placement`) —
  it checks every leaf project's actual current placement against
  Vikunja directly, rather than only reacting to a change seen since the
  last poll, so a mismatch from any cause gets corrected automatically
  instead of silently persisting. Removed the now-unused
  `pending_project_ids_last.txt` state file.
- **2026-09-20 (later still, x12)**: Full review of the script for bugs,
  requested after the two folder-placement incidents above. Fixed:
  (1) `merge_directories` never cleaned up stray `.DS_Store` files,
  so any merge touching a folder that had one could never fully empty
  it — logged as "could not remove" on every future merge forever;
  (2) `poll_once()` was one big try/except, so a single bad task (e.g.
  a dangling relation to a deleted task) silently skipped every
  automation scheduled after it in that cycle — now every step is
  isolated via `run_step()` and per-item loops (successors, PENDING
  projects, folder checks) are isolated per item too;
  (3) `remove_label_from_task`/`delete_label` silently swallowed every
  kind of API error, not just an expected 404 — now only 404 is
  silent, anything else is reported;
  (4) a saved filter that failed to fetch was silently skipped with no
  log line at all;
  (5) `last_check.txt` only advanced after the ENTIRE poll succeeded,
  so a persistent downstream failure meant the "what's changed" window
  grew without bound on every future poll — it now advances once the
  project list is fetched, independent of downstream step outcomes.
  Also designed and added a full error-notification system (#12):
  `notify_error()` (log + errors.log + rate-limited macOS notification)
  used throughout, plus a heartbeat file and an independent
  `watchdog.py` (own LaunchAgent) to catch the poller stopping
  entirely — the one failure mode the poller can never report about
  itself.
- **2026-09-20 (later still, x13)**: Fixed a false-positive watchdog
  alert. Both LaunchAgents (poller and watchdog) were reloaded at the
  same time, and the watchdog's own `RunAtLoad` check ran before the
  poller had completed its first poll cycle and written its first
  `heartbeat.txt` — a harmless cold-start race, not a real outage, but
  it fired a real "Vikunja automation may be down" notification.
  `watchdog.py` now requires **2 consecutive bad checks** (roughly 6
  minutes of genuine staleness, since the watchdog runs every 3
  minutes) before it actually alerts, tracked via a `consecutive_bad`
  counter in `watchdog_last_sent.json`, reset to 0 on any healthy
  check. A single bad reading is now logged but not notified, so this
  can no longer fire spuriously on every reboot or coordinated
  reload.
- **2026-09-20 (later still, x14)**: Added `label_filter.html`, a local
  panel for filtering tasks by any combination of labels (Any/All
  toggle) — see "Extra: local label-filter panel" above. First built
  as a Claude artifact, which turned out to be a dead end: Claude's
  artifact sandbox's Content Security Policy blocks it from ever
  calling an external server like this Vikunja instance, regardless of
  Vikunja's own CORS config. Rebuilt as a plain local HTML file
  instead, and added `VIKUNJA_CORS_ENABLE`/`VIKUNJA_CORS_ORIGINS` to
  `docker-compose.yml` so the page's cross-origin `fetch()` calls are
  permitted. Also caught and fixed, before ever shipping it: it
  originally called `/api/v1/tasks/all`, which the quirks list below
  already flagged as always 400ing — switched to the same paginated
  `/api/v1/tasks` pattern `webhook_listener.py` uses.
- **2026-09-20 (later still, x15)**: Fixed two front-end bugs in
  `label_filter.html` found right after shipping it as a local file:
  (1) the "Connect to Vikunja" modal wasn't closing on Save & connect —
  its `.modal-backdrop` class set `display: flex` unconditionally,
  which (being an author-level rule) silently overrode the browser's
  native `[hidden] { display: none }` handling once the page was no
  longer wrapped by the Claude artifact platform's own `[hidden]`
  override; added an explicit `.modal-backdrop[hidden]` rule; (2) the
  "Hide completed tasks" switch wasn't clickable — its `track`/`thumb`
  decorative spans painted on top of the actual checkbox in DOM order
  and swallowed every click; fixed with `pointer-events: none` on
  both. See the new "Known front-end gotcha" note above.
- **2026-09-20 (later still, x16)**: Reworked the labels sidebar in
  `label_filter.html` on request — labels are now grouped into
  collapsible, colour-named dropdowns (Red, Orange, Green, Blue,
  Grey, ...) in rainbow (hue) order instead of one flat alphabetical
  list, using native `<details>`/`<summary>` for the accordion
  behaviour. A group auto-expands while searching or when one of its
  labels is already selected; manual open/close choices are otherwise
  remembered across re-renders via `state.openColorGroups`.
- **2026-09-20 (later still, x18)**: Reverted the colour-dropdown/
  accordion sidebar from x16 (and the hex-code header + "Selected
  labels" summary briefly added after it, x17 — also reverted) back to
  a flat label list — no colour grouping or dropdowns — but kept the
  rainbow (hue) sort order from the step before x16, at the user's
  request pending an explanation of why. Removed the now-unused
  `buildColorGroups()`/`colorGroupName()` helpers and the
  `.color-group*` accordion CSS.
- **2026-09-20 (later still, x19)**: Reverted further, back to the
  panel's very first design — a flat label list sorted alphabetically
  by title, no colour sorting or grouping at all — at the user's
  request to keep it simple. Removed the now-unused `hexToHsl()`
  helper.
- **2026-09-20 (later still, x20)**: Batch of five requested changes to
  `label_filter.html`: (1) fixed a real bug behind labels silently not
  appearing (e.g. "week") — `/api/v1/labels` is paginated the same as
  `/tasks`, and the panel was making one request hoping `per_page: 200`
  would be honored; added `fetchAllLabels()`, walking pages the same
  way `fetchAllTasks()` already does, so nothing past whatever page
  size the server actually enforces gets silently dropped; (2) default
  Match mode is now All labels (AND) instead of Any (OR); (3) removed
  the "Search labels" box; (4) added a "Selected labels" strip at the
  top of the sidebar showing only the active picks, each removable
  with one click; (5) reinstated colour grouping, but as always-open
  boxes rather than click-to-expand dropdowns — one box per exact hex
  colour, each a fixed ~5-row height with its own scrollbar rather
  than growing to fit every label of that colour.
- **2026-09-20 (later still, x21)**: Two more requested tweaks to
  `label_filter.html`: (1) swapped the Match toggle so All labels
  (AND) sits on the left, matching the new default; (2) redesigned the
  colour boxes — removed the header row entirely (no swatch icon, no
  colour name, no hex code), and instead the box itself is tinted in
  that colour: background, border and text are all shades of the same
  hue via `--h`/`--s` CSS custom properties set inline per box, with
  separate (lighter-text/darker-bg) values under dark mode. Also
  shrank each box from ~5 rows to ~2 rows tall, scrollable inside for
  colours with more labels than that. Removed the now-unused
  `colorGroupName()` helper.

  **Also found and fixed a real bug during this round:** the previous
  several pushes of this file (x19 and x20) had silently failed to
  actually write to disk — `device_commit_files` reported success each
  time, but the file on this Mac was still the pre-change version,
  which is why none of those changes appeared to take effect. Fixed
  by re-pushing with a forced overwrite and verifying the file's
  checksum on disk matches what was sent, rather than trusting the
  tool's success response alone. Worth re-verifying by hash (not just
  a "written" response) after any future push if changes don't seem
  to show up after a reload.

## Project folders and the Bin (added 2026-10-08)

**Folders.** `folder_sync.py` (called by the poller every cycle) keeps one folder per project
under `areas/`, laid out like the app: `areas/<AREA>/<YYMMDD>_<project>` (sub-projects nest),
`areas/<AREA>/pending_projects/<project>` (no date), `areas/<AREA>/archived_projects/<start>_<end>_<project>`.
An area is a top-level project with an UPPER CASE title. Pending, start and end dates come from
hidden first lines of the project description written by the app (`[pending]`, `[start:YYYY-MM-DD]`,
`[end:YYYY-MM-DD]`). It only creates and moves folders; it never deletes or overwrites (a clash is
reported and left alone). `folder_state.json` remembers which folder belongs to which project.
Projects outside an area, INBOX, SINGLE TASKS, the Bin and the old PENDING tree get no folder of
their own (the old PENDING/<AREA>/<project> projects become `pending_projects` of that area).
Tests: `python3 -m unittest test_folder_sync`.

**Bin.** Deleted tasks are moved by the app into a top-level project called `Bin` and erased by
the app after 30 days. The poller treats the Bin like a pending project (no labels, no automation)
and keeps its tasks' start dates. The health check lists them separately (`bin`).

**Auto-restart.** The poller exits when `webhook_listener.py` or `folder_sync.py` changes on
disk; launchd (KeepAlive) starts the new version.
