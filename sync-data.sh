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

echo "Committing and pushing the extension repo..."
git add -A
git commit -m "Update company data" || echo "(nothing to commit in extension repo)"
git push

echo "Committing and pushing the site repo..."
cd "$SITE_REPO"
git add -A
git commit -m "Sync company data from extension" || echo "(nothing to commit in site repo)"
git push

echo ""
echo "Done. GitHub Pages will auto-deploy maplecheck.store in about a minute."
