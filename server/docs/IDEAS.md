# Ideas: none of these is implemented. Tell me which ones you want.

Each one keeps the app minimal: one small control or one page, not a new layer of settings. Effort is for Claude: **S** under an hour, **M** a few hours, **L** a day or more. Several ideas come from what Todoist, TickTick and Things do well, adapted to your GTD set-up and your existing labels.

## My top 8

1. **Off-PC automatic backup (S).** Copy each nightly backup into your OneDrive folder too (encrypted zip). If the PC dies with its disk, your data survives with no action from you. Today, that only happens when you run `export-for-new-pc`.
2. **"What can I do now?" (S).** Pick how much time you have (`<15` `<30` `<60`, labels you already use) and/or a context (`computer`, `call`, `read`, `write`, `think`). You get the matching `next-action` tasks. Your labels are made for this, but no screen uses them together.
3. **Swipe on the phone (M).**
   - swipe right: complete (with Undo)
   - swipe left: toggle `today`
   - long-press: select several tasks
4. **Undo (S).** "Task completed — Undo" / "Deleted — Undo" for 5 s, everywhere.
5. **Morning digest (S).** At 07:30, one notification (ntfy) or e-mail with today's tasks and the Red ones. Free, from the PC.
6. **Move the automations to the PC (M).** Already planned, see [AUTOMATIONS.md](AUTOMATIONS.md). They would then run 24/7, appear in the same health report, and be tested before every Vikunja update.
7. **Guided weekly review (M).** The GTD steps one by one:
   - empty the Inbox
   - each active project: still useful, has a next action?
   - Waiting-for list: follow up?
   - Someday list
   - pending projects to activate

   Today's page covers two of these steps.
8. **Recurring tasks from quick add (S).** `!every monday 9h`, `!tous les mois`, without opening the task page.

## Capture

| Idea | From | Effort |
|---|---|---|
| Voice capture: a microphone in the new-task box (speech recognition in Chrome/Android) | TickTick | S |
| Quick add understands `!p1` / `!!` for priority, and `*` for today | Todoist | S |
| E-mail to Inbox: forward an e-mail to an address and it becomes a task (needs a mail service) | Todoist, Things | M |
| iPhone: Siri / Shortcuts action "Add to Tasks" (same as the Mac script) | Things | S |
| Paste several lines: one task per line | Things | S |

## Planning and focus

| Idea | From | Effort |
|---|---|---|
| **Upcoming**: the next 14 days, day by day, by due date | Todoist, Things | M |
| **Calendar**: your tasks in Google/Apple Calendar through Vikunja's built-in CalDAV, read-only, no code | TickTick | S (set-up only) |
| Eisenhower matrix from your labels (`p1` × `today`/due) | TickTick | M |
| Focus mode: one task full screen, with a timer (Pomodoro); completing it shows the next `next-action` | TickTick | M |
| Waiting-for with follow-up dates: `waiting-for` tasks resurface on their date | GTD | S |
| Someday/Maybe list kept out of every view except the weekly review | GTD, Things | S |
| Time estimates added up per day ("Today: 3 h 20 of tasks") from your `<15/<30/<60/>60` labels | — | S |
| Checklists inside a task (sub-steps that are not separate tasks) | Things, TickTick | M |
| Project templates (for example "Trip": the usual tasks created at once) | Todoist | M |
| Logbook: what you completed, by day/week, with a simple count per week | Things, Todoist karma | S |
| Habits (daily/weekly with streaks), kept apart from tasks | TickTick | L |

## Phone and computer polish

| Idea | Effort |
|---|---|
| Pull down to refresh on the phone | S |
| Follow the system dark mode (today the app is deliberately light-only) | M |
| Drag tasks to reorder on the phone (today: computer only) | M |
| Bulk edit: select several tasks → project / labels / dates / complete | M |
| Show conflicts instead of "last change wins" when the same task changed on two devices offline | M |
| Mac menu-bar / Windows tray: today's tasks at a glance | M |
| Print / PDF of today's list | S |

## Sharing and other people

| Idea | Effort |
|---|---|
| "Set up my account like Lou's" button: creates the labels, contexts, filters and Inbox conventions | S |
| Automations for every account on the server (each with its own token) | M |
| Share a project from the app (instead of Vikunja's pages), with who did what | M |
| Assignees and comments on tasks (Vikunja has both; the app does not show them) | M |
| Import from Todoist / TickTick for a new user (Vikunja has importers) | S (set-up) |
| Linux / Docker version of the server kit | S |

## Robustness

| Idea | Effort |
|---|---|
| Off-PC backup to OneDrive (see top 8) | S |
| Monthly reminder to run `export-for-new-pc` (or make it automatic to OneDrive) | S |
| Restore test: once a month, check that the newest backup really starts in Vikunja (on port 3457, like updates) | S |
| A small UPS (battery) for the PC, and "power on after power loss" in the BIOS | — (hardware) |
| A status page for the phone with each check of the server, beyond the banner and Settings | S |
