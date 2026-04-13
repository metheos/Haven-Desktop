#!/bin/bash
# Fix chrome-sandbox permissions for Electron on Linux
# The SUID sandbox requires the binary to be owned by root with mode 4755
SANDBOX="/opt/Haven/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi
