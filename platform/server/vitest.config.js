import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.js'],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) =>
        k.startsWith('ANTHROPIC') ||
        k.startsWith('AUTH0') ||
        k === 'ALLOWED_ORIGIN' ||
        k === 'PORT' ||
        k === 'NODE_ENV' ||
        k === 'DB_ENCRYPTION_KEY'
      )
    ),
  },
});
