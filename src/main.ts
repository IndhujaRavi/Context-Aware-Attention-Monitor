import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './style.css';
import { CameraSession } from './camera';
import { demoPose, guidedDemo, type Scenario } from './demo';
import { AttentionEngine, Calibration, DEFAULT_SETTINGS, eventExplanation, MAX_SAMPLE_GAP_MS, type Assessment, type Motion, type Pose, type Settings } from './engine';
import type { Point } from './vision-types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-mark" aria-hidden="true">Ⅱ</span>routewatch<span class="brand-dot">.</span></a>
    <div class="workspace-label">RESEARCH WORKSPACE</div>
    <nav aria-label="Main navigation">
      <a class="nav-item active" href="#monitor"><span aria-hidden="true">◉</span> Attention monitor <span class="nav-count">01</span></a>
      <a class="nav-item" href="#timeline"><span aria-hidden="true">≡</span> Event timeline</a>
      <a class="nav-item" href="#method"><span aria-hidden="true">⊞</span> How it works</a>
    </nav>
    <div class="sidebar-note"><span class="small-orbit" aria-hidden="true">↗</span><h3>Context comes first.</h3><p>A head movement is a signal to understand, not a judgment about a driver.</p></div>
    <div class="sidebar-footer"><span class="status-dot"></span> Runs on your device <span>v0.1</span></div>
  </aside>
  <main>
    <header class="topbar"><span>Driver safety <span class="breadcrumb">/</span> Attention lab</span><span class="prototype-tag">RESEARCH PROTOTYPE</span></header>
    <section class="page-heading" id="monitor">
      <div><div class="eyebrow">OBSERVE. UNDERSTAND. REVIEW.</div><h1>Every glance has context.</h1><p>Explore head-pose cues with the delivery conditions that matter.</p></div>
      <button id="export" class="button secondary" disabled><span aria-hidden="true">↓</span> Export session</button>
    </section>
    <div class="session-bar"><div><span class="status-dot" id="session-dot"></span><strong id="session-label">No active session</strong><span class="session-source" id="source-label">Choose a source to begin</span></div><span class="mono" id="session-clock">00:00</span></div>
    <div class="workspace-grid">
      <section class="monitor-card" aria-label="Camera and pose monitor">
        <div class="card-heading"><h2>Observation feed</h2><span class="micro-tag" id="feed-tag">LOCAL PROCESSING</span></div>
        <div class="feed">
          <video id="camera-video" autoplay playsinline muted hidden></video>
          <canvas id="overlay" width="640" height="480" aria-label="Head pose visualization"></canvas>
          <div class="feed-top"><span class="feed-chip" id="feed-mode">READY WHEN YOU ARE</span><span class="feed-chip" id="tracking-label">NO INPUT</span></div>
          <div class="feed-idle" id="feed-idle"><div class="viewfinder" aria-hidden="true">+</div><h3>A clearer view of attention.</h3><p>Try a guided simulation or connect your camera.</p><button class="button lime" id="hero-demo">Try the demo <span aria-hidden="true">↗</span></button></div>
          <div class="feed-bottom"><span id="feed-caption">Camera frames stay on this device.</span><span class="mono" id="inference-label"></span></div>
        </div>
        <div class="pose-readings"><div><span>HORIZONTAL TURN</span><strong id="yaw-value">—<small> yaw</small></strong></div><div><span>DOWNWARD TILT</span><strong id="pitch-value">—<small> pitch</small></strong></div><div class="calibration-cell"><span>REFERENCE POSE</span><button id="calibrate" class="text-button" disabled>Calibrate forward ↗</button></div></div>
        <div class="signal-chart"><div class="chart-heading"><span>Recent head pose <small>last 30s · degrees</small></span><div><span class="legend yaw"></span>|yaw| <span class="legend pitch"></span>pitch</div></div><svg id="pose-chart" viewBox="0 0 600 72" role="img" aria-label="Recent absolute horizontal turn and downward tilt"><path class="chart-grid" d="M0 18H600 M0 36H600 M0 54H600"/><path id="yaw-path" class="yaw-path"/><path id="pitch-path" class="pitch-path"/></svg></div>
      </section>
      <aside class="controls" aria-label="Session controls">
        <section class="control-card"><div class="section-number">01 <span>INPUT SOURCE</span></div><h2>Start observing</h2><div class="source-buttons"><button id="start-demo" class="button secondary">▶ Demo</button><button id="start-camera" class="button primary">◉ Use camera</button></div><button id="stop" class="button stop-button" disabled>Stop session</button><p class="helper" id="source-help">Demo uses synthetic poses. Camera uses a local AI face model.</p><div id="demo-controls" hidden><label class="field-label" for="scenario">Demo scenario</label><select id="scenario"><option value="guided">Guided delivery sequence</option><option value="forward">Manual · facing forward</option><option value="down">Manual · looking down</option><option value="turned">Manual · head turned</option><option value="missing">Manual · face unavailable</option></select></div></section>
        <section class="control-card"><div class="section-number">02 <span>VEHICLE CONTEXT</span></div><div class="segmented" role="group" aria-label="Vehicle movement"><button id="parked" aria-pressed="true">Parked</button><button id="moving" aria-pressed="false">Moving</button></div><p class="helper" id="motion-help">Set manually. No vehicle telemetry is connected.</p><div class="assessment" id="assessment" data-tone="neutral"><span class="assessment-icon" aria-hidden="true">◎</span><div><h3 id="assessment-title">Ready to observe</h3><p id="assessment-description">Start a session to see how context changes an assessment.</p></div></div><div class="persistence-track"><div id="persistence-fill"></div></div><div class="persistence-label"><span id="persistence-label">Persistence window</span><span id="persistence-time">0.0 / 2.0s</span></div></section>
        <details class="control-card thresholds"><summary><span><span class="section-number">03</span> Detection settings</span><span aria-hidden="true">+</span></summary><p class="helper">Exploratory thresholds, not validated safety limits. Changes start a new observation window.</p><label for="yaw">Head turn <output id="yaw-output">30°</output></label><input id="yaw" type="range" min="15" max="60" step="1" value="30"><label for="pitch">Downward tilt <output id="pitch-output">20°</output></label><input id="pitch" type="range" min="10" max="45" step="1" value="20"><label for="hold">Sustained for <output id="hold-output">2.0s</output></label><input id="hold" type="range" min="1" max="5" step="0.1" value="2"><button class="text-button" id="reset-settings">Restore defaults</button></details>
      </aside>
    </div>
    <p id="notice" class="notice" role="status" aria-live="polite" hidden></p>
    <section class="stats" aria-label="Session totals"><div><span class="stat-label"><i class="stat-dot review"></i>Review cues</span><strong id="review-count">0</strong><p>Sustained movement while moving</p></div><div><span class="stat-label"><i class="stat-dot suppressed"></i>Suppressed by context</span><strong id="suppressed-count">0</strong><p>Head movements while parked</p></div><div><span class="stat-label"><i class="stat-dot unavailable"></i>Tracking gaps</span><strong id="unavailable-count">0</strong><p>Insufficient evidence to assess</p></div></section>
    <section class="timeline" id="timeline"><div class="timeline-heading"><div><div class="eyebrow">THE EVIDENCE, EXPLAINED</div><h2>Event timeline <span id="event-count">0</span></h2></div><label class="filter-label">Show <select id="event-filter"><option value="all">All events</option><option value="review">Review cues</option><option value="suppressed">Suppressed</option><option value="unavailable">Tracking gaps</option></select></label></div><div class="table-scroll"><table><thead><tr><th scope="col">SESSION TIME</th><th scope="col">OBSERVATION</th><th scope="col">CONTEXT</th><th scope="col">DURATION</th><th scope="col">ASSESSMENT & EVIDENCE</th></tr></thead><tbody id="events"></tbody></table></div><div class="empty-state" id="empty-state"><span aria-hidden="true">≡</span><h3>Your observations will appear here.</h3><p>Run the demo to compare the same head movement while parked and moving.</p></div></section>
    <section class="method" id="method"><div><div class="eyebrow">BUILT FOR UNDERSTANDING</div><h2>Signals, with their circumstances.</h2><p>AI estimates head pose. A transparent set of timing and context rules decides what to surface for review.</p></div><ol><li><span>1</span><div><strong>Establish a reference</strong><p>Face the camera in your neutral forward position and calibrate.</p></div></li><li><span>2</span><div><strong>Observe over time</strong><p>Brief movements stay below the duration threshold. Missing or ambiguous faces are marked unavailable.</p></div></li><li><span>3</span><div><strong>Keep the context</strong><p>Parked movements are suppressed. Moving events retain their duration, thresholds, and explanation.</p></div></li></ol></section>
    <footer><span>Routewatch · Driver attention lab</span><p>Head pose is not eye gaze or proof of distraction. For stationary demonstrations and research; not a driving aid or an automated scoring system.</p></footer>
  </main>`;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function text(id: string, value: string): void { element(id).textContent = value; }
function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

type Mode = 'idle' | 'demo' | 'camera';
let mode: Mode = 'idle';
let engine = new AttentionEngine();
let motion: Motion = 'parked';
let scenario: Scenario = 'guided';
let camera: CameraSession | null = null;
let sessionStartedAt = 0;
let sessionStartedISO = '';
let sessionEndedISO: string | null = null;
let source: 'demo' | 'camera' | null = null;
let timer = 0;
let baseline: Pose | null = null;
let calibration: Calibration | null = null;
let rawPose: Pose | null = null;
let currentPose: Pose | null = null;
let lastResultAt = 0;
let cameraReady = false;
let points: Point[] = [];
let history: { at: number; pose: Pose | null }[] = [];
let contextChanges: { atMs: number; motion: Motion }[] = [];
let settingsChanges: { atMs: number; settings: Settings }[] = [];
let calibrations: { atMs: number; baseline: Pose }[] = [];
let unavailableReason = 'No single face could be tracked.';
let lastTimelineRender = 0;
const video = element<HTMLVideoElement>('camera-video');
const canvas = element<HTMLCanvasElement>('overlay');
const ctx = canvas.getContext('2d')!;

function notice(message: string): void {
  element('notice').hidden = !message;
  text('notice', message);
}

function setMotion(next: Motion): void {
  if (next !== motion) {
    motion = next;
    engine.resetContinuity();
    if (mode !== 'idle') contextChanges.push({ atMs: performance.now() - sessionStartedAt, motion });
  }
  element('parked').setAttribute('aria-pressed', String(motion === 'parked'));
  element('moving').setAttribute('aria-pressed', String(motion === 'moving'));
}

function prepareSession(next: 'demo' | 'camera'): void {
  stopSession();
  engine = new AttentionEngine({ ...engine.settings });
  mode = next;
  source = next;
  sessionStartedAt = performance.now();
  sessionStartedISO = new Date().toISOString();
  sessionEndedISO = null;
  history = [];
  drawChart(0);
  text('session-clock', '00:00');
  baseline = null;
  calibration = null;
  rawPose = null;
  currentPose = null;
  points = [];
  contextChanges = [];
  calibrations = [];
  settingsChanges = [{ atMs: 0, settings: { ...engine.settings } }];
  setMotion('parked');
  contextChanges = [{ atMs: 0, motion: 'parked' }];
  element('feed-idle').hidden = true;
  element('demo-controls').hidden = next !== 'demo';
  element<HTMLButtonElement>('stop').disabled = false;
  element<HTMLButtonElement>('export').disabled = false;
  element<HTMLButtonElement>('start-demo').disabled = true;
  element<HTMLButtonElement>('start-camera').disabled = true;
  element('session-dot').classList.add('running');
  text('session-label', 'Session running');
  text('source-label', next === 'demo' ? 'Synthetic demo · no camera' : 'Camera · local AI processing');
  text('feed-mode', next === 'demo' ? 'SIMULATED INPUT' : 'LIVE CAMERA · MIRRORED');
  text('source-help', 'Stop to switch sources. A new session clears this timeline; export it first.');
  notice('');
  renderTimeline();
}

function startDemo(): void {
  prepareSession('demo');
  scenario = 'guided';
  element<HTMLSelectElement>('scenario').value = scenario;
  text('feed-tag', 'SYNTHETIC POSES');
  text('calibrate', 'Demo reference set');
  text('motion-help', 'Guided demo controls context. Choose a manual scenario to change it.');
  tickDemo();
  timer = window.setInterval(tickDemo, 100);
}

function tickDemo(): void {
  const now = performance.now();
  const elapsed = now - sessionStartedAt;
  if (scenario === 'guided') {
    const frame = guidedDemo(elapsed);
    setMotion(frame.motion);
    currentPose = frame.pose;
    text('feed-caption', frame.label);
  } else {
    currentPose = demoPose(scenario, elapsed);
    text('feed-caption', 'Manual simulation · switch context to compare outcomes');
  }
  unavailableReason = 'Synthetic face tracking loss.';
  observe(now, currentPose);
  draw();
}

async function startCamera(): Promise<void> {
  prepareSession('camera');
  video.hidden = false;
  text('feed-tag', 'LOCAL AI MODEL');
  text('feed-caption', 'Opening camera and loading the local face model…');
  text('tracking-label', 'LOADING');
  text('calibrate', 'Calibrate forward ↗');
  text('motion-help', 'Set manually. No vehicle telemetry is connected.');
  showAssessment('Camera starting', 'Allow camera access to begin. Your video is processed locally.', 'neutral');
  const session = new CameraSession(video, {
    onResult(result): void {
      if (camera !== session || mode !== 'camera') return;
      lastResultAt = performance.now();
      const stale = lastResultAt - result.at > MAX_SAMPLE_GAP_MS;
      rawPose = stale ? null : result.pose;
      points = stale ? [] : result.points;
      unavailableReason = 'No usable face pose. Check lighting and camera position.';
      if (result.faceCount > 1) unavailableReason = 'Multiple faces detected. Keep only the participant in frame.';
      if (stale) unavailableReason = 'Inference is too slow for continuous observation.';
      text('inference-label', `${Math.round(result.inferenceMs)}ms / frame`);
      if (calibration) {
        const progress = calibration.add(lastResultAt, rawPose);
        text('feed-caption', `Face forward and hold still · ${Math.round(progress.progress * 100)}%`);
        if (progress.baseline) {
          baseline = progress.baseline;
          calibrations.push({ atMs: lastResultAt - sessionStartedAt, baseline: { ...baseline } });
          calibration = null;
          engine.resetContinuity();
          element<HTMLButtonElement>('calibrate').disabled = false;
          text('calibrate', 'Recalibrate ↗');
          notice('Reference set. Verify that looking down increases pitch and turning your head increases |yaw|.');
        }
      }
      currentPose = rawPose && baseline ? { yaw: rawPose.yaw - baseline.yaw, pitch: rawPose.pitch - baseline.pitch } : null;
      if (baseline && !calibration) {
        text('feed-caption', 'Head pose relative to your calibrated forward position');
        observe(lastResultAt, currentPose);
      } else {
        text('tracking-label', rawPose ? 'FACE DETECTED' : 'UNAVAILABLE');
        showAssessment(calibration ? 'Calibrating reference' : 'Set your forward reference', rawPose ? 'Face forward in your normal seated position. Hold still during calibration.' : unavailableReason, 'neutral');
      }
      draw();
    },
    onError(message): void {
      if (camera !== session) return;
      stopSession();
      notice(message);
    },
  });
  camera = session;
  try {
    await session.start();
    if (camera !== session || mode !== 'camera') return;
    cameraReady = true;
    lastResultAt = performance.now();
    element<HTMLButtonElement>('calibrate').disabled = false;
    text('feed-caption', 'Face forward, then choose “Calibrate forward”');
    timer = window.setInterval(() => {
      const now = performance.now();
      text('session-clock', clock(now - sessionStartedAt));
      if (now - lastResultAt > MAX_SAMPLE_GAP_MS) {
        rawPose = null;
        currentPose = null;
        points = [];
        unavailableReason = 'No fresh camera frame. Tracking is unavailable.';
        if (calibration) calibration.add(now, null);
        if (baseline && !calibration) observe(now, null);
        else {
          text('tracking-label', 'UNAVAILABLE');
          showAssessment('Tracking unavailable', unavailableReason, 'neutral');
        }
        draw();
      }
    }, 100);
  } catch (error) {
    if (camera !== session) return;
    stopSession();
    const message = error instanceof Error ? error.message : 'Could not start the camera.';
    notice(`Camera could not start: ${message} Check browser permissions and run npm run setup if model assets are missing. You can still use Demo.`);
  }
}

function stopSession(): void {
  window.clearInterval(timer);
  camera?.stop();
  camera = null;
  cameraReady = false;
  if (mode !== 'idle') sessionEndedISO = new Date().toISOString();
  mode = 'idle';
  engine.resetContinuity();
  currentPose = null;
  points = [];
  calibration = null;
  video.hidden = true;
  element('feed-idle').hidden = false;
  element('demo-controls').hidden = true;
  element<HTMLButtonElement>('stop').disabled = true;
  element<HTMLButtonElement>('start-demo').disabled = false;
  element<HTMLButtonElement>('start-camera').disabled = false;
  element<HTMLButtonElement>('calibrate').disabled = true;
  element('session-dot').classList.remove('running');
  text('session-label', source ? 'Session stopped' : 'No active session');
  text('tracking-label', 'NO INPUT');
  text('inference-label', '');
  text('feed-mode', 'READY WHEN YOU ARE');
  text('feed-caption', 'Camera frames stay on this device.');
  text('yaw-value', '—');
  text('pitch-value', '—');
  text('persistence-label', 'Persistence window');
  text('persistence-time', `0.0 / ${(engine.settings.holdMs / 1000).toFixed(1)}s`);
  showAssessment('Ready to observe', 'Start a session to see how context changes an assessment.', 'neutral');
  element('persistence-fill').style.width = '0%';
  renderTimeline();
  draw();
}

function showAssessment(title: string, description: string, tone: string): void {
  text('assessment-title', title);
  text('assessment-description', description);
  element('assessment').dataset.tone = tone;
}

function observe(now: number, pose: Pose | null): void {
  const at = now - sessionStartedAt;
  const assessment = engine.update({ at, pose, motion });
  history.push({ at, pose });
  history = history.filter((sample) => sample.at >= at - 30000);
  text('session-clock', clock(at));
  text('yaw-value', pose ? `${pose.yaw.toFixed(0)}°` : '—');
  text('pitch-value', pose ? `${pose.pitch.toFixed(0)}°` : '—');
  text('tracking-label', pose ? 'POSE AVAILABLE' : 'UNAVAILABLE');
  renderAssessment(assessment);
  drawChart(at);
  if (now - lastTimelineRender > 250) {
    renderTimeline();
    lastTimelineRender = now;
  }
}

function renderAssessment(result: Assessment): void {
  const progress = result.cue === 'forward' ? 0 : Math.min(result.elapsedMs / result.thresholdMs, 1);
  element('persistence-fill').style.width = `${progress * 100}%`;
  text('persistence-label', result.cue === 'unavailable' ? 'Tracking gap duration' : 'Persistence window');
  text('persistence-time', `${result.cue === 'forward' ? '0.0' : (result.elapsedMs / 1000).toFixed(1)} / ${(result.thresholdMs / 1000).toFixed(1)}s`);
  if (result.cue === 'unavailable') {
    showAssessment('Tracking unavailable', unavailableReason, 'neutral');
  } else if (result.outcome === 'suppressed') {
    showAssessment('Suppressed while parked', 'Sustained head movement observed. Parked context prevents a review flag.', 'green');
  } else if (result.outcome === 'review') {
    showAssessment('Movement to review', 'Sustained head movement while moving. Context and human review are needed.', 'amber');
  } else if (result.cue === 'forward') {
    showAssessment('Within forward reference', 'No head-pose threshold exceeded. This does not establish attention or safe driving.', 'green');
  } else {
    showAssessment('Observing head movement', 'Below the persistence threshold. Brief movements do not create review events.', 'neutral');
  }
}

function renderTimeline(): void {
  for (const outcome of ['review', 'suppressed', 'unavailable'] as const) {
    text(`${outcome}-count`, String(engine.events.filter((event) => event.outcome === outcome).length));
  }
  text('event-count', String(engine.events.length));
  const filter = element<HTMLSelectElement>('event-filter').value;
  const events = engine.events.filter((event) => filter === 'all' || event.outcome === filter);
  const tbody = element('events');
  tbody.replaceChildren();
  for (const event of events) {
    const row = document.createElement('tr');
    const title = event.cue === 'down' ? 'Downward head pose' : event.cue === 'turned' ? 'Sustained head turn' : 'Tracking unavailable';
    const values = [clock(event.startedAt), title, event.motion === 'parked' ? 'Parked' : 'Moving', `${(event.durationMs / 1000).toFixed(1)}s`];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    const evidence = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${event.outcome}`;
    badge.textContent = event.outcome === 'review' ? 'Review' : event.outcome === 'suppressed' ? 'Suppressed' : 'Unavailable';
    const explanation = document.createElement('p');
    explanation.textContent = eventExplanation(event);
    evidence.append(badge, explanation);
    row.append(evidence);
    tbody.append(row);
  }
  element('empty-state').hidden = events.length > 0;
  element('empty-state').querySelector('h3')!.textContent = engine.events.length ? 'No events match this filter.' : 'Your observations will appear here.';
}

