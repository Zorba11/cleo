# API Contracts & Testing

## Overview

API specifications for all endpoints with request/response schemas and testing procedures.

## Common Response Format

All APIs return typed JSON with this structure:

```typescript
interface APIResponse<T = any> {
  ok: boolean;
  error?: string;
  data?: T;
}
```

## 1. Planner API

### POST /api/plan

**Purpose**: Generate dialogue turns, beat sheet, style bible, and timeline skeleton

**Request Schema**:
```typescript
interface PlanRequest {
  topic: string;
}
```

**Response Schema**:
```typescript
interface PlanResponse {
  dialogueInputs: DialogueTurn[];
  beats: BeatPlan[];
  styleBibleMin: StyleBible;
  timelineSkeleton: TimelineSkeleton;
}

interface DialogueTurn {
  index: number;
  text: string;
  estimatedDuration: number;
}

interface BeatPlan {
  index: number;
  summary: string;
  onScreenText?: string;
  plannedFrames?: number;
  durationS?: number;
}

interface StyleBible {
  visualStyle: string;
  colorPalette: string[];
  typography: string;
  mood: string;
}

interface TimelineSkeleton {
  totalDuration: number;
  beatTimings: { beatIndex: number; startTime: number; endTime: number }[];
}
```

**Manual Test Steps**:
```bash
curl -X POST http://localhost:3000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"topic":"How to make coffee"}'
```

**Expected Results**:
- 200 status code
- Response contains all four required keys
- ProjectPlan.json and StyleBible.min.json written to R2
- DB rows created for Project, Beats, StyleBible
- Progress.md updated

**Test Route**: `/api/plan/test` - Returns mock successful response

---

## 2. Narration API

### POST /api/tts/beat (Recommended)

**Purpose**: Generate TTS audio for individual beat with timestamps

**Request Schema**:
```typescript
interface TTSBeatRequest {
  projectId: string;
  beatId: string;
}
```

**Response Schema**:
```typescript
interface TTSBeatResponse {
  audioUrl: string;
  alignmentUrl: string;
  durationS: number;
  alignment: {
    words: Array<{
      word: string;
      startS: number;
      endS: number;
      confidence: number;
    }>;
  };
}
```

**Manual Test Steps**:
```bash
curl -X POST http://localhost:3000/api/tts/beat \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project","beatId":"test-beat"}'
```

**Expected Results**:
- 200 status code
- audio/beat_X.wav uploaded to R2
- align/beat_X.json with word timestamps
- Audio duration > 0
- At least 1 word with valid startS/endS times

**Test Route**: `/api/tts/beat/test`

### Alternative: POST /api/tts/full + POST /api/align

For complete dialogue TTS followed by forced alignment.

---

## 3. Cue Sheet API

### POST /api/cues

**Purpose**: Build cue windows from alignment data and beats

**Request Schema**:
```typescript
interface CueRequest {
  projectId: string;
}
```

**Response Schema**:
```typescript
interface CueResponse {
  cuesUrl: string;
  frameCount: number;
  totalDuration: number;
  cues: Array<{
    frameId: string;
    startS: number;
    endS: number;
    onScreenText?: string;
    transitionIn?: string;
    transitionOut?: string;
  }>;
}
```

**Manual Test Steps**:
```bash
curl -X POST http://localhost:3000/api/cues \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project"}'
```

**Expected Results**:
- 200 status code
- cues/cues.json written to R2
- All frame start/end times align with word boundaries
- Total duration ≈ planned ~180s
- Valid transition specifications

**Test Route**: `/api/cues/test`

---

## 4. Frames API

### POST /api/frame/base

**Purpose**: Generate base frame for a beat using Gemini 2.5 Flash

**Request Schema**:
```typescript
interface FrameBaseRequest {
  projectId: string;
  beatId: string;
}
```

