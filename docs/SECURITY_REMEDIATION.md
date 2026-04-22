# Security Remediation - Exposed Supabase Anon Key

## Issue
GitGuardian detected a hardcoded Supabase Anon Key in the git commit history:
- **Location**: `lib/config.ts` and `app/auth/setup/page.tsx`
- **Type**: JSON Web Token (JWT) - Supabase Public Anon Key
- **Status**: ❌ EXPOSED in PR #6 (feature/api branch)

## Root Cause
During development, the Supabase credentials were hardcoded as fallback values in the codebase instead of relying solely on environment variables. This exposed the key in git history where it could be accessed by anyone with repository access.

## Actions Taken

### 1. Code Changes (Committed)
- **lib/config.ts**: Removed hardcoded Anon Key, now only reads from environment variables
- **app/auth/setup/page.tsx**: Removed exposed key display, replaced with instructions
- **.env.example**: Created template file with placeholder values
- **.gitignore**: Verified `.env.local` is ignored (it already was)

### 2. IMMEDIATE ACTIONS REQUIRED

⚠️ **The exposed key must be revoked immediately:**

1. **Go to Supabase Dashboard**
   - Project: `tuahakfaqknmmdlqqrwr`
   - Navigate to: Settings → API
   
2. **Revoke the Exposed Key**
   - Find the exposed Anon Key
   - Click the 3-dot menu → "Revoke"
   - Confirm revocation
   
3. **Generate a New Anon Key**
   - After revocation, click "Generate New Key"
   - Copy the new key
   
4. **Update Deployment**
   - In Vercel Project Settings → Environment Variables
   - Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the new key
   - Redeploy the application
   
5. **Update Local Development**
   - Edit your `.env.local` file with the new key
   - Restart dev server: `npm run dev`

### 3. Git History Cleanup
The secret is still in the git commit history. To completely remove it:

```bash
# Option A: Force push to remove commits (⚠️ Only if you're the only developer)
# git reset --hard HEAD~1  # Remove last commit
# git push origin feature/api --force

# Option B: Use git filter-repo (recommended for shared repos)
# See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
```

## Prevention Measures

### ✅ Going Forward
- **Never hardcode secrets** in source code, even as fallbacks
- **Use environment variables only**: `process.env.NEXT_PUBLIC_*`
- **Verify .gitignore** includes all secret files (`.env.local`, `.env*.local`, etc.)
- **Enable secret scanning** in GitHub: Settings → Security & Analysis → Secret Scanning
- **Use GitGuardian** or similar tools in CI/CD to catch secrets before commits
- **Review .env.example** has only placeholder values

### 🔐 Secret Management Best Practices
1. **Local Development**: Store secrets in `.env.local` (gitignored)
2. **Staging/Production**: Use Vercel Environment Variables or secrets manager
3. **Team Sharing**: Never share secrets via Git, Email, or Chat
4. **Rotation**: Regularly rotate API keys and access tokens
5. **Scope**: Use limited-scope tokens (e.g., Supabase Anon Keys with RLS policies)

## Files Modified
- `lib/config.ts` - Removed hardcoded secret
- `app/auth/setup/page.tsx` - Removed exposed key display
- `.env.example` - Added proper template
- `SECURITY_REMEDIATION.md` - This file

## Status
- ✅ Code remediated
- ⏳ Requires: Key revocation in Supabase
- ⏳ Requires: Environment variable update in Vercel
- ⏳ Requires: Git history cleanup (optional but recommended)

---

**Last Updated**: 2026-02-22
**Incident**: Hardcoded JWT exposed in PR #6
**Responsible**: Security scanning catch
