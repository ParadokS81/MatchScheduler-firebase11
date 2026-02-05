#!/bin/bash
# Deploy Cloud Functions
# Usage: ./scripts/deploy-functions.sh [--project PROJECT_ID]
#
# After v1 migration:
# - v1 functions (25) deploy as a single Cloud Functions container - fast!
# - v2 storage triggers (2) deploy as separate Cloud Run services
#
# No more quota issues - v1 functions share infrastructure.

set -e

PROJECT_FLAG=""
if [ "$1" = "--project" ] && [ -n "$2" ]; then
    PROJECT_FLAG="--project $2"
    shift 2
fi

echo "=== MatchScheduler Functions Deploy ==="
echo "Region: europe-west3"
echo ""

# Option 1: Deploy all functions at once (recommended after v1 migration)
echo "Deploying all functions..."
firebase deploy --only functions $PROJECT_FLAG

echo ""
echo "=== All functions deployed ==="
echo ""
echo "Note: v1 functions share a single container."
echo "Only storage triggers (processLogoUpload, processAvatarUpload) use Cloud Run."
