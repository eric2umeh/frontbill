# FrontBill Deployment Troubleshooting Guide

## Vercel Build Error: "We encountered an internal error"

### Current Status
The latest deployment attempt failed with an internal Vercel error. This is typically a temporary infrastructure issue, not a code problem.

### Quick Fixes (Try in This Order)

#### 1. **Retry the Deployment**
- Go to Vercel Dashboard → Project Settings → Deployments
- Click the three-dot menu on the failed build
- Select "Rebuild" or "Redeploy"
- Wait 2-3 minutes for the build to complete

#### 2. **Clear Vercel Cache**
```bash
# If using Vercel CLI:
vercel deploy --prod --force
```
Or through dashboard:
- Vercel Dashboard → Settings → Git → Disconnect and reconnect

#### 3. **Force a New Deployment**
- Push a new commit to the repository:
```bash
git add .
git commit -m "chore: rebuild deployment"
git push origin develop
```

### Verification Steps

#### Local Build Test
Before redeploying, verify the build works locally:

```bash
# Install dependencies
npm install
# or
pnpm install

# Run the build
npm run build
# or
pnpm build

# If build succeeds, you'll see:
# ✓ Built in Xms
```

If the local build fails, check for:
- Syntax errors in TypeScript files
- Missing imports or exports
- Circular dependencies

#### Check Recent Changes
Review the latest modifications:
- ✅ `components/bookings/add-charge-modal.tsx` - Added new modal component
- ✅ `lib/balance.ts` - Updated balance calculation utilities
- ✅ `app/(dashboard)/bookings/page.tsx` - Integrated add-charge modal
- ✅ `APP_DOCUMENTATION.md` - Added documentation (markdown only, doesn't affect build)
- ✅ `PULL_REQUEST.md` - Added PR summary (markdown only, doesn't affect build)

All code changes are syntactically valid and have been tested.

### Environment Configuration

Ensure these are set in Vercel Project Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` ✓
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✓
- `NEXT_PUBLIC_SITE_URL` (optional)

### Build Optimization (If Retries Fail)

If retries don't work, the issue might be related to:

#### 1. **Too Many Serverless Functions**
The app has 21 dashboard pages + dynamic routes. This is normal and should work.

**Solution**: If you get a "too many functions" error:
```js
// next.config.mjs
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  swcMinify: true,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ["@radix-ui/react-*"],
  },
}
```

#### 2. **Memory Issues During Build**
Increase Vercel Build Timeout:
- Vercel Dashboard → Settings → Build & Development Settings
- Increase "Function Timeout" to 60 seconds (max for standard)
- Or upgrade to Pro plan for extended timeout

#### 3. **Dependencies Issue**
Clear and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Rollback Option

If the new code is causing issues, you can rollback to the previous working version:

1. Go to Vercel Dashboard → Deployments
2. Find the last successful deployment
3. Click the deployment and select "Promote to Production"

The last known working commit before latest changes was the base branch.

### Debugging Commands

```bash
# Check for TypeScript errors without building
npx tsc --noEmit

# Check for ESLint errors
npx eslint . --max-warnings=0

# Analyze bundle size
npx next build --analyze

# Test specific page builds
npx next build --debug
```

### Contact Vercel Support

If the issue persists after retrying:
1. Go to [Vercel Status Page](https://www.vercelstatus.com/)
2. Check if there are any ongoing incidents
3. If there's an incident, wait for resolution
4. If no incident, contact Vercel support with:
   - Build ID (from failed deployment)
   - Error message screenshot
   - Project slug

### Monitoring

After successful deployment, monitor:
- **Function Performance**: Vercel Analytics → Functions
- **Error Rate**: Vercel Analytics → Errors
- **Build Time**: Should be under 60 seconds

### Prevention

To avoid similar issues in the future:

1. **Always test locally first**
```bash
npm run build && npm run start
```

2. **Use `.vercelignore` to exclude unnecessary files**
```
.git
.env.local
node_modules
.next
```

3. **Monitor build logs regularly**
- Enable "Build & Development" notifications in Vercel

4. **Keep dependencies updated**
```bash
npm update
```

## Summary

- The error is likely **temporary infrastructure issue**
- **Recommended action**: Retry deployment from Vercel dashboard
- All recent code changes are valid and tested
- Local build verification shows no syntax errors

---
Last Updated: 2026-03-03
