#!/bin/bash
# Removes what the Mac no longer needs now that the server lives on the PC.
# Without "apply": LISTS what it would do. With "apply": MOVES files to ~/_to_delete/<date>/
# (delete that folder yourself once you are sure), stops the old services. Never touches
# ~/Partage_One_plus_nord_CE_2/areas (the project folders that stay in sync) nor the automations
# folder (still used until the automations move to the PC). Keeps Tailscale.
APPLY=0; [ "$1" = "apply" ] && APPLY=1
BIN="$HOME/_to_delete/$(date +%Y-%m-%d)"
say() { echo "$@"; }
do_or_say() { if [ $APPLY = 1 ]; then eval "$1"; echo "  done: $2"; else echo "  would: $2"; fi; }
move() { [ -e "$1" ] || return; if [ $APPLY = 1 ]; then mkdir -p "$BIN"; mv "$1" "$BIN/" && echo "  moved: $1 -> $BIN/"; else echo "  would move: $1 ($(du -sh "$1" 2>/dev/null | cut -f1)) - $2"; fi; }

say "== 1. Old app service (vite dev server on port 5173)"
P="$HOME/Library/LaunchAgents/com.tasks-app.dev.plist"
if [ -f "$P" ]; then
  do_or_say "launchctl bootout gui/$(id -u)/com.tasks-app.dev 2>/dev/null; true" "stop com.tasks-app.dev"
  move "$P" "the app is now served by the PC"
fi
pkill -x quickpanel 2>/dev/null

say "== 2. Tailscale serve on this Mac (old addresses macbook-pro-de-lou...:443 / :8443)"
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale; [ -x "$TS" ] || TS=$(command -v tailscale)
[ -n "$TS" ] && do_or_say "\"$TS\" serve reset" "tailscale serve reset (Tailscale itself stays)"

say "== 3. Old Vikunja server in Docker (stopped since 9 Oct; the data now lives on the PC)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  for c in $(docker ps -a --format '{{.Names}}' | grep -i vikunja); do do_or_say "docker rm -f $c" "remove container $c"; done
  for i in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -i vikunja); do do_or_say "docker rmi $i" "remove image $i (re-downloadable)"; done
  echo "  Docker Desktop itself: uninstall it by hand if you use it for nothing else."
else echo "  Docker not running: start Docker Desktop and run again to remove the old container."; fi

say "== 4. Old folders"
if [ -d "$HOME/vikunja" ]; then
  if [ $APPLY = 1 ]; then mkdir -p "$BIN"; tar czf "$BIN/vikunja-mac-server-final.tar.gz" -C "$HOME" vikunja && echo "  archived ~/vikunja into $BIN/vikunja-mac-server-final.tar.gz"; fi
  move "$HOME/vikunja" "old server data (state of 9 Oct, before the move; the PC has the live data + nightly backups)"
fi
move "$HOME/Downloads/tasks-app-v1-source" "old copy of the app (the PC has the live one in Documents\\todo-server\\app-source)"
find "$HOME" -maxdepth 5 -type d \( -name ongoing_projects -o -name pending_projects \) -not -path "*/Library/*" -not -path "*/.Trash/*" \
  -not -path "*/Partage_One_plus_nord_CE_2/areas/*" 2>/dev/null | while read -r d; do
  move "$d" "folder mirror of an older version of the app (projects now live in Partage_One_plus_nord_CE_2/areas)"
done
for f in "$HOME/Desktop/start-tasks-app.command" "$HOME/Downloads/start-tasks-app.command" "$HOME/Downloads/vikunja.zip" "$HOME/Downloads/tasks-app-v1-source.zip"; do move "$f" "leftover of the old set-up"; done

echo
if [ $APPLY = 1 ]; then echo "Done. Everything moved is in $BIN (listed above)."; else echo "Nothing changed. To apply: bash \"$0\" apply"; fi
read -r -p "Press Enter to close"
