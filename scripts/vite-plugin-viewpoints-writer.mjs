import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Dev-only Vite middleware that lets the chrome's Settings panel persist
 * viewpoints to `public/viewpoints.json` on disk. The file is the source of
 * truth — committed to the repo, served as a static asset, and read by the
 * chrome at boot. This plugin makes the file writable from the running app.
 *
 * Active only under `npm run dev` (`apply: 'serve'`). In production builds
 * the endpoint does not exist; the client receives 404 and surfaces an
 * error toast explaining that saving is local-only.
 */
export function viewpointsWriter(opts = {}) {
  const file = path.resolve(opts.file ?? 'public/viewpoints.json');

  function migrateViewpoint(vp) {
    if (!vp) return vp;
    return {
      ...vp,
      hiddenObjects: vp.hiddenObjects ?? [],
      sectioning: vp.sectioning ?? null,
      markups: vp.markups ?? [],
    };
  }

  function migrateEntry(entry) {
    if (!entry) return { homeView: null, customViews: [] };
    return {
      homeView: entry.homeView ? migrateViewpoint(entry.homeView) : null,
      customViews: (entry.customViews ?? []).map(migrateViewpoint),
    };
  }

  async function readFile() {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && (parsed.schemaVersion === 2 || parsed.schemaVersion === 3)) {
        const models = parsed.models && typeof parsed.models === 'object' ? parsed.models : {};
        const migrated = {};
        for (const [modelId, entry] of Object.entries(models)) {
          migrated[modelId] = migrateEntry(entry);
        }
        return { schemaVersion: 3, models: migrated };
      }
    } catch {
      // File missing or corrupt — fall through to fresh state.
    }
    return { schemaVersion: 3, models: {} };
  }

  async function writeFile(json) {
    await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  async function readBody(req) {
    let body = '';
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
  }

  function ensureModelEntry(json, modelId) {
    if (!json.models[modelId]) {
      json.models[modelId] = { homeView: null, customViews: [] };
    }
  }

  async function handleRequest(req, res, handler) {
    try {
      const body = await readBody(req);
      const json = await readFile();
      const result = handler(json, body);
      if (result?.error) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: result.error }));
        return;
      }
      await writeFile(json);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(json));
    } catch (err) {
      console.error('[viewpoints-writer] error:', err);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: String(err) }));
    }
  }

  return {
    name: 'viewpoints-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__viewpoints/home', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        await handleRequest(req, res, (json, { modelId, viewpoint }) => {
          if (!modelId || !viewpoint) return { error: 'missing modelId or viewpoint' };
          ensureModelEntry(json, modelId);
          json.models[modelId].homeView = viewpoint;
        });
      });

      server.middlewares.use('/__viewpoints/custom', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        await handleRequest(req, res, (json, { modelId, action, viewpoint, viewpointId, name, viewpoints }) => {
          if (!modelId || !action) return { error: 'missing modelId or action' };
          ensureModelEntry(json, modelId);
          const entry = json.models[modelId];

          if (action === 'add') {
            if (!viewpoint) return { error: 'missing viewpoint' };
            entry.customViews = [...(entry.customViews ?? []), viewpoint];
          } else if (action === 'delete') {
            if (!viewpointId) return { error: 'missing viewpointId' };
            entry.customViews = (entry.customViews ?? []).filter((v) => v.id !== viewpointId);
          } else if (action === 'rename') {
            if (!viewpointId || !name) return { error: 'missing viewpointId or name' };
            entry.customViews = (entry.customViews ?? []).map((v) =>
              v.id === viewpointId ? { ...v, name } : v,
            );
          } else if (action === 'reorder') {
            if (!Array.isArray(viewpoints)) return { error: 'missing viewpoints array' };
            entry.customViews = viewpoints;
          } else if (action === 'update') {
            if (!viewpoint || !viewpoint.id) return { error: 'missing viewpoint or viewpoint.id' };
            const idx = (entry.customViews ?? []).findIndex((v) => v.id === viewpoint.id);
            if (idx === -1) return { error: `viewpoint not found: ${viewpoint.id}` };
            entry.customViews = [
              ...(entry.customViews ?? []).slice(0, idx),
              viewpoint,
              ...(entry.customViews ?? []).slice(idx + 1),
            ];
          } else {
            return { error: `unknown action: ${action}` };
          }
        });
      });
    },
  };
}
