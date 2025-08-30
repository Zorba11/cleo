import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface DialogueTurn {
  index: number;
  text: string;
  estimatedDuration: number;
}

export interface BeatPlan {
  index: number;
  summary: string;
  onScreenText?: string;
  plannedFrames?: number;
  durationS?: number;
}

export interface StyleBible {
  visualStyle: string;
  colorPalette: string[];
  typography: string;
  mood: string;
}

export interface TimelineSkeleton {
  totalDuration: number;
  beatTimings: { beatIndex: number; startTime: number; endTime: number }[];
}

export interface PlanResponse {
  dialogueInputs: DialogueTurn[];
  beats: BeatPlan[];
  styleBibleMin: StyleBible;
  timelineSkeleton: TimelineSkeleton;
}

const PLANNING_PROMPT = `You are an expert explainer video planner. Your job is to create comprehensive plans for 3-minute explainer videos.

Given a topic, create:
1. Dialogue turns (8-12 turns, each 15-25 seconds)
2. Beat sheet (4-6 visual beats aligned with dialogue)
3. Style bible (visual style, colors, typography, mood)
4. Timeline skeleton (timing for each beat)

Topic: {topic}

Return valid JSON in this exact format:
{
  "dialogueInputs": [
    {
      "index": 0,
      "text": "Hook statement that grabs attention immediately",
      "estimatedDuration": 8
    }
  ],
  "beats": [
    {
      "index": 1,
      "summary": "Visual concept for this segment",
      "onScreenText": "Key text overlay",
      "plannedFrames": 3,
      "durationS": 30
    }
  ],
  "styleBibleMin": {
    "visualStyle": "Modern flat illustration with clean lines",
    "colorPalette": ["#2563eb", "#f59e0b", "#10b981", "#ffffff"],
    "typography": "Sans-serif, bold headings, readable body",
    "mood": "Professional yet approachable"
  },
  "timelineSkeleton": {
    "totalDuration": 180,
    "beatTimings": [
      {"beatIndex": 1, "startTime": 0, "endTime": 30}
    ]
  }
}

Rules:
- Total duration should be ~180 seconds (3 minutes)
- Each dialogue turn should be 15-25 seconds
- Beat summaries should describe visual concepts clearly
- On-screen text should be concise and impactful
- Color palette should have 3-5 colors including white/background
- Timeline beats should not overlap and sum to total duration`;

export async function generateProjectPlan(
  topic: string
): Promise<PlanResponse> {
  try {
    console.log(`🧠 Generating project plan for topic: "${topic}"`);

    // Combine system and user messages into single input for Responses API
    const combinedPrompt = `You are an expert explainer video planner. Return only valid JSON responses.

${PLANNING_PROMPT.replace('{topic}', topic)}`;

    // Use new Responses API for GPT-5 via OpenAI SDK
    const completion: OpenAI.Responses.Response = await openai.responses.create(
      {
        model: 'gpt-5-mini-2025-08-07',
        input: combinedPrompt,
        // max_output_tokens: 2000,
        temperature: 1, // GPT-5 only supports default temperature of 1
      }
    );

    // Handle different response output types
    let response: string | null = null;

    // Try output_text first (root level field)
    if (completion.output_text) {
      response = completion.output_text;
    } else {
      // Try to find message type output
      const messageOutput = completion.output?.find(
        (output) => output.type === 'message'
      );
      if (messageOutput && 'content' in messageOutput) {
        const textItem = messageOutput.content?.[0];
        if (textItem && 'text' in textItem) {
          response = textItem.text;
        }
      }
    }

    if (!response) {
      console.error(
        'OpenAI response structure:',
        JSON.stringify(completion, null, 2)
      );
      throw new Error('No valid text response content from OpenAI');
    }

    console.log('🔍 Parsing LLM response...');

    let planData: PlanResponse;
    try {
      planData = JSON.parse(response);
    } catch (parseError) {
      console.error('Failed to parse LLM response:', response);
      throw new Error(
        `Invalid JSON response from LLM: ${
          parseError instanceof Error ? parseError.message : 'Unknown error'
        }`
      );
    }

    // Validate required fields
    if (!planData.dialogueInputs || !Array.isArray(planData.dialogueInputs)) {
      throw new Error('Missing or invalid dialogueInputs in LLM response');
    }

    if (!planData.beats || !Array.isArray(planData.beats)) {
      throw new Error('Missing or invalid beats in LLM response');
    }

    if (!planData.styleBibleMin || typeof planData.styleBibleMin !== 'object') {
      throw new Error('Missing or invalid styleBibleMin in LLM response');
    }

    if (
      !planData.timelineSkeleton ||
      typeof planData.timelineSkeleton !== 'object'
    ) {
      throw new Error('Missing or invalid timelineSkeleton in LLM response');
    }

    // Validate dialogue turns
    for (const turn of planData.dialogueInputs) {
      if (
        typeof turn.index !== 'number' ||
        typeof turn.text !== 'string' ||
        typeof turn.estimatedDuration !== 'number'
      ) {
        throw new Error('Invalid dialogue turn structure');
      }
    }

    // Validate beats
    for (const beat of planData.beats) {
      if (typeof beat.index !== 'number' || typeof beat.summary !== 'string') {
        throw new Error('Invalid beat structure');
      }
    }

    // Validate style bible
    const style = planData.styleBibleMin;
    if (
      !style.visualStyle ||
      !style.colorPalette ||
      !Array.isArray(style.colorPalette) ||
      !style.typography ||
      !style.mood
    ) {
      throw new Error('Invalid style bible structure');
    }

    console.log(
      `✅ Generated plan with ${planData.dialogueInputs.length} dialogue turns and ${planData.beats.length} beats`
    );

    return planData;
  } catch (error) {
    console.error('❌ Failed to generate project plan:', error);

    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error('OpenAI API key not configured or invalid');
    }

    throw new Error(
      `Failed to generate project plan: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function testOpenAIConnection(): Promise<boolean> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not configured');
      return false;
    }

    // Test with basic GPT-4 model using old API for compatibility
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      max_completion_tokens: 5,
    });

    return !!completion.choices[0]?.message?.content;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
}
