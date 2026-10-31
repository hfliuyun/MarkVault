#!/bin/zsh
# Serve site/dist with wrangler dev while running the given command, then stop.
cd "$(dirname "$0")/../../site"
P=8787
# Cloud name comes from the local config so it never lands in the repo.
CLOUD=$(node -e 'const c=require(require("os").homedir()+"/.config/markvault/config.json");process.stdout.write(c.cloudinary?.cloud_name??"")' 2>/dev/null)
../node_modules/.bin/wrangler dev --port $P --local --var "CLOUDINARY_CLOUD:$CLOUD" > ../.tmp/wrangler-dev.log 2>&1 &
for i in {1..40}; do curl --noproxy "*" -s -o /dev/null "http://localhost:$P/" && break; sleep 0.5; done
cd ..
"$@"
pkill -f "wrangler dev --port $P"
pkill -f "workerd serve"
exit 0
