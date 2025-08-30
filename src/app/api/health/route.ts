import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db';
import { checkR2Connection } from '@/lib/storage';
import { testOpenAIConnection } from '@/lib/llm';

export async function GET() {
  try {
    // Check database connectivity
    const dbHealthy = await checkDatabaseConnection();
    
    // Check R2 connectivity
    let storageHealthy = false;
    let storageError = null;
    
    try {
      storageHealthy = await checkR2Connection();
    } catch (error) {
      storageError = error instanceof Error ? error.message : 'Unknown storage error';
      console.warn('Storage health check failed:', storageError);
    }
    
    // Check OpenAI connectivity
    let llmHealthy = false;
    let llmError = null;
    
    try {
      llmHealthy = await testOpenAIConnection();
    } catch (error) {
      llmError = error instanceof Error ? error.message : 'Unknown LLM error';
      console.warn('OpenAI health check failed:', llmError);
    }
    
    // Check environment variables
    const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    const hasR2Config = !!(
      (process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT) &&
      (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID) &&
      (process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY) &&
      (process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.R2_BUCKET)
    );
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    const healthStatus = {
      status: (dbHealthy && hasClerkKeys && hasDatabaseUrl && storageHealthy && hasOpenAIKey) ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'operational',
        database: dbHealthy ? 'operational' : 'unavailable',
        auth: hasClerkKeys ? 'configured' : 'not_configured',
        storage: storageHealthy ? 'operational' : (hasR2Config ? 'unavailable' : 'not_configured'),
        llm: llmHealthy ? 'operational' : (hasOpenAIKey ? 'unavailable' : 'not_configured')
      },
      environment: {
        node_env: process.env.NODE_ENV,
        database_configured: hasDatabaseUrl,
        auth_configured: hasClerkKeys,
        storage_configured: hasR2Config,
        llm_configured: hasOpenAIKey
      },
      ...(storageError && { storage_error: storageError }),
      ...(llmError && { llm_error: llmError })
    };

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

    return NextResponse.json({
      ok: healthStatus.status === 'healthy',
      data: healthStatus
    }, { status: statusCode });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Health check failed',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}