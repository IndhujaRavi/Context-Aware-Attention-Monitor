import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const expectedHash = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const target = new URL('../public/models/face_landmarker.task', import.meta.url);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
let existing;
try {
  existing = await readFile(target);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!existing || hash(existing) !== expectedHash) {
  console.log('Downloading the pinned MediaPipe face model (about 3.6 MB)…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expectedHash) throw new Error('Model checksum did not match. The existing file was not replaced.');
  const temporary = new URL(`${target.href}.tmp`);
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}
await cp(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
  new URL('../public/wasm/', import.meta.url),
  { recursive: true },
);
console.log('Model verified. Model and WebAssembly files will be served locally.');
