#!/usr/bin/env bash
appFile='stacks/app.js'
appStackCount=$(grep -c '    stackId:' "$appFile")
appTotalKeysCount=$(grep -cE '    stackId:|    baseURL:|    authorization:|    timeoutSecs:' "$appFile")
appKeysCount=4

if [[ "$(("$appStackCount" * "$appKeysCount"))" -ne "$appTotalKeysCount" ]]; then
  echo -e "\033[0;31m'$appFile' seems malformed. '$(($appStackCount * 4))' does not match expected '$appTotalKeysCount'.\033[0m"
  exit 1
else
  exit 0
fi
