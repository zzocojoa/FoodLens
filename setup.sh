#!/bin/bash
set -euo pipefail

# Compatibility wrapper for legacy root command.
bash backend/setup.sh "$@"
