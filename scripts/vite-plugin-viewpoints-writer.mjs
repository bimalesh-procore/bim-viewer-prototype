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

  return {
    name: 'viewpoints-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__viewpoints/home', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const { modelId, viewpoint } = await readBody(req);
          if (!modelId || !viewpoint) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'missing modelId or viewpoint' }));
            return;
          }

          const json = await readFile();
          if (!json.models[modelId]) {
            json.models[modelId] = { homeView: null, customViews: [] };
          }
          json.models[modelId].homeView = viewpoint;
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
      });
    },
  };
}
