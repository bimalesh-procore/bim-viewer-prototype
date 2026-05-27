/**
 * IFC Model Loading - Automated Test Suite
 * Tests the full IFC model loading pipeline including WASM initialization,
 * file fetching, parsing, and scene rendering.
 */
import { test, expect } from '@playwright/test';

test.describe('IFC Model Loading', () => {

  test.beforeEach(async ({ page }) => {
    // Use test-page.html, NOT the Chrome UI ('/'). ChromeApp's useEffect calls
    // viewer.loadModel(...) on mount to load the default model, which races
    // with these tests — by the time waitForFunction(window.viewer) resolves,
    // a load is already in flight, so the listeners attached below miss
    // load-start, and a second loadModel call collides with the in-progress
    // one. test-page.html instantiates the same real ModelViewer + IFCLoader
    // but does not trigger any IFC load on its own.
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.viewer !== undefined, { timeout: 15000 });
    await page.waitForFunction(() => window.__sceneReady === true, { timeout: 10000 });
  });

  test('WASM files are accessible from the server', async ({ page }) => {
    // Verify web-ifc.wasm is served correctly
    const wasmResponse = await page.evaluate(async () => {
      const res = await fetch('/web-ifc.wasm');
      return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') };
    });
    expect(wasmResponse.ok).toBe(true);
    expect(wasmResponse.status).toBe(200);
  });

  test('IFC loader initializes without errors', async ({ page }) => {
    // Check that the IFC loader was created
    const loaderReady = await page.evaluate(async () => {
      const viewer = window.viewer;
      // Wait for init promise to complete
      if (viewer.ifcLoader && viewer.ifcLoader._initPromise) {
        await viewer.ifcLoader._initPromise;
      }
      return {
        hasLoader: !!viewer.ifcLoader,
        hasComponents: !!viewer.ifcLoader?.components,
        hasIfcLoader: !!viewer.ifcLoader?.ifcLoader,
      };
    });
    expect(loaderReady.hasLoader).toBe(true);
    expect(loaderReady.hasComponents).toBe(true);
    expect(loaderReady.hasIfcLoader).toBe(true);
  });

  test('IFC loader WASM settings are correctly configured', async ({ page }) => {
    // After init, verify wasm settings point to local path, not CDN
    const wasmSettings = await page.evaluate(async () => {
      const viewer = window.viewer;
      if (viewer.ifcLoader && viewer.ifcLoader._initPromise) {
        await viewer.ifcLoader._initPromise;
      }
      const settings = viewer.ifcLoader?.ifcLoader?.settings;
      return {
        wasmPath: settings?.wasm?.path,
        wasmAbsolute: settings?.wasm?.absolute,
        autoSetWasm: settings?.autoSetWasm,
      };
    });
    // WASM path should be local, not CDN
    expect(wasmSettings.wasmPath).toBe('/');
    expect(wasmSettings.wasmAbsolute).toBe(true);
    // autoSetWasm should be false to prevent CDN override
    expect(wasmSettings.autoSetWasm).toBe(false);
  });

  test('Sample IFC model file is accessible', async ({ page }) => {
    // Verify the condos.frag.gz file can be fetched. IFC source files are not
    // committed (see CLAUDE.md §4b); pre-converted .frag.gz files ship instead.
    const modelResponse = await page.evaluate(async () => {
      const res = await fetch('/models/condos.frag.gz');
      return {
        status: res.status,
        ok: res.ok,
        size: parseInt(res.headers.get('content-length') || '0', 10)
      };
    });
    expect(modelResponse.ok).toBe(true);
    expect(modelResponse.status).toBe(200);
  });

  test('Sample IFC model loads successfully via API', async ({ page }) => {
    // The legacy `.sample-model-btn` is gone — Chrome UI uses the header model
    // picker. Drive the load programmatically via loadModel() instead, which
    // exercises the same pipeline (load-start → load-complete events) without
    // depending on a chrome-layer selector.
    await page.evaluate(() => {
      window.__loadEvents = [];
      window.__loadError = null;

      window.viewer.on('load-start', (data) => {
        window.__loadEvents.push({ type: 'load-start', data });
      });
      window.viewer.on('load-complete', (data) => {
        window.__loadEvents.push({ type: 'load-complete', data });
      });
      window.viewer.on('load-error', (data) => {
        window.__loadEvents.push({ type: 'load-error', data });
        window.__loadError = data.error;
      });
    });

    // Fire-and-forget: the page.evaluate must return immediately so the
    // surrounding waitForFunction can poll the load-complete event. Awaiting
    // the inner loadModel promise would block past Playwright's default 180s
    // test timeout on slow headless software-WebGL runs.
    await page.evaluate(() => { window.viewer.loadModel('/models/condos.frag.gz', 'Condos'); });

    // Wait for either load-complete or load-error (up to 120 seconds for large model)
    const result = await page.waitForFunction(
      () => {
        return window.__loadEvents.some(
          e => e.type === 'load-complete' || e.type === 'load-error'
        );
      },
      { timeout: 120000 }
    );

    // Check results
    const loadResult = await page.evaluate(() => ({
      events: window.__loadEvents.map(e => e.type),
      error: window.__loadError,
      modelCount: window.viewer.ifcLoader?.loadedModels?.size || 0,
    }));

    // Should have load-start and load-complete, no error
    expect(loadResult.events).toContain('load-start');
    expect(loadResult.events).toContain('load-complete');
    expect(loadResult.events).not.toContain('load-error');
    expect(loadResult.error).toBeNull();
    expect(loadResult.modelCount).toBeGreaterThan(0);
  });

  test('Model adds meshes to the scene after loading', async ({ page }) => {
    // Set up load tracking
    await page.evaluate(() => {
      window.__modelLoaded = false;
      window.__loadError = null;
      window.viewer.on('load-complete', () => { window.__modelLoaded = true; });
      window.viewer.on('load-error', (data) => { window.__loadError = data.error; });
    });

    // Fire-and-forget: the page.evaluate must return immediately so the
    // surrounding waitForFunction can poll the load-complete event. Awaiting
    // the inner loadModel promise would block past Playwright's default 180s
    // test timeout on slow headless software-WebGL runs.
    await page.evaluate(() => { window.viewer.loadModel('/models/condos.frag.gz', 'Condos'); });

    // Wait for load to finish
    await page.waitForFunction(
      () => window.__modelLoaded || window.__loadError,
      { timeout: 120000 }
    );

    // Verify no error and meshes exist in scene
    const sceneInfo = await page.evaluate(() => {
      if (window.__loadError) return { error: window.__loadError };

      const scene = window.viewer.sceneManager.getScene();
      let meshCount = 0;
      scene.traverse((obj) => {
        if (obj.isMesh) meshCount++;
      });
      return { error: null, meshCount };
    });

    expect(sceneInfo.error).toBeNull();
    expect(sceneInfo.meshCount).toBeGreaterThan(0);
  });

  test('No console errors during model loading', async ({ page }) => {
    const consoleErrors = [];

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Listen for page errors
    const pageErrors = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    // Set up load tracking
    await page.evaluate(() => {
      window.__modelLoaded = false;
      window.__loadError = null;
      window.viewer.on('load-complete', () => { window.__modelLoaded = true; });
      window.viewer.on('load-error', (data) => { window.__loadError = data.error; });
    });

    // Fire-and-forget: the page.evaluate must return immediately so the
    // surrounding waitForFunction can poll the load-complete event. Awaiting
    // the inner loadModel promise would block past Playwright's default 180s
    // test timeout on slow headless software-WebGL runs.
    await page.evaluate(() => { window.viewer.loadModel('/models/condos.frag.gz', 'Condos'); });

    // Wait for load to finish
    await page.waitForFunction(
      () => window.__modelLoaded || window.__loadError,
      { timeout: 120000 }
    );

    // Filter out non-critical console errors (e.g. favicon, source maps)
    const criticalErrors = consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('.map') && !e.includes('404')
    );

    const criticalPageErrors = pageErrors.filter(
      e => !e.includes('favicon') && !e.includes('.map')
    );

    // Check there are no critical errors
    expect(criticalPageErrors).toEqual([]);
    // The load should succeed
    const loadError = await page.evaluate(() => window.__loadError);
    expect(loadError).toBeNull();
  });

  test('loadModel API works programmatically', async ({ page }) => {
    // Test the programmatic API directly. Use the pre-converted .frag.gz file
    // that actually ships (CLAUDE.md §4b: .ifc sources are gitignored).
    const result = await page.evaluate(async () => {
      try {
        const modelId = await window.viewer.loadModel('/models/condos.frag.gz', 'Test Model');
        return { success: true, modelId, error: null };
      } catch (error) {
        return { success: false, modelId: null, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.modelId).toBeTruthy();
    expect(result.error).toBeNull();
  });

  test('Object streaming lifecycle events are emitted during load', async ({ page }) => {
    await page.evaluate(() => {
      window.__streamEvents = [];
      window.__streamDone = false;
      window.__streamFailed = null;

      const capture = (type) => (data) => {
        window.__streamEvents.push({ type, data });
      };

      window.viewer.on('stream-capability', capture('stream-capability'));
      window.viewer.on('object-load-start', capture('object-load-start'));
      window.viewer.on('object-load-progress', capture('object-load-progress'));
      window.viewer.on('object-load-complete', capture('object-load-complete'));
      window.viewer.on('object-load-error', (data) => {
        window.__streamFailed = data?.error || 'unknown stream error';
        capture('object-load-error')(data);
      });
      window.viewer.on('model-stream-complete', () => {
        window.__streamDone = true;
      });
      window.viewer.on('load-error', (data) => {
        window.__streamFailed = data?.error || 'unknown load error';
      });
    });

    // Fire-and-forget: the page.evaluate must return immediately so the
    // surrounding waitForFunction can poll the load-complete event. Awaiting
    // the inner loadModel promise would block past Playwright's default 180s
    // test timeout on slow headless software-WebGL runs.
    await page.evaluate(() => { window.viewer.loadModel('/models/condos.frag.gz', 'Condos'); });

    await page.waitForFunction(
      () => window.__streamDone || window.__streamFailed,
      { timeout: 120000 }
    );

    const result = await page.evaluate(() => ({
      failed: window.__streamFailed,
      events: window.__streamEvents.map((e) => e.type),
      progressPayloads: window.__streamEvents
        .filter((e) => e.type === 'object-load-progress')
        .map((e) => e.data),
    }));

    expect(result.failed).toBeNull();
    expect(result.events).toContain('stream-capability');
    expect(result.events).toContain('object-load-progress');
    expect(result.events).toContain('object-load-complete');

    const hasProgress = result.progressPayloads.some(
      (p) => typeof p?.parserProgress === 'number'
    );
    expect(hasProgress).toBe(true);
  });

});
