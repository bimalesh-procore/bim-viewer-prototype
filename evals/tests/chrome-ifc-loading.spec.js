import { test, expect } from '@playwright/test';

test.describe('Chrome IFC Streaming Loading', () => {
  test('shows progressive loading indicator while object stream is active', async ({ page }) => {
    // Use addInitScript so listeners are registered before ChromeApp starts auto-loading.
    // page.evaluate() after goto() risks missing early stream events on fast connections.
    await page.addInitScript(() => {
      window.__streamEvents = [];
      window.__streamDone = false;
      window.__streamFailed = null;
      window.__indicatorSeen = false;

      const tryAttach = () => {
        if (!window.viewer) { setTimeout(tryAttach, 50); return; }
        const capture = (type) => (data) => window.__streamEvents.push({ type, data });
        window.viewer.on('stream-capability', capture('stream-capability'));
        window.viewer.on('object-load-progress', capture('object-load-progress'));
        window.viewer.on('model-stream-complete', () => { window.__streamDone = true; });
        window.viewer.on('load-error', (data) => {
          window.__streamFailed = data?.error || 'unknown load error';
        });
        window.__indicatorPoll = setInterval(() => {
          if (document.querySelector('.mv-object-streaming-indicator')) {
            window.__indicatorSeen = true;
          }
          if (window.__streamDone || window.__streamFailed) {
            clearInterval(window.__indicatorPoll);
          }
        }, 60);
      };
      tryAttach();
    });

    // /?model=condos auto-loads the Condos model on mount — no button click needed.
    await page.goto('/?model=condos');

    await page.waitForFunction(
      () => window.__streamDone || window.__streamFailed,
      { timeout: 120000 }
    );

    const result = await page.evaluate(() => ({
      failed: window.__streamFailed,
      indicatorSeen: window.__indicatorSeen,
      events: window.__streamEvents.map((e) => e.type),
      finalIndicatorVisible: !!document.querySelector('.mv-object-streaming-indicator'),
    }));

    expect(result.failed).toBeNull();
    expect(result.events).toContain('stream-capability');
    expect(result.events).toContain('object-load-progress');
    expect(result.indicatorSeen).toBe(true);
    expect(result.finalIndicatorVisible).toBe(false);
  });
});
