import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '../../../');
const apiDir = resolve(__dirname, '../../');

// Root env (shared)
config({ path: resolve(projectRoot, '.env'), override: false });
config({ path: resolve(projectRoot, '.env.local'), override: true });

// Package-specific overrides (optional)
config({ path: resolve(apiDir, '.env'), override: false });
config({ path: resolve(apiDir, '.env.local'), override: true });
