# Voice Replay Multi-Clan — Cross-Project Contract

> Canonical copy lives at the parent workspace: `/quake/VOICE-REPLAY-CONTRACT.md`
> This is a reference copy for the MatchScheduler project. If they diverge, the orchestrator version is authoritative.

---

## Overview

Evolving voice replay from single-clan PoC to multi-clan production:
- Registration starts from MatchScheduler UI (team settings) — leader initiates, bot completes
- Uploads tagged with teamId, enabling Firestore-rules-based privacy
- Teams control visibility: default public/private + per-recording override
- Frontend discovery: team members find their recordings in MatchScheduler

---

## New Collection: `/botRegistrations/{teamId}`

Document ID = teamId (one registration per team). Created by MatchScheduler (pending) → completed by quad bot (active).

```typescript
interface BotRegistrationDocument {
  teamId: string;                     // = document ID
  teamTag: string;
  teamName: string;
  authorizedDiscordUserId: string;    // Leader's Discord ID — only this user can run /register
  registeredBy: string;               // Firebase UID of the leader
  guildId: string | null;             // null while pending, populated on completion
  guildName: string | null;
  status: 'pending' | 'active';
  knownPlayers: {
    [discordUserId: string]: string;  // Discord user ID → QW display name
  };
  createdAt: Timestamp;
  activatedAt: Timestamp | null;
  updatedAt: Timestamp;
}
```

### Firestore Rules
```
match /botRegistrations/{teamId} {
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/teams/$(teamId)).data.leaderId == request.auth.uid;
  allow write: if false;  // Cloud Function + Admin SDK only
}
```

---

## Updated Collection: `/voiceRecordings/{demoSha256}` (Phase 3+)

```typescript
interface VoiceRecordingDocument {
  demoSha256: string;
  teamId: string;                              // From botRegistration
  teamTag: string;
  visibility: 'public' | 'private';            // From team's defaultVisibility
  source: 'firebase_storage' | 'google_drive';
  tracks: VoiceTrack[];
  mapName: string;
  recordedAt: Timestamp;
  uploadedAt: Timestamp;
  uploadedBy: string;
  trackCount: number;
}

interface VoiceTrack {
  discordUserId: string;       // Stable file identifier
  discordUsername: string;     // Discord display name at recording time
  playerName: string;          // QW name (resolved or fallback)
  resolved: boolean;           // true = confirmed, false = using Discord fallback
  storagePath: string;         // "voice-recordings/{teamId}/{sha256}/{discordUserId}.ogg"
  fileName: string;            // "{discordUserId}.ogg"
  size: number;
  duration: number | null;
}
```

### Firestore Rules (Phase 3)
```
match /voiceRecordings/{demoSha256} {
  allow read: if
    resource.data.visibility == 'public'
    || (request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teams[resource.data.teamId] == true);
  allow write: if false;
}
```

---

## New Field on `/teams/{teamId}` (Phase 4)

```typescript
voiceSettings?: {
  defaultVisibility: 'public' | 'private';  // Default: 'private' when absent
};
```

---

## Updated Storage Path (Phase 2+)
```
voice-recordings/{teamId}/{demoSha256}/{discordUserId}.ogg
```

Storage rules remain publicly readable. Privacy enforced at Firestore discovery layer.

---

## Registration Flow

```
MatchScheduler                              Discord
────────────                                ───────
Leader clicks "Connect Voice Bot"
  → Cloud Function creates
    botRegistrations/{teamId}
    status: 'pending'
  → UI shows invite link + instructions
                                            Leader invites bot
                                            Leader runs /register
                                            Bot finds pending doc
                                            Bot updates: guildId, status: 'active'
  ← Firestore listener updates UI
  → "Connected to [guildName]"
```

---

## Phase Plan

| Phase | Project | Scope |
|-------|---------|-------|
| **1a** | MatchScheduler | Connect Bot UI + pending registration |
| **1b** | quad | `/register` command completes pending registration |
| **2** | quad | Refactor uploader: teamId, discordUserId, name resolution, backfill DM |
| **3** | MatchScheduler | Firestore rules + Auth on replay page |
| **4** | MatchScheduler | voiceSettings.defaultVisibility toggle |
| **5** | MatchScheduler | Per-recording visibility + recordings discovery |
