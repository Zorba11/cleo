import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db, updateAssetMeta } from '@/lib/db';
import { downloadFile } from '@/lib/storage';
import { z } from 'zod';

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

    // Verify access and find the plan asset
    const project = await db.project.findFirst({
      where: { id, owner: { clerkId: userId } },
      include: {
        assets: {
          where: { type: 'DOC' },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const planAsset =
      project.assets.find((a) => a.label === 'ProjectPlan.json') ||
      project.assets.find((a) => a.r2Key.endsWith('/plan/ProjectPlan.json'));

    const r2Key = planAsset?.r2Key || `projects/${id}/plan/ProjectPlan.json`;

    // Fetch from R2
    const buffer = await downloadFile(r2Key);
    const json = JSON.parse(buffer.toString('utf8'));

    return NextResponse.json({ success: true, data: json });
  } catch (error) {
    console.error('Failed to fetch plan JSON:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}

const SelectBodySchema = z.object({
  planAssetId: z.string().uuid().optional(),
  styleAssetId: z.string().uuid().optional(),
});

// Mark active plan/style assets; default latest when none specified
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = SelectBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid body' },
        { status: 400 }
      );
    }

    const { planAssetId, styleAssetId } = parsed.data;

    // Load project DOC assets
    const project = await db.project.findFirst({
      where: { id, owner: { clerkId: userId } },
      include: {
        assets: { where: { type: 'DOC' }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const planAssets = project.assets.filter(
      (a) =>
        a.label === 'ProjectPlan.json' ||
        a.r2Key.endsWith('/plan/ProjectPlan.json')
    );
    const styleAssets = project.assets.filter(
      (a) =>
        a.label === 'StyleBible.min.json' ||
        a.r2Key.endsWith('/plan/StyleBible.min.json')
    );

    const chosenPlan = planAssetId
      ? planAssets.find((a) => a.id === planAssetId)
      : planAssets[0];
    const chosenStyle = styleAssetId
      ? styleAssets.find((a) => a.id === styleAssetId)
      : styleAssets[0];

    // Update meta.active flags
    const tasks: Promise<unknown>[] = [];
    for (const a of planAssets) {
      const meta = {
        ...(a.meta as unknown as Record<string, unknown>),
        kind: 'plan',
        active: a.id === chosenPlan?.id,
        version: a.createdAt,
      };
      tasks.push(updateAssetMeta(a.id, meta, userId));
    }
    for (const a of styleAssets) {
      const meta = {
        ...(a.meta as unknown as Record<string, unknown>),
        kind: 'style_bible_min',
        active: a.id === chosenStyle?.id,
        version: a.createdAt,
      };
      tasks.push(updateAssetMeta(a.id, meta, userId));
    }
    await Promise.all(tasks);

    return NextResponse.json({
      success: true,
      data: {
        projectId: id,
        activePlanAssetId: chosenPlan?.id || null,
        activeStyleAssetId: chosenStyle?.id || null,
      },
    });
  } catch (error) {
    console.error('Failed to select active plan/style:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to select plan/style' },
      { status: 500 }
    );
  }
}
