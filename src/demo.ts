import type { Motion, Pose } from './engine';

export type Scenario = 'guided' | 'forward' | 'down' | 'turned' | 'missing';
export type DemoFrame = { pose: Pose | null; motion: Motion; label: string; step: number };

const segments: { seconds: number; scenario: Exclude<Scenario, 'guided'>; motion: Motion; label: string }[] = [
  { seconds: 4, scenario: 'forward', motion: 'parked', label: 'At the delivery stop' },
  { seconds: 5, scenario: 'down', motion: 'parked', label: 'Looking down while parked · suppressed' },
  { seconds: 3, scenario: 'forward', motion: 'moving', label: 'Back on the route' },
  { seconds: 0.8, scenario: 'turned', motion: 'moving', label: 'Brief glance · below the duration threshold' },
  { seconds: 2.2, scenario: 'forward', motion: 'moving', label: 'Facing forward again' },
  { seconds: 5, scenario: 'down', motion: 'moving', label: 'Sustained downward pose · review' },
  { seconds: 3, scenario: 'missing', motion: 'moving', label: 'Face unavailable · no assessment' },
  { seconds: 5, scenario: 'turned', motion: 'moving', label: 'Sustained head turn · review' },
  { seconds: 4, scenario: 'forward', motion: 'parked', label: 'Next delivery stop' },
];

export function demoPose(scenario: Exclude<Scenario, 'guided'>, at: number): Pose | null {
  const drift = Math.sin(at / 700) * 1.2;
  switch (scenario) {
    case 'forward': return { yaw: drift, pitch: drift };
    case 'down': return { yaw: drift, pitch: 32 + drift };
    case 'turned': return { yaw: 43 + drift, pitch: drift };
    case 'missing': return null;
  }
}

export function guidedDemo(at: number): DemoFrame {
  let seconds = (at / 1000) % 32;
  for (const [step, segment] of segments.entries()) {
    if (seconds < segment.seconds) return { pose: demoPose(segment.scenario, at), motion: segment.motion, label: segment.label, step };
    seconds -= segment.seconds;
  }
  return { pose: demoPose('forward', at), motion: 'parked', label: 'Next delivery stop', step: segments.length - 1 };
}
