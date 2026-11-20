# Tasks

A personal to-do app that syncs between a Mac, a Windows PC and a phone.

| Folder | What it is |
|---|---|
| `app/` | The web app (SvelteKit, offline-first, installable). Talks to a self-hosted Vikunja server. `npm install`, `npm run dev`, `npm run build`. User guide in `app/guide/`, admin guide in `app/admin-guide/`. |
| `server/` | Everything that runs on the PC hosting Vikunja: start-up and maintenance scripts (`scripts/`), the automations (`automations/`), helpers (`tools/`), the Vikunja launcher (`vikunja/run-vikunja.cmd`), Mac helpers (`mac/`) and the documentation (`docs/`, start with `docs/START-HERE.md`; every change is in `docs/CHANGELOG.md`). |

Not in this repository: the database, backups, logs, keys and the server secret. In `server/vikunja/run-vikunja.cmd`, `REPLACE_WITH_YOUR_SECRET` stands for the real value kept on the PC.
