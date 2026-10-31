import { describe, expect, it } from 'vitest';
import { AttentionEngine, Calibration, DEFAULT_SETTINGS, classify, eventExplanation, poseFromMatrix, type Motion, type Pose } from '../src/engine';
import { guidedDemo } from '../src/demo';

const down = { yaw: 0, pitch: 30 };
const turned = { yaw: 40, pitch: 0 };
const forward = { yaw: 0, pitch: 0 };

function feed(engine: AttentionEngine, start: number, end: number, pose: Pose | null, motion: Motion = 'moving'): void {
  for (let at = start; at <= end; at += 100) engine.update({ at, pose, motion });
}

describe('context and persistence', () => {
  it('suppresses the same sustained cue when parked and flags it while moving', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 2400, down, 'parked');
    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].outcome).toBe('suppressed');
    feed(engine, 2500, 4400, down);
    expect(engine.events).toHaveLength(1);
    feed(engine, 4500, 5000, down);
    expect(engine.events[0]).toMatchObject({ outcome: 'review', startedAt: 2500, durationMs: 2500 });
  });

  it('does not turn a brief glance into an event or accumulate separate glances', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 1000, turned);
    feed(engine, 1100, 1400, forward);
    feed(engine, 1500, 2600, turned);
    expect(engine.events).toHaveLength(0);
  });

  it('records one event per continuous cue and updates its evidence', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 7000, down);
    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].durationMs).toBe(7000);
    expect(eventExplanation(engine.events[0])).toContain('7.0s');
  });

  it('marks missing tracking as unknown even while parked', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 1500, null, 'parked');
    expect(engine.events[0]).toMatchObject({ cue: 'unavailable', outcome: 'unavailable' });
  });

  it('does not bridge missing observations or long frame gaps', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 1500, down);
    engine.update({ at: 1600, pose: null, motion: 'moving' });
    feed(engine, 1700, 3400, down);
    expect(engine.events).toHaveLength(0);
    feed(engine, 8000, 9900, down);
    expect(engine.events).toHaveLength(0);
    feed(engine, 10000, 10100, down);
    expect(engine.events[0].startedAt).toBe(8000);
  });

  it('restarts persistence when cue category changes', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 1500, down);
    feed(engine, 1600, 3400, turned);
    expect(engine.events).toHaveLength(0);
    feed(engine, 3500, 3700, turned);
    expect(engine.events[0].cue).toBe('turned');
  });

  it('uses a release margin to avoid splitting a continuous event on jitter', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 2100, { yaw: 32, pitch: 0 });
    feed(engine, 2200, 3000, { yaw: 28, pitch: 0 });
    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].durationMs).toBe(3000);
    expect(classify({ yaw: 26, pitch: 0 }, DEFAULT_SETTINGS, 'turned')).toBe('forward');
  });

  it('preserves the thresholds used for earlier events', () => {
    const engine = new AttentionEngine();
    feed(engine, 0, 2200, down);
    engine.settings = { ...DEFAULT_SETTINGS, holdMs: 4000 };
    engine.resetContinuity();
    feed(engine, 2300, 4500, down);
    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].settings.holdMs).toBe(2000);
  });

  it('does not label upward tilt as looking down', () => {
    expect(classify({ yaw: 0, pitch: -40 }, DEFAULT_SETTINGS)).toBe('forward');
  });

  it('produces the expected four events in the entire guided sequence', () => {
    const engine = new AttentionEngine();
    for (let at = 0; at < 32000; at += 100) {
      const frame = guidedDemo(at);
      engine.update({ at, pose: frame.pose, motion: frame.motion });
    }
    expect(engine.events.map(({ cue, outcome }) => ({ cue, outcome })).reverse()).toEqual([
      { cue: 'down', outcome: 'suppressed' },
      { cue: 'down', outcome: 'review' },
      { cue: 'unavailable', outcome: 'unavailable' },
      { cue: 'turned', outcome: 'review' },
    ]);
  });
});

describe('pose extraction and reference calibration', () => {
  it('extracts known horizontal and downward rotations from column-major matrices', () => {
    const angle = Math.PI / 6;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    expect(poseFromMatrix([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])!.yaw).toBeCloseTo(30);
    expect(poseFromMatrix([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])!.pitch).toBeCloseTo(30);
  });

  it('rejects malformed matrix data at the model boundary', () => {
    expect(poseFromMatrix([])).toBeNull();
    expect(poseFromMatrix(Array(16).fill(NaN))).toBeNull();
    expect(poseFromMatrix(Array(16).fill(0))).toBeNull();
  });

  it('requires a stable two-second reference and enough samples', () => {
    const calibration = new Calibration();
    for (let at = 0; at < 2000; at += 100) expect(calibration.add(at, { yaw: 3, pitch: -8 }).baseline).toBeNull();
    expect(calibration.add(2000, { yaw: 3, pitch: -8 }).baseline).toEqual({ yaw: 3, pitch: -8 });
  });

  it('resets calibration for missing faces, movement, and stale samples', () => {
    const calibration = new Calibration();
    for (let at = 0; at <= 1500; at += 100) calibration.add(at, forward);
    expect(calibration.add(1600, null).progress).toBe(0);
    expect(calibration.add(1700, forward).baseline).toBeNull();
    expect(calibration.add(1800, turned).progress).toBe(0);
    expect(calibration.add(5000, turned).progress).toBe(0);
  });
});
