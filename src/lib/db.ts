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
  meta?: any
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
        meta: meta ? JSON.stringify(meta) : null,
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
    const where = clerkId 
      ? { projectId, owner: { clerkId }, ...(type && { type }) }
      : { projectId, ...(type && { type }) };
    
    const assets = await db.asset.findMany({
      where: clerkId ? { project: { id: projectId, owner: { clerkId } }, ...(type && { type }) } : { projectId, ...(type && { type }) },
      orderBy: { createdAt: 'desc' },
      include: {
        project: clerkId ? { include: { owner: true } } : false
      }
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
          owner: { clerkId }
        }
      },
      include: {
        project: {
          include: { owner: true }
        }
      }
    });
    
    return asset;
  } catch (error) {
    console.error('Failed to get asset:', error);
    throw error;
  }
}

// Update asset metadata
export async function updateAssetMeta(assetId: string, meta: any, clerkId?: string) {
  try {
    const where = clerkId 
      ? { id: assetId, project: { owner: { clerkId } } }
      : { id: assetId };
    
    const asset = await db.asset.update({
      where,
      data: {
        meta: JSON.stringify(meta)
      }
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
      where
    });
    
    console.log(`✅ Asset deleted: ${assetId}`);
    return asset;
  } catch (error) {
    console.error('Failed to delete asset:', error);
    throw error;
  }
}

// Get asset storage usage for project
export async function getProjectStorageUsage(projectId: string, clerkId?: string) {
  try {
    const where = clerkId 
      ? { projectId, project: { owner: { clerkId } } }
      : { projectId };
    
    const assets = await db.asset.findMany({
      where,
      select: {
        type: true,
        bytes: true
      }
    });
    
    const usage = assets.reduce((acc, asset) => {
      const type = asset.type;
      if (!acc[type]) {
        acc[type] = { count: 0, bytes: 0n };
      }
      acc[type].count++;
      acc[type].bytes += asset.bytes;
      return acc;
    }, {} as Record<AssetType, { count: number; bytes: bigint }>);
    
    const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0n);
    
    return {
      totalAssets: assets.length,
      totalBytes,
      byType: usage
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
        createdAt: true
      }
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
        notes
      }
    });
    
    console.log(`📊 Progress tracked: ${phase} - ${status}`);
    return progressEntry;
  } catch (error) {
    console.error('Failed to track progress:', error);
    throw error;
  }
}