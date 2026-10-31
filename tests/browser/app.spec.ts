import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('demo applies context, reports tracking gaps, filters, and exports evidence', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await page.getByLabel('Demo scenario').selectOption('down');
  await expect(page.locator('#suppressed-count')).toHaveText('1');
  await expect(page.locator('#review-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Moving', exact: true }).click();
  await expect(page.locator('#review-count')).toHaveText('1');
  await page.getByLabel('Demo scenario').selectOption('missing');
  await expect(page.locator('#unavailable-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Stop session' }).click();
  await page.locator('#event-filter').selectOption('suppressed');
  await expect(page.locator('#events tr')).toHaveCount(1);
  await expect(page.locator('#events')).toContainText('Parked context: review flag suppressed.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export session' }).click();
  const download = await downloadPromise;
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(report.source).toBe('demo');
  expect(report.events).toHaveLength(3);
  expect(report.contextChanges.at(-1).motion).toBe('moving');
  expect(report.endedAt).toBeTruthy();
  expect(report.events.every((event: { explanation: string }) => event.explanation.length > 10)).toBe(true);
  expect(failures).toEqual([]);
  await page.locator('#event-filter').selectOption('all');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});

test('camera initializes real local AI worker and releases the fake camera on stop', async ({ page }) => {
  const failures: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.locator('#calibrate')).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#inference-label')).toContainText('ms / frame');
  // Chromium's fake camera is a test pattern: no face must not become a review cue.
  await expect(page.locator('#tracking-label')).toHaveText('UNAVAILABLE');
  await expect(page.locator('#review-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Stop session' }).click();
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();
  expect(requests.some((url) => url.includes('face_landmarker.task'))).toBe(true);
  expect(requests.every((url) => url.startsWith('http://127.0.0.1:4173/') || url.startsWith('blob:'))).toBe(true);
  expect(failures).toEqual([]);
});

test('camera permission failure leaves demo usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.getByRole('status')).toContainText('Camera could not start');
  await page.locator('#start-demo').click();
  await expect(page.locator('#session-label')).toHaveText('Session running');
});

test('development worker loads and hiding the tab releases the camera', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#inference-label')).toContainText('ms / frame', { timeout: 30000 });
  const tracksStopped = await page.locator('video').evaluate((video: HTMLVideoElement) => {
    const tracks = (video.srcObject as MediaStream).getTracks();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return tracks.every((track) => track.readyState === 'ended');
  });
  expect(tracksStopped).toBe(true);
  await expect(page.locator('#session-label')).toHaveText('Session stopped');
  await expect(page.getByRole('status')).toContainText('tab became hidden');
});

test('mobile layout stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every glance has context.' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.locator('#tracking-label')).toHaveText('POSE AVAILABLE');
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
