import { PrismaClient, AssetType } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Helper function to check database connectivity
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Helper function to create or update user from Clerk
export async function syncUserFromClerk(clerkId: string, email: string) {
  try {
    const user = await db.user.upsert({
      where: { clerkId },
      update: { email },
      create: {
        clerkId,
        email,
      },
    });
    return user;
  } catch (error) {
    console.error('Failed to sync user from Clerk:', error);
    throw error;
  }
}

// Helper function to get user projects
export async function getUserProjects(clerkId: string) {
  try {
    const user = await db.user.findUnique({
      where: { clerkId },
      include: {
        projects: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    return user?.projects || [];
  } catch (error) {
    console.error('Failed to get user projects:', error);
    throw error;
  }
}

// Helper function to create a new project
export async function createProject(clerkId: string, topic: string) {
  try {
    const user = await db.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const project = await db.project.create({
      data: {
        ownerId: user.id,
        topic,
        status: 'PLANNED',
      },
    });
    return project;
  } catch (error) {
    console.error('Failed to create project:', error);
    throw error;
  }
}

// Helper function to get project with owner check
export async function getProjectForUser(projectId: string, clerkId: string) {
  try {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        owner: { clerkId },
      },
      include: {
        beats: {
          orderBy: { index: 'asc' },
        },
        assets: true,
        frames: true,
        cues: true,
        progressEntries: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
    return project;
  } catch (error) {
    console.error('Failed to get project:', error);
    throw error;
  }
}

// Asset Management Helpers

// Create asset record in database
export async function createAsset(
  projectId: string,
  type: AssetType,
  label: string,
  r2Key: string,
  bytes: bigint,
  checksum?: string,
  meta?: unknown
) {
  try {
    const asset = await db.asset.create({
      data: {
        projectId,
        type,
        label,
        r2Key,
        bytes,
        checksum,
        meta: meta ? JSON.stringify(meta) : undefined,
      },
    });

    console.log(`✅ Asset created: ${asset.id} (${type})`);
    return asset;
  } catch (error) {
    console.error('Failed to create asset:', error);
    throw error;
  }
}

// Get project assets by type
export async function getProjectAssets(
  projectId: string,
  type?: AssetType,
  clerkId?: string
) {
  try {
    const assets = await db.asset.findMany({
      where: clerkId
        ? {
            project: { id: projectId, owner: { clerkId } },
            ...(type && { type }),
          }
        : { projectId, ...(type && { type }) },
      orderBy: { createdAt: 'desc' },
      include: {
        project: clerkId ? { include: { owner: true } } : false,
      },
    });

    return assets;
  } catch (error) {
    console.error('Failed to get project assets:', error);
    throw error;
  }
}

// Get asset by ID with owner check
export async function getAssetForUser(assetId: string, clerkId: string) {
  try {
    const asset = await db.asset.findFirst({
      where: {
        id: assetId,
        project: {
          owner: { clerkId },
        },
      },
      include: {
        project: {
          include: { owner: true },
        },
      },
    });

    return asset;
  } catch (error) {
    console.error('Failed to get asset:', error);
    throw error;
  }
}

// Update asset metadata
export async function updateAssetMeta(
  assetId: string,
  meta: unknown,
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: assetId, project: { owner: { clerkId } } }
      : { id: assetId };

    const asset = await db.asset.update({
      where,
      data: {
        meta: JSON.stringify(meta),
      },
    });

    console.log(`✅ Asset metadata updated: ${assetId}`);
    return asset;
  } catch (error) {
    console.error('Failed to update asset metadata:', error);
    throw error;
  }
}

// Delete asset record
export async function deleteAsset(assetId: string, clerkId?: string) {
  try {
    const where = clerkId
      ? { id: assetId, project: { owner: { clerkId } } }
      : { id: assetId };

    const asset = await db.asset.delete({
      where,
    });

    console.log(`✅ Asset deleted: ${assetId}`);
    return asset;
  } catch (error) {
    console.error('Failed to delete asset:', error);
    throw error;
  }
}

// Get asset storage usage for project
export async function getProjectStorageUsage(
  projectId: string,
  clerkId?: string
) {
  try {
    // Verify project ownership if clerkId provided
    if (clerkId) {
      const project = await db.project.findFirst({
        where: { id: projectId, owner: { clerkId } },
      });
      if (!project) {
        throw new Error('Project not found or access denied');
      }
    }

    const assets = await db.asset.findMany({
      where: { projectId },
      select: {
        type: true,
        bytes: true,
      },
    });

    const usage = assets.reduce((acc, asset) => {
      const type = asset.type;
      if (!acc[type]) {
        acc[type] = { count: 0, bytes: BigInt(0) };
      }
      acc[type].count++;
      acc[type].bytes += asset.bytes;
      return acc;
    }, {} as Record<AssetType, { count: number; bytes: bigint }>);

    const totalBytes = assets.reduce(
      (sum, asset) => sum + asset.bytes,
      BigInt(0)
    );

    return {
      totalAssets: assets.length,
      totalBytes,
      byType: usage,
    };
  } catch (error) {
    console.error('Failed to get storage usage:', error);
    throw error;
  }
}

// Clean up orphaned assets (assets without corresponding R2 files)
export async function findOrphanedAssets(projectId: string, clerkId?: string) {
  try {
    const where = clerkId
      ? { projectId, project: { owner: { clerkId } } }
      : { projectId };

    // Get all assets for the project
    const assets = await db.asset.findMany({
      where,
      select: {
        id: true,
        r2Key: true,
        label: true,
        type: true,
        createdAt: true,
      },
    });

    // Note: To fully implement this, we'd need to check R2 for file existence
    // For now, just return the assets that could be checked
    return assets;
  } catch (error) {
    console.error('Failed to find orphaned assets:', error);
    throw error;
  }
}

// Progress tracking helper for asset operations
export async function trackAssetProgress(
  projectId: string,
  phase: string,
  status: string,
  notes?: string
) {
  try {
    const progressEntry = await db.progressEntry.create({
      data: {
        projectId,
        phase,
        status,
        notes,
      },
    });

    console.log(`📊 Progress tracked: ${phase} - ${status}`);
    return progressEntry;
  } catch (error) {
    console.error('Failed to track progress:', error);
    throw error;
  }
}

// Planning & Beat Management Helpers

export async function createProjectBeats(
  projectId: string,
  beats: Array<{
    index: number;
    summary: string;
    onScreenText?: string;
    plannedFrames?: number;
    durationS?: number;
  }>,
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: projectId, owner: { clerkId } }
      : { id: projectId };

    // Verify project exists and user has access
    const project = await db.project.findFirst({ where });
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Delete existing beats for this project
    await db.beat.deleteMany({
      where: { projectId },
    });

    // Create new beats
    const createdBeats = await Promise.all(
      beats.map((beat) =>
        db.beat.create({
          data: {
            projectId,
            index: beat.index,
            summary: beat.summary,
            onScreenText: beat.onScreenText,
            plannedFrames: beat.plannedFrames,
            durationS: beat.durationS,
          },
        })
      )
    );

    console.log(
      `✅ Created ${createdBeats.length} beats for project ${projectId}`
    );
    return createdBeats;
  } catch (error) {
    console.error('Failed to create project beats:', error);
    throw error;
  }
}

