# Devices

The app is a **Progressive Web App (PWA)**. Once installed it is a real app:
- its own icon (Dock, Start menu, phone home screen) and its own window, without browser bars
- it opens with no network
- it shows in the phone's share menu
- it updates itself

It is the same "proper app" as the Vikunja one you had installed before, but for your own app.

Address on every device: **`https://pc-lou.tailc45f62.ts.net:8443`**.

## Install

Easiest: open the app, tap **?** (Help) → **Install the app** at the top. It installs it (Chrome, Edge, Brave) or shows the steps for the browser in use. A link opened from WhatsApp or another app must first be opened in the browser (Help says how).

| Device | Browser | How |
|---|---|---|
| **Android** | Chrome or Brave (or Firefox, Edge, Samsung Internet: installable, without the icon shortcuts and share entry) | Open the address, sign in, then ⋮ > **Install app** (or Add to Home screen > Install). Long-press the icon for "New task" / "Weekly review" / "Tomorrow's priorities". "Share" from any app offers **Tasks**. |
| **Mac** | Brave, Chrome or Edge | Open the address, sign in, then the install icon at the right of the address bar (or menu > Save and share > **Install Tasks**). The app appears in Applications/Launchpad and can be kept in the Dock. |
| **Mac** | Safari (macOS 14+) | File > **Add to Dock** |
| **Windows** | Edge, Brave or Chrome | Install icon in the address bar. The app appears in the Start menu. Pin it to the taskbar |
| **iPhone / iPad** | Safari (or Chrome / Edge on iOS 16.4+) | Share > **Add to Home Screen** (no share-menu entry and no icon shortcuts: iOS does not offer them to web apps) |
| **Linux / Chromebook** | Chrome | As Windows |

Firefox can use the app in a tab, but cannot install it.

## Quick capture

| Device | How | When the PC is off |
|---|---|---|
| Mac | ⌥⇧⌘T → one text box → Enter. Set up with `mac/install-quick-capture.command` | The task is kept on the Mac and sent with the next capture |
| Windows PC | Ctrl+Alt+T → "New task" window, on the PC's own address `http://127.0.0.1:5173`. Set up with `scripts\install-windows-quick-capture.bat`; sign in once in that window | (The PC is the server) |
| Android | Long-press the Tasks icon > **New task**, or **Share** a text/link → Tasks | Kept in the app, sent later |
| Any device | `n` in the app, or the round + on a phone | Kept in the app, sent later |

On the server PC itself, open the app at **http://127.0.0.1:5173** rather than the public address: a browser on the PC cannot always reach the PC's own public address (it showed "500 Internal Error").

Every quick capture lands in the **Inbox** project, waiting for you to define it.

## When the PC is off

| | Works? |
|---|---|
| Open the installed app | Yes (it must have been opened at least once on that device since 10 Oct) |
| See all tasks, projects, labels, filters | Yes, as of the last sync of that device |
| Add, edit, complete, delete, move tasks | Yes. Changes wait on the device ("N changes waiting" in Settings) |
| See changes made on *another* device meanwhile | No. Each device syncs with the PC, not with the others |
| Automations (next-action, overdue labels…) | No, they need the server |
| Sign in for the first time on a new device | No |

When the PC is back, each device sends its waiting changes and then downloads the latest, at the latest 5 minutes later, or at once when you bring the app to the front. If the same task was changed on two devices meanwhile, the change sent last wins.

## Compatibility between devices

- All devices run the same app version, served by the PC. When it changes, each device gets it the next time it opens the app.
- Data is identical everywhere after a sync.
- Two exceptions are kept per device:
  - **sections** inside projects
  - layout choices (panel widths, colour order)
- The health check tests the server side. A device-side problem shows in that device's Settings > This device: not installed, not ready offline, storage not protected, changes waiting or refused.
