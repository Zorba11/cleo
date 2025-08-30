import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createProject } from '@/lib/db';
import { z } from 'zod';

const createProjectSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500, 'Topic must be less than 500 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    const body = await request.json();
    const validatedData = createProjectSchema.parse(body);
    
    const project = await createProject(user.clerkId, validatedData.topic);
    
    return NextResponse.json({
      ok: true,
      data: project
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        ok: false,
        error: error.issues[0]?.message || 'Invalid input'
      }, { status: 400 });
    }
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        ok: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      ok: false,
      error: 'Failed to create project'
    }, { status: 500 });
  }
}