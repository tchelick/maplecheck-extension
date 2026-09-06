#!/bin/bash
# sync-data.sh — run this from inside the maplecheck-extension folder.
#
# Copies data.js into the sibling maplecheck-site repo as extension-data.js,
# recalculates the homepage stat counts from the live dataset, then commits
# and pushes both repos. This replaces the manual "remember to copy the
# file, edit two places, commit twice, push twice" workflow with one command.
#
# ASSUMES this folder layout:
#   MapleCheck Content/
#     maplecheck-extension/maplecheck-extension/   <- this repo
#     maplecheck-site/maplecheck-site/              <- site repo
# If your folders are named or located differently, edit SITE_REPO below.

set -e  # stop on first error, don't push a half-finished sync

SITE_REPO="../../maplecheck-site/maplecheck-site"

if [ ! -d "$SITE_REPO" ]; then
  echo "Error: couldn't find $SITE_REPO — edit SITE_REPO in this script to the correct path."
  exit 1
fi

echo "Copying data.js -> $SITE_REPO/extension-data.js ..."
cp data.js "$SITE_REPO/extension-data.js"

echo "Updating homepage stat counts..."
node "$SITE_REPO/update-stats.js" "$SITE_REPO/extension-data.js" "$SITE_REPO/index.html"

# The manifest lists each covered domain explicitly instead of asking for
# <all_urls>, so it has to be regenerated whenever the dataset changes or it
# silently falls behind data.js.
echo "Regenerating manifest permissions from data.js..."
node generate-manifest-permissions.js

echo "Committing and pushing the extension repo..."
# Stage only what this script actually changes. "git add -A" would sweep any
# unrelated work-in-progress into a commit labelled "Update company data",
# which is how the manifest-permissions change ended up mislabelled once.
git add data.js manifest.json
git commit -m "Update company data" || echo "(nothing to commit in extension repo)"
git push

echo "Committing and pushing the site repo..."
cd "$SITE_REPO"
git add -A
git commit -m "Sync company data from extension" || echo "(nothing to commit in site repo)"
git push

echo ""
echo "Done. Vercel will auto-deploy the site update in about a minute."
echo ""
echo "Note: the website is now current, but the extension is not. If this"
echo "sync added NEW domains, those sites get no on-page badge until you"
echo "run 'node build.js' and publish a new version to the stores — the"
echo "covered domains are baked into manifest.json. The popup still works"
echo "everywhere in the meantime, so people can still request research."
