import type { VisionRequest, VisionResponse } from './vision-types';

type CameraCallbacks = {
  onResult: (result: Extract<VisionResponse, { type: 'result' }>) => void;
  onError: (message: string) => void;
};

export class CameraSession {
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private stopped = false;
  private frameHandle = 0;
  private busy = false;
  private lastSentAt = 0;
  private lastVideoTime = -1;
  private pendingReject: ((error: Error) => void) | null = null;
  private startupTimeout = 0;
  private inferenceTimeout = 0;

  constructor(private video: HTMLVideoElement, private callbacks: CameraCallbacks) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS and a browser that supports webcams.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks()[0].addEventListener('ended', () => this.fail('The camera disconnected. Start a new camera session to reconnect.'));
    this.video.srcObject = stream;
    await this.video.play();
    if (this.stopped) return;
    const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      this.startupTimeout = window.setTimeout(() => this.fail('Model loading timed out. Run npm run setup, then retry.'), 30000);
      worker.onerror = () => this.fail('The vision worker could not start. Run npm run setup and use a current Chrome or Edge browser.');
      worker.onmessage = (event: MessageEvent<VisionResponse>): void => {
        const message = event.data;
        if (message.type === 'ready') {
          window.clearTimeout(this.startupTimeout);
          this.pendingReject = null;
          resolve();
        } else if (message.type === 'error') {
          this.fail(`Face tracking stopped: ${message.message}`);
        } else {
          this.busy = false;
          window.clearTimeout(this.inferenceTimeout);
          this.callbacks.onResult(message);
        }
      };
      const message: VisionRequest = { type: 'init', baseUrl: new URL(import.meta.env.BASE_URL, location.href).href };
      worker.postMessage(message);
    });
    if (!this.stopped) this.frameHandle = requestAnimationFrame(this.tick);
  }

  private tick = (at: number): void => {
    if (this.stopped) return;
    this.frameHandle = requestAnimationFrame(this.tick);
    if (this.busy || at - this.lastSentAt < 100 || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.busy = true;
    this.lastSentAt = at;
    this.lastVideoTime = this.video.currentTime;
    void this.sendFrame(at);
  };

  private async sendFrame(at: number): Promise<void> {
    try {
      const bitmap = await createImageBitmap(this.video);
      if (this.stopped) {
        bitmap.close();
        return;
      }
      const message: VisionRequest = { type: 'frame', bitmap, at };
      this.worker!.postMessage(message, [bitmap]);
      this.inferenceTimeout = window.setTimeout(() => this.fail('Face tracking stopped responding. Restart the camera session.'), 10000);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Could not read the camera frame.');
    }
  }

  private fail(message: string): void {
    if (this.stopped) return;
    const reject = this.pendingReject;
    this.pendingReject = null;
    this.stop();
    if (reject) reject(new Error(message));
    else this.callbacks.onError(message);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frameHandle);
    window.clearTimeout(this.startupTimeout);
    window.clearTimeout(this.inferenceTimeout);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.worker?.terminate();
    this.video.srcObject = null;
    this.pendingReject?.(new Error('Camera startup cancelled.'));
    this.pendingReject = null;
  }
}
