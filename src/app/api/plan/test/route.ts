import { NextResponse } from 'next/server';
import { generateMockPlan } from '@/lib/planning';

export async function GET() {
  try {
    console.log('🧪 Plan test endpoint called');
    
    const mockTopic = 'How to make the perfect coffee';
    const mockPlan = generateMockPlan(mockTopic);
    
    console.log(`✅ Generated mock plan with ${mockPlan.beats.length} beats and ${mockPlan.dialogueInputs.length} dialogue turns`);
    
    return NextResponse.json({
      ok: true,
      data: {
        topic: mockTopic,
        status: 'PLANNED',
        planResponse: mockPlan,
        metadata: {
          totalDuration: mockPlan.timelineSkeleton.totalDuration,
          beatCount: mockPlan.beats.length,
          dialogueCount: mockPlan.dialogueInputs.length,
          generatedAt: new Date().toISOString(),
          testMode: true
        },
        testInfo: {
          description: 'Mock plan generated for testing purposes',
          features: [
            'Complete dialogue turns with timing',
            'Visual beat breakdown',
            'Style bible with colors and typography',
            'Timeline skeleton with beat timings',
            'No LLM API calls required'
          ],
          usage: 'This endpoint can be used to test the planning pipeline without consuming OpenAI tokens'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Plan test endpoint error:', error);
    
    return NextResponse.json({
      ok: false,
      error: 'Test endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    console.log('🧪 Plan test POST endpoint called');
    
    // Test with different topics
    const testTopics = [
      'The science of productivity',
      'Understanding cryptocurrency',
      'Building sustainable habits',
      'The psychology of decision making'
    ];
    
    const randomTopic = testTopics[Math.floor(Math.random() * testTopics.length)];
    const mockPlan = generateMockPlan(randomTopic);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`✅ Generated mock plan for topic: "${randomTopic}"`);
    
    return NextResponse.json({
      ok: true,
      data: {
        topic: randomTopic,
        status: 'PLANNED',
        planResponse: mockPlan,
        storage: {
          projectPlanKey: `projects/test-project/plan/ProjectPlan.json`,
          styleBibleKey: `projects/test-project/plan/StyleBible.min.json`
        },
        metadata: {
          totalDuration: mockPlan.timelineSkeleton.totalDuration,
          beatCount: mockPlan.beats.length,
          dialogueCount: mockPlan.dialogueInputs.length,
          generatedAt: new Date().toISOString(),
          testMode: true,
          processingTime: '1.0s (simulated)'
        },
        testInfo: {
          description: 'Mock plan with random topic for POST testing',
          randomTopic: randomTopic,
          availableTopics: testTopics,
          note: 'This simulates the full planning pipeline response format'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Plan test POST endpoint error:', error);
    
    return NextResponse.json({
      ok: false,
      error: 'Test POST endpoint failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}