#!/usr/bin/env bash
# R4C.1 CORS proof for the three Cash Intelligence Edge Functions.
# Usage: bash scripts/verify-intel-cors.sh [ORIGIN]
# Pass/fail is judged on Access-Control-Allow-Origin only.
set -u
BASE="https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1"
ORIGIN="${1:-https://id-preview--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app}"
BAD="https://evil.example.com"
FNS="knowledge-mcp-read intelligence-mcp-read intelligence-promotion-write"

probe() { # $1=fn $2=origin
  curl -s -o /dev/null -D - -X OPTIONS "$BASE/$1" \
    -H "Origin: $2" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization, apikey, content-type" \
  | tr -d '\r'
}

for fn in $FNS; do
  ok=$(probe "$fn" "$ORIGIN")
  bad=$(probe "$fn" "$BAD")
  acao=$(printf '%s' "$ok" | grep -i '^access-control-allow-origin:' | cut -d' ' -f2-)
  bad_acao=$(printf '%s' "$bad" | grep -ci '^access-control-allow-origin:')
  status=$(printf '%s' "$ok" | head -1)
  echo "--- $fn"
  echo "  preflight status : $status"
  echo "  allow-origin     : ${acao:-<absent>}"
  echo "  allow-headers    : $(printf '%s' "$ok" | grep -i '^access-control-allow-headers:' | cut -d' ' -f2-)"
  echo "  allow-methods    : $(printf '%s' "$ok" | grep -i '^access-control-allow-methods:' | cut -d' ' -f2-)"
  echo "  vary             : $(printf '%s' "$ok" | grep -i '^vary:' | cut -d' ' -f2-)"
  if [ "$acao" = "$ORIGIN" ]; then echo "  allowed-origin   : PASS"; else echo "  allowed-origin   : FAIL"; fi
  if [ "$bad_acao" = "0" ]; then echo "  negative-origin  : PASS"; else echo "  negative-origin  : FAIL (echoed ACAO to $BAD)"; fi
done
