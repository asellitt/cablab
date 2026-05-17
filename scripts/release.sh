#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-}"
IMAGE="asellitt/cablr"

usage() {
  echo "Usage: $0 <patch|minor|major>"
  exit 1
}

[[ "$BUMP" =~ ^(patch|minor|major)$ ]] || usage

# Find latest semver tag
LATEST=$(git tag --list 'v*.*.*' | sort -V | tail -1)

if [[ -z "$LATEST" ]]; then
  CURRENT="0.0.0"
else
  CURRENT="${LATEST#v}"
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEXT="${MAJOR}.${MINOR}.${PATCH}"
TAG="v${NEXT}"

echo ""
echo "  Current: ${LATEST:-none}"
echo "  Next:    ${TAG}  →  ${IMAGE}:${NEXT}  +  ${IMAGE}:latest"
echo ""
read -r -p "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# Ensure buildx multi-arch builder exists
if ! docker buildx inspect cablr-builder &>/dev/null; then
  docker buildx create --name cablr-builder --use
else
  docker buildx use cablr-builder
fi

echo ""
echo "Building and pushing ${IMAGE}:${NEXT} (linux/amd64 + linux/arm64)..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "${IMAGE}:${NEXT}" \
  --tag "${IMAGE}:latest" \
  --push \
  .

echo ""
echo "Tagging git commit as ${TAG}..."
git tag "${TAG}"

echo ""
echo "Done. Run 'git push origin ${TAG}' to push the tag."
