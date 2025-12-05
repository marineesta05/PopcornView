#!/bin/bash

echo "Starting PopcornView Backends..."

Absolute path of the project
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

--- User Server ---
osascript <<EOF
tell application "Terminal"
    do script "cd '$BASE_DIR/user' && node server.js"
end tell
EOF

sleep 2

--- Movie Review Server ---
osascript <<EOF
tell application "Terminal"
    do script "cd '$BASE_DIR/movie' && node serverReview.js"
end tell
EOF

sleep 2

--- Main Backend ---
osascript <<EOF
tell application "Terminal"
    do script "cd '$BASE_DIR/../backend' && node server.js"
end tell
EOF

sleep 2

--- Movie Server ---
osascript <<EOF
tell application "Terminal"
    do script "cd '$BASE_DIR/../backend' && node index.js"
end tell
EOF

echo "All servers started!"