export async function createProjectStyleBible(
  projectId: string,
  styleBibleData: {
    visualStyle: string;
    colorPalette: string[];
    typography: string;
    mood: string;
  },
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: projectId, owner: { clerkId } }
      : { id: projectId };

    // Verify project exists and user has access
    const project = await db.project.findFirst({ where });
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Delete existing style bible
    await db.styleBible.deleteMany({
      where: { projectId },
    });

    // Create new style bible
    const styleBible = await db.styleBible.create({
      data: {
        projectId,
        json: styleBibleData,
      },
    });

    console.log(`✅ Created style bible for project ${projectId}`);
    return styleBible;
  } catch (error) {
    console.error('Failed to create project style bible:', error);
    throw error;
  }
}

export async function updateProjectStatusToPlanned(
  projectId: string,
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: projectId, owner: { clerkId } }
      : { id: projectId };

    const project = await db.project.update({
      where,
      data: {
        status: 'PLANNED',
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Updated project ${projectId} status to PLANNED`);
    return project;
  } catch (error) {
    console.error('Failed to update project status:', error);
    throw error;
  }
}

export async function getProjectWithPlanningData(
  projectId: string,
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: projectId, owner: { clerkId } }
      : { id: projectId };

    const project = await db.project.findFirst({
      where,
      include: {
        beats: {
          orderBy: { index: 'asc' },
        },
        frames: {
          orderBy: { index: 'asc' },
        },
        assets: {
          where: {
            type: 'DOC',
          },
        },
        styleBibles: true,
        progressEntries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return project;
  } catch (error) {
    console.error('Failed to get project with planning data:', error);
    throw error;
  }
}

export async function trackPlanningProgress(
  projectId: string,
  phase:
    | 'PLANNING_START'
    | 'LLM_GENERATION'
    | 'STORAGE_UPLOAD'
    | 'DATABASE_SAVE'
    | 'PLANNING_COMPLETE',
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED',
  notes?: string
) {
  return trackAssetProgress(projectId, phase, status, notes);
}

// Frames materialization helpers
export async function materializeFramesFromBeats(
  projectId: string,
  clerkId?: string
) {
  try {
    const where = clerkId
      ? { id: projectId, owner: { clerkId } }
      : { id: projectId };

    // Verify project
    const project = await db.project.findFirst({
      where,
      include: { beats: true },
    });
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Remove existing frames to avoid duplicates
    await db.frame.deleteMany({ where: { projectId } });

    // Create frames per beat based on plannedFrames
    for (const beat of project.beats) {
      const frameCount = beat.plannedFrames || 0;
      for (let i = 1; i <= frameCount; i++) {
        await db.frame.create({
          data: {
            projectId,
            beatId: beat.id,
            index: i,
            status: 'NEW',
          },
        });
      }
    }

    const total = await db.frame.count({ where: { projectId } });
    console.log(`✅ Materialized ${total} frames for project ${projectId}`);
    return total;
  } catch (error) {
    console.error('Failed to materialize frames from beats:', error);
    throw error;
  }
}
