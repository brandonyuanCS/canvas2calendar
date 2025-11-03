import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const apiDir = resolve(__dirname, '../../');

// Load env from api directory
config({ path: resolve(apiDir, '.env'), override: false });
config({ path: resolve(apiDir, '.env.local'), override: true });
