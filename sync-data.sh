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

# The extension fetches this file every few hours, so it is the thing that
# actually delivers a correction to people. Forgetting it would leave the
# website updated and every installed extension quietly stale.
echo "Writing ownership-data.json for the extension to fetch..."
node make-data-json.js

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
echo "Installed extensions pick this up within about 6 hours, or sooner if"
echo "the browser restarts — corrections do NOT need a store release."
echo ""
echo "Still needs a release: NEW domains only get an automatic on-page badge"
echo "once manifest.json ships, because the covered sites are baked into it."
echo "Two things soften that — the popup already works on any site, and users"
echo "who turned on full coverage in the popup get the badge immediately."
