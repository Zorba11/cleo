import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getProjectForUser } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    
    // Get project with planning data if it's planned
    const project = await getProjectForUser(id, userId);
    
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    
    // If project is planned, include planning data
    let projectData = project;
    if (project.status === 'PLANNED') {
      const { getProjectWithPlanningData } = await import('@/lib/db');
      const projectWithPlanning = await getProjectWithPlanningData(id, userId);
      if (projectWithPlanning) {
        projectData = projectWithPlanning;
      }
    }

    return NextResponse.json({
      success: true,
      data: projectData
    });
    
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}