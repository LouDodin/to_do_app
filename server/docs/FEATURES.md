# What the app does

A minimal, keyboard-friendly task manager built for a GTD way of working, on top of your own Vikunja server. Items marked **new** were added on 10 Oct 2026.

## Views and pages

| Where | What |
|---|---|
| **View switcher** (top-left: All, Pro, Perso written side by side since 14 Nov 2026) | The Inbox (every task still to define) is a page of its own, first in the menu, since 13 Nov 2026. All shows everything (Perso projects first, then Pro). Pro and Perso show only the projects of that context. |
| **Home** (house icon) | A **filter box** at the top, then your open actionable tasks in four blocks: **Today** (label `today`), **This week** (label `week`, since 13 Nov 2026), **Red** (`overdue`, `last-day`, `p1`), **Available** (`next-action`, plus every open task of a project whose name starts with "Single tasks", such as SINGLE TASKS PRO and SINGLE TASKS PERSO, unless it is `waiting-for`; since 26 Oct). Since 25 Oct there is no list of "all the other tasks" any more. The browser tab shows today's count. |
| **Project page** | The project's tasks (oldest first), its path (e.g. Pro / Client A), and **sections** to group them (since 10 Nov 2026 kept in your account: the same on every device, the phone included). Below them, **Sub-projects (n) and their tasks**: every project inside it, each with its tasks (foldable). **Add a task to this project…** at the bottom of the list: type, Enter, and the next one. The task is validated at once (it does not go through the Inbox); set its labels, dates and the rest in its row, as in the Inbox, or on its page. |
| **Task page** | Title, project (and "Back to Inbox"), labels, start and due dates, repeat, description, relations (precedes / follows), Duplicate, Delete (then back to the page you came from; Esc too). **New:** picking a related task now shows a list of matching open tasks. It used to link the first match blindly, possibly the wrong task. |
| **Filter page / Label page** | Tasks matching a saved Vikunja filter (its definition is shown under the title), or carrying a label. Filters are evaluated on the device, so they work offline too. **New:** the filter page was blank since 8 Oct; it is rebuilt and checked against Vikunja's own results. |
| **Weekly review** | **Redone 13–14 Nov 2026** (no figures, only what is ahead; on Sundays it replaces Tomorrow). Three steps: **Clean up** (tick Desktop, Downloads, Emails; the Inbox), **Projects and tasks on hold** (projects without a next action, pending projects → Activate, pending tasks → Resume, waiting for, untouched for 60 days → Abandon / Bin), **Plan the coming week**: your list for the week, then groups: Planned this week, not done (on a day's list in the last 7 days, or on the week's list when the page was opened), Overdue, Due in the next 7 days, Next actions, Due in the next two weeks, Due later, Recently added. On each task: ☆/★ the week's list (label `week`) and **Tomorrow** (label `today`). Steps 1 and 2 are ticked by hand for the week (`step-clean`, `step-review` in `tasks_weekly_routine`). |
| **Tomorrow** (called Tomorrow's priorities until 14 Nov 2026) | No figures, nothing already done: **Your list for tomorrow**, **To consider** (groups: Planned for today, not done — from `tasks_day_plans`, ★ = still on tomorrow's list —, Due by tomorrow, This week, Next actions, Due in the next two weeks, Due later, Recently added). ☆ adds the `today` label, ★ removes it. A task chosen in the evening is written under tomorrow's date in the day plans, so it does not count as planned for today. |
| **Bin** | Tasks deleted in the last 30 days (also those of a deleted project), each with days left. Restore puts it back in the Inbox. |
| **Left panel, bottom corner** | Three icons, from left to right: Tomorrow's priorities (moon), Weekly review (calendar), Bin. Hover for the name. |
| **Search** (⌘K / Ctrl+K, or /) | Searches everything, with recent searches. |
| **Settings** | See below. |

## The Inbox (validation)

Rule since 19 Oct 2026: **a task is in the Inbox until you validate it.** Nothing else takes it out.
- Every task starts "to validate": made in the app, with the Mac's ⌥⇧⌘T, shared from the phone, or created on the Vikunja website.
- Change it as much as you like (title, project, labels, dates, notes): it stays in the Inbox.
- **Validate** it (the circle on the right, `v`, or the bar on its task page) once it has a project: it leaves the Inbox and appears in its views.
- **Complete** it straight from the Inbox once it has a project (right-click on the circle, or `x`): that validates it too.
- Moving a task back to the Inbox project, "Back to Inbox" (`i`), or restoring it from the Bin makes it "to validate" again. Undo right after deleting keeps its status. A duplicate of a validated task is validated.
- How it is stored: validating adds a hidden label `ctx:validated` to the task. If that mark were ever lost, the task would come back to the Inbox (it never vanishes). Labels are now sent one change at a time, so a device with an older copy of a task cannot erase labels set elsewhere.
- On screen, a task shown in the Inbox stays there until you validate, complete or bin it, even if the device's copy says otherwise; such a case is written to the Error report as a "trace".
- Keyboard: 1 sets Pro, 2 sets Perso, v validates, x completes once it has a project.
- The newest tasks are at the top. **Newest first ↓ / Oldest first ↑** switches the order, remembered on each device.

