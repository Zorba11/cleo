import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { AssetType } from '@prisma/client';
import { getPresignedDownloadUrl } from '@/lib/storage';

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

    // Verify access and get project with audio assets
    const project = await db.project.findFirst({
      where: { id, owner: { clerkId: userId } },
      include: {
        assets: {
          where: { type: AssetType.AUDIO },
        },
        beats: {
          select: {
            id: true,
            index: true,
            summary: true,
            onScreenText: true,
            durationS: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse meta; filter narration assets
    const narrationAssets = project.assets.filter((asset) => {
      let meta: Record<string, unknown> | undefined;
      const raw = asset.meta as unknown;
      if (typeof raw === 'string') {
        try {
          meta = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          meta = undefined;
        }
      } else if (raw && typeof raw === 'object') {
        meta = raw as Record<string, unknown>;
      }
      return !!meta && meta.kind === 'narration';
    });

    // Build audio files with presigned URLs
    const audioFiles = await Promise.all(
      narrationAssets.map(async (asset) => {
        let meta: Record<string, unknown> = {};
        const raw = asset.meta as unknown;
        if (typeof raw === 'string') {
          try {
            meta = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            meta = {};
          }
        } else if (raw && typeof raw === 'object') {
          meta = raw as Record<string, unknown>;
        }

        let downloadUrl = '';
        try {
          downloadUrl = await getPresignedDownloadUrl(asset.r2Key, 3600);
        } catch (e) {
          console.warn('Failed to create presigned URL for', asset.r2Key, e);
        }

        return {
          id: asset.id,
          dialogueIndex: meta.dialogueIndex as number | undefined,
          filename: asset.label,
          r2Key: asset.r2Key,
          duration: meta.duration as number | undefined,
          voiceId: meta.voiceId as string | undefined,
          bytes:
            typeof asset.bytes === 'bigint' ? Number(asset.bytes) : asset.bytes,
          createdAt: asset.createdAt,
          downloadUrl,
        };
      })
    );

    // Build narration data structure
    const narrationData = {
      projectId: project.id,
      status: project.status,
      totalDialogues: project.beats.length,
      narratedDialogues: narrationAssets.length,
      audioFiles,
      beats: project.beats.map((beat) => ({
        id: beat.id,
        index: beat.index,
        summary: beat.summary,
        onScreenText: beat.onScreenText,
        durationS: beat.durationS,
        hasAudio: narrationAssets.some((asset) => {
          let meta: Record<string, unknown> = {};
          const raw = asset.meta as unknown;
          if (typeof raw === 'string') {
            try {
              meta = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              meta = {};
            }
          } else if (raw && typeof raw === 'object') {
            meta = raw as Record<string, unknown>;
          }
          return (meta.dialogueIndex as number | undefined) === beat.index;
        }),
        audioFile: (() => {
          const a = narrationAssets.find((asset) => {
            let meta: Record<string, unknown> = {};
            const raw = asset.meta as unknown;
            if (typeof raw === 'string') {
              try {
                meta = JSON.parse(raw) as Record<string, unknown>;
              } catch {
                meta = {};
              }
            } else if (raw && typeof raw === 'object') {
              meta = raw as Record<string, unknown>;
            }
            return (meta.dialogueIndex as number | undefined) === beat.index;
          });
          return a?.label;
        })(),
      })),
    };

    return NextResponse.json({
      success: true,
      data: narrationData,
    });
  } catch (error) {
    console.error('Failed to fetch narration data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch narration data' },
      { status: 500 }
    );
  }
}
