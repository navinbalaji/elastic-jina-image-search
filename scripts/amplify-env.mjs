// Amplify only exposes environment variables at build time; write the app's into .env.production for the server
import { appendFileSync } from 'node:fs';

const KEYS = [
  'ES_URL',
  'ES_CLOUD_ID',
  'ES_API_KEY',
  'ES_INDEX',
  'INFERENCE_ID',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'S3_BUCKET',
  'S3_REGION',
];

// Single quotes keep values literal, falling back to double quotes when the value has one
const quote = (v) => (v.includes("'") ? `"${v}"` : `'${v}'`);

const lines = KEYS.filter((k) => process.env[k]).map((k) => `${k}=${quote(process.env[k])}`);
appendFileSync('.env.production', lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} variables to .env.production: ${KEYS.filter((k) => process.env[k]).join(', ')}`);
