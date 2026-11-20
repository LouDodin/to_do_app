# todo-server

Your to-do server: Vikunja and the Tasks app, running on this PC. Reach it from anywhere at
**https://pc-lou.tailc45f62.ts.net:8443**.

**Start with [docs/START-HERE.md](docs/START-HERE.md).**

| I want to… | Do |
|---|---|
| Check all is well | `scripts\health-check-now.bat` |
| Fix "it does not work" | `scripts\restart-server.bat`, then [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Update Vikunja safely | `scripts\update-vikunja.bat` |
| Get an old version of my data back | `scripts\restore-backup.bat` |
| Prepare for a PC change | `scripts\export-for-new-pc.bat` + [docs/MOVE-TO-NEW-PC.md](docs/MOVE-TO-NEW-PC.md) |
| Give an account to someone | `scripts\create-user.bat` + [docs/SHARING.md](docs/SHARING.md) |
| GTD automations (labels, dates, pending projects) | [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md): `install-automations`, `start-automations`, `stop-automations` |
| Tidy the PC | `scripts\cleanup-pc.bat` (list), `cleanup-pc-apply.bat` (move), `cleanup-pc-empty.bat` (Recycle Bin) |
| Use the app on this PC | `http://127.0.0.1:5173` (the public address does not work from the server PC itself) |

Do not move, rename or edit files in `vikunja\`, `app\` or `tools\` by hand. The scheduled tasks depend on them.
