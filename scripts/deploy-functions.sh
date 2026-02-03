#!/bin/bash
# Deploy Cloud Functions in batches to avoid Cloud Run CPU quota limits.
# Usage: ./scripts/deploy-functions.sh [--project PROJECT_ID]
#
# Each Firebase v2 function = separate Cloud Run service.
# Deploying all 27 at once exceeds concurrent container build quota.
# This script deploys in groups of 5-6 with pauses between batches.

set -e

PROJECT_FLAG=""
if [ "$1" = "--project" ] && [ -n "$2" ]; then
    PROJECT_FLAG="--project $2"
    shift 2
fi

echo "=== MatchScheduler Functions Deploy (Batched) ==="
echo "Region: europe-west10"
echo ""

# Batch 1: Auth & Profile (6 functions)
echo "--- Batch 1/5: Auth & Profile ---"
firebase deploy --only \
functions:googleSignIn,\
functions:createProfile,\
functions:updateProfile,\
functions:getProfile,\
functions:deleteAccount,\
functions:discordOAuthExchange \
$PROJECT_FLAG
echo "Batch 1 complete. Waiting 10s..."
sleep 10

# Batch 2: Team Operations (7 functions)
echo "--- Batch 2/5: Team Operations ---"
firebase deploy --only \
functions:createTeam,\
functions:joinTeam,\
functions:regenerateJoinCode,\
functions:leaveTeam,\
functions:updateTeamSettings,\
functions:kickPlayer,\
functions:transferLeadership \
$PROJECT_FLAG
echo "Batch 2 complete. Waiting 10s..."
sleep 10

# Batch 3: Availability, Templates, Favorites (5 functions)
echo "--- Batch 3/5: Availability & Templates ---"
firebase deploy --only \
functions:updateAvailability,\
functions:saveTemplate,\
functions:deleteTemplate,\
functions:renameTemplate,\
functions:updateFavorites \
$PROJECT_FLAG
echo "Batch 3 complete. Waiting 10s..."
sleep 10

# Batch 4: Match Proposals (6 functions)
echo "--- Batch 4/5: Match Proposals ---"
firebase deploy --only \
functions:createProposal,\
functions:confirmSlot,\
functions:withdrawConfirmation,\
functions:cancelProposal,\
functions:cancelScheduledMatch,\
functions:toggleScheduler \
$PROJECT_FLAG
echo "Batch 4 complete. Waiting 10s..."
sleep 10

# Batch 5: Storage Triggers + Misc (3 functions)
echo "--- Batch 5/5: Storage Triggers & Misc ---"
firebase deploy --only \
functions:processLogoUpload,\
functions:processAvatarUpload,\
functions:helloWorld \
$PROJECT_FLAG
echo ""

echo "=== All functions deployed ==="
