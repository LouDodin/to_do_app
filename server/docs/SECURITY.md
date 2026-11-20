# Security

## What is reachable from the internet

Through Tailscale Funnel, anyone who knows the addresses can reach:
- `https://pc-lou.tailc45f62.ts.net`: Vikunja (sign-in page and API)
- `https://pc-lou.tailc45f62.ts.net:8443`: the app's files (no data: the data needs a signed-in session)

Nothing else on the PC or your home network is exposed. The two services listen on 127.0.0.1 only, and Tailscale is the only way in.

## Protections in place

| Protection | Since |
|---|---|
| HTTPS everywhere (Tailscale certificates, renewed automatically) | 9 Oct |
| Sign-ups closed: no one can create an account (accounts only via `create-user`) | 9 Oct |
| Sign-in attempts limited by Vikunja (10 per minute) | built in |
| **CORS restricted to the app**: only `https://pc-lou…:8443` can use the API from a browser. It was `*`: any website you visited while signed in could have renewed your session token and read your tasks | 10 Oct (MORNING) |
| **Link sharing off** (unused; one less public entry point) | 10 Oct (MORNING) |
| **App server security headers** (no framing, no MIME sniffing, no referrer, no camera/mic/location) | 10 Oct |
| Two-factor sign-in supported by the app | 10 Oct |
| Hourly check: sign-ups still closed, Vikunja version vs security releases, Tailscale connected | 10 Oct |
| Vikunja updates verified (SHA-256) and tested before switching | 10 Oct |
| Tailscale updates itself | 10 Oct (MORNING) |
| Nightly backups, 30 days | 9 Oct |
| The Mac quick-capture token lives in the macOS Keychain and can only *create* tasks | 10 Oct |

## Recommended (your action)

1. **Turn on two-factor authentication**: Vikunja > Settings > Two-factor authentication. This is the single most useful step, since the sign-in page is public.
2. Use a **long, unique password** for Vikunja.
3. Keep an **off-PC copy**: run `export-for-new-pc` once a month and keep the zip somewhere safe, such as an encrypted USB stick. If the PC dies with its disk, the nightly backups die with it.
4. Delete API tokens you no longer use (Vikunja > Settings > API Tokens). You have 4 old ones from the Mac era ("To do", "Token 2", "Full Access", "Automate filters"). Keep "Full Access": the automations use it (on the PC it is in `state\automation-token.txt`, readable only by you, the administrators and the system; on the Mac in `~/vikunja-automation/api_token.txt`, mode 600). Keep the one the Mac quick capture uses. Delete the others once you have checked nothing else uses them. A token limited to what the automations need (tasks, projects, labels, filters) would be safer than "Full Access": ask Claude when you want to switch.

## What to keep private

- The ntfy topic (`state\ntfy-topic.txt`, and in your account): anyone who knows it can read your alerts and send fake ones. The alerts are generic, so nothing personal leaks. If it ever leaks, choose a new topic: put it in the file and in the app (Settings > Alerts), then re-subscribe on the phone.


`vikunja\run-vikunja.cmd` (server secret), `state\api-token.txt`, the export zips, `backups\`, and the earlier `vikunja.zip` from the Mac (moved to `_to_delete` by the clean-up).

## Known limits

- **Tailscale Funnel** is free and has been for years, but it is marked *beta* and its bandwidth is capped at an unpublished level (irrelevant for a to-do app). If Tailscale ever changes it, the alternative is Cloudflare Tunnel with a domain of your own (about €10/year). The app needs no change, only the address.
- All public requests reach Vikunja from Tailscale on the same PC, so its per-address limits count everyone together. An attacker hammering the sign-in page could make *your* sign-in wait a minute. They still cannot guess the password faster.
- The PC itself must stay secure: Windows updates on, a password on your Windows account, and disk encryption (BitLocker, if your Windows edition has it). Anyone using the PC can read the database file.
