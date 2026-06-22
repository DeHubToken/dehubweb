# /editor — OpenCut Parity Plan

Porting OpenCut's full surface area in one turn would mean 12 half-wired features. Instead, here is a phased plan that delivers a genuinely usable editor now and finishes the harder pieces in follow-ups. Each phase ends in a working, typechecking build.

## Phase 3 (this turn) — Working multi-track editing core

Goal: drag media to a timeline, arrange clips across tracks, trim/split/delete with snapping, scrub a synchronised canvas preview, undo/redo, autosave to IndexedDB, keyboard shortcuts. This is the foundation everything else hangs off.

Includes:
- Editor store rewrite (zustand + undo/redo command history): `tracks[]`, `clips[]`, `selection`, `playhead`, `zoom`, `projectSettings` (aspect, resolution, fps, background).
- Multi-track timeline UI: time ruler, draggable playhead, video/image/audio/text track lanes, drag-from-media-panel to create clips, drag-to-move within/across tracks, left/right trim handles, split at playhead, ripple delete, multi-select (shift-click + marquee), clip+playhead snapping, zoom in/out.
- Canvas-based preview compositor: `requestAnimationFrame` loop, composites video frames + images + text overlays in z-order at the current playhead, synced `HTMLAudioElement`s for audio clips, play/pause/seek/scrub, frame-accurate time display, loop toggle.
- Project/canvas settings panel: aspect presets (16:9, 9:16, 1:1, 4:5), resolution, fps, background colour.
- Text tool (basic): add text overlay clip, edit content/font/size/weight/colour/alignment, drag-to-position on preview, own timeline duration.
- Keyboard shortcuts: Space, S, Delete, ←/→ (Shift = frame), Cmd/Ctrl+Z / Shift+Z, +/−.
- IndexedDB project persistence + autosave + simple project list to reopen.
- Performance: object-URL revocation, single decoded HTMLVideoElement pool per source, no re-decode per frame.

Explicitly deferred from this turn (stubbed with clear UI affordances + TODOs, no fake buttons):
- Export (MP4/WebM via WebCodecs + ffmpeg.wasm fallback) — Phase 4.
- Transitions (crossfade) — Phase 5.
- Per-clip adjustments (brightness/contrast/saturation/opacity/blur/speed), detach-audio, per-clip volume/mute/fades, waveform rendering — Phase 6.

## Phase 4 (next turn) — Export pipeline

- Lazy-loaded `mp4-muxer` + `webm-muxer` + WebCodecs `VideoEncoder`/`AudioEncoder`.
- Offscreen canvas render loop driven by timeline → encoded video track.
- Audio mixdown via OfflineAudioContext → AAC/Opus.
- ffmpeg.wasm fallback for Safari/Firefox where WebCodecs is missing.
- Resolution/quality options, progress bar, cancellation, download.

## Phase 5 — Transitions and clip adjustments

- Cut + crossfade between adjacent clips on the same track.
- Per-clip CSS-style filter stack (brightness, contrast, saturation, opacity, blur) applied in the compositor.
- Per-clip playback speed (affects timeline length + decode rate).

## Phase 6 — Audio polish

- Waveform rendering (custom analyser on decoded `AudioBuffer`s; no extra dep needed).
- Per-clip volume/mute/fade in/out.
- Detach-audio-from-video (splits a video clip into linked video + audio clips).

## Technical notes (for reference)

- Deps to add this turn: `nanoid` (stable clip ids). `zustand` and `idb` are already installed from Phase 2.
- Deps deferred until Phase 4: `mp4-muxer`, `webm-muxer`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`.
- File layout under `src/components/editor/` will add: `Timeline/`, `Preview/`, `Inspector/`, `ProjectSettings.tsx`, `ShortcutsLayer.tsx`. Store splits into `editorStore.ts` (state + actions) and `src/lib/editor/history.ts` (command stack). IndexedDB project layer in `src/lib/editor/projectStore.ts`.
- OpenCut MIT attribution + `LICENSE-OpenCut` stay intact.
- UK English throughout (colour, centre, etc.).

## What you get at the end of this turn

A `/editor` route where you can: create a project, import media, drag clips onto a real multi-track timeline, trim/split/move/delete with snapping, scrub a live canvas preview with synced audio, add text overlays, change canvas settings, undo/redo everything, and have it autosave and reopen on refresh. Export and transitions will be stubbed buttons that say "coming in next phase" rather than fake no-ops.

Approve this scope and I'll execute Phase 3 end-to-end, then we tackle Phase 4 (export) in the next turn.