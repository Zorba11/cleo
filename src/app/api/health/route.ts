import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/db';

export async function GET() {
  try {
    // Check database connectivity
    const dbHealthy = await checkDatabaseConnection();
    
    // Check environment variables
    const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    
    const healthStatus = {
      status: (dbHealthy && hasClerkKeys && hasDatabaseUrl) ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'operational',
        database: dbHealthy ? 'operational' : 'unavailable',
        auth: hasClerkKeys ? 'configured' : 'not_configured',
        storage: 'not_configured'  // Will update in Phase 2
      },
      environment: {
        node_env: process.env.NODE_ENV,
        database_configured: hasDatabaseUrl,
        auth_configured: hasClerkKeys
      }
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