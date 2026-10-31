export type Motion = 'parked' | 'moving';
export type Cue = 'forward' | 'down' | 'turned' | 'unavailable';
export type Outcome = 'review' | 'suppressed' | 'unavailable';
export type Pose = { yaw: number; pitch: number };
export type Sample = { at: number; pose: Pose | null; motion: Motion };
export type Settings = { yawDegrees: number; pitchDegrees: number; holdMs: number };
export const DEFAULT_SETTINGS: Settings = { yawDegrees: 30, pitchDegrees: 20, holdMs: 2000 };
export const MAX_SAMPLE_GAP_MS = 750;
export const UNAVAILABLE_HOLD_MS = 1000;

export interface AttentionEvent {
  id: number;
  cue: Exclude<Cue, 'forward'>;
  outcome: Outcome;
  motion: Motion;
  startedAt: number;
  lastSeenAt: number;
  durationMs: number;
  peakYaw: number;
  peakPitch: number;
  settings: Settings;
}

export interface Assessment {
  cue: Cue;
  outcome: Outcome | 'observing' | 'forward';
  elapsedMs: number;
  thresholdMs: number;
}

type Candidate = { cue: Cue; motion: Motion; startedAt: number; peakYaw: number; peakPitch: number; event: AttentionEvent | null };

/** Temporal rules operate on head-pose cues, never a verdict about safe driving. */
export class AttentionEngine {
  readonly events: AttentionEvent[] = [];
  private candidate: Candidate | null = null;
  private lastAt: number | null = null;
  private nextId = 1;

  constructor(public settings: Settings = { ...DEFAULT_SETTINGS }) {}

  resetContinuity(): void {
    this.candidate = null;
    this.lastAt = null;
  }

  update(sample: Sample): Assessment {
    if (this.lastAt !== null && (sample.at <= this.lastAt || sample.at - this.lastAt > MAX_SAMPLE_GAP_MS)) {
      this.resetContinuity();
    }
    this.lastAt = sample.at;
    const previous = this.candidate?.cue;
    const cue = classify(sample.pose, this.settings, previous);
    if (!this.candidate || this.candidate.cue !== cue || this.candidate.motion !== sample.motion) {
      this.candidate = { cue, motion: sample.motion, startedAt: sample.at, peakYaw: 0, peakPitch: 0, event: null };
    }
    const candidate = this.candidate;
    candidate.peakYaw = Math.max(candidate.peakYaw, Math.abs(sample.pose?.yaw ?? 0));
    candidate.peakPitch = Math.max(candidate.peakPitch, sample.pose?.pitch ?? 0);
    const elapsedMs = sample.at - candidate.startedAt;
    const thresholdMs = cue === 'unavailable' ? UNAVAILABLE_HOLD_MS : this.settings.holdMs;
    if (cue === 'forward') return { cue, outcome: 'forward', elapsedMs, thresholdMs };
    if (elapsedMs < thresholdMs) return { cue, outcome: 'observing', elapsedMs, thresholdMs };

    let outcome: Outcome = 'review';
    if (cue === 'unavailable') outcome = 'unavailable';
    else if (sample.motion === 'parked') outcome = 'suppressed';
    if (!candidate.event) {
      candidate.event = {
        id: this.nextId++, cue, outcome, motion: sample.motion,
        startedAt: candidate.startedAt, lastSeenAt: sample.at, durationMs: elapsedMs,
        peakYaw: candidate.peakYaw, peakPitch: candidate.peakPitch,
        settings: { ...this.settings },
      };
      this.events.unshift(candidate.event);
    }
    Object.assign(candidate.event, {
      lastSeenAt: sample.at, durationMs: elapsedMs,
      peakYaw: candidate.peakYaw, peakPitch: candidate.peakPitch,
    });
    return { cue, outcome, elapsedMs, thresholdMs };
  }
}

export function classify(pose: Pose | null, settings: Settings, previous?: Cue): Cue {
  if (!pose) return 'unavailable';
  // A small release margin avoids splitting events on threshold jitter.
  const pitchThreshold = settings.pitchDegrees - (previous === 'down' ? 3 : 0);
  const yawThreshold = settings.yawDegrees - (previous === 'turned' ? 3 : 0);
  if (pose.pitch >= pitchThreshold) return 'down';
  if (Math.abs(pose.yaw) >= yawThreshold) return 'turned';
  return 'forward';
}

export function eventExplanation(event: AttentionEvent): string {
  if (event.outcome === 'unavailable') return 'No usable single-face pose. Attention cannot be assessed; this is not a driver violation.';
  const cue = event.cue === 'down' ? 'Downward head pose' : 'Head turn';
  const measurement = event.cue === 'down'
    ? `peak pitch ${Math.round(event.peakPitch)}°; threshold ${event.settings.pitchDegrees}°`
    : `peak |yaw| ${Math.round(event.peakYaw)}°; threshold ${event.settings.yawDegrees}°`;
  const evidence = `${cue} for ${(event.durationMs / 1000).toFixed(1)}s (${measurement}).`;
  if (event.outcome === 'suppressed') return `${evidence} Parked context: review flag suppressed.`;
  return `${evidence} Moving context and ${(event.settings.holdMs / 1000).toFixed(1)}s persistence threshold met. Review the circumstances.`;
}

/** MediaPipe returns a column-major canonical-face transformation. */
export function poseFromMatrix(data: number[]): Pose | null {
  if (data.length !== 16 || !data.every(Number.isFinite)) return null;
  if (Math.hypot(data[0], data[1], data[2]) < 0.001) return null;
  const degrees = 180 / Math.PI;
  return {
    yaw: Math.atan2(-data[2], Math.hypot(data[0], data[1])) * degrees,
    pitch: Math.atan2(data[6], data[10]) * degrees,
  };
}

export class Calibration {
  private samples: { at: number; pose: Pose }[] = [];

  add(at: number, pose: Pose | null): { progress: number; baseline: Pose | null } {
    const last = this.samples.at(-1);
    if (!pose || (last && at - last.at > MAX_SAMPLE_GAP_MS)) this.samples = [];
    if (!pose) return { progress: 0, baseline: null };
    this.samples.push({ at, pose });
    const yaws = this.samples.map((sample) => sample.pose.yaw);
    const pitches = this.samples.map((sample) => sample.pose.pitch);
    if (Math.max(...yaws) - Math.min(...yaws) > 6 || Math.max(...pitches) - Math.min(...pitches) > 6) {
      this.samples = [{ at, pose }];
      return { progress: 0, baseline: null };
    }
    const progress = Math.min((at - this.samples[0].at) / 2000, this.samples.length / 20, 1);
    const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
    return { progress, baseline: progress === 1 ? { yaw: mean(yaws), pitch: mean(pitches) } : null };
  }
}
