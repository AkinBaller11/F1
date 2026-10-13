#!/bin/sh
# Vercel build step: stamp the commit id into the app and into version.json,
# so installed home-screen apps can tell when a newer version is online.
set -e
V=$(printf '%s' "${VERCEL_GIT_COMMIT_SHA:-$(date +%s)}" | cut -c1-12)
sed -i "s/__BUILD__/$V/" js/version.js
printf '{"version":"%s"}\n' "$V" > version.json
echo "Stamped version $V"
