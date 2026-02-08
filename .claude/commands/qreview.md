---
description: Review user feedback - fetch new submissions, view screenshots, triage and update review log
allowed-tools: Bash, Read, Write, Edit, Task
---

# Feedback Review Session

Review user feedback submitted through the app. Fetch from Firestore, download and view screenshots, discuss with the user, and maintain the review log.

## Phase 1: Fetch Feedback

Run the feedback script to pull latest submissions:

```bash
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && node scripts/read-feedback.js --new"
```

If no new feedback, also check all feedback for context:
```bash
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && node scripts/read-feedback.js"
```

**Always check the shelf:** Read `feedback-reviews/REVIEW-LOG.md` and look for any items marked **SHELVED**. Present these to the user as candidates to act on — they represent validated features/fixes that were deferred and may now be ready to pick up.

## Phase 2: View Screenshots

Screenshots are auto-downloaded to `feedback-reviews/` by the script (named by feedback ID).

For each feedback item with a screenshot, use the Read tool to view it:
```
Read: feedback-reviews/{feedbackId}.jpg
```

This lets you see exactly what the user reported and provide visual analysis.

## Phase 3: Analyze and Triage

For each feedback item, assess:

1. **Category accuracy** - Is it really a bug/feature/other?
2. **Severity/Impact** - How many users does this affect?
3. **Effort estimate** - Quick fix, moderate, or needs planning?
4. **Screenshot analysis** - What exactly does the screenshot show? What's the visual context?

Present findings to the user with your recommendation:
- **ACT ON** - Fix now (quick wins, clear bugs)
- **SHELVE** - Valid but needs more planning or is lower priority
- **DISCARD** - Not actionable, duplicate, or out of scope

## Phase 4: Update Review Log

After discussing with the user, update `feedback-reviews/REVIEW-LOG.md`:

```markdown
### {feedbackId} - {Category} ({UserName})
**{Summary of feedback}**
- Screenshot analysis: {what you saw}
- **Decision: {ACTED ON / SHELVED / DISCARDED}** - {reason}
- {If ACTED ON: what was done or commit reference}
- {If SHELVED: what's needed before acting}
```

## Phase 5: Mark as Reviewed

For each triaged item, update its Firestore status:

```bash
# After reviewing
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && node scripts/read-feedback.js --mark-reviewed {feedbackId}"

# After fixing
wsl bash -ic "cd /home/paradoks/projects/MatchScheduler && node scripts/read-feedback.js --mark-resolved {feedbackId}"
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/read-feedback.js` | Fetch feedback, download screenshots, update status |
| `feedback-reviews/REVIEW-LOG.md` | Decision log with analysis |
| `feedback-reviews/*.jpg` | Downloaded screenshots (gitignored) |
| `functions/feedback.js` | Backend Cloud Function |
| `public/js/components/FeedbackModal.js` | Frontend modal |

## Tips

- Always view screenshots with Read tool - they tell the full story
- Group related feedback items (same bug reported by multiple users)
- Quick CSS/styling fixes can be done immediately during review
- Feature requests that need architectural decisions should be SHELVED with notes
- Update the log as you go - don't batch it at the end