## Projects

- A tree of projects and sub-projects (left panel), in your own order. Drag to reorder or to nest a project inside another. Nothing is ever re-sorted automatically: a new project goes to the bottom of its context.
- **Pro / Perso** is a setting of a project and applies to all its sub-projects. Tasks follow their project.
- **Pending** projects are hidden from views and automations until their start date ("Show pending" lists them).
- **Archive** a finished project. It is refused while open tasks remain ("Show archived" lists archived ones).
- **Delete** a project: its open tasks go back to the Inbox and its completed tasks go to the Bin. Nothing open is ever deleted.
- Right-click a project to rename, move or delete it. Editing panels have no Save button: closing applies.
- Your Mac keeps a folder for each project under `Partage_One_plus_nord_CE_2/areas`. See [AUTOMATIONS.md](AUTOMATIONS.md).

## Labels and filters

- **Several labels at once** (11 Nov 2026, asked by Lou Canava): on a label's page, a click on another label in the menu adds it (marked), a click on a marked one takes it off; the list follows live. On the page, × takes one off, + adds one (the phone way), and **All of them** (default) / **Any of them**. Address `/label/12+15`, `?any=1`. From any other page, a label opens alone.
- Labels are coloured chips. Right-click one to rename it or change its colour. Labels are sorted by colour (your order, in Settings), then alphabetically.
- Saved filters (right panel) can be dragged into order. A new one goes to the bottom.
- **New:** every label is now loaded. Only the first 50 used to be, and you have 98.

## Creating tasks

- **New task window (simplified 19 Oct):** press `n` (or `c`), the `+` in the top bar, or the round `+` button on a phone. It is **one text box**: type the title, the task goes to the Inbox, where you give it a project, labels and dates later. Nothing in the text is read as a date or label any more. Enter adds it and closes the window. ⌘/Ctrl+Enter adds it and keeps the window open. Text or a link shared from another app is kept as the notes.
- *Until 19 Oct* the window also had project, labels, dates, description and a related task, and read **shortcuts in the title**: `#project`, `@label`, `>start`, `!due`. **New:** dates are understood in English *and* French:
  - `!today` `!tomorrow` `!demain` `!monday` `!lundi` `!fri`
  - `!in 3 days` `!dans 3 jours` `!in 2 weeks` `!dans 2 semaines`
  - `!+3` `!3d` `!2w`
  - `!next week` `!semaine prochaine`
  - `!25/12` `!25/12/2026`
  - a time after the date: `!demain 14h`, `!fri 9h30`

  "dans 3 jours" never worked before, because only the first word was read.
- **Quick capture from anywhere:**

  | Where | How |
  |---|---|
  | Mac | **new** ⌥⇧⌘T, a text box only. If the PC is off, the task is saved and sent later. |
  | Windows | **new** Ctrl+Alt+T |
  | Phone | long-press the app icon > New task (drag it onto the home screen for a one-tap **New task** icon), or **Share** any text or link to Tasks |

  Details in [DEVICES.md](DEVICES.md).

## Repeating tasks

Set in the task page only (for example every Monday at 9, or every year on the same date). Views show the next occurrence's due date.

## Keyboard (computer)

Press `?` for the full list. Main keys:

| Key | Does |
|---|---|
| `n` / `c` | New task |
| ⌘K / Ctrl+K | Search |
| ↑ ↓ or k j | Move the selection |
| x or Space | Complete |
| r | Rename |
| l | Labels |
| m | Move to another project |
| i | Back to the Inbox |
| Enter or o | Open |
| Backspace | Delete |
| Esc | Close / go back |
| / | Search (new) |
| g h · g i | Home · Inbox page |
| g t · g w | Tomorrow's priorities · Weekly review (new) |
| g b · g s | Bin · Settings (new) |
| v (task page) | Validate the definition (new) |

## Help and settings (simplified 19 Oct)

