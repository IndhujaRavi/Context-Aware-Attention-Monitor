import type { Pose } from './engine';

export type Point = { x: number; y: number };
export type VisionRequest =
  | { type: 'init'; baseUrl: string }
  | { type: 'frame'; bitmap: ImageBitmap; at: number };
export type VisionResponse =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; at: number; pose: Pose | null; points: Point[]; faceCount: number; inferenceMs: number };
