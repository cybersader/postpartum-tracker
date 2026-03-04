#!/bin/bash
# Release script: bump version, tag, and push to trigger GitHub Actions
# Usage: scripts/release.sh <version>
# Example: scripts/release.sh 0.5.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

VERSION=$1

if [ -z "$VERSION" ]; then
    echo -e "${RED}Usage: scripts/release.sh <version>${NC}"
    echo "Example: scripts/release.sh 0.5.0"
    exit 1
fi

# ── Pre-flight checks ──────────────────────────────────────

# 1. Changelog must contain an entry for this version
if ! grep -q "## \[${VERSION}\]" CHANGELOG.md 2>/dev/null; then
    echo -e "${RED}CHANGELOG.md has no entry for version ${VERSION}.${NC}"
    echo -e "${YELLOW}Add a ## [${VERSION}] section to CHANGELOG.md before releasing.${NC}"
    exit 1
fi

# 2. Changelog [Unreleased] section should be empty (changes moved to version heading)
UNRELEASED_CONTENT=$(sed -n '/^## \[Unreleased\]/,/^## \[/{ /^## \[/d; /^$/d; p; }' CHANGELOG.md)
if [ -n "$UNRELEASED_CONTENT" ]; then
    echo -e "${YELLOW}Warning: [Unreleased] section in CHANGELOG.md is not empty.${NC}"
    echo -e "${YELLOW}Consider moving those entries under ## [${VERSION}].${NC}"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 3. No uncommitted changes (other than what the script will create)
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes.${NC}"
    git status --short
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}Releasing version ${VERSION}...${NC}"

# ── Version bump ────────────────────────────────────────────

echo -e "${BLUE}Updating package.json version...${NC}"
npm version "$VERSION" --no-git-tag-version

echo -e "${BLUE}Bumping manifest and versions...${NC}"
bun run version-bump.mjs "$VERSION"

# ── Build ───────────────────────────────────────────────────

echo -e "${BLUE}Building plugin...${NC}"
bun run build

# ── Commit, tag, push ───────────────────────────────────────

echo -e "${BLUE}Committing version bump...${NC}"
git add package.json manifest.json versions.json CHANGELOG.md
git commit -m "Release ${VERSION}"

echo -e "${BLUE}Creating tag ${VERSION}...${NC}"
git tag "$VERSION"

echo -e "${BLUE}Pushing to origin...${NC}"
git push origin main
git push origin "$VERSION"

echo -e "${GREEN}Release ${VERSION} pushed! GitHub Actions will create the release.${NC}"
echo -e "${GREEN}Changelog entry:${NC}"
sed -n "/^## \[${VERSION}\]/,/^## \[/{ /^## \[${VERSION}\]/p; /^## \[${VERSION}\]/!{ /^## \[/!p; } }" CHANGELOG.md
