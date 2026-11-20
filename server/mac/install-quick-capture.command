#!/bin/bash
# One-off set-up of the Mac quick capture (quick-capture.sh).
# You need an API token that can create tasks: in the app's Vikunja (https://pc-lou.tailc45f62.ts.net)
# > Settings > API Tokens > New: name "Quick capture", permission Tasks: create. Copy it.
DIR="$HOME/Library/Application Support/Tasks"
mkdir -p "$DIR"
cp "$(dirname "$0")/quick-capture.sh" "$DIR/quick-capture.sh" && chmod +x "$DIR/quick-capture.sh"
read -r -s -p "Paste the API token (it is stored in your Keychain, not in a file): " T; echo
security delete-generic-password -s tasks-quick-capture >/dev/null 2>&1
security add-generic-password -s tasks-quick-capture -a "$USER" -w "$T" && echo "Token saved in the Keychain."
echo
echo "Last step (by hand, 30 s): Shortcuts app > + > search \"Run Shell Script\" > paste:"
echo "    bash \"$DIR/quick-capture.sh\""
echo "Name it \"New task\", then (i) > Add Keyboard Shortcut > ⌥⇧⌘T."
echo "Remove (or change) the old \"New task\" shortcut that opened the panel / localhost:5173."
read -r -p "Press Enter to close"
