# FrontBill GitHub Workflow Guide

## Setup (One-time)

### 1. Clone the Repository Locally
```bash
git clone https://github.com/eric2umeh/frontbill.git
cd frontbill
```

### 2. Set Up Git Configuration
```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### 3. Create and Track Branches
```bash
# Make sure you have develop and main branches tracked locally
git fetch origin
git checkout develop
git checkout main
```

---

## Development Workflow

### 1. Create Feature Branch from develop
```bash
# Update develop with latest changes
git checkout develop
git pull origin develop

# Create new feature branch
git checkout -b feature/feature-name

# Examples:
# git checkout -b feature/auth-setup
# git checkout -b feature/guest-management
# git checkout -b feature/payment-integration
```

### 2. Make Changes Locally
```bash
# Check status
git status

# Stage changes
git add .                    # Add all files
git add path/to/file         # Add specific file

# Commit with descriptive message
git commit -m "feat: add login page with demo account creation"

# Examples of good commit messages:
# git commit -m "feat: implement guest check-in modal"
# git commit -m "fix: resolve Supabase auth session issue"
# git commit -m "refactor: improve data table performance"
# git commit -m "docs: add API documentation"
```

### 3. Push Feature Branch to GitHub
```bash
git push origin feature/feature-name

# Example:
# git push origin feature/auth-setup
```

### 4. Create Pull Request (develop)
- Go to: https://github.com/eric2umeh/frontbill
- Click "Pull requests" tab
- Click "New pull request"
- Set: Base: `develop` ← Compare: `feature/feature-name`
- Use PR template below
- Click "Create pull request"

### 5. Code Review & Merge to develop
- Request review from team members
- Once approved, click "Merge pull request"
- Choose "Squash and merge" for cleaner history
- Delete branch after merge

### 6. Promote develop to main (When Ready for Production)
```bash
# Update local main and develop
git checkout main
git pull origin main
git checkout develop
git pull origin develop

# Create release branch or merge directly
git checkout main
git pull origin main
git merge develop

# Push to main (triggers Vercel deployment)
git push origin main
```

Alternatively, create a PR from `develop` → `main`:
- Go to Pull requests
- New pull request
- Base: `main` ← Compare: `develop`
- Use PR template below
- Merge when ready

---

## PR Title & Description Templates

### Feature PR (develop)
**Title:**
```
feat: brief description of feature
```

**Description:**
```markdown
## Description
Brief explanation of what this feature does.

## Changes
- Added guest check-in modal
- Integrated Supabase real-time updates
- Added form validation

## Testing
- [ ] Tested locally
- [ ] No console errors
- [ ] Mobile responsive (tested on 375px width)
- [ ] Works with mock data

## Screenshots
<!-- Optional: Add screenshots or GIFs -->

## Related Issue
Closes #123

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation
```

### Bugfix PR (develop)
**Title:**
```
fix: brief description of bug fix
```

**Description:**
```markdown
## Problem
Describe the bug that was fixed.

## Root Cause
Explain why it was happening.

## Solution
Explain the fix applied.

## Changes
- Fixed Supabase session cookie handling
- Added error logging
- Improved error messages

## Testing
- [ ] Bug is fixed
- [ ] No regression on other features
- [ ] Tested on mobile

## Related Issue
Closes #456
```

### Release PR (main)
**Title:**
```
release: v1.0.0 - Initial FrontBill Launch
```

**Description:**
```markdown
## Release Notes
v1.0.0 - Initial Production Release

## Features
- Complete authentication system (Supabase Auth)
- Guest management with check-in/check-out
- Room inventory management
- Payment tracking and City Ledger
- Revenue analytics and reconciliation
- Mobile-responsive dashboard

## What's Changed
- Total commits: 45
- Files changed: 150+
- Database schema: 9 tables with RLS

## Deployment
This PR merges `develop` into `main` for production deployment on Vercel.

- [ ] All tests passing
- [ ] Environment variables configured in Vercel
- [ ] Database migrations applied
- [ ] Vercel preview deployment successful

## Breaking Changes
None

## Known Issues
None
```

---

## Vercel Setup & Deployment

### 1. Connect GitHub Repository to Vercel
1. Go to: https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Select "Import Git Repository"
4. Connect GitHub account if needed
5. Select `frontbill` repository
6. Click "Import"

### 2. Configure Environment Variables
In Vercel Dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Configure Git Integration
1. Go to Vercel Dashboard → Settings → Git
2. Under "Production Branch": Select `main`
3. Under "Preview Deployments": Select `develop`
4. Enable "Automatic Production Deployment"

### 4. Deployment Behavior
- **main branch**: Automatic deployment to production (https://frontbill.vercel.app)
- **develop branch**: Automatic preview deployment
- **feature branches**: Automatic preview deployment (for PRs)

### 5. Check Deployment Status
- Vercel will automatically comment on PRs with preview URL
- View deployments: Vercel Dashboard → Deployments tab
- Check logs: Click deployment → Logs

---

## Important Git Rules

### Do's:
- ✓ Commit frequently with meaningful messages
- ✓ Pull before pushing
- ✓ Create PRs for all changes
- ✓ Review PRs thoroughly
- ✓ Delete feature branches after merge
- ✓ Keep branches up-to-date with develop

### Don'ts:
- ✗ Don't commit directly to main or develop
- ✗ Don't force push (git push -f)
- ✗ Don't commit secrets or .env files
- ✗ Don't ignore merge conflicts
- ✗ Don't rewrite history on shared branches

---

## Useful Git Commands

```bash
# See commit history
git log --oneline

# See current branch
git branch

# See all branches (local and remote)
git branch -a

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard local changes
git checkout .

# Sync with remote
git fetch origin

# Delete local branch
git branch -d feature/name

# Delete remote branch
git push origin --delete feature/name

# Rebase feature on latest develop
git checkout feature/name
git rebase develop
git push origin feature/name --force-with-lease
```

---

## Troubleshooting

### Merge Conflicts
```bash
# See conflicts
git status

# Resolve conflicts manually in editor, then:
git add .
git commit -m "chore: resolve merge conflicts"
git push origin feature/name
```

### Accidentally Committed to main
```bash
# Undo commit on main
git reset HEAD~1

# Create new branch and push
git checkout -b feature/name
git push origin feature/name
```

### Need to Update Feature Branch with Latest develop
```bash
git checkout feature/name
git fetch origin
git rebase origin/develop
git push origin feature/name --force-with-lease
```

---

## Branch Naming Convention

```
feature/feature-name          # New features
fix/bug-description           # Bug fixes
refactor/component-name       # Refactoring
docs/documentation-type       # Documentation
chore/maintenance-task        # Maintenance
```

Examples:
- `feature/guest-check-in`
- `fix/supabase-auth-session`
- `refactor/data-table-component`
- `docs/api-endpoints`
- `chore/update-dependencies`
