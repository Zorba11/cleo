import { PrismaClient } from '@prisma/client';

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