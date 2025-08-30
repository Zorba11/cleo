import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { downloadFile } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify access and find the plan asset
    const project = await db.project.findFirst({
      where: { id, owner: { clerkId: userId } },
      include: {
        assets: {
          where: { type: 'DOC' }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const planAsset = project.assets.find(a => a.label === 'ProjectPlan.json')
      || project.assets.find(a => a.r2Key.endsWith('/plan/ProjectPlan.json'));

    const r2Key = planAsset?.r2Key || `projects/${id}/plan/ProjectPlan.json`;

    // Fetch from R2
    const buffer = await downloadFile(r2Key);
    const json = JSON.parse(buffer.toString('utf8'));

    return NextResponse.json({ success: true, data: json });

  } catch (error) {
    console.error('Failed to fetch plan JSON:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch plan' }, { status: 500 });
  }
}


