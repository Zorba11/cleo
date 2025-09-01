import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import OpenAI from 'openai';
import { uploadFile } from './storage';
import { AssetType } from '@prisma/client';

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Initialize OpenAI client for dialogue enhancement
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Voice settings for consistent audio generation
export interface VoiceSettings {
  stability: number; // 0-1: Controls stability vs variability
  similarity_boost: number; // 0-1: Controls similarity to reference voice
  style?: number; // 0-1: Controls speaking style (optional)
  use_speaker_boost?: boolean; // Enhance speaker similarity
  speed?: number; // Controls speech speed (0.5-2.0)
}

// Audio generation options
export interface NarrationOptions {
  voiceId: string;
  modelId?: string; // 'eleven_v3' or 'eleven_multilingual_v2'
  outputFormat?: string; // 'mp3_44100_128', 'mp3_22050_32', etc.
  voiceSettings?: VoiceSettings;
}

// Default voice settings for explainer videos
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.8, // High stability for consistent narration
  similarity_boost: 0.9, // High similarity for professional voice
  style: 0.7, // Balanced style
  use_speaker_boost: true, // Enhanced speaker similarity
  speed: 1.0, // Normal speed
};

// Default narration options
export const DEFAULT_NARRATION_OPTIONS: Omit<NarrationOptions, 'voiceId'> = {
  modelId: 'eleven_multilingual_v2', // Stable multilingual model
  outputFormat: 'mp3_44100_128', // Good quality MP3
  voiceSettings: DEFAULT_VOICE_SETTINGS,
};

