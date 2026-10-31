# Routewatch driver attention monitor

A local web prototype for the proposed endeavor: interpreting delivery-driver monitoring signals with operational context and an auditable explanation. It estimates head pose with an AI face model, then uses explicit timing rules and a manually selected parked/moving context to surface observations.

## Run locally

Requires Node.js 22.12 or newer. Use a current desktop Chrome or Edge browser for the camera workflow.

```sh
cd "/Users/rohith/Documents/Indhuja NIW/driver-attention-monitor"
npm ci
npm run setup
npm run dev
```

Open the localhost address printed by Vite. The first setup downloads a pinned MediaPipe model, verifies its SHA-256, and copies the installed package's WebAssembly files into `public/`. Once installed, inference, model loading, and fonts are served locally. No API keys, paid services, or backend are required. Camera access requires localhost or HTTPS.

```sh
npm run build
npm run preview
```

`dist/` is the static production build. Run setup before building so model and WebAssembly assets are included. The demo works without model assets; the camera needs them.

## Try it

1. Select **Try the demo**. A 32-second repeating synthetic sequence shows a parked downward pose, a brief glance, sustained head movements while moving, and lost tracking.
2. Select a **Manual** demo scenario to hold a pose. Switch **Parked / Moving** to compare the same signal under different contexts.
3. Stop the demo and select **Use camera**. Allow camera access, then select **Calibrate forward** while facing your normal forward reference. Hold still for at least two seconds. Keep the camera fixed afterward.
4. Verify the displayed pitch rises when you tilt down and the absolute yaw rises when you turn. Recalibrate if the camera or your seated position changes.
5. Review the timeline, filter observations, and select **Export session** to download a JSON evidence report.

Camera frames and face landmarks are not uploaded or persisted. Only the session data explicitly exported by the user is saved. The app has no analytics, external font requests, video recorder, or server-side inference. Session state is held in memory; refreshing or starting a new session clears it. Export first if you want to keep it. Hiding the tab stops the session and releases the camera.

## Detection behavior

| Input | Default behavior |
| --- | --- |
| Downward pitch of at least 20° for 2 seconds | Review cue while moving; suppressed event while parked |
| Absolute yaw of at least 30° for 2 seconds | Review cue while moving; suppressed event while parked |
| Brief head movement | No event |
| No usable single-face pose for 1 second after calibration | Tracking unavailable; never a driver violation |
| Multiple visible faces | No identity selection; tracking unavailable |
| Sample gap longer than 750 ms | Reset persistence; do not bridge missing evidence |
| Movement context, settings, or calibration changes | Start a new observation window |

Downward tilt takes precedence when both pose thresholds are exceeded. A 3° release margin prevents small boundary fluctuations from splitting an event. A continuous observation produces one event whose duration and peak angles update until the cue changes. Event durations represent observed continuity, not time inferred through gaps.

The camera adapter samples at up to 10 frames per second, with one frame in flight. Inference runs in a dedicated Web Worker using the CPU delegate. It detects up to two faces to avoid selecting an arbitrary participant when multiple faces appear. Calibration requires at least 20 samples over two seconds with no more than 6° range in either axis. The pose calculation uses the model's column-major transformation matrix and subtracts the calibrated reference angles.

The AI component is MediaPipe Face Landmarker. The context and timing decisions are deterministic rules; this project does not train a new distraction classifier. The thresholds above are configurable exploratory choices, not established safety standards.

## Evidence export

Each event records its cue, disposition, movement context, start/last-observed times relative to session start, duration, peak angles, thresholds, and explanation. The session export also includes source (`demo` or `camera`), model version, calibration references, settings history, context changes, and wall-clock session times. It excludes frames and raw face landmarks. A demo export is explicitly identified as synthetic.

## Verification

```sh
npm test                  # Temporal rules, matrix conversion, calibration, demo sequence
npm run build             # Typecheck and production bundle
npx playwright install chromium
npm run test:e2e          # Browser workflows against the production build
npm run check             # Unit tests, build, browser tests
```

Browser tests use Chromium's simulated camera rather than the computer's physical camera. They exercise the actual local model/worker in development and production, the no-face path, demo context handling, evidence export, camera permission failure, tab-hiding cleanup, and mobile layout. Screenshots stay in the ignored `test-results/` directory. A separate development smoke check using the public [MediaPipe portrait fixture](https://storage.googleapis.com/mediapipe-assets/portrait.jpg) confirmed positive face detection and reference calibration. These checks establish software behavior, not real-world driver-monitoring accuracy; physical-camera testing remains to be done.

## Project structure

```text
src/engine.ts          Pose classification, event persistence, calibration
src/demo.ts            Deterministic delivery scenarios
src/camera.ts          Camera lifecycle and worker communication
src/vision.worker.ts   Local MediaPipe inference and pose extraction
src/vision-types.ts    Worker message contracts
src/main.ts            Interface, session state, visualization, export
src/style.css          Responsive interface
scripts/setup-assets.mjs  Verified model installation and local WASM assets
tests/                Unit and browser checks
```

## Research limits and useful next steps

Head pose does not establish eye gaze, cognitive attention, phone use, fatigue, fault, or safe driving. Forward-looking eyes can still be distracted, and head turns may be necessary mirror checks. This prototype distinguishes brief from sustained movements; it cannot recognize the reason for a mirror check. Missing tracking is an uncertainty state, not proof of obstruction or misconduct. Angle estimates can be affected by lighting, camera placement, occlusion, eyewear, and facial variation. Motion is manual or synthetic, not obtained from a vehicle.

Use stationary demonstrations or consented prerecorded/simulator data for development. This is not a validated driving aid, emergency warning system, or automated employee scorecard.

The next meaningful research milestone is a consented, labeled evaluation set with distinct participants and camera conditions. Compare a pose-only baseline with the context-aware rules, reporting false alerts per observed moving hour, missed labeled sustained-pose events, unavailable-tracking time, and participant-level results. Keep training/tuning participants separate from evaluation participants. Synthetic tests cannot demonstrate reduced crashes, improved safety, or real-world fairness.

## Dependencies and model provenance

- [MediaPipe Face Landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Model overview and model cards](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
- [Pinned float16 v1 model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- Model SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- MediaPipe Tasks Vision: `1.1.1`; see the installed dependency's license and linked model cards for applicable terms.
- DM Sans and Manrope are bundled locally through Fontsource; their license files are included in the respective dependency packages.
