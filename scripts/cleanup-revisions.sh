#!/bin/bash
source ~/.nvm/nvm.sh
nvm use 20

GCLOUD="$HOME/google-cloud-sdk/bin/gcloud"
PROJECT="matchscheduler-dev"
REGION="europe-west10"

REVISIONS=(
  confirmslot-00002-wuh
  confirmslot-00003-yex
  confirmslot-00004-wan
  confirmslot-00005-sum
  confirmslot-00006-jik
  cancelscheduledmatch-00001-xog
  cancelscheduledmatch-00003-hew
  cancelscheduledmatch-00004-gup
  togglescheduler-00001-has
  togglescheduler-00003-fiw
  togglescheduler-00004-gac
  withdrawconfirmation-00001-pef
  withdrawconfirmation-00002-noc
  withdrawconfirmation-00003-duh
  withdrawconfirmation-00004-mix
  withdrawconfirmation-00005-yoz
  cancelproposal-00001-wim
  cancelproposal-00002-hab
  cancelproposal-00003-pos
  createprofile-00001-led
  createproposal-00001-vox
  createteam-00001-wip
  deleteaccount-00001-bub
  deletetemplate-00001-rum
  discordoauthexchange-00001-vic
  discordoauthexchange-00002-ceq
  getprofile-00001-teh
  googlesignin-00001-vaw
  jointeam-00001-hot
  kickplayer-00001-pen
  leaveteam-00001-kit
  processavatarupload-00001-loy
  processavatarupload-00002-woc
  processavatarupload-00003-tig
  processavatarupload-00004-dof
  processavatarupload-00005-xug
  processlogoupload-00001-xaj
  processlogoupload-00002-wag
  processlogoupload-00003-yeh
  processlogoupload-00004-heq
  processlogoupload-00005-xoj
  regeneratejoincode-00001-wuv
  renametemplate-00001-nev
  savetemplate-00001-leh
  togglescheduler-00002-kib
  transferleadership-00001-xux
  updateavailability-00001-fub
  updatefavorites-00001-ret
  updateprofile-00001-woq
  updateteamsettings-00001-zot
)

for rev in "${REVISIONS[@]}"; do
  echo "Deleting $rev..."
  "$GCLOUD" run revisions delete "$rev" --project="$PROJECT" --region="$REGION" --quiet 2>&1
done

echo "Done cleaning up revisions."
