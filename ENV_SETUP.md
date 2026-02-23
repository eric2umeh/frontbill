# Environment Variables Setup Guide

This guide explains how to configure environment variables for FrontBill.

## Files

- **`.env.example`** - Reference file showing all available environment variables
- **`.env.local.example`** - Template with detailed explanations
- **`.env.local`** - Your actual configuration (created locally, never committed)

## Quick Setup

### 1. Create Your `.env.local` File

```bash
# Copy the example file
cp .env.local.example .env.local
```

### 2. Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project "frontbill"
3. Click **Settings** → **API**
4. You'll see:
   - **Project URL** → Use for `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon public key** → Use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service role key** → Use for `SUPABASE_SERVICE_ROLE_KEY`
   - **JWT Secret** → Use for `SUPABASE_JWT_SECRET`

### 3. Fill in Your `.env.local`

```env
# From Supabase API Settings
NEXT_PUBLIC_SUPABASE_URL=https://veuuqawqjvnvmsrukois.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your_jwt_secret

# Database details (also from Supabase)
POSTGRES_HOST=db.veuuqawqjvnvmsrukois.supabase.co
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
```

## Environment Variables Explained

### Public Variables (Safe to expose)
These can be seen in client-side code:

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key for client auth | Long JWT token |
| `NEXT_PUBLIC_APP_URL` | Your app's URL for redirects | `http://localhost:3000` |

### Private Variables (Server-only)
These must NEVER be exposed to the client:

| Variable | Purpose | Where to Keep |
|----------|---------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations | `.env.local` only |
| `SUPABASE_JWT_SECRET` | Token verification | `.env.local` only |
| `POSTGRES_URL` | Database connection | `.env.local` only |
| `POSTGRES_PASSWORD` | Database password | `.env.local` only |

## Local Development

### Running Locally

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Your app will be at http://localhost:3000
```

The `.env.local` file will be automatically loaded by Next.js.

## Deployment to Vercel

### Using Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your FrontBill project
3. Go to **Settings** → **Environment Variables**
4. Add each variable from `.env.local`:
   - ✅ Add public variables (NEXT_PUBLIC_*)
   - ✅ Add private variables (SUPABASE_*, POSTGRES_*)
5. Select which environments need each variable (Production, Preview, Development)

### Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... etc
```

## Security Best Practices

⚠️ **Important Rules:**

1. **Never commit `.env.local`**
   ```bash
   # .gitignore already contains:
   .env.local
   .env.*.local
   ```

2. **Never expose service keys in client code**
   - Only use `NEXT_PUBLIC_SUPABASE_ANON_KEY` in frontend
   - Use `SUPABASE_SERVICE_ROLE_KEY` only in `/app/api/` routes

3. **Keep credentials secret**
   - Don't share `.env.local` files
   - Don't commit keys to Git
   - Rotate keys if compromised

4. **Use different keys per environment**
   - Local development: Development keys
   - Production: Production keys
   - Staging: Staging keys

## Troubleshooting

### "Environment variable not found"
- Check `.env.local` exists
- Verify variable names are spelled correctly
- Restart dev server: `pnpm dev`

### Supabase connection errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is valid
- Ensure Supabase project is active

### Authentication fails after deployment
- Confirm all variables are set in Vercel
- Check `NEXT_PUBLIC_SUPABASE_URL` matches Supabase project
- Verify auth redirect URLs in Supabase settings

## Verifying Setup

Run this to test your setup:

```bash
# Check if environment variables are loaded
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"

# Should output your Supabase URL
# https://veuuqawqjvnvmsrukois.supabase.co
```

## References

- [Supabase API Keys](https://supabase.com/docs/guides/api/authentication)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
