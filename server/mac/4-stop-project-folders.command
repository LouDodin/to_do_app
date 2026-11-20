#!/bin/bash
# Stops the Mac automation that mirrors your projects as folders in
# ~/Partage_One_plus_nord_CE_2/areas (and writes the weekly report_<date>.txt there). 22 Oct 2026.
#
# It NEVER deletes, moves or renames anything in areas: every existing folder stays exactly
# where it is. From now on you create and manage the folders yourself.
#
# Without "apply": only SHOWS what it would do. With "apply": stops the two Mac services
# (the poller and its watchdog) and keeps their settings files in
# ~/vikunja-automation/disabled-2026-10-22/ so it can be undone.
# Double-click runs the preview. To apply, in Terminal:  bash ~/Downloads/4-stop-project-folders.command apply
APPLY=0; [ "$1" = "apply" ] && APPLY=1
AUTO="$HOME/vikunja-automation"
AREAS="$HOME/Partage_One_plus_nord_CE_2/areas"
KEEP="$AUTO/disabled-2026-10-22"
UIDN=$(id -u)

count() { find "$AREAS" -type d 2>/dev/null | wc -l | tr -d ' '; }
BEFORE=$(count)
echo "== areas: $BEFORE folders (they are not touched)"

echo "== Mac services of the automation"
FOUND=0
for p in "$HOME"/Library/LaunchAgents/*.plist; do
  [ -f "$p" ] || continue
  grep -qE "vikunja-automation|vikunja_automation|webhook_listener|vikunja-watchdog|watchdog\.py" "$p" || continue
  FOUND=1
  label=$(/usr/libexec/PlistBuddy -c 'Print :Label' "$p" 2>/dev/null || basename "$p" .plist)
  if [ $APPLY = 1 ]; then
    launchctl bootout "gui/$UIDN/$label" 2>/dev/null || launchctl unload "$p" 2>/dev/null
    mkdir -p "$KEEP" && mv "$p" "$KEEP/" && echo "  stopped: $label (settings kept in $KEEP)"
  else
    echo "  would stop: $label ($p)"
  fi
done
[ $FOUND = 0 ] && echo "  none found in ~/Library/LaunchAgents"

echo "== Still running?"
PIDS=$(pgrep -f "[Pp]ython[0-9.]* .*vikunja-automation/(webhook_listener|watchdog)\.py")
if [ -n "$PIDS" ]; then
  if [ $APPLY = 1 ]; then kill $PIDS 2>/dev/null; sleep 1; echo "  stopped the leftover processes"; else echo "  would stop processes: $PIDS"; fi
else echo "  nothing running"; fi

echo "== Other schedules (shown only, not changed)"
crontab -l 2>/dev/null | grep -iE "vikunja|webhook_listener|watchdog" || echo "  none in crontab"

if [ $APPLY = 1 ]; then
  sleep 1
  LEFT=$(pgrep -f "[Pp]ython[0-9.]* .*vikunja-automation/(webhook_listener|watchdog)\.py")
  AFTER=$(count)
  echo
  [ -z "$LEFT" ] && echo "OK: the folder automation is stopped." || echo "WARNING: still running ($LEFT). Restart the Mac, or send this output to Claude."
  [ "$AFTER" = "$BEFORE" ] && echo "OK: areas still has its $AFTER folders." || echo "Note: areas had $BEFORE folders, now $AFTER (something else changed it)."
  echo
  echo "Undo: mv \"$KEEP\"/*.plist ~/Library/LaunchAgents/  then log out and back in (the services start again)."
else
  echo
  echo "Preview only. To do it:  bash \"$0\" apply"
fi
