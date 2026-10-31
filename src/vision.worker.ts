import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { poseFromMatrix } from './engine';
import type { VisionRequest, VisionResponse } from './vision-types';

let landmarker: FaceLandmarker;
const contourIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

function respond(message: VisionResponse): void {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<VisionRequest>): Promise<void> => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(`${message.baseUrl}wasm`, true);
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${message.baseUrl}models/face_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputFacialTransformationMatrixes: true,
      });
      respond({ type: 'ready' });
      return;
    }
    const start = performance.now();
    const result = landmarker.detectForVideo(message.bitmap, message.at);
    const faceCount = result.faceLandmarks.length;
    const matrix = result.facialTransformationMatrixes[0];
    const pose = faceCount === 1 && matrix ? poseFromMatrix(matrix.data) : null;
    const landmarks = result.faceLandmarks[0];
    const points = pose && landmarks ? contourIndices.map((index) => ({ x: landmarks[index].x, y: landmarks[index].y })) : [];
    respond({ type: 'result', at: message.at, pose, points, faceCount, inferenceMs: performance.now() - start });
  } catch (error) {
    respond({ type: 'error', message: error instanceof Error ? error.message : 'Face tracking failed.' });
  } finally {
    if (message.type === 'frame') message.bitmap.close();
  }
};
