import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import {
  generateBatchAudio,
  generateAudio,
  DEFAULT_VOICE_ID,
  DEFAULT_NARRATION_OPTIONS,
  NarrationOptions,
} from '@/lib/narration';
import {
  getProjectForUser,
  createAsset,
  updateProjectStatusToNarrated,
  trackNarrationProgress,
} from '@/lib/db';
import { AssetType } from '@prisma/client';

const NarrationRequestSchema = z.object({
  projectId: z.string().uuid(),
  voiceId: z.string().optional(),
  modelId: z.string().optional(),
  outputFormat: z.string().optional(),
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarity_boost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      use_speaker_boost: z.boolean().optional(),
      speed: z.number().min(0.5).max(2.0).optional(),
    })
    .optional(),
});

const SingleNarrationRequestSchema = z.object({
  projectId: z.string().uuid(),
  dialogueIndex: z.number().min(0),
  text: z.string().min(1).max(2000),
  voiceId: z.string().optional(),
  modelId: z.string().optional(),
  outputFormat: z.string().optional(),
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarity_boost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      use_speaker_boost: z.boolean().optional(),
      speed: z.number().min(0.5).max(2.0).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    console.log('🎵 Narration API request received');

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

    // Check if this is a single dialogue or batch request
    const isSingleRequest =
      'dialogueIndex' in requestData && 'text' in requestData;

    const validationSchema = isSingleRequest
      ? SingleNarrationRequestSchema
      : NarrationRequestSchema;

    const validation = validationSchema.safeParse(requestData);
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

    const data = validation.data;
    const { projectId } = data;

    console.log(
      `🎵 Starting narration process for project: ${projectId}${
        isSingleRequest
          ? `, dialogue: ${(data as { dialogueIndex: number }).dialogueIndex}`
          : ', batch mode'
      }`
    );

    // Verify project ownership and status
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

    if (project.status !== 'PLANNED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Project must be in PLANNED status to generate narration',
          currentStatus: project.status,
        },
        { status: 400 }
      );
    }

    // Check if project has dialogue turns to narrate
    if (!project.beats || project.beats.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Project has no dialogue turns to narrate',
        },
        { status: 400 }
      );
    }

    // Prepare narration options
    const narrationOptions: NarrationOptions = {
      voiceId: (data as { voiceId?: string }).voiceId || DEFAULT_VOICE_ID,
      modelId:
        (data as { modelId?: string }).modelId ||
        DEFAULT_NARRATION_OPTIONS.modelId,
      outputFormat:
        (data as { outputFormat?: string }).outputFormat ||
        DEFAULT_NARRATION_OPTIONS.outputFormat,
      voiceSettings:
        (data as { voiceSettings?: VoiceSettings }).voiceSettings ||
        DEFAULT_NARRATION_OPTIONS.voiceSettings,
    };

    // Track narration start
    await trackNarrationProgress(
      projectId,
      'NARRATION_START',
      'IN_PROGRESS',
      `Starting narration with voice: ${narrationOptions.voiceId}`
    );

    if (isSingleRequest) {
      // Single dialogue narration
      const { dialogueIndex, text } = data as {
        dialogueIndex: number;
        text: string;
      };

      // Generate directly using provided dialogue text
      await trackNarrationProgress(
        projectId,
        'AUDIO_GENERATION',
        'IN_PROGRESS',
        `Generating audio for dialogue ${dialogueIndex}`
      );

      let audioResult;
      try {
        audioResult = await generateAudio(
          projectId,
          dialogueIndex,
          text,
          narrationOptions
        );
      } catch (audioError) {
        await trackNarrationProgress(
          projectId,
          'AUDIO_GENERATION',
          'FAILED',
          `Audio generation failed: ${
            audioError instanceof Error ? audioError.message : 'Unknown error'
          }`
        );

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to generate audio',
            details:
              audioError instanceof Error
                ? audioError.message
                : 'Unknown error',
          },
          { status: 500 }
        );
      }

      await trackNarrationProgress(
        projectId,
        'AUDIO_GENERATION',
        'COMPLETED',
        `Generated audio for dialogue ${dialogueIndex}: ${audioResult.key}`
      );

      // Record audio file as asset
      try {
        const filename = `beat_${dialogueIndex
          .toString()
          .padStart(3, '0')}.mp3`;
        await createAsset(
          projectId,
          AssetType.AUDIO,
          filename,
          audioResult.key,
          BigInt(audioResult.duration || 10) * 1000n, // Rough estimate in milliseconds
          undefined,
          {
            kind: 'narration',
            dialogueIndex,
            duration: audioResult.duration,
            voiceId: narrationOptions.voiceId,
          }
        );
      } catch (assetError) {
        console.warn('⚠️ Failed to record audio file as asset:', assetError);
      }

      // Check if all dialogues are narrated (single dialogue, so we're done)

      // For now, assume this is the only dialogue, update status to NARRATED
      await updateProjectStatusToNarrated(projectId, userId);

      await trackNarrationProgress(
        projectId,
        'NARRATION_COMPLETE',
        'COMPLETED',
        `Narration completed successfully for dialogue ${dialogueIndex}`
      );

      console.log(
        `✅ Narration completed successfully for project: ${projectId}`
      );

      return NextResponse.json({
        success: true,
        data: {
          projectId,
          dialogueIndex,
          audio: {
            key: audioResult.key,
            url: audioResult.url,
            duration: audioResult.duration,
          },
          voiceId: narrationOptions.voiceId,
          status: 'NARRATED',
          generatedAt: new Date().toISOString(),
        },
      });
    } else {
      // Batch narration - generate audio for all dialogue turns using beats' onScreenText
      const dialogues = project.beats.flatMap((beat) =>
        beat.onScreenText
          ? [{ index: beat.index, text: beat.onScreenText }]
          : []
      );

      if (dialogues.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No dialogue turns found to narrate',
          },
          { status: 400 }
        );
      }

      await trackNarrationProgress(
        projectId,
        'BATCH_AUDIO_GENERATION',
        'IN_PROGRESS',
        `Generating audio for ${dialogues.length} dialogue turns`
      );

      let audioResults;
      try {
        audioResults = await generateBatchAudio(
          projectId,
          dialogues,
          narrationOptions
        );
      } catch (batchError) {
        await trackNarrationProgress(
          projectId,
          'BATCH_AUDIO_GENERATION',
          'FAILED',
          `Batch audio generation failed: ${
            batchError instanceof Error ? batchError.message : 'Unknown error'
          }`
        );

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to generate batch audio',
            details:
              batchError instanceof Error
                ? batchError.message
                : 'Unknown error',
          },
          { status: 500 }
        );
      }

      await trackNarrationProgress(
        projectId,
        'BATCH_AUDIO_GENERATION',
        'COMPLETED',
        `Generated audio for ${Object.keys(audioResults).length} dialogues`
      );

      // Record audio files as assets
      const assetPromises = Object.entries(audioResults).map(
        async ([dialogueIndex, result]) => {
          if (result.key) {
            try {
              const filename = `beat_${dialogueIndex.padStart(3, '0')}.mp3`;
              await createAsset(
                projectId,
                AssetType.AUDIO,
                filename,
                result.key,
                BigInt(result.duration || 10) * 1000n,
                undefined,
                {
                  kind: 'narration',
                  dialogueIndex: parseInt(dialogueIndex),
                  duration: result.duration,
                  voiceId: narrationOptions.voiceId,
                }
              );
            } catch (assetError) {
              console.warn(
                `⚠️ Failed to record audio asset for dialogue ${dialogueIndex}:`,
                assetError
              );
            }
          }
        }
      );

      await Promise.allSettled(assetPromises);

      // Update project status to NARRATED
      await updateProjectStatusToNarrated(projectId, userId);

      await trackNarrationProgress(
        projectId,
        'NARRATION_COMPLETE',
        'COMPLETED',
        `Batch narration completed successfully for ${
          Object.keys(audioResults).length
        } dialogues`
      );

      console.log(
        `✅ Batch narration completed successfully for project: ${projectId}`
      );

      return NextResponse.json({
        success: true,
        data: {
          projectId,
          audioResults,
          voiceId: narrationOptions.voiceId,
          status: 'NARRATED',
          metadata: {
            totalDialogues: dialogues.length,
            successfulGenerations: Object.values(audioResults).filter(
              (r) => r.key
            ).length,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
  } catch (error) {
    console.error('❌ Narration API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during narration',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
