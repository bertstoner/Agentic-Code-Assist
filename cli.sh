#!/usr/bin/env bash
# Agentic Code Assist - CLI launcher
# Usage: ./cli.sh [--model <name>] [--theme dark]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find Python
PYTHON=""
for candidate in python3 python "$SCRIPT_DIR/venv/bin/python"; do
    if command -v "$candidate" &>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "Python not found. Install Python 3.10+ and run: pip install -r cli/requirements.txt"
    exit 1
fi

# Install dependencies if needed
if ! "$PYTHON" -c "import rich, prompt_toolkit, openai" &>/dev/null; then
    echo "Installing CLI dependencies..."
    "$PYTHON" -m pip install -r "$SCRIPT_DIR/cli/requirements.txt" -q
fi

exec "$PYTHON" "$SCRIPT_DIR/cli/chat.py" "$@"
