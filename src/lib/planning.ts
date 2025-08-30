import { PlanResponse, DialogueTurn, BeatPlan, StyleBible, TimelineSkeleton } from './llm';
import { uploadPlanFile } from './storage';
// Planning utilities for project plan processing and R2 storage

export interface ProcessedPlan {
  projectPlan: ProjectPlanFile;
  styleBible: StyleBibleFile;
  r2Keys: {
    projectPlan: string;
    styleBible: string;
  };
}

export interface ProjectPlanFile {
  topic: string;
  totalDuration: number;
  dialogueInputs: DialogueTurn[];
  beats: BeatPlan[];
  timelineSkeleton: TimelineSkeleton;
  createdAt: string;
  version: '1.0';
}

export interface StyleBibleFile {
  visualStyle: string;
  colorPalette: string[];
  typography: string;
  mood: string;
  createdAt: string;
  version: '1.0';
}

export async function processPlanForStorage(
  projectId: string,
  topic: string,
  planResponse: PlanResponse
): Promise<ProcessedPlan> {
  try {
    console.log(`📋 Processing plan for storage - Project: ${projectId}`);

    const timestamp = new Date().toISOString();

    const projectPlan: ProjectPlanFile = {
      topic,
      totalDuration: planResponse.timelineSkeleton.totalDuration,
      dialogueInputs: planResponse.dialogueInputs,
      beats: planResponse.beats,
      timelineSkeleton: planResponse.timelineSkeleton,
      createdAt: timestamp,
      version: '1.0',
    };

    const styleBible: StyleBibleFile = {
      visualStyle: planResponse.styleBibleMin.visualStyle,
      colorPalette: planResponse.styleBibleMin.colorPalette,
      typography: planResponse.styleBibleMin.typography,
      mood: planResponse.styleBibleMin.mood,
      createdAt: timestamp,
      version: '1.0',
    };

    console.log('💾 Uploading plan files to R2...');

    const projectPlanUpload = await uploadPlanFile(
      projectId,
      'ProjectPlan.json',
      JSON.stringify(projectPlan, null, 2),
      'application/json'
    );

    const styleBibleUpload = await uploadPlanFile(
      projectId,
      'StyleBible.min.json',
      JSON.stringify(styleBible),
      'application/json'
    );

    console.log(`✅ Plan files uploaded successfully`);
    console.log(`   - ProjectPlan.json: ${projectPlanUpload.key}`);
    console.log(`   - StyleBible.min.json: ${styleBibleUpload.key}`);

    return {
      projectPlan,
      styleBible,
      r2Keys: {
        projectPlan: projectPlanUpload.key,
        styleBible: styleBibleUpload.key,
      },
    };

  } catch (error) {
    console.error('❌ Failed to process plan for storage:', error);
    throw new Error(`Failed to process plan for storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validatePlanResponse(planResponse: unknown): planResponse is PlanResponse {
  if (!planResponse || typeof planResponse !== 'object') {
    return false;
  }

  const plan = planResponse as Record<string, unknown>;

  if (!Array.isArray(plan.dialogueInputs)) {
    return false;
  }

  for (const turn of plan.dialogueInputs as unknown[]) {
    const typedTurn = turn as Record<string, unknown>;
    if (typeof typedTurn.index !== 'number' || 
        typeof typedTurn.text !== 'string' || 
        typeof typedTurn.estimatedDuration !== 'number') {
      return false;
    }
  }

  if (!Array.isArray(plan.beats)) {
    return false;
  }

  for (const beat of plan.beats as unknown[]) {
    const typedBeat = beat as Record<string, unknown>;
    if (typeof typedBeat.index !== 'number' || 
        typeof typedBeat.summary !== 'string') {
      return false;
    }
  }

  if (!plan.styleBibleMin || 
      typeof (plan.styleBibleMin as Record<string, unknown>).visualStyle !== 'string' ||
      !Array.isArray((plan.styleBibleMin as Record<string, unknown>).colorPalette) ||
      typeof (plan.styleBibleMin as Record<string, unknown>).typography !== 'string' ||
      typeof (plan.styleBibleMin as Record<string, unknown>).mood !== 'string') {
    return false;
  }

  if (!plan.timelineSkeleton ||
      typeof (plan.timelineSkeleton as Record<string, unknown>).totalDuration !== 'number' ||
      !Array.isArray((plan.timelineSkeleton as Record<string, unknown>).beatTimings)) {
    return false;
  }

  for (const timing of (plan.timelineSkeleton as Record<string, unknown>).beatTimings as unknown[]) {
    const typedTiming = timing as Record<string, unknown>;
    if (typeof typedTiming.beatIndex !== 'number' ||
        typeof typedTiming.startTime !== 'number' ||
        typeof typedTiming.endTime !== 'number') {
      return false;
    }
  }

  return true;
}

export function generateMockPlan(topic: string): PlanResponse {
  const mockDialogue: DialogueTurn[] = [
    {
      index: 0,
      text: `Ever wondered about ${topic}? Let's dive in and explore this fascinating topic together.`,
      estimatedDuration: 8
    },
    {
      index: 1,
      text: `First, let's understand what ${topic} actually means and why it matters in today's world.`,
      estimatedDuration: 12
    },
    {
      index: 2,
      text: `The key components that make ${topic} work are interconnected in interesting ways.`,
      estimatedDuration: 15
    },
    {
      index: 3,
      text: `Here's where things get really interesting - the practical applications are endless.`,
      estimatedDuration: 18
    },
    {
      index: 4,
      text: `Let's look at some real-world examples that demonstrate these principles in action.`,
      estimatedDuration: 20
    },
    {
      index: 5,
      text: `But what about the challenges? Every system has its limitations and considerations.`,
      estimatedDuration: 16
    },
    {
      index: 6,
      text: `The future looks bright with emerging trends and innovations on the horizon.`,
      estimatedDuration: 14
    },
    {
      index: 7,
      text: `Now you have a solid understanding of ${topic} and its importance. Thanks for watching!`,
      estimatedDuration: 10
    }
  ];

  const mockBeats: BeatPlan[] = [
    {
      index: 1,
      summary: `Introduction and hook - animated title sequence with ${topic} visualization`,
      onScreenText: `Understanding ${topic}`,
      plannedFrames: 2,
      durationS: 20
    },
    {
      index: 2,
      summary: `Definition and context - infographic style explanation with icons`,
      onScreenText: "What it means",
      plannedFrames: 3,
      durationS: 27
    },
    {
      index: 3,
      summary: `Key components breakdown - diagram with interconnected elements`,
      onScreenText: "Key Components",
      plannedFrames: 4,
      durationS: 33
    },
    {
      index: 4,
      summary: `Practical applications showcase - split screen examples`,
      onScreenText: "Real Applications",
      plannedFrames: 3,
      durationS: 38
    },
    {
      index: 5,
      summary: `Real-world examples - case studies with visual data`,
      onScreenText: "Success Stories",
      plannedFrames: 3,
      durationS: 36
    },
    {
      index: 6,
      summary: `Future trends and conclusion - forward-looking animation`,
      onScreenText: "The Future",
      plannedFrames: 2,
      durationS: 24
    }
  ];

  const mockStyleBible: StyleBible = {
    visualStyle: "Modern flat illustration with clean geometric shapes and subtle gradients",
    colorPalette: ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#ffffff"],
    typography: "Inter font family, bold for headings, medium for body text",
    mood: "Professional, approachable, and educational"
  };

  const mockTimeline: TimelineSkeleton = {
    totalDuration: 180,
    beatTimings: [
      { beatIndex: 1, startTime: 0, endTime: 20 },
      { beatIndex: 2, startTime: 20, endTime: 47 },
      { beatIndex: 3, startTime: 47, endTime: 80 },
      { beatIndex: 4, startTime: 80, endTime: 118 },
      { beatIndex: 5, startTime: 118, endTime: 154 },
      { beatIndex: 6, startTime: 154, endTime: 178 }
    ]
  };

  return {
    dialogueInputs: mockDialogue,
    beats: mockBeats,
    styleBibleMin: mockStyleBible,
    timelineSkeleton: mockTimeline
  };
}