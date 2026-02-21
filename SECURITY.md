# Security Guidelines for FrontBill

## Hardcoded Secrets Prevention

### What NOT to do ❌
```typescript
// BAD: Never hardcode passwords, API keys, or tokens
const password = 'Admin@123456'
const apiKey = 'sk_live_51234567890'
const dbUrl = 'postgresql://user:password@localhost:5432/db'
```

### What TO do ✅
```typescript
// GOOD: Use environment variables
const password = process.env.DEMO_PASSWORD
const apiKey = process.env.API_KEY
const dbUrl = process.env.DATABASE_URL
```

## How to Handle Environment Variables

### 1. Create `.env.local` (Never commit this)
```bash
# .env.local - DO NOT COMMIT
DEMO_PASSWORD=demo
DATABASE_URL=your_actual_db_url
AUTH_SECRET=your_secret_key
```

### 2. Create `.env.example` (Commit this)
```bash
# .env.example - Safe to commit, shows structure only
DEMO_PASSWORD=demo
DATABASE_URL=your_database_url_here
AUTH_SECRET=your_secret_key_here
```

### 3. Reference in Code
```typescript
// ✅ Correct - uses environment variable
const password = process.env.DEMO_PASSWORD

// For client-side (exposed to browser)
const publicKey = process.env.NEXT_PUBLIC_API_KEY
```

## Pre-commit Security Checks

### Option 1: Git Hooks (Local Machine)
Install Husky for automatic pre-commit checks:

```bash
npm install husky --save-dev
npx husky install
npx husky add .husky/pre-commit 'npm run scan-secrets'
```

Add to `package.json`:
```json
{
  "scripts": {
    "scan-secrets": "detect-secrets scan --all-files --force-use-all-plugins"
  }
}
```

### Option 2: GitGuardian CLI (Recommended)
Best tool for catching secrets before push:

```bash
# Install
npm install -g gitguardian-cli

# Scan before commit
ggshield secret scan --staged
```

### Option 3: TruffleHog (Open Source)
```bash
# Install
pip install truffleHog

# Scan entire repo
trufflehog filesystem . --json
```

## Tools Comparison

| Tool | Type | Cost | Best For |
|------|------|------|----------|
| GitGuardian | CI/CD & CLI | Free tier | Enterprise & teams |
| TruffleHog | CLI | Free | Local scanning |
| Detect Secrets | Pre-commit | Free | Team standards |
| Gitleaks | Git hook | Free | Quick local checks |

## Workflow Checklist Before Creating PR

- [ ] Run `ggshield secret scan --staged` locally
- [ ] Verify no `.env.local` files are staged
- [ ] Check `.gitignore` includes `*.local` files
- [ ] Search code for passwords/API keys: `grep -r "password\|api_key\|secret" src/`
- [ ] Review commits for hardcoded values
- [ ] Use environment variables for all sensitive data
- [ ] Add `NEXT_PUBLIC_` prefix only for safe public data

## Common Patterns That Trigger Alerts

GitGuardian detects:
- `password: 'value'`
- `api_key: 'sk_...'`
- `token: 'bearer ...'`
- `secret: 'value'`
- Database connection strings with credentials
- AWS keys, Stripe keys, etc.

## What to Do If Secret is Committed

1. **Immediately** rotate the secret (change password, revoke token, etc.)
2. Remove from git history:
   ```bash
   git filter-branch --tree-filter 'rm -f path/to/file' HEAD
   ```
3. Force push (careful - notify team):
   ```bash
   git push --force-with-lease
   ```
4. Update `.env.local` with new secret

## For Demo Credentials

Use simple, obvious demo credentials:
```typescript
// ✅ OK for demo/development only
{ email: 'demo@example.com', password: 'demo' }
{ email: 'admin@app.com', password: 'demo123' }
```

Never use:
- Real employee credentials
- Actual company passwords
- Production API keys
- Real user data

## References
- GitGuardian: https://www.gitguardian.com
- TruffleHog: https://github.com/trufflesecurity/truffleHog
- OWASP: https://owasp.org/www-project-secrets-management
