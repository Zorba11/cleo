# Runbook - Development & Production Setup

## Prerequisites

- Node.js 18+ 
- pnpm package manager
- PostgreSQL database (Neon recommended)
- Cloudflare account with R2 storage
- Clerk account for authentication
- ElevenLabs API key
- Google AI Studio or Vertex AI account (Gemini)
- Inngest account

## Environment Variables

### Required Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@host:5432/dbname?sslmode=require

# Cloudflare R2 Storage  
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=cleo-explainer-videos
R2_PUBLIC_BASE_URL=https://pub-xxxxx.r2.dev

# ElevenLabs TTS
ELEVENLABS_API_KEY=your_api_key

# Gemini AI (Google AI Studio)
GEMINI_API_KEY=your_api_key

# Optional: Replicate (for WhisperX forced alignment)
REPLICATE_API_TOKEN=your_token

# Inngest Background Jobs
INNGEST_EVENT_KEY=your_event_key
```

## Setup Instructions

### 1. Clerk Authentication Setup

1. Go to [clerk.com](https://clerk.com) and create an account
2. Create a new application
3. In your Clerk dashboard:
   - Go to **API Keys** 
   - Copy the **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Copy the **Secret key** → `CLERK_SECRET_KEY`
4. Configure sign-in methods (email/OAuth providers)

### 2. Neon PostgreSQL Setup

1. Go to [neon.tech](https://neon.tech) and create account
2. Create new project
3. Copy the connection string → `DATABASE_URL`
4. Database will auto-sleep when not in use (free tier)

### 3. Cloudflare R2 Setup

1. Log into Cloudflare Dashboard
2. Go to **R2 Object Storage**
3. Create a new bucket (e.g., `cleo-explainer-videos`)
4. Go to **R2 API Tokens** → **Create API Token**
5. Configure permissions: Object Read & Write for your bucket
6. Copy credentials:
   - Account ID → `R2_ACCOUNT_ID`
   - Access Key ID → `R2_ACCESS_KEY_ID` 
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
7. Set up public access:
   - Go to bucket settings → **Public access**
   - Enable public access and note the public URL → `R2_PUBLIC_BASE_URL`

### 4. ElevenLabs Setup

1. Go to [elevenlabs.io](https://elevenlabs.io) 
2. Sign up and verify account
3. Go to **API Keys** in dashboard
4. Generate API key → `ELEVENLABS_API_KEY`
5. Note: Free tier has limited characters/month

### 5. Google Gemini Setup

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Create/login to Google account
3. Create new API key
4. Copy API key → `GEMINI_API_KEY`
5. Note: Free tier has rate limits

### 6. Inngest Setup

1. Go to [inngest.com](https://inngest.com)
2. Create account and new app
3. Copy event key → `INNGEST_EVENT_KEY`
4. Configure webhooks for local development (see Inngest docs)

## Local Development

### Initial Setup

```bash
# Clone and install dependencies
git clone <repo-url>
cd cleo
pnpm install

# Setup environment
cp .env.example .env
# Fill in all environment variables

# Initialize database
pnpm prisma generate
pnpm prisma db push

# Seed database (optional)
pnpm prisma db seed
```

### Development Server

```bash
# Start development server
pnpm dev

# Open http://localhost:3000
```

### Database Operations

```bash
# Generate Prisma client after schema changes
pnpm prisma generate

# Push schema changes to database
pnpm prisma db push

# View database in Prisma Studio
pnpm prisma studio

# Reset database (WARNING: deletes all data)
pnpm prisma db push --force-reset
```

### Testing

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run all API test routes
curl http://localhost:3000/api/health
curl http://localhost:3000/api/plan/test
curl http://localhost:3000/api/tts/beat/test
# ... etc for all test routes
```

## Production Deployment

### Vercel Deployment (Recommended)

1. Connect GitHub repo to Vercel
2. Set all environment variables in Vercel dashboard
3. Deploy automatically on git push

### Environment Variables in Production

Ensure all production values are set:
- Use production Clerk keys
- Use production database URL
- Use production R2 bucket
- Use production API keys

### Database Migrations

```bash
# Generate migration files
pnpm prisma migrate dev --name init

# Apply migrations in production
pnpm prisma migrate deploy
```

## Monitoring & Debugging

### Health Check

- **Endpoint**: `GET /api/health`
- **Purpose**: Verify all services are operational
- **Response**: Status of database, R2, and external APIs

### Logging

- Application logs via console/Vercel
- Job logs stored in `Job` model
- Progress tracking in `ProgressEntry` model
- Error tracking via Vercel/external service

### Database Monitoring

```bash
# Connect to production database
pnpm prisma studio --browser none

# Check database connection
pnpm prisma db pull
```

### R2 Storage Monitoring

- Monitor bucket usage in Cloudflare dashboard
- Set up billing alerts for storage/bandwidth
- Consider lifecycle policies for old files

## Security Considerations

### Environment Variables
- Never commit `.env` file to git
- Use different keys for dev/staging/production  
- Rotate API keys regularly

### Database Security
- Use connection pooling for production
- Enable SSL connections (sslmode=require)
- Regular backups via Neon

### File Upload Security
- Validate file types before R2 upload
- Set reasonable file size limits
- Use signed URLs for temporary access

### API Rate Limiting
- Implement rate limiting for expensive operations
- Monitor usage of external APIs
- Handle rate limit errors gracefully

## Troubleshooting

### Common Issues

**"Database connection failed"**
- Check DATABASE_URL format
- Verify network connectivity to Neon
- Check if database is sleeping (wake with any query)

**"R2 upload failed"**  
- Verify R2 credentials and bucket permissions
- Check bucket exists and is accessible
- Verify CORS settings if accessing from browser

**"Clerk authentication not working"**
- Check publishable vs secret key usage
- Verify Clerk configuration matches environment
- Check domain settings in Clerk dashboard

**"External API timeouts"**
- Implement retry logic with exponential backoff
- Check API key validity and rate limits
- Consider fallback strategies

### Debug Mode

```bash
# Enable debug logging
DEBUG=* pnpm dev

# Check specific service
DEBUG=prisma:* pnpm dev
DEBUG=clerk:* pnpm dev
```

## Performance Optimization

### Database
- Use Prisma connection pooling
- Add indexes for frequently queried fields
- Consider read replicas for heavy workloads

### Storage
- Implement CDN for frequently accessed assets
- Use appropriate compression for images/videos  
- Set cache headers for static assets

### API Optimization
- Implement request caching where appropriate
- Use streaming for large file operations
- Consider background job processing for heavy tasks

## Backup & Recovery

### Database Backups
- Neon provides automatic daily backups
- Export important data regularly
- Test restore procedures

### R2 Storage Backups
- Consider cross-region replication
- Export project artifacts for archival
- Document recovery procedures

### Code Backups
- Use git with remote repositories
- Tag production releases
- Document rollback procedures