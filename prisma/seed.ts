import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a test user (will be replaced by real Clerk users)
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      clerkId: 'test_user_123',
      email: 'test@example.com',
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create sample projects
  const sampleProjects = [
    {
      topic: 'How to make the perfect cup of coffee',
      status: 'PLANNED' as const,
    },
    {
      topic: 'Introduction to machine learning for beginners',
      status: 'NARRATED' as const,
    },
    {
      topic: 'Setting up a productive home office',
      status: 'FRAMES_READY' as const,
    },
  ];

  for (const projectData of sampleProjects) {
    const project = await prisma.project.upsert({
      where: {
        id: `${testUser.id}_${projectData.topic.replace(/\s+/g, '_').toLowerCase()}`,
      },
      update: {},
      create: {
        ownerId: testUser.id,
        topic: projectData.topic,
        status: projectData.status,
      },
    });

    console.log('✅ Created project:', project.topic);

    // Add sample beats for the first project
    if (projectData.status === 'PLANNED') {
      const beats = [
        {
          index: 0,
          summary: 'Introduction to coffee brewing',
          onScreenText: 'Welcome to Coffee 101',
          durationS: 15.0,
        },
        {
          index: 1,
          summary: 'Choosing the right beans',
          onScreenText: 'Quality beans make all the difference',
          durationS: 20.0,
        },
        {
          index: 2,
          summary: 'Grinding and brewing techniques',
          onScreenText: 'Perfect grind for perfect taste',
          durationS: 25.0,
        },
      ];

      for (const beatData of beats) {
        const beat = await prisma.beat.upsert({
          where: {
            projectId_index: {
              projectId: project.id,
              index: beatData.index,
            },
          },
          update: {},
          create: {
            projectId: project.id,
            ...beatData,
          },
        });

        console.log(`  ✅ Created beat ${beat.index}: ${beat.summary}`);
      }
    }

    // Add sample progress entries
    await prisma.progressEntry.create({
      data: {
        projectId: project.id,
        phase: 'PLANNING',
        status: 'COMPLETED',
        notes: 'Initial project planning completed',
      },
    });

    console.log(`  ✅ Added progress entry for ${project.topic}`);
  }

  console.log('🎉 Database seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });