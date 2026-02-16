# FrontBill Git Quick Reference

## Daily Workflow (Copy & Paste)

### Start New Feature
```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### Save Work (Multiple times per day)
```bash
git add .
git commit -m "feat: description of what you did"
git push origin feature/your-feature-name
```

### Create PR to develop
1. Go to https://github.com/eric2umeh/frontbill
2. Click "Pull requests" → "New pull request"
3. Base: `develop` ← Compare: `feature/your-feature-name`
4. Fill in title and description
5. Click "Create pull request"

### Merge to develop
- Get approval from team
- Click "Merge pull request" → "Squash and merge"
- Delete branch

### Release to Production
```bash
git checkout main
git pull origin main
git merge develop
git push origin main
# Vercel auto-deploys
```

---

## Commit Message Examples

### Good Commit Messages
```
feat: add guest check-in modal with real-time updates
fix: resolve Supabase session cookie not persisting
refactor: improve data table performance with virtualization
docs: add API endpoint documentation
chore: update dependencies to latest version
```

### Structure
```
<type>: <short description (50 chars max)>

<optional longer description>
<explaining what and why>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code refactoring
- `docs:` Documentation
- `chore:` Maintenance, dependencies
- `style:` Formatting (no logic change)
- `test:` Adding tests

---

## Branch Status

### View All Branches
```bash
git branch -a
```

### Switch to Branch
```bash
git checkout feature/name
```

### Delete Local Branch
```bash
git branch -d feature/name
```

### Sync with Remote
```bash
git fetch origin
git pull origin develop
```

---

## Emergency Commands

### Undo Last Commit (keep changes)
```bash
git reset --soft HEAD~1
```

### Discard All Local Changes
```bash
git checkout .
```

### Fix Merge Conflict
1. Open files with `<<<<` markers
2. Keep changes you want
3. Remove conflict markers
4. Save and:
```bash
git add .
git commit -m "chore: resolve merge conflicts"
git push origin feature/name
```

### Accidentally Pushed to develop?
```bash
git revert HEAD
git push origin develop
```

---

## PR Titles by Type

| Type | Title Example |
|------|--------------|
| Feature | `feat: add guest check-in modal` |
| Bug Fix | `fix: resolve Supabase session loss` |
| Refactor | `refactor: optimize data table rendering` |
| Documentation | `docs: add setup instructions` |
| Release | `release: v1.0.0 - Initial Launch` |

---

## Deployment Status

**After push to:**
- `develop` → Preview deployment (Vercel auto)
- `main` → Production deployment (Vercel auto)

**Check status:**
1. Go to https://vercel.com/dashboard
2. Click "frontbill" project
3. View "Deployments" tab
4. Click deployment to see logs

---

## Before You Commit

- [ ] No console errors in dev tools
- [ ] Mobile responsive (test at 375px)
- [ ] No hardcoded secrets (.env values)
- [ ] Descriptive commit message
- [ ] Code follows project patterns
- [ ] All imports resolved

---

## Team Communication

**When creating PR:**
- Tag reviewers: `@username`
- Reference issues: `Closes #123`
- Add screenshots for UI changes
- Describe what you tested

**PR Check List:**
- [ ] Code compiles without errors
- [ ] Tests pass (if applicable)
- [ ] Vercel preview works
- [ ] Mobile responsive
- [ ] No breaking changes
