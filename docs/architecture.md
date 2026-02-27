# Architecture

## High-level
`User -> React (Vercel) -> Express API (Vercel) -> MongoDB + Firebase -> AI Worker (Whisper + spaCy) -> API callback -> Memory chain -> UI`

## Why worker split?
Vercel free/serverless limits make long Whisper transcription unreliable. A free VM worker handles heavy CPU jobs and reports results back.

## Memory Chain logic
1. Generate embedding from transcript.
2. Compare against completed memories.
3. Keep top items above threshold 0.65.
4. Save IDs into `relatedMemoryIds`.

## Accessibility choices
- large text base (18px)
- large record button
- high contrast colors
- minimal page depth
- explicit status text for each stage
