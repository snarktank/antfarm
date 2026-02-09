#!/bin/bash
# Test that antfarm hello prints the expected output

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_PATH="$SCRIPT_DIR/../dist/cli/cli.js"

# Test 1: Check output is exactly "Hello from Antfarm!"
OUTPUT=$(node "$CLI_PATH" hello)
EXPECTED="Hello from Antfarm!"

if [ "$OUTPUT" = "$EXPECTED" ]; then
  echo "✓ Output matches: $OUTPUT"
else
  echo "✗ Output mismatch"
  echo "  Expected: $EXPECTED"
  echo "  Got: $OUTPUT"
  exit 1
fi

# Test 2: Check exit code is 0
node "$CLI_PATH" hello > /dev/null
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ Exit code is 0"
else
  echo "✗ Exit code was $EXIT_CODE, expected 0"
  exit 1
fi

echo ""
echo "All hello tests passed!"