// Generate audio for a single dialogue turn
export async function generateAudio(
  projectId: string,
  dialogueIndex: number,
  text: string,
  options: NarrationOptions
): Promise<{ key: string; url: string; duration?: number }> {
  try {
    console.log(
      `🎵 Generating audio for dialogue ${dialogueIndex}: "${text.substring(
        0,
        50
      )}..."`
    );

    // Generate audio using ElevenLabs
    const audioStream = await elevenlabs.textToSpeech.convert(options.voiceId, {
      text,
      modelId: options.modelId || DEFAULT_NARRATION_OPTIONS.modelId,
      outputFormat:
        options.outputFormat || DEFAULT_NARRATION_OPTIONS.outputFormat,
      voiceSettings: options.voiceSettings || DEFAULT_VOICE_SETTINGS,
    });

    // Convert ReadableStream to Buffer
    const chunks: Uint8Array[] = [];
    const reader = audioStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const audioBuffer = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk))
    );

    // Generate filename
    const filename = `beat_${dialogueIndex.toString().padStart(3, '0')}.mp3`;

    // Upload to R2 storage
    const uploadResult = await uploadFile(
      projectId,
      AssetType.AUDIO,
      filename,
      audioBuffer,
      'audio/mpeg'
    );

    console.log(
      `✅ Audio generated and uploaded: ${uploadResult.key} (${audioBuffer.length} bytes)`
    );

    // Estimate duration based on text length (rough approximation)
    const estimatedDuration = Math.max(
      5,
      Math.min(30, text.split(' ').length * 0.3)
    );

    return {
      key: uploadResult.key,
      url: uploadResult.url,
      duration: estimatedDuration,
    };
  } catch (error) {
    console.error('❌ Failed to generate audio:', error);
    throw new Error(
      `Failed to generate audio: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

// Generate audio for multiple dialogue turns
export async function generateBatchAudio(
  projectId: string,
  dialogues: { index: number; text: string }[],
  options: NarrationOptions
): Promise<{
  [dialogueIndex: number]: { key: string; url: string; duration?: number };
}> {
  try {
    console.log(`🎵 Generating audio for ${dialogues.length} dialogue turns`);

    const results: {
      [dialogueIndex: number]: { key: string; url: string; duration?: number };
    } = {};

    // Process dialogues sequentially to avoid rate limiting
    for (const dialogue of dialogues) {
      try {
        const result = await generateAudio(
          projectId,
          dialogue.index,
          dialogue.text,
          options
        );

        results[dialogue.index] = result;

        // Small delay between requests to be respectful to the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `❌ Failed to generate audio for dialogue ${dialogue.index}:`,
          error
        );
        // Continue with other dialogues even if one fails
        results[dialogue.index] = {
          key: '',
          url: '',
          duration: 0,
        };
      }
    }

    const successful = Object.values(results).filter((r) => r.key).length;
    console.log(
      `✅ Batch audio generation complete: ${successful}/${dialogues.length} successful`
    );

    return results;
  } catch (error) {
    console.error('❌ Failed to generate batch audio:', error);
    throw new Error(
      `Failed to generate batch audio: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

// Get available voices from ElevenLabs
export async function getAvailableVoices(): Promise<unknown[]> {
  try {
    console.log('🎤 Fetching available voices from ElevenLabs');

    const voices = await elevenlabs.voices.getAll();
    console.log(`✅ Found ${voices.voices?.length || 0} available voices`);

    return voices.voices || [];
  } catch (error) {
    console.error('❌ Failed to fetch voices:', error);
    throw new Error(
      `Failed to fetch voices: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

// Test ElevenLabs connection
export async function testElevenLabsConnection(): Promise<boolean> {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.warn('⚠️ ElevenLabs API key not configured');
      return false;
    }

    // Try to fetch voices as a connection test
    const voices = await getAvailableVoices();

    return voices.length > 0;
  } catch (error) {
    console.error('❌ ElevenLabs connection test failed:', error);
    return false;
  }
}

// Enhance dialogue text for ElevenLabs v3 best practices
export async function enhanceDialogueForTTS(
  plainText: string,
  context?: string,
  style?: string
): Promise<string> {
  try {
    console.log(
      '🎭 Enhancing dialogue for TTS:',
      plainText.substring(0, 50) + '...'
    );

    const prompt = `You are an expert voice actor and script writer specializing in creating expressive narration for AI voice synthesis. Your task is to transform plain explanatory text into engaging, emotionally rich dialogue that will sound natural and compelling when spoken by ElevenLabs v3.

INPUT TEXT: "${plainText}"

${context ? `CONTEXT: ${context}` : ''}
${style ? `STYLE: ${style}` : ''}

TRANSFORMATION REQUIREMENTS:
1. Add emotional cues and expressive language
2. Include natural pauses and emphasis markers
3. Use conversational tone with personality
4. Add rhetorical questions and engaging phrases
5. Incorporate sensory and vivid language
6. Use contractions and natural speech patterns
7. Add enthusiasm and energy markers
8. Include pacing instructions where helpful

BEST PRACTICES FOR ELEVENLABS V3:
- Use emotional descriptors like "excitedly", "thoughtfully", "enthusiastically"
- Add emphasis with words like "really", "absolutely", "incredible"
- Include natural hesitations like "you know", "well", "actually"
- Use rhetorical questions to engage the listener
- Add vivid, sensory descriptions
- Incorporate storytelling elements
- Use conversational transitions

Return ONLY the enhanced dialogue text, no explanations or formatting. Make it flow naturally as spoken language.

ENHANCED DIALOGUE:`;

    const completion = await openai.responses.create({
      model: 'gpt-5-mini-2025-08-07',
      input: prompt,
      max_output_tokens: 500,
      temperature: 0.7,
    });

    let enhancedText = '';

    if (completion.output_text) {
      enhancedText = completion.output_text;
    } else {
      const messageOutput = completion.output?.find(
        (output) => output.type === 'message'
      );
      if (messageOutput && 'content' in messageOutput) {
        const textItem = messageOutput.content?.[0];
        if (textItem && 'text' in textItem) {
          enhancedText = textItem.text;
        }
      }
    }

    if (!enhancedText) {
      console.warn('⚠️ Failed to enhance dialogue, using original text');
      return plainText;
    }

    console.log(
      '✅ Enhanced dialogue:',
      enhancedText.substring(0, 100) + '...'
    );
    return enhancedText.trim();
  } catch (error) {
    console.error('❌ Failed to enhance dialogue:', error);
    // Return original text if enhancement fails
    return plainText;
  }
}

// Enhance multiple dialogues for TTS
export async function enhanceBatchDialoguesForTTS(
  dialogues: { index: number; text: string; context?: string }[],
  overallStyle?: string
): Promise<{ index: number; originalText: string; enhancedText: string }[]> {
  try {
    console.log(`🎭 Enhancing ${dialogues.length} dialogues for TTS`);

    const enhancedDialogues = await Promise.all(
      dialogues.map(async (dialogue) => {
        const enhancedText = await enhanceDialogueForTTS(
          dialogue.text,
          dialogue.context,
          overallStyle
        );

        return {
          index: dialogue.index,
          originalText: dialogue.text,
          enhancedText,
        };
      })
    );

    console.log('✅ Batch dialogue enhancement complete');
    return enhancedDialogues;
  } catch (error) {
    console.error('❌ Failed to enhance batch dialogues:', error);
    // Return original dialogues if enhancement fails
    return dialogues.map((d) => ({
      index: d.index,
      originalText: d.text,
      enhancedText: d.text,
    }));
  }
}

// Voice recommendations for different types of content
export const VOICE_RECOMMENDATIONS = {
  explainer: [
    '21m00Tcm4TlvDq8ikWAM', // Rachel - Clear, professional female voice
    'AZnzlk1XvdvUeBnXmlld', // Dora - Warm, engaging female voice
    'EXAVITQu4vr4xnSDxMaL', // Bella - Friendly, approachable female voice
    'ErXwobaYiN019PkySvjV', // Antoni - Professional male voice
    'VR6AewLTigWG4xSOukaG', // Arnold - Authoritative male voice
  ],
  educational: [
    '21m00Tcm4TlvDq8ikWAM', // Rachel - Clear and articulate
    'AZnzlk1XvdvUeBnXmlld', // Dora - Warm and trustworthy
    'pNInz6obpgDQGcFmaJgB', // Adam - Professional and clear
    'ErXwobaYiN019PkySvjV', // Antoni - Educational tone
  ],
  corporate: [
    '21m00Tcm4TlvDq8ikWAM', // Rachel - Professional female
    'ErXwobaYiN019PkySvjV', // Antoni - Corporate male
    'pNInz6obpgDQGcFmaJgB', // Adam - Authoritative male
    'MF3mGyEYCl7XYWbV9V6O', // Elli - Confident female
  ],
};

// Default voice for explainer videos
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
