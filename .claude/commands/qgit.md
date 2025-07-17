---
description: Create conventional commit and push changes
argument-hint: (optional: commit type or message)
allowed-tools: Bash
---

# Git Commit and Push

Create a well-formatted conventional commit and push to remote.

## Pre-Commit Checks

1. **Review Changes**:
   ```bash
   git status
   git diff --staged
   ```

2. **Identify Commit Type**:
   - `feat`: New feature added
   - `fix`: Bug fix
   - `refactor`: Code refactoring (no functional change)
   - `style`: Formatting, styling (no code change)
   - `docs`: Documentation only
   - `test`: Adding/updating tests
   - `chore`: Maintenance tasks

## Commit Message Construction

### If $ARGUMENTS provided
Use arguments as guidance:
- If starts with feat/fix/etc, use as commit type
- Otherwise, analyze changes to determine type

### If no arguments
Analyze the changes to determine:
1. Primary commit type
2. Scope (component or feature affected)
3. Clear, concise description

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Examples
```bash
feat(availability): add optimistic updates for instant UI response
fix(team-drawer): correct animation timing to 300ms
refactor(firebase): migrate team listeners to v11 pattern
docs(roadmap): update progress for completed slices
```

## Execution Steps

1. **Stage Changes** (if needed):
   ```bash
   git add -A
   ```

2. **Create Commit**:
   ```bash
   git commit -m "<type>(<scope>): <description>"
   ```

3. **Push to Remote**:
   ```bash
   git push origin <current-branch>
   ```

## Best Practices

- Keep description under 50 characters
- Use present tense ("add" not "added")
- Reference slice number if applicable
- Don't end with period
- Scope should be the affected component/feature

## Error Handling

If push fails:
1. Check if branch exists on remote
2. Verify you're authenticated
3. Pull any remote changes first
4. Resolve conflicts if needed

## Success Response

After successful push:
```
✅ Changes committed and pushed successfully!

Commit: <type>(<scope>): <description>
Hash: <short-hash>
Branch: <branch-name>
Files: <count> changed
```