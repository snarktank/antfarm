#!/bin/sh
set -eu

redact_secret() {
  value=${1:-}
  if [ -z "$value" ]; then
    printf '%s' '[unset]'
  else
    printf '%s' '[redacted]'
  fi
}

printf 'token=%s\n' "$(redact_secret "${JWT_SECRET-}")" >> app.log
