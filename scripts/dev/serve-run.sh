#!/bin/zsh
# Serve site/dist with wrangler dev while running the given command, then stop.
cd "$(dirname "$0")/../../site"
P=8787
../node_modules/.bin/wrangler dev --port $P --local > ../.tmp/wrangler-dev.log 2>&1 &
for i in {1..40}; do curl --noproxy "*" -s -o /dev/null "http://localhost:$P/" && break; sleep 0.5; done
cd ..
"$@"
pkill -f "wrangler dev --port $P"
pkill -f "workerd serve"
exit 0