function drawChart(at: number): void {
  for (const key of ['yaw', 'pitch'] as const) {
    let path = '';
    let connected = false;
    let lastAt = 0;
    for (const sample of history) {
      if (!sample.pose) { connected = false; continue; }
      if (sample.at - lastAt > MAX_SAMPLE_GAP_MS) connected = false;
      const x = 600 - (at - sample.at) / 30000 * 600;
      const value = key === 'yaw' ? Math.abs(sample.pose.yaw) : Math.max(0, sample.pose.pitch);
      const y = 66 - Math.min(value, 60);
      path += `${connected ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
      connected = true;
      lastAt = sample.at;
    }
    document.getElementById(`${key}-path`)!.setAttribute('d', path);
  }
}

function draw(): void {
  ctx.clearRect(0, 0, 640, 480);
  if (mode === 'camera') {
    if (!points.length) return;
    // Match object-fit: contain for cameras with a non-4:3 aspect ratio.
    const scale = Math.min(640 / video.videoWidth, 480 / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    ctx.strokeStyle = '#d8efb2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [index, point] of points.entries()) {
      const x = (640 - width) / 2 + (1 - point.x) * width;
      const y = (480 - height) / 2 + point.y * height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
  for (let y = 0; y < 480; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
  if (mode !== 'demo') return;
  const available = currentPose !== null;
  const yaw = currentPose?.yaw ?? 0;
  const pitch = currentPose?.pitch ?? 0;
  ctx.save();
  ctx.globalAlpha = available ? 1 : 0.2;
  ctx.translate(320, 212);
  ctx.strokeStyle = '#8dada0';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 7]);
  ctx.beginPath(); ctx.arc(0, 0, 155, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#d8efb2';
  const faceWidth = 76 - Math.abs(yaw) * 0.45;
  ctx.beginPath(); ctx.ellipse(yaw * 0.5, pitch * 0.4, faceWidth, 99 - pitch * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#86a99a';
  ctx.beginPath(); ctx.moveTo(-24, 95); ctx.lineTo(-28, 129); ctx.quadraticCurveTo(-110, 133, -132, 180); ctx.moveTo(24, 95); ctx.lineTo(28, 129); ctx.quadraticCurveTo(110, 133, 132, 180); ctx.stroke();
  ctx.translate(yaw * 0.95, pitch * 1.25);
  ctx.strokeStyle = '#d8efb2';
  ctx.beginPath(); ctx.moveTo(-41, -20); ctx.quadraticCurveTo(-29, -27, -17, -20); ctx.moveTo(17, -20); ctx.quadraticCurveTo(29, -27, 41, -20); ctx.moveTo(0, -9); ctx.lineTo(-6, 20); ctx.lineTo(5, 20); ctx.moveTo(-20, 44); ctx.quadraticCurveTo(0, 51, 20, 44); ctx.stroke();
  for (const [x, y] of [[-29, -21], [29, -21], [0, 20], [-20, 44], [20, 44], [0, -68], [0, 85]]) {
    ctx.fillStyle = '#def2bc'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function applySettings(settings: Settings): void {
  engine.settings = settings;
  engine.resetContinuity();
  if (mode !== 'idle') settingsChanges.push({ atMs: performance.now() - sessionStartedAt, settings: { ...settings } });
  text('yaw-output', `${settings.yawDegrees}°`);
  text('pitch-output', `${settings.pitchDegrees}°`);
  text('hold-output', `${(settings.holdMs / 1000).toFixed(1)}s`);
}

element('hero-demo').addEventListener('click', startDemo);
element('start-demo').addEventListener('click', startDemo);
element('start-camera').addEventListener('click', () => { void startCamera(); });
element('stop').addEventListener('click', stopSession);
element('event-filter').addEventListener('change', renderTimeline);
element('scenario').addEventListener('change', () => {
  scenario = element<HTMLSelectElement>('scenario').value as Scenario;
  engine.resetContinuity();
  text('motion-help', scenario === 'guided' ? 'Guided demo controls context. Choose a manual scenario to change it.' : 'Manual simulation. Switch context to compare the same pose.');
});
for (const next of ['parked', 'moving'] as const) {
  element(next).addEventListener('click', () => {
    if (mode === 'demo' && scenario === 'guided') {
      scenario = 'forward';
      element<HTMLSelectElement>('scenario').value = scenario;
      text('motion-help', 'Manual simulation. Choose a pose below the source buttons.');
    }
    setMotion(next);
  });
}
element('calibrate').addEventListener('click', () => {
  if (!cameraReady) return;
  calibration = new Calibration();
  baseline = null;
  currentPose = null;
  engine.resetContinuity();
  element<HTMLButtonElement>('calibrate').disabled = true;
  text('calibrate', 'Hold still…');
  notice('Look toward your forward reference and hold still for two seconds. Keep the camera fixed after calibration.');
});
for (const id of ['yaw', 'pitch', 'hold']) {
  element(id).addEventListener('input', () => applySettings({
    yawDegrees: element<HTMLInputElement>('yaw').valueAsNumber,
    pitchDegrees: element<HTMLInputElement>('pitch').valueAsNumber,
    holdMs: element<HTMLInputElement>('hold').valueAsNumber * 1000,
  }));
}
element('reset-settings').addEventListener('click', () => {
  element<HTMLInputElement>('yaw').value = String(DEFAULT_SETTINGS.yawDegrees);
  element<HTMLInputElement>('pitch').value = String(DEFAULT_SETTINGS.pitchDegrees);
  element<HTMLInputElement>('hold').value = String(DEFAULT_SETTINGS.holdMs / 1000);
  applySettings({ ...DEFAULT_SETTINGS });
});
element('export').addEventListener('click', () => {
  const report = {
    schemaVersion: 1, application: 'Routewatch 0.1.0', source,
    startedAt: sessionStartedISO, endedAt: sessionEndedISO, exportedAt: new Date().toISOString(),
    motionSource: source === 'demo' ? 'synthetic-or-manual' : 'manual',
    model: source === 'camera' ? { name: 'MediaPipe Face Landmarker float16 v1', tasksVision: '1.1.1' } : null,
    settings: engine.settings, settingsChanges, contextChanges, calibrations,
    eventPolicy: { sampleGapResetMs: MAX_SAMPLE_GAP_MS, trackingGapHoldMs: 1000, hysteresisDegrees: 3 },
    limitations: 'Head pose is not eye gaze or proof of distraction. Synthetic and camera sessions are not safety validation. No images or video are included.',
    events: engine.events.map((event) => ({ ...event, explanation: eventExplanation(event) })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `routewatch-${source}-${sessionStartedISO.replaceAll(':', '-')}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode !== 'idle') {
    stopSession();
    notice('Session stopped because the tab became hidden. Camera access was released; the timeline is available to export.');
  }
});
window.addEventListener('pagehide', () => camera?.stop());
draw();
