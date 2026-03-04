#!/bin/bash
# Release script: bump version, tag, and push to trigger GitHub Actions
# Usage: scripts/release.sh <version>
# Example: scripts/release.sh 0.2.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

VERSION=$1

if [ -z "$VERSION" ]; then
    echo -e "${RED}Usage: scripts/release.sh <version>${NC}"
    echo "Example: scripts/release.sh 0.2.0"
    exit 1
fi

echo -e "${BLUE}Releasing version ${VERSION}...${NC}"

# Update version in package.json
echo -e "${BLUE}Updating package.json version...${NC}"
npm version "$VERSION" --no-git-tag-version

# Run version bump script (updates manifest.json and versions.json)
echo -e "${BLUE}Bumping manifest and versions...${NC}"
npm_package_version="$VERSION" bun run version-bump.mjs

# Build to verify
echo -e "${BLUE}Building plugin...${NC}"
bun run build

echo -e "${BLUE}Committing version bump...${NC}"
git add package.json manifest.json versions.json
git commit -m "Release ${VERSION}"

echo -e "${BLUE}Creating tag ${VERSION}...${NC}"
git tag "$VERSION"

echo -e "${BLUE}Pushing to origin...${NC}"
git push origin main
git push origin "$VERSION"

echo -e "${GREEN}Release ${VERSION} pushed! GitHub Actions will create the release.${NC}"
