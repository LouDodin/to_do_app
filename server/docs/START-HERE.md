# Tasks — start here

Your to-do system now runs on this PC (`pc-lou`), and every device uses it:

| What | Address |
|---|---|
| **The app** (install it on every device) | `https://pc-lou.tailc45f62.ts.net:8443` |
| Vikunja (the server, its own web pages) | `https://pc-lou.tailc45f62.ts.net` |
| Everything on the PC | `Documents\todo-server\` |

No VPN is needed: the two addresses work from anywhere, on Wi-Fi or mobile data.

## Status (10 Oct 2026)

### On the PC: done

- The server settings, scheduled tasks and the new app are installed (`MORNING.bat`), and the health check is all OK.
- Ctrl+Alt+T opens the "New task" window.
- **Automations (10 Oct):** `scripts\install-automations.bat`, then switch the Mac, then `scripts\start-automations.bat`. The steps are in [AUTOMATIONS.md](AUTOMATIONS.md), "Moving day".
- On this PC, use the app at **`http://127.0.0.1:5173`**: a browser on the server PC cannot use the PC's own public address.
- **Tidy the PC** whenever you like:
  1. `scripts\cleanup-pc.bat` only lists what it would move.
  2. `scripts\cleanup-pc-apply.bat` moves it to `_to_delete\` (one-off files go to `setup-history\`).
  3. Once you have checked, `scripts\cleanup-pc-empty.bat` sends `_to_delete\` to the Recycle Bin.

### On the phone (about 2 minutes)

1. Open `https://pc-lou.tailc45f62.ts.net:8443` in Chrome or Brave and sign in. The server address is filled in for you.
2. Install the app: in the menu (⋮), choose **Install app** (or Add to Home screen > Install). It becomes a real app with its own icon and no browser bars, and it works offline.
3. Try it out:
   - **Long-press the icon** and choose "New task".
   - **Share** a link or text from any app, choose **Tasks**, and it becomes a task.
4. Remove the old pieces:
   - the old home-screen icon pointing at `macbook-pro-de-lou…`
   - the HTTP Shortcuts widget, which sent tasks to the Mac. You can uninstall HTTP Shortcuts if you used it only for this.

### On the Mac (about 10 minutes)

The best way is to **open this conversation in the Claude app on the Mac and choose "Link to this computer"**. I can then do the clean-up myself with the commands, looking at what is really there. Otherwise, use the scripts in `todo-server\mac\`. Send that folder to the Mac first: right-click it on the PC > "Send with Tailscale" > your Mac.

1. In Brave, open `https://pc-lou.tailc45f62.ts.net:8443`, sign in, then choose **Install Tasks** (icon at the right of the address bar). The app gets its own window and Dock icon.
2. `mac/1-report.command`: lists everything left from the old set-up. It changes nothing.
3. `mac/install-quick-capture.command`: the new ⌥⇧⌘T. Type the task and it goes to the Inbox, with no browser and no panel. If the PC is off, the task is kept and sent later.
4. Automations: done. They point at the PC, and on moving day the Mac switches to "folders only" ([AUTOMATIONS.md](AUTOMATIONS.md)).
5. `mac/3-cleanup.command`: stops the old app service and the old Tailscale addresses, removes the stopped Docker container, and moves old folders to `~/_to_delete/<date>/`. Run it once to preview, then with `apply`.

### Recommended (5 minutes)

- **Turn on two-factor authentication.** The server is reachable from the internet, so in Vikunja go to Settings > Two-factor authentication. The app now asks for the code at sign-in.
- **Use a strong, unique Vikunja password** if it isn't one already.

## Where to read next

| Document | For |
|---|---|
| **Tasks-admin-guide.pdf** | For you: running the server, managing it from the Mac, users, backups, alerts (kept up to date with every change) |
| **Tasks-user-guide.pdf** | For anyone using the app (give it to new users) |
| [FEATURES.md](FEATURES.md) | Everything the app does |
| [DEVICES.md](DEVICES.md) | Installing on each device, quick capture, what happens offline or when the PC is off |
| [OPERATIONS.md](OPERATIONS.md) | Every script: updates, backups, restarts, health checks, notifications |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | "Something does not work" → what to do |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it all fits together |
| [SECURITY.md](SECURITY.md) | What is exposed and how it is protected |
| [MOVE-TO-NEW-PC.md](MOVE-TO-NEW-PC.md) | When this PC breaks or is replaced |
| [SHARING.md](SHARING.md) | Giving it to other people |
| [AUTOMATIONS.md](AUTOMATIONS.md) | The GTD automations: what runs on the PC, what stays on the Mac, moving day |
| [IDEAS.md](IDEAS.md) | Suggested features (none implemented without your OK) |
| [CHANGELOG.md](CHANGELOG.md) | Everything changed, added, moved or removed, and when |
