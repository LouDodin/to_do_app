#!/bin/bash
# New task from anywhere on the Mac: a single text box, the task goes to the Inbox. Nothing else.
# Bind it to ⌥⇧⌘T: Shortcuts app > New shortcut > "Run Shell Script":
#     bash "$HOME/Library/Application Support/Tasks/quick-capture.sh"
#   then (i) > Add Keyboard Shortcut. (install-quick-capture.command does the copying.)
# If the PC cannot be reached, the task is kept on the Mac and sent with the next capture
# (or by: bash quick-capture.sh --flush).
SERVER="https://pc-lou.tailc45f62.ts.net"
INBOX_PROJECT=1
DIR="$HOME/Library/Application Support/Tasks"
QUEUE="$DIR/unsent.txt"
TOKEN=$(security find-generic-password -s tasks-quick-capture -w 2>/dev/null)
mkdir -p "$DIR"
notify() { osascript -e "display notification \"$1\" with title \"Tasks\"" >/dev/null 2>&1; }
send() {
  python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1]}))' "$1" |
  curl -s -m 10 -o /dev/null -w '%{http_code}' -X PUT "$SERVER/api/v1/projects/$INBOX_PROJECT/tasks" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @-
}
flush() {
  [ -s "$QUEUE" ] || return 0
  local left="" sent=0
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    c=$(send "$t")
    if [ "$c" = "201" ] || [ "$c" = "200" ]; then sent=$((sent+1)); else left="$left$t"$'\n'; fi
  done < "$QUEUE"
  printf '%s' "$left" > "$QUEUE"
  [ $sent -gt 0 ] && notify "$sent saved task(s) sent"
}
[ -z "$TOKEN" ] && { osascript -e 'display alert "Tasks quick capture is not set up" message "Run install-quick-capture.command once."'; exit 1; }
[ "$1" = "--flush" ] && { flush; exit 0; }
TITLE=$(osascript -e 'try' -e 'text returned of (display dialog "" default answer "" with title "New task" buttons {"Cancel", "Add"} default button "Add")' -e 'end try' 2>/dev/null)
[ -z "${TITLE// }" ] && exit 0
code=$(send "$TITLE")
if [ "$code" = "201" ] || [ "$code" = "200" ]; then notify "Added to the Inbox"; flush
else printf '%s\n' "$TITLE" >> "$QUEUE"; notify "PC unreachable: saved, will be sent later"; fi
