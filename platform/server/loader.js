import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { requireAuth } from './middleware/requireAuth.js';

const isVitest = typeof process.env.VITEST !== 'undefined';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TOOLS_DIR = resolve(__dirname, '../../tools');

export async function loadTools(app) {
  const manifests = [];

  if (!existsSync(TOOLS_DIR)) {
    app.locals.toolManifests = manifests;
    return;
  }

  const toolDirs = readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const toolName of toolDirs) {
    const manifestPath = join(TOOLS_DIR, toolName, 'manifest.json');
    const routesPath = join(TOOLS_DIR, toolName, 'server', 'routes.js');

    if (!existsSync(manifestPath)) {
      console.warn(`[loader] Skipping ${toolName}: no manifest.json`);
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifests.push(manifest);

    if (existsSync(routesPath)) {
      const importPath = isVitest ? routesPath : pathToFileURL(routesPath).href;
      const { default: router } = await import(importPath);

      if (manifest.requiresAuth) {
        app.use(`/api/tools/${manifest.id}`, requireAuth, router);
        console.log(`[loader] Mounted tool (auth required): ${manifest.id}`);
      } else {
        app.use(`/api/tools/${manifest.id}`, router);
        console.log(`[loader] Mounted tool (public): ${manifest.id}`);
      }
    }
  }

  app.locals.toolManifests = manifests;
  console.log(`[loader] ${manifests.length} tool(s) registered`);
}
