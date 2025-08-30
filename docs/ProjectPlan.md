# Project Plan - Componentized Explainer Video Pipeline

## Overview

A modular explainer video generation system built with Next.js, TypeScript, Prisma, Neon, Cloudflare R2, Clerk, and Inngest.

## Architecture

### Core Components
1. **Planner** - GPT-style LLM for dialogue generation, beat sheets, style bible
2. **Narration** - ElevenLabs TTS with timestamp alignment
3. **Cue Sheet** - Timeline mapping for frames and text overlays
4. **Visuals** - Gemini 2.5 Flash Image generation with validation loops
5. **Assembly** - Video stitching with audio and overlays

### Tech Stack
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Auth**: Clerk (email/OAuth)
- **Database**: Neon Postgres via Prisma
- **Storage**: Cloudflare R2
- **Workers**: Inngest for long-running tasks
- **Package Manager**: pnpm

### Data Flow
```
Topic Input → Planner → Beat Sheet + Style Bible
         ↓
    Narration (ElevenLabs) → Audio Files + Timestamps
         ↓
    Cue Sheet Generation → Frame Windows + Text Timing
         ↓
    Visual Generation (Gemini) → Base + Edit Frames
         ↓
    Assembly → Final MP4
```

### R2 Storage Structure
```
/projects/{projectId}/
  plan/
    ProjectPlan.json
    StyleBible.min.json
  audio/
    beat_{idx}.wav
  align/
    beat_{idx}.json OR final.json
  frames/
    B{idx}_F{n}.png
  cues/
    cues.json
  video/
    final.mp4
  docs/
    ProjectPlan.md
    Progress.md
    APIContracts.md
```

## Status Tracking

### Project States
1. **PLANNED** - Planning phase complete
2. **NARRATED** - Audio generation complete  
3. **ALIGNED** - Timestamp alignment complete
4. **CUES_READY** - Cue sheet generated
5. **FRAMES_READY** - Visual frames complete
6. **ASSEMBLED** - Final video rendered

### Quality Gates
Each phase requires approval before proceeding to the next stage.

## Development Phases

### Phase 0 - Repo & Docs ✅
- [x] Next.js scaffold with TypeScript + Tailwind
- [x] Prisma configuration with data models
- [x] Documentation structure
- [ ] Health check route
- [ ] Environment configuration

### Phase 1 - Auth & DB
- [ ] Clerk integration (SSR + client)
- [ ] Database connection and migrations
- [ ] Test user/project seeding

### Phase 2 - Storage & R2 SDK
- [ ] R2 client configuration
- [ ] File upload/download helpers
- [ ] Signed URL generation

### Phase 3 - Planner API
- [ ] LLM integration for planning
- [ ] Beat sheet generation
- [ ] Style bible creation

### Phase 4 - Narration
- [ ] ElevenLabs TTS integration
- [ ] Per-beat audio generation
- [ ] Timestamp alignment

### Phase 5 - Cue Sheet
- [ ] Timeline calculation
- [ ] Frame window mapping
- [ ] Text overlay timing

### Phase 6 - Frames
- [ ] Gemini 2.5 Flash integration
- [ ] Base frame generation
- [ ] Iterative editing
- [ ] Validation loops

### Phase 7 - Assembly
- [ ] Video stitching
- [ ] Audio overlay
- [ ] Text rendering
- [ ] Final MP4 export

### Phase 8 - E2E Demo
- [ ] End-to-end pipeline test
- [ ] Demo video generation
- [ ] Performance validation

## Success Criteria

- Each API works independently with test routes
- Modular architecture supports component testing
- Quality gates prevent progression without validation
- Complete documentation with runbooks
- Granular commit history for traceability