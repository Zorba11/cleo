import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { generateProjectPlan } from '@/lib/llm';
import { processPlanForStorage } from '@/lib/planning';
import {
  createProjectBeats,
  createProjectStyleBible,
  updateProjectStatusToPlanned,
  trackPlanningProgress,
  getProjectForUser,
  createAsset,
} from '@/lib/db';
import { AssetType } from '@prisma/client';

const PlanRequestSchema = z.object({
  projectId: z.string().uuid(),
  topic: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Planning API request received');

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    let requestData;
    try {
      requestData = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      );
    }

    const validation = PlanRequestSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { projectId, topic } = validation.data;

    console.log(
      `📋 Starting planning process for project: ${projectId}, topic: "${topic}"`
    );

    // Verify project ownership
    const project = await getProjectForUser(projectId, userId);
    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: 'Project not found or access denied',
        },
        { status: 404 }
      );
    }

    // Track planning start
    await trackPlanningProgress(
      projectId,
      'PLANNING_START',
      'IN_PROGRESS',
      `Starting planning for: ${topic}`
    );

    // Generate plan using GPT-5
    await trackPlanningProgress(
      projectId,
      'LLM_GENERATION',
      'IN_PROGRESS',
      'Calling GPT-5 for plan generation'
    );

    let planResponse;
    try {
      planResponse = await generateProjectPlan(topic);
    } catch (llmError) {
      await trackPlanningProgress(
        projectId,
        'LLM_GENERATION',
        'FAILED',
        `LLM error: ${
          llmError instanceof Error ? llmError.message : 'Unknown error'
        }`
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to generate plan with GPT-5',
          details:
            llmError instanceof Error ? llmError.message : 'Unknown LLM error',
        },
        { status: 500 }
      );
    }

    await trackPlanningProgress(
      projectId,
      'LLM_GENERATION',
      'COMPLETED',
      `Generated ${planResponse.beats.length} beats, ${planResponse.dialogueInputs.length} dialogue turns`
    );

    // Process and save to R2 storage
    await trackPlanningProgress(
      projectId,
      'STORAGE_UPLOAD',
      'IN_PROGRESS',
      'Uploading plan files to R2'
    );

    let processedPlan;
    try {
      processedPlan = await processPlanForStorage(
        projectId,
        topic,
        planResponse
      );
    } catch (storageError) {
      await trackPlanningProgress(
        projectId,
        'STORAGE_UPLOAD',
        'FAILED',
        `Storage error: ${
          storageError instanceof Error ? storageError.message : 'Unknown error'
        }`
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save plan files to storage',
          details:
            storageError instanceof Error
              ? storageError.message
              : 'Unknown storage error',
        },
        { status: 500 }
      );
    }

    await trackPlanningProgress(
      projectId,
      'STORAGE_UPLOAD',
      'COMPLETED',
      `Uploaded ProjectPlan.json and StyleBible.min.json`
    );

    // Save to database
    await trackPlanningProgress(
      projectId,
      'DATABASE_SAVE',
      'IN_PROGRESS',
      'Saving beats and style bible to database'
    );

    try {
      // Create beats
      await createProjectBeats(projectId, planResponse.beats, userId);

      // Create style bible
      await createProjectStyleBible(
        projectId,
        planResponse.styleBibleMin,
        userId
      );

      // Record uploaded plan files as DOC assets so they appear in UI
      try {
        const projectPlanContent = JSON.stringify(
          processedPlan.projectPlan,
          null,
          2
        );
        const styleBibleContent = JSON.stringify(processedPlan.styleBible);
        const projectPlanBytes = BigInt(
          Buffer.byteLength(projectPlanContent, 'utf8')
        );
        const styleBibleBytes = BigInt(
          Buffer.byteLength(styleBibleContent, 'utf8')
        );

        await createAsset(
          projectId,
          AssetType.DOC,
          'ProjectPlan.json',
          processedPlan.r2Keys.projectPlan,
          projectPlanBytes,
          undefined,
          { kind: 'plan', description: 'Full planning artifact' }
        );

        await createAsset(
          projectId,
          AssetType.DOC,
          'StyleBible.min.json',
          processedPlan.r2Keys.styleBible,
          styleBibleBytes,
          undefined,
          { kind: 'style_bible_min' }
        );
      } catch (assetError) {
        console.warn('⚠️ Failed to record plan files as assets:', assetError);
      }

      // Update project status
      await updateProjectStatusToPlanned(projectId, userId);
    } catch (dbError) {
      await trackPlanningProgress(
        projectId,
        'DATABASE_SAVE',
        'FAILED',
        `Database error: ${
          dbError instanceof Error ? dbError.message : 'Unknown error'
        }`
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to save plan data to database',
          details:
            dbError instanceof Error
              ? dbError.message
              : 'Unknown database error',
        },
        { status: 500 }
      );
    }

    await trackPlanningProgress(
      projectId,
      'DATABASE_SAVE',
      'COMPLETED',
      `Saved ${planResponse.beats.length} beats and style bible`
    );

    // Mark planning as complete
    await trackPlanningProgress(
      projectId,
      'PLANNING_COMPLETE',
      'COMPLETED',
      `Planning completed successfully. Total duration: ${planResponse.timelineSkeleton.totalDuration}s`
    );

    console.log(`✅ Planning completed successfully for project: ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        topic,
        status: 'PLANNED',
        planResponse: {
          dialogueInputs: planResponse.dialogueInputs,
          beats: planResponse.beats,
          styleBibleMin: planResponse.styleBibleMin,
          timelineSkeleton: planResponse.timelineSkeleton,
        },
        storage: {
          projectPlanKey: processedPlan.r2Keys.projectPlan,
          styleBibleKey: processedPlan.r2Keys.styleBible,
        },
        metadata: {
          totalDuration: planResponse.timelineSkeleton.totalDuration,
          beatCount: planResponse.beats.length,
          dialogueCount: planResponse.dialogueInputs.length,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('❌ Planning API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during planning',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
