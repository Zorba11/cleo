import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  materializeFramesFromBeats,
  getProjectWithPlanningData,
} from '@/lib/db';

// POST -> create placeholder frames from plannedFrames per beat
export async function POST(
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
    const total = await materializeFramesFromBeats(id, userId);
    const project = await getProjectWithPlanningData(id, userId);
    return NextResponse.json({ success: true, data: { total, project } });
  } catch (error) {
    console.error('Failed to materialize frames:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create frames' },
      { status: 500 }
    );
  }
}
