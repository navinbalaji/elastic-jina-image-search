// Serve the face detector weights from public/models instead of committing them
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const from = 'node_modules/@vladmandic/face-api/model';
const to = 'public/models';
mkdirSync(to, { recursive: true });
for (const file of ['ssd_mobilenetv1_model-weights_manifest.json', 'ssd_mobilenetv1_model.bin']) {
  copyFileSync(path.join(from, file), path.join(to, file));
}
