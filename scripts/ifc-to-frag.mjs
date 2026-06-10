import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/ifc-to-frag.mjs <path-to-ifc-file>');
  process.exit(1);
}

const absInput = resolve(inputPath);
const outputName = basename(absInput, '.ifc') + '.frag.gz';
const outputPath = resolve(projectRoot, 'public/models', outputName);

console.log(`Reading ${absInput}...`);
const bytes = new Uint8Array(readFileSync(absInput));
console.log(`Input size: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

// Minimal headless OBC setup — IfcLoader only needs a scene, not a renderer.
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.scene = new OBC.SimpleScene(components);
world.scene.three = new THREE.Scene();

const fragmentsManager = components.get(OBC.FragmentsManager);

const ifcLoader = components.get(OBC.IfcLoader);
const wasmDir = resolve(projectRoot, 'node_modules/web-ifc') + '/';
await ifcLoader.setup({ wasm: { path: wasmDir, absolute: true }, autoSetWasm: false });
if (ifcLoader.settings.webIfc) {
  ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true;
  ifcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;
}

console.log('Converting to fragments (this may take a few minutes for large files)...');
const startMs = Date.now();

const model = await ifcLoader.load(bytes);
const fragData = fragmentsManager.export(model);
const compressed = gzipSync(fragData);

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`Conversion complete in ${elapsedSec}s`);
console.log(`Uncompressed: ${(fragData.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`Compressed:   ${(compressed.length / 1024 / 1024).toFixed(1)} MB  →  ${outputPath}`);

writeFileSync(outputPath, compressed);

// FragmentsManager.export() serializes ONLY geometry — the IFC properties
// (element types, names, psets) are dropped. Without them, getLocalProperties()
// returns nothing on load, so the Object Tree shows "Unknown" and search sets
// can't match by type. Export the properties as a sibling gzipped JSON so the
// loader can restore them (model.setLocalProperties) after load.
const props = model.getLocalProperties?.();
if (props && Object.keys(props).length > 0) {
  const propsName = basename(absInput, '.ifc') + '.props.json.gz';
  const propsPath = resolve(projectRoot, 'public/models', propsName);
  const propsJson = JSON.stringify(props);
  const propsCompressed = gzipSync(Buffer.from(propsJson, 'utf-8'));
  writeFileSync(propsPath, propsCompressed);
  console.log(
    `Properties:   ${Object.keys(props).length} entities, ` +
    `${(propsCompressed.length / 1024 / 1024).toFixed(2)} MB  →  ${propsPath}`,
  );
} else {
  console.warn('Properties:   none found on model — Object Tree/Search will be type-less.');
}

console.log('Done.');
