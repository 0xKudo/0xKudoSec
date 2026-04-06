import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

async function getReleaseDate(version) {
  try {
    const tag = `v${version}`;
    const res = await fetch(
      `https://api.github.com/repos/0xKudoX/0xKudoSec-releases/releases/tags/${tag}`,
      { headers: { 'User-Agent': 'cybertools-vite-build' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.published_at ? data.published_at.slice(0, 10) : null;
  } catch {
    return null;
  }
}

const releaseDate = await getReleaseDate(pkg.version);
const buildDate = releaseDate || new Date().toISOString().slice(0, 10);
if (releaseDate) {
  console.log(`[vite] Using GitHub release date for v${pkg.version}: ${releaseDate}`);
} else {
  console.log(`[vite] No GitHub release found for v${pkg.version}, using today's date`);
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [react()],
  base: process.env.VITE_BASE_URL || '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