The `?` key or button on a computer, **Settings** on a phone. Same content in both, from top to bottom:
- **Install the app** (29 Oct; only while the app is not installed on this device): installs it in Chrome, Edge and Brave, otherwise shows the steps for the browser in use (Firefox, Samsung Internet, iPhone, a link opened inside WhatsApp…).
- **Status:** server online or not, last sync and changes waiting, server health (all OK, or each problem with how to fix it), changes the server refused. **Run a health check** asks the PC to check itself now; the result appears within a minute. Only a signed-in device can ask, at most once a minute.
- **Error report (30 days)** (new, 21 Oct): one click gathers everything that went wrong in the last 30 days, on the server (health check history, automations, Vikunja warnings, off-PC copy, alerts, app installs) and on **all your devices** (each one sends the errors it sees to the PC), copies it, and shows it to download. Paste it to Claude.
- **Keyboard** (computer) or how to put the **New task** icon on the home screen (phone).
- **Alerts:** your ntfy topic, **Save**, **Test**.
- **Maintenance** (folded): duplicates, label colour order, Pro/Perso folder conversion (only if needed), Fresh start.
- **Sign out**, and the build and Vikunja versions.

Removed: "Send all tasks to the Inbox view" (Fresh start does it), the separate About and This device sections (their content is in Status and the last line).

## Phone (new, 19 Oct)

- **Long-press a task** in any list: a menu to change its project, labels, due date (Today, Tomorrow, In a week, any date, or none) or start date, open it, or move it to the Bin (with Undo). A normal tap still opens the task.
- **The back gesture** (or back button) closes what is open, the New task box, a menu, a dialog or a side panel, instead of leaving the page.
- The task title on the task page grows over several lines.

## Updates (new, 21 Oct)

Every device switches to a new version by itself: the app checks the PC's version when it starts, when you come back to it and every 10 minutes, and reloads as soon as you are not typing and no window is open (or at once if it is in the background). Changes waiting to be sent are kept. If it already reloaded once for that version, a "Reload" banner is shown instead.

## Sync, offline and installation

- The app keeps a full copy of your tasks on each device. It opens instantly and works with no network, including when the PC is off: you can read, add, edit, complete and delete. Changes wait on the device and are sent when the server is reachable again.
- **new** It is a real installable app (icon, own window, works offline). Before 10 Oct the page was never registered as installable, and offline mode could not work.
- **new** Coming back to the app (unlocking the phone, focusing the window) syncs at once, instead of up to five minutes later.
- **new** Tasks, projects and labels deleted on one device (or by an automation) now disappear on the others too.
- **new** A change made while your session had expired is now kept and sent after you sign in again. It used to be thrown away.
- **new** Several tasks created offline across an app restart no longer overwrite each other.
- **new** After the very first sign-in on a new device, the app starts syncing at once. Before, it stayed empty until reloaded.
- **new** When a new version of the app is installed on the PC, devices show "A new version is ready – Reload".
- **new** A red banner appears on every device when the server has a problem. Tap it for details, or hide it.
- **new** Sign-in supports two-factor codes and gives clearer messages (wrong password, too many attempts, server unreachable).

## The filter box on the home page (19 Oct, reworked 25 Oct)

At the top of the home page, in All, Perso and Pro. Empty, it is just one search box and the page shows Today, This week, Red and Available.

- **Type**: the matching tasks of the view replace the blocks at once. Words are found in the title, the notes, the **label names** and the **project name** (every word, any order, accents ignored).
- The labels matching what you type are proposed: **Enter** (or a click) turns one into a label chip and the box empties for the next. Backspace in the empty box removes the last label. With two labels or more: **All of them** or **Any of them**.
- Tap a chip to switch between "with" and "not" (struck out); × on the chip removes it.
- Once something is chosen, two small menus appear: due date (overdue, today, next 7 days, has / has no due date, between two dates) and project (sub-projects included), with the number of open tasks found.
- Everything is combined (AND), across the whole view, Today, This week, Red and Available included.
- **×** at the right of the box, or **Esc**, clears it and the blocks come back. It is not remembered: the home page always opens on the blocks.
- The search in the top bar is unchanged: it finds any task, in every view.

## Alerts (new, 10 Oct)

