#!/bin/bash
# Runs automatically after a task-agent merge.
# Delegates to bootstrap.sh which is the single source of truth for setup.
set -euo pipefail
bash "$(dirname "$0")/bootstrap.sh"
