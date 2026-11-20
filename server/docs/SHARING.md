# Sharing it with other people

You can, in three ways. They differ in who holds the data and who looks after the server.

| | A. An account on **your** server | B. **Their own** server | C. **Share projects** between accounts |
|---|---|---|---|
| For | Family and close friends you trust, and who trust you | Anyone with an always-on computer | Two people working on the same list (couple, colleague) |
| They need | A browser | An always-on Windows PC, Tailscale (free), 30 min | An account (A or B) |
| Their data lives | On your PC | On their PC | In the owner's account |
| You | Host, back up, update for them | Do nothing after giving the kit | — |
| Cost | 0 | 0 | 0 |

## A. An account on your server (the "create a Vikunja account and use my interface" idea)

**How:**
1. From the Mac, ask Claude "create a user: <name>, <e-mail>": the PC creates the account with a random temporary password and sends it only to your Mac (Downloads, `YYMMDD_Tasks-account-<username>.txt`, with what to tell them). Or, at the PC, double-click `scripts\create-user.bat` and enter their username, e-mail and a temporary password. Sign-ups stay closed to everyone else.
2. Send them:
   - the app address `https://pc-lou.tailc45f62.ts.net:8443`
   - their username and the temporary password
3. They install the app on their devices, as described in [DEVICES.md](DEVICES.md). At sign-in, the server address is already filled in.
4. They change their password (Vikunja `https://pc-lou.tailc45f62.ts.net` > Settings), and should turn on two-factor authentication.

**What they get:**
- **Help > My data**: a copy of their own data on their own device (a table for Excel, or everything), with a reminder once a month.
- Their own private, empty account, with the same app, views, Inbox, offline mode, phone layout and quick capture from the share menu.
- They do not see your tasks, and the app never shows you theirs.
- Their Vikunja account starts with an "Inbox" project, which the app uses as their Inbox.

**Limits, to be honest about:**
- **Your PC is their server.** When it is off, they work offline like you, and their changes wait.
- **You can technically read their data.** It is in your database file, your backups and the copies on your Mac (all accounts are backed up together). They must be fine with that, and you are responsible for it. For non-family, that is real personal-data hosting: keep it to people you know.
- **The GTD automations** (since 26 Oct 2026): they are **on by default** for every account (the app switches them on by itself); each person can turn them off in **Help > Automations**, and that choice is kept. The app creates a key for their account only, with just the rights the automations need, and gives it to the PC; **Turn off** removes and deletes it. The PC then runs a separate copy for them, which only ever works on their account (its own labels, created if missing). The health check watches each account on its own. List: [AUTOMATIONS.md](AUTOMATIONS.md).
- The app expects your conventions: labels `today`, `next-action`, `overdue`, `last-day`, `p1`; contexts Pro/Perso set on top-level projects; saved filters such as "Tomorrow". They can create the same, or ignore what they don't use. A "set up my account like Lou's" button is in [IDEAS.md](IDEAS.md).
- **Mac quick capture** (⌥⇧⌘T) for them: same scripts, with their own token. Android share and icon shortcuts work at once.
- **Load:** a few people are no problem for the PC or for Tailscale Funnel (its bandwidth cap is unpublished but far above what to-do lists use). Funnel is free but labelled beta by Tailscale.
- **Sign-in limits are shared:** 10 sign-in attempts a minute for everyone together (see [SECURITY.md](SECURITY.md)). This is fine for a handful of people.
- **To remove someone:** in Vikunja, they can delete their own account (Settings). Otherwise ask Claude to give you the command for your server. Their data is then deleted.

## B. Their own server (nothing hosted by you)

**How:**
1. On your PC, run `scripts\make-starter-kit.bat`. You get `Documents\tasks-starter-kit-<date>.zip`, with **no data, no secret, no token** of yours.
2. They need:
   - an always-on Windows 10/11 PC
   - a free Tailscale account
3. They:
   1. unpack the kit into `Documents` (so they have `Documents\todo-server`)
   2. run `scripts\setup-new-pc.bat`. It installs Python and Tailscale, creates a new secret, and sets everything up.
   3. approve Funnel if Tailscale asks
   4. run `scripts\create-user.bat` to create **their** account
4. Their addresses are `https://<their-pc-name>.<their-tailnet>.ts.net(:8443)`. Every script and the app adapt to the name by themselves.
5. Their documentation is in their `docs\` folder: the same as yours. [MOVE-TO-NEW-PC.md](MOVE-TO-NEW-PC.md) explains the Tailscale steps.

**Other kinds of server:**
- **Mac or Linux, NAS, Raspberry Pi, cloud VM:** Vikunja runs everywhere (Docker image or native builds). The app is a folder of static files that any web server can serve, and Tailscale Funnel works on Linux and macOS too. The scripts are Windows-only: on Linux it is about 10 commands (Docker Compose + `tailscale funnel`). Ask Claude for a Linux version when someone needs it.
- **Without Tailscale:** any HTTPS hosting works. One option is a domain with Cloudflare Tunnel. Another is a VPS with Caddy.

**Updates:** they get Vikunja updates the same way (`update-vikunja`). App updates come with a new kit or an `app-next.zip` you send them, which they install with `deploy-app`.

## C. Working on the same projects

Vikunja can share a project with another account, read-only or read-write, and the app shows shared projects like your own. Today the app has no screen for sharing: do it in Vikunja's own pages (`https://pc-lou.tailc45f62.ts.net` > the project > Share). The app does not show who did what, and has no assignees or comments. Those are listed in [IDEAS.md](IDEAS.md).

## Requirements summary

| Device | Requirement |
|---|---|
| Server | Windows 10/11 PC always on, internet, about 200 MB, Python 3, Tailscale free account (or any HTTPS hosting) |
| Phones | Android: Chrome or Brave (full features); Firefox, Edge, Samsung Internet install it too (no icon shortcut, no share-menu entry). iPhone: Safari, or Chrome/Edge on iOS 16.4+, Add to Home Screen (no share-menu entry, no icon shortcuts) |
| Computers | Chrome, Brave, Edge (install as app), Safari on macOS 14+ (Add to Dock). Firefox in a tab only |