**Response Schema**:
```typescript
interface FrameBaseResponse {
  frameId: string;
  imageUrl: string;
  validationStatus: 'approved' | 'repair_needed';
  repairPrompt?: string;
}
```

**Manual Test Steps**:
```bash
curl -X POST http://localhost:3000/api/frame/base \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project","beatId":"test-beat"}'
```

**Expected Results**:
- 200 status code
- PNG file written to R2 at frames/BXX_F01.png
- Frame record created in DB
- Validation returns either 'approved' or 'repair_needed'

**Test Route**: `/api/frame/base/test`

### POST /api/frame/edit

**Purpose**: Generate iterative edit frame based on previous frame

**Request Schema**:
```typescript
interface FrameEditRequest {
  projectId: string;
  beatId: string;
  prevFrameId: string;
  editInstructions?: string;
}
```

**Test Route**: `/api/frame/edit/test`

### POST /api/frame/validate

**Purpose**: LLM vision validation of frame quality

**Request Schema**:
```typescript
interface FrameValidateRequest {
  projectId: string;
  frameId: string;
}
```

**Test Route**: `/api/frame/validate/test`

### POST /api/frame/repair

**Purpose**: Apply repair instructions to fix frame issues

**Request Schema**:
```typescript
interface FrameRepairRequest {
  projectId: string;
  frameId: string;
  repairPrompt: string;
}
```

**Test Route**: `/api/frame/repair/test`

---

## 5. Assembly API

### POST /api/assemble

**Purpose**: Stitch frames, audio, and text overlays into final MP4

**Request Schema**:
```typescript
interface AssembleRequest {
  projectId: string;
}
```

**Response Schema**:
```typescript
interface AssembleResponse {
  videoUrl: string;
  durationS: number;
  fileSize: number;
  framerate: number;
}
```

**Manual Test Steps**:
```bash
curl -X POST http://localhost:3000/api/assemble \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project"}'
```

**Expected Results**:
- 200 status code
- video/final.mp4 written to R2
- Video duration within ±0.5s of cue total
- File is playable MP4 format
- Contains audio track and visual frames

**Test Route**: `/api/assemble/test`

---

## 6. Status API

### GET /api/status/[projectId]

**Purpose**: Get consolidated project status for dashboard

**Response Schema**:
```typescript
interface StatusResponse {
  project: {
    id: string;
    topic: string;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
  };
  progress: {
    phase: string;
    status: string;
    completedSteps: number;
    totalSteps: number;
    lastUpdate: string;
  };
  assets: {
    [key in AssetType]: number;
  };
}
```

**Manual Test Steps**:
```bash
curl http://localhost:3000/api/status/test-project
```

**Test Route**: `/api/status/test`

---

## Testing Checklist

### Pre-Implementation Tests
- [ ] All test routes return 200 with correct schema
- [ ] Mock data validates against TypeScript interfaces
- [ ] Error handling returns proper error responses

### Post-Implementation Tests  
- [ ] Real API calls work end-to-end
- [ ] Files are properly uploaded to R2
- [ ] Database records are created correctly
- [ ] Progress tracking updates appropriately
- [ ] Error states are handled gracefully

### Integration Tests
- [ ] APIs work independently without dependencies
- [ ] Chained workflows complete successfully
- [ ] Retry mechanisms work for failed operations
- [ ] Cleanup procedures remove temporary files

## Failure States

### Common Error Responses
- `400 Bad Request` - Invalid input parameters
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Project or resource not found
- `500 Internal Server Error` - Server-side processing error
- `503 Service Unavailable` - External API unavailable

### Specific Failure Scenarios
- **Planner**: LLM service timeout, invalid topic format
- **TTS**: ElevenLabs API limit exceeded, invalid voice ID
- **Frames**: Gemini API rate limit, image generation failure
- **Assembly**: FFmpeg processing error, insufficient storage space

All failures should return appropriate HTTP status codes with descriptive error messages in the response body.