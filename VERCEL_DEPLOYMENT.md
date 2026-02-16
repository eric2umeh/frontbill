# Vercel Deployment Guide - FrontBill

## Initial Vercel Setup (One-time)

### 1. Create Vercel Account
- Go to https://vercel.com
- Sign up with GitHub (recommended for easy integration)

### 2. Import FrontBill Project
1. Go to Vercel Dashboard: https://vercel.com/dashboard
2. Click "Add New..." button
3. Select "Project"
4. Click "Import Git Repository"
5. Search and select: `frontbill`
6. Click "Import"

### 3. Configure Environment Variables
1. After import, Vercel shows "Configure Project"
2. Scroll to "Environment Variables" section
3. Add these variables:

```
NEXT_PUBLIC_SUPABASE_URL = [your-supabase-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY = [your-anon-key]
SUPABASE_SERVICE_ROLE_KEY = [your-service-role-key]
```

4. Click "Deploy"

### 4. Configure Git Integration
1. Go to Project Settings: https://vercel.com/frontbill/settings
2. Navigate to "Git" section
3. Under "Production Branch":
   - Select `main`
4. Under "Preview Deployments":
   - Select `develop` (for staging preview)
5. Enable:
   - ✓ "Automatic Production Deployment"
   - ✓ "Preview Deployments"

---

## Deployment Workflow

### Branch → Deployment Mapping

| Branch | Deployment | URL | Type |
|--------|-----------|-----|------|
| `main` | Production | https://frontbill.vercel.app | Live |
| `develop` | Staging | https://develop-frontbill.vercel.app | Preview |
| `feature/*` | PR Preview | https://frontbill-feat-xyz.vercel.app | Preview |

### What Happens When You Push

1. **Push to feature branch**
   - Vercel builds preview
   - Comments preview URL on PR
   - Takes ~2-3 minutes

2. **Merge to develop**
   - Vercel builds staging deployment
   - Available at develop preview URL
   - Takes ~2-3 minutes

3. **Merge to main**
   - Vercel builds production
   - Goes live immediately
   - Takes ~2-3 minutes
   - Users access updated site

---

## Monitoring Deployments

### Check Deployment Status
1. Go to Vercel Dashboard
2. Click "frontbill" project
3. View "Deployments" tab
4. See status: Building → Ready → Error

### View Deployment Logs
1. Click on deployment in list
2. Click "Logs" tab
3. View build logs for debugging
4. View runtime logs for errors

### See Function Logs
1. Click "Functions" tab
2. View API route logs
3. Useful for debugging `/api/` endpoints

---

## Environment Variables Management

### Add New Variable
1. Go to Project Settings
2. Click "Environment Variables"
3. Click "Add New Variable"
4. Enter name and value
5. Select which environments: Production, Preview, Development

### Update Variable
1. Settings → Environment Variables
2. Click the variable
3. Edit value
4. Click "Save"
5. Redeploy for changes to take effect

### View Current Variables
```bash
# In Vercel Dashboard
Settings → Environment Variables → View all
```

---

## Troubleshooting

### Deployment Failed
1. Check build logs in Vercel
2. Common issues:
   - Missing environment variable
   - Syntax error in code
   - TypeScript error
3. Fix locally, push fix, retry deployment

### Deployment Stuck Building
1. Click deployment
2. Click "..." menu
3. Select "Cancel deployment"
4. Push new commit to restart

### Preview Deployment Not Updating
1. Push force update: `git push origin feature/name --force-with-lease`
2. Or close and reopen PR
3. Or redeploy from Vercel dashboard

### Environment Variables Not Working
1. Verify variable name matches in code
2. For `NEXT_PUBLIC_*`, must rebuild after adding
3. Check variables are in correct environment (Production/Preview)
4. Redeploy: Settings → Deployments → Select latest → Click "Redeploy"

---

## Domain & Custom DNS

### Vercel Provided Domain
- Project automatically gets: `frontbill.vercel.app`
- No setup needed
- Always available

### Custom Domain (Optional)
1. Go to Project Settings
2. Click "Domains"
3. Add custom domain: `www.frontbill.com`
4. Follow DNS instructions for your registrar
5. Takes 24-48 hours to propagate

---

## Rollback to Previous Deployment

1. Go to Vercel Dashboard
2. Click "Deployments"
3. Find previous stable deployment
4. Click "..." menu
5. Click "Promote to Production"
6. Confirms you want to rollback
7. Previous version now live

---

## Performance Monitoring

### View Analytics
1. Vercel Dashboard → frontbill project
2. Click "Analytics" tab
3. View:
   - Response times
   - Error rates
   - Build times

### Optimize Performance
- Enable "Edge Functions" (API routes on edge)
- Use image optimization
- Enable "ISR" (Incremental Static Regeneration)

---

## CI/CD Pipeline (Automatic)

Vercel automatically:
1. Runs Next.js build on every push
2. Optimizes images
3. Minifies code
4. Deploys to CDN (worldwide)
5. Routes traffic through Vercel network

---

## Security Settings

### Enable Password Protection
1. Settings → Deployment Protection
2. Select "Standard" (adds password to preview)
3. Users must enter password before seeing preview

### GitHub Status Checks
1. Settings → Git
2. Requires preview deployment to be successful before merging

---

## Useful Dashboard Links

| Task | Link |
|------|------|
| Project Dashboard | https://vercel.com/frontbill |
| Project Settings | https://vercel.com/frontbill/settings |
| Environment Variables | https://vercel.com/frontbill/settings/environment-variables |
| Deployments | https://vercel.com/frontbill/deployments |
| Analytics | https://vercel.com/frontbill/analytics |
| Monitoring | https://vercel.com/frontbill/monitoring |

---

## Zero Downtime Deployment

Vercel handles this automatically:
- Old deployment stays live while new builds
- Traffic switches instantly when ready
- No downtime for users
- Can rollback instantly if needed

---

## Deployment Checklist

Before merging to main:

- [ ] Code reviewed and approved
- [ ] Tests passing
- [ ] Vercel preview deployment successful
- [ ] Mobile responsive verified
- [ ] No console errors in preview
- [ ] All Supabase queries working
- [ ] Environment variables set in Vercel
- [ ] No hardcoded URLs or secrets

