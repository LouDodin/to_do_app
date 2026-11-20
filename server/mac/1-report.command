#!/bin/bash
# READ-ONLY. Lists everything on this Mac that belonged to the old set-up (server on the Mac),
# so nothing is removed blindly. Writes ~/Desktop/tasks-mac-report.txt. Changes nothing.
OUT="$HOME/Desktop/tasks-mac-report.txt"
PC="https://pc-lou.tailc45f62.ts.net"
{
echo "Tasks - Mac report - $(date)"
echo
echo "== Docker (old Vikunja server)"
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.Names}}  {{.Image}}  {{.Status}}' 2>&1
  echo "-- images"; docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}' 2>&1
  echo "-- volumes"; docker volume ls 2>&1
else echo "docker not installed / not running"; fi
echo
echo "== LaunchAgents mentioning vikunja / tasks / todo"
for f in "$HOME"/Library/LaunchAgents/*.plist; do
  [ -f "$f" ] || continue
  if grep -qiE 'vikunja|tasks|todo|quickpanel|folder_sync|watchdog|webhook' "$f"; then
    echo "-- $f"; plutil -p "$f" 2>/dev/null | grep -E 'Label|ProgramArguments|=>  *"/|WorkingDirectory' | head -12
    launchctl list | grep -i "$(basename "$f" .plist)" || echo "   (not loaded)"
  fi
done
echo
echo "== Processes"
ps -ax -o pid,command | grep -iE 'vikunja|vite|quickpanel|folder_sync|watchdog|webhook_listener|healthcheck' | grep -v grep
echo
echo "== Tailscale serve / funnel on this Mac"
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale; [ -x "$TS" ] || TS=$(command -v tailscale)
[ -n "$TS" ] && "$TS" serve status 2>&1
echo
echo "== Folders of the old set-up"
for d in "$HOME/vikunja" "$HOME/vikunja-automation" "$HOME/Downloads/tasks-app-v1-source" "$HOME/Partage_One_plus_nord_CE_2/areas"; do
  if [ -e "$d" ]; then echo "-- $d  ($(du -sh "$d" 2>/dev/null | cut -f1))"; ls -la "$d" | head -40; fi
done
echo
echo "== Old project-folder mirrors (ongoing_projects / pending_projects / archived_projects) outside areas/"
find "$HOME" -maxdepth 5 -type d \( -name ongoing_projects -o -name pending_projects -o -name archived_projects -o -name 'PENDING*' \) \
  -not -path "*/Library/*" -not -path "*/.Trash/*" 2>/dev/null | while read -r d; do
  echo "-- $d  ($(find "$d" -type f | wc -l | tr -d ' ') files, $(du -sh "$d" | cut -f1))"; ls "$d" | head -15
done
echo
echo "== Where the automations point (server address, Docker use)"
if [ -d "$HOME/vikunja-automation" ]; then
  grep -rnE 'localhost:3456|127\.0\.0\.1:3456|ts\.net|docker|VIKUNJA_(URL|API|TOKEN)|osascript' "$HOME/vikunja-automation" \
    --include='*.py' --include='*.json' --include='*.env' --include='*.sh' --include='*.toml' --include='*.yml' --include='*.yaml' --include='*.cfg' 2>/dev/null \
    | sed -E 's/(tk_[a-f0-9]{6})[a-f0-9]+/\1…/g; s/(token["'"'"' :=]+)[A-Za-z0-9._-]{12,}/\1…hidden…/Ig' | head -80
fi
echo
echo "== Shortcuts mentioning tasks / vikunja"
shortcuts list 2>/dev/null | grep -iE 'task|vikunja|todo|capture' || echo "(none found by name)"
echo
echo "== crontab"
crontab -l 2>&1 | grep -iE 'vikunja|task|todo' || echo "(nothing)"
echo
echo "== Can this Mac reach the PC server?"
curl -s -m 10 "$PC/api/v1/info" | head -c 120; echo
} > "$OUT" 2>&1
echo "Report written to $OUT"
open "$OUT"