- Settings > Alerts: your ntfy topic. It is saved in your account, so your other devices pick it up the next time the app opens. **Send a test** checks it.
- The app sends one short alert to the topic when **sync has failed for 15 minutes**, or when **the server signed this device out**. Signing out yourself sends nothing.
- A device with no network sends nothing, and the app sends only while it is open: a closed phone app does not run.
- The text is generic: it never includes a task, project or server detail. It is tagged with the kind of device (phone, mac, windows, pc).
- You get the alerts in the ntfy app on the phone, and as Windows notifications on the PC (except the PC's own).

## Phone layout (new)

- On a phone the app is now laid out for the phone, not a shrunk computer page:
  - the task title uses the full width, with labels below and the project and dates on one line
  - empty columns are hidden
  - tapping a task opens it
  - tapping a label can no longer remove it by accident
- A round **+** button sits where your thumb is. The top bar keeps menu, view, home, search, sync, filters.
- The new-task window opens at the top, clear of the keyboard, without keyboard-only hints.
- The app uses the real visible height of the screen (no content hidden under the browser bar) and respects the notch and gesture areas.

## Added 6 Nov 2026
- Shopping list (🛒 when adding or on a task's page; page /shopping, grouped by shop label; skips the Inbox).
- Several tasks at once (Ctrl/⌘-click, Shift-click; bar: project, section, complete, Bin; drag together).
- Undo / redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, ↶ ↷ in the top bar), last 50 changes.
- Project page: order button (oldest / newest / my order), drag a task onto another, "Add a task to this section…", ↑ ↓ for sections, Archive / Restore; task page: Section.
- Tomorrow's priorities: Today's summary (planned and done). Removed 13 Nov 2026 (only what is ahead).
- Titles start with a capital letter; no password-manager prompts in the app's boxes; menus open upwards when needed.

## Added 10 Nov 2026
- Sections, the tasks in them and "My order" kept in your account (Vikunja user setting `tasks_sections`), so every device shows them: the phone did not.
- Parent project's page: its sub-projects (all levels) and their tasks, foldable.
- Pending tasks: a tick on a task's page (hidden label `ctx:pending`). Off the home page and Tomorrow's priorities; greyed at the end of their project's lists; Weekly review "Pending projects and tasks" with Resume. Undoable.
- Markdown in task descriptions (shown formatted, click to edit; links in a new tab; cleaned of any script).
- "What's new" box after each update (once per device), and Help > What's new.
- Admin: "Seen by" on every warning.

## Layout (10 Nov 2026)
- Top bar: menu ☰, Home, view, back/forward | search | sync dot (→ Status), undo/redo, New task, ? (dot: updates not seen / something in Status).
- Menu ☰ (left; drawer on the phone): Home, Shopping, Tomorrow's priorities, Weekly review; Projects (show pending · archived), Filters, Labels (each heading folds, remembered per device); Bin at the bottom. The right panel is gone.
- Help centre (? or `/settings?tab=`): Help (install, organisation, user guide, shortcuts) · Updates (all updates, searchable, highlighted) · Status (server, sync, warnings, health check, error report) · Settings (alerts, automations, my data, label colours, maintenance, account).
- Shortcuts: g p Shopping, g u Updates, g s Settings.



## 13 Nov 2026

- **Project page**: name with + (new task window) and ⋯ (order, completed, pending tasks, pending project, archive); sections dragged by their title bar or handle, folded, + and ⋯ each; compact rows without column names.
- **Pending tasks** hidden everywhere except their own Weekly step and their project page on request.
- **Upcoming** (`/upcoming`): the next 7 days with planned and due tasks; plan with the row menu or by dragging; the week's list not planned yet; Later.
- **The week's list**: label `week`, picked in the Weekly review (☆); the home page's This week block and a group of Tomorrow's priorities.
- **Tomorrow's candidates**: This week, Next actions, Due soon, Due later, Recently added.
- **Appearance** per device: Light, Black, Like the device; labels in shades of grey; black icon with Black.

## Added 19 Nov 2026

- **Reminders**: task page › Remind (day and time); the PC sends a phone notification through the account's ntfy topic (`automations/reminders.py`, every minute). Kept by every full update (app `sync.ts` keep list, automations `TASK_FIELDS`).
- **Inbox → project in one move**: drag a task onto a project in the menu (any page, computer); from the Inbox page the move also validates it (also the row's project and the selection's Move).
- **New task window, labels**: all labels listed (was the first 8), the list slides on phones, no keyboard popping up on touch screens.
- **Staying signed in**: a session renewal that fails at the same moment as another is tried again before signing out; sessions last a year after the last use (server).
- **Selection bar, Abandon**: closes every ticked task as abandoned (to the Bin, undo with Ctrl/⌘+Z).
- **Home, + per block**: a new task with the block's label (today, week, p1, next-action).
- **Editing a title in a row**: the labels stay in view and clickable.
