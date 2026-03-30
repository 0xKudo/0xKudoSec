# 0xKudo Security Toolkit — Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform frame (monorepo shell + Node/Express server + tool module system) and the Alert Triage Assistant as the first tool module.

**Architecture:** Monorepo with npm workspaces. `platform/server` is a Node/Express app that auto-discovers tool routes via `loader.js`. `platform/shell` is a React/Vite app that fetches tool manifests from the server and builds the sidebar dynamically. Each tool in `tools/` is a self-contained module with a manifest, React views, and Express routes — dropping a folder is all that's needed to add a tool.

**Tech Stack:** Node.js 20+, Express 4, React 18, Vite 5, React Router 6, Anthropic SDK, express-rate-limit, helmet, cors, Vitest (server tests), npm workspaces.

---

## File Map

| File | Purpose |
|------|---------|
| `cybertools/package.json` | Workspace root — defines npm workspaces |
| `platform/server/index.js` | Express entry — middleware, routes, loader, listen |
| `platform/server/loader.js` | Auto-discovers `tools/*/server/routes.js`, mounts at `/api/tools/[id]/` |
| `platform/server/middleware/cors.js` | CORS locked to `ALLOWED_ORIGIN` env var |
| `platform/server/middleware/rateLimiter.js` | 60 req/min per IP on all `/api/*` |
| `platform/server/middleware/validate.js` | Input sanitization helpers |
| `platform/server/services/claude.js` | Anthropic SDK singleton, key from env |
| `platform/server/routes/tools.js` | `GET /api/health`, `GET /api/tools` |
| `platform/shell/vite.config.js` | Vite config — proxies `/api/*` to server in dev |
| `platform/shell/src/main.jsx` | React entry point |
| `platform/shell/src/App.jsx` | Shell layout — TopNav, Sidebar, tool content area, Router |
| `platform/shell/src/context/ToolRegistry.jsx` | Fetches `/api/tools`, provides manifest list via context |
| `platform/shell/src/context/WorkspaceContext.jsx` | Shared clipboard context — tools push/read data here; backed by localStorage; designed to swap to server API later |
| `platform/shell/src/components/TopNav.jsx` | Branding bar, link back to laynekudo.com |
| `platform/shell/src/components/Sidebar.jsx` | Tool list, tag filter chips, favorites (localStorage) |
| `platform/shell/src/components/ErrorBoundary.jsx` | Catches tool crashes, shows fallback |
| `platform/shell/src/styles/theme.css` | CSS variables — full Cyber Blue palette + severity colors |
| `platform/shared/constants.js` | Severity levels array, tag color map |
| `tools/alert-triage/manifest.json` | Tool manifest |
| `tools/alert-triage/client/index.jsx` | Alert triage React UI |
| `tools/alert-triage/server/routes.js` | `POST /api/tools/alert-triage/analyze` |

---

## Task 1: Monorepo Scaffold

**Files:**
- Create: `cybertools/package.json`
- Create: `cybertools/.gitignore`
- Create: `cybertools/.env.example`
- Create: `platform/server/package.json`
- Create: `platform/shell/package.json`
- Create: `platform/shared/constants.js`

- [ ] **Step 1: Create the monorepo root**

```bash
mkdir -p cybertools/platform/server cybertools/platform/shell cybertools/platform/shared cybertools/tools
cd cybertools
```

- [ ] **Step 2: Write the workspace root `package.json`**

Create `cybertools/package.json`:
```json
{
  "name": "cybertools",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "platform/server",
    "platform/shell",
    "platform/shared"
  ],
  "scripts": {
    "dev:server": "npm run dev --workspace=platform/server",
    "dev:shell": "npm run dev --workspace=platform/shell",
    "test": "npm run test --workspace=platform/server"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

Create `cybertools/.gitignore`:
```
node_modules/
dist/
.env
*.local
.DS_Store
```

- [ ] **Step 4: Write `.env.example`**

Create `cybertools/.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
ALLOWED_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
```

- [ ] **Step 5: Write `platform/server/package.json`**

```json
{
  "name": "@cybertools/server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "dev": "node --watch index.js",
    "start": "node index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 6: Write `platform/shell/package.json`**

```json
{
  "name": "@cybertools/shell",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.2.11"
  }
}
```

- [ ] **Step 7: Write `platform/shared/constants.js`**

```js
export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

export const TAG_COLORS = {
  'blue-team': '#4a9eff',
  'red-team': '#ff4444',
  'ai-assisted': '#00c8ff',
  'soc': '#4a9eff',
  'recon': '#ff8c00',
  'network': '#ffd700',
  'threat-intel': '#ff8c00',
  'compliance': '#8b949e',
};
```

- [ ] **Step 8: Install dependencies**

```bash
cd cybertools
npm install
```

Expected: node_modules installed in root + each workspace, no errors.

- [ ] **Step 9: Commit**

```bash
git init
git add cybertools/
git commit -m "feat: monorepo scaffold with npm workspaces"
```

---

## Task 2: Express Server — Middleware + Health Route

**Files:**
- Create: `platform/server/middleware/cors.js`
- Create: `platform/server/middleware/rateLimiter.js`
- Create: `platform/server/middleware/validate.js`
- Create: `platform/server/routes/tools.js`
- Create: `platform/server/index.js`
- Create: `platform/server/tests/health.test.js`

- [ ] **Step 1: Write the CORS middleware**

Create `platform/server/middleware/cors.js`:
```js
import corsLib from 'cors';

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

export const corsMiddleware = corsLib({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (origin === allowedOrigin) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
});
```

- [ ] **Step 2: Write the rate limiter middleware**

Create `platform/server/middleware/rateLimiter.js`:
```js
import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});
```

- [ ] **Step 3: Write the validate middleware**

Create `platform/server/middleware/validate.js`:
```js
/**
 * Returns Express middleware that validates req.body has the required fields.
 * Responds 400 with a descriptive error if any field is missing or not a string.
 * @param {string[]} fields
 */
export function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (typeof req.body[field] !== 'string' || req.body[field].trim() === '') {
        return res.status(400).json({ error: `Missing or empty field: ${field}` });
      }
    }
    next();
  };
}
```

- [ ] **Step 4: Write the health + tools routes stub**

Create `platform/server/routes/tools.js`:
```js
import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Populated by loader.js after manifests are discovered
router.get('/tools', (req, res) => {
  res.json(req.app.locals.toolManifests || []);
});

export default router;
```

- [ ] **Step 5: Write the server entry point**

Create `platform/server/index.js`:
```js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import apiRoutes from './routes/tools.js';
import { loadTools } from './loader.js';

const app = express();

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '50kb' }));
app.use('/api', apiRateLimiter);
app.use('/api', apiRoutes);

// createApp sets up the express app and loads tools.
// Call start() to actually bind to a port (not called during tests).
export async function createApp() {
  await loadTools(app);
  return app;
}

export default app;

// Only start listening when run directly (not imported by tests)
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = process.env.PORT || 4000;
  createApp().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
    });
  });
}
```

- [ ] **Step 6: Write the failing health test**

Create `platform/server/tests/health.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});
```

- [ ] **Step 7: Run test — expect it to fail (loader.js missing)**

```bash
cd cybertools
npm test
```

Expected: FAIL — `Cannot find module './loader.js'`

- [ ] **Step 8: Write the tool loader (stub — no tools yet)**

Create `platform/server/loader.js`:
```js
import { readdirSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

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
      const { default: router } = await import(routesPath);
      app.use(`/api/tools/${manifest.id}`, router);
      console.log(`[loader] Mounted tool: ${manifest.id}`);
    }
  }

  app.locals.toolManifests = manifests;
  console.log(`[loader] ${manifests.length} tool(s) registered`);
}
```

- [ ] **Step 9: Run test — expect pass**

```bash
cd cybertools
npm test
```

Expected: PASS — `GET /api/health > returns status ok`

- [ ] **Step 10: Commit**

```bash
git add platform/server/
git commit -m "feat: express server with middleware, health route, and tool loader"
```

---

## Task 3: Claude API Service

**Files:**
- Create: `platform/server/services/claude.js`
- Create: `platform/server/tests/claude.test.js`

- [ ] **Step 1: Write the failing test**

Create `platform/server/tests/claude.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { claudeClient } from '../services/claude.js';

describe('claudeClient', () => {
  it('is defined and has a messages property', () => {
    expect(claudeClient).toBeDefined();
    expect(typeof claudeClient.messages).toBe('object');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd cybertools
npm test
```

Expected: FAIL — `Cannot find module '../services/claude.js'`

- [ ] **Step 3: Write the Claude service**

Create `platform/server/services/claude.js`:
```js
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set. Check your .env file.');
}

export const claudeClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Send a prompt to Claude and return the text response.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function askClaude(systemPrompt, userMessage) {
  const message = await claudeClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }
  return block.text;
}
```

- [ ] **Step 4: Create a `.env` file for local dev**

```bash
cp cybertools/.env.example cybertools/.env
# Edit .env and fill in your real ANTHROPIC_API_KEY
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd cybertools
npm test
```

Expected: PASS — `claudeClient > is defined and has a messages property`

- [ ] **Step 6: Commit**

```bash
git add platform/server/services/ platform/server/tests/claude.test.js
git commit -m "feat: claude api singleton service"
```

---

## Task 4: React Shell — Theme + Layout

**Files:**
- Create: `platform/shell/index.html`
- Create: `platform/shell/vite.config.js`
- Create: `platform/shell/src/main.jsx`
- Create: `platform/shell/src/styles/theme.css`
- Create: `platform/shell/src/components/ErrorBoundary.jsx`
- Create: `platform/shell/src/components/TopNav.jsx`
- Create: `platform/shell/src/App.jsx`

- [ ] **Step 1: Write `index.html`**

Create `platform/shell/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>0xKudo Security Toolkit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `vite.config.js`**

Create `platform/shell/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Write the theme CSS variables**

Create `platform/shell/src/styles/theme.css`:
```css
:root {
  --bg-primary: #111110;
  --bg-surface: #1a1917;
  --bg-sidebar: #0e0d0c;
  --border: #1f1e1c;
  --text-primary: #e8e6e3;
  --text-muted: #4a4845;
  --text-subtle: #333330;
  --severity-critical: #ef4444;
  --severity-high: #d97706;
  --severity-medium: #ca8a04;
  --severity-low: #16a34a;
  --severity-info: #60a5fa;
  --btn-primary-bg: #e8e6e3;
  --btn-primary-text: #111110;
  --font: 'Source Code Pro', 'Consolas', 'Monaco', monospace;
}

[data-theme="light"] {
  --bg-primary: #faf8f5;
  --bg-surface: #ffffff;
  --bg-sidebar: #f0ece6;
  --border: #e0d8cc;
  --text-primary: #1a1714;
  --text-muted: #8a8078;
  --text-subtle: #c0b8b0;
  --btn-primary-bg: #1a1714;
  --btn-primary-text: #faf8f5;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font);
  font-weight: 500;
  min-height: 100vh;
}
```

- [ ] **Step 4: Write the ErrorBoundary component**

Create `platform/shell/src/components/ErrorBoundary.jsx`:
```jsx
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', color: 'var(--severity-critical)', fontFamily: 'var(--font-mono)' }}>
          <h2>Tool Error</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
            {this.state.error?.message || 'This tool encountered an unexpected error.'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 5: Write the TopNav component**

Create `platform/shell/src/components/TopNav.jsx`:
```jsx
const styles = {
  nav: {
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  brand: {
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 'bold',
    fontSize: '15px',
  },
  backLink: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    textDecoration: 'none',
  },
};

export function TopNav() {
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>// 0xKudo Tools</span>
      <a href="https://laynekudo.com" style={styles.backLink}>
        ← laynekudo.com
      </a>
    </nav>
  );
}
```

- [ ] **Step 6: Write App.jsx with placeholder content area**

Create `platform/shell/src/App.jsx`:
```jsx
import { BrowserRouter } from 'react-router-dom';
import { TopNav } from './components/TopNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/theme.css';

const styles = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
};

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.layout}>
        <TopNav />
        <div style={styles.body}>
          <ErrorBoundary>
            <main style={styles.content}>
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                Loading tools...
              </p>
            </main>
          </ErrorBoundary>
        </div>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Write `main.jsx`**

Create `platform/shell/src/main.jsx`:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Start the shell and verify it loads**

```bash
# Terminal 1
cd cybertools && npm run dev:server

# Terminal 2
cd cybertools && npm run dev:shell
```

Open http://localhost:5173 — expect: dark background, top nav with "// 0xKudo Tools" branding and "← laynekudo.com" link, "Loading tools..." text in main area. No console errors.

- [ ] **Step 9: Commit**

```bash
git add platform/shell/
git commit -m "feat: react shell with theme, layout, top nav, error boundary"
```

---

## Task 5: Tool Registry + Sidebar

**Files:**
- Create: `platform/shell/src/context/ToolRegistry.jsx`
- Create: `platform/shell/src/components/Sidebar.jsx`
- Modify: `platform/shell/src/App.jsx`

- [ ] **Step 1: Write the ToolRegistry context**

Create `platform/shell/src/context/ToolRegistry.jsx`:
```jsx
import { createContext, useContext, useEffect, useState } from 'react';

const ToolRegistryContext = createContext([]);

export function ToolRegistryProvider({ children }) {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    fetch('/api/tools')
      .then(r => r.json())
      .then(setTools)
      .catch(err => console.error('[ToolRegistry] Failed to fetch tools:', err));
  }, []);

  return (
    <ToolRegistryContext.Provider value={tools}>
      {children}
    </ToolRegistryContext.Provider>
  );
}

export function useTools() {
  return useContext(ToolRegistryContext);
}
```

- [ ] **Step 2: Write the Sidebar component**

Create `platform/shell/src/components/Sidebar.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';

const FAVORITES_KEY = 'cybertools_favorites';

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

const styles = {
  sidebar: {
    width: '220px',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  filterArea: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: (active) => ({
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
  }),
  toolList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  sectionLabel: {
    padding: '8px 12px 4px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  toolRow: (active, comingSoon) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    cursor: comingSoon ? 'default' : 'pointer',
    background: active ? 'var(--bg-surface)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    opacity: comingSoon ? 0.4 : 1,
  }),
  toolName: {
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  },
  starBtn: (favorited) => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: favorited ? 'var(--accent)' : 'var(--border)',
    fontSize: '14px',
    lineHeight: 1,
    padding: '0 0 0 8px',
  }),
};

export function Sidebar() {
  const tools = useTools();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeFilters, setActiveFilters] = useState([]);
  const [favorites, setFavorites] = useState(loadFavorites);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const allTags = [...new Set(tools.flatMap(t => t.tags || []))].sort();

  const toggleFilter = (tag) => {
    setActiveFilters(f => f.includes(tag) ? f.filter(t => t !== tag) : [...f, tag]);
  };

  const toggleFavorite = (e, id) => {
    e.stopPropagation();
    setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  };

  const visibleTools = activeFilters.length === 0
    ? tools
    : tools.filter(t => activeFilters.some(f => (t.tags || []).includes(f)));

  const favoriteTools = visibleTools.filter(t => favorites.includes(t.id));
  const otherTools = visibleTools.filter(t => !favorites.includes(t.id));

  function ToolRow({ tool }) {
    const isActive = location.pathname === tool.route;
    const isFavorite = favorites.includes(tool.id);
    const isComingSoon = tool.status === 'coming-soon';
    return (
      <div
        style={styles.toolRow(isActive, isComingSoon)}
        onClick={() => !isComingSoon && navigate(tool.route)}
        title={isComingSoon ? 'Coming Soon' : tool.description}
      >
        <span style={styles.toolName}>{tool.name}</span>
        <button style={styles.starBtn(isFavorite)} onClick={(e) => toggleFavorite(e, tool.id)}>
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.filterArea}>
        {allTags.map(tag => (
          <span
            key={tag}
            style={styles.chip(activeFilters.includes(tag))}
            onClick={() => toggleFilter(tag)}
          >
            {tag}
          </span>
        ))}
      </div>
      <div style={styles.toolList}>
        {favoriteTools.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Favorites</div>
            {favoriteTools.map(t => <ToolRow key={t.id} tool={t} />)}
            <div style={{ ...styles.sectionLabel, marginTop: '8px' }}>All Tools</div>
          </>
        )}
        {otherTools.map(t => <ToolRow key={t.id} tool={t} />)}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Update App.jsx to include ToolRegistryProvider and Sidebar**

Replace `platform/shell/src/App.jsx` with:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToolRegistryProvider, useTools } from './context/ToolRegistry';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/theme.css';

const styles = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
};

function ToolRoutes() {
  const tools = useTools();
  return (
    <Routes>
      {tools
        .filter(t => t.status === 'active')
        .map(t => (
          <Route
            key={t.id}
            path={t.route}
            element={
              <ErrorBoundary>
                <ToolLoader toolId={t.id} />
              </ErrorBoundary>
            }
          />
        ))}
      <Route path="*" element={
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Select a tool from the sidebar.
        </p>
      } />
    </Routes>
  );
}

// Dynamically imports tool client component by id
const toolModuleCache = {};
function ToolLoader({ toolId }) {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (toolModuleCache[toolId]) {
      setComponent(() => toolModuleCache[toolId]);
      return;
    }
    import(`../../../tools/${toolId}/client/index.jsx`)
      .then(mod => {
        toolModuleCache[toolId] = mod.default;
        setComponent(() => mod.default);
      })
      .catch(err => setError(err.message));
  }, [toolId]);

  if (error) return <p style={{ color: 'var(--severity-critical)', fontFamily: 'var(--font-mono)' }}>{error}</p>;
  if (!Component) return <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Loading...</p>;
  return <Component />;
}

// useState import needed for ToolLoader
import { useState, useEffect } from 'react';

export default function App() {
  return (
    <BrowserRouter>
      <ToolRegistryProvider>
        <div style={styles.layout}>
          <TopNav />
          <div style={styles.body}>
            <Sidebar />
            <main style={styles.content}>
              <ToolRoutes />
            </main>
          </div>
        </div>
      </ToolRegistryProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Verify in browser**

With both server and shell running, open http://localhost:5173.

Expected: Top nav visible, sidebar shows empty filter area and no tools (no tools registered yet), main area shows "Select a tool from the sidebar." No console errors.

- [ ] **Step 5: Commit**

```bash
git add platform/shell/src/
git commit -m "feat: tool registry context, sidebar with tag filter and favorites"
```

---

## Task 6: WorkspaceContext — Inter-Tool Data Sharing

**Files:**
- Create: `platform/shell/src/context/WorkspaceContext.jsx`
- Modify: `platform/shell/src/App.jsx` (wrap with WorkspaceProvider)

- [ ] **Step 1: Write WorkspaceContext**

Create `platform/shell/src/context/WorkspaceContext.jsx`:
```jsx
import { createContext, useContext, useState, useCallback } from 'react';

const WORKSPACE_KEY = 'cybertools_workspace';

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToStorage(items) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(items));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const WorkspaceContext = createContext({ items: [], push: () => {}, clear: () => {} });

export function WorkspaceProvider({ children }) {
  const [items, setItems] = useState(loadFromStorage);

  const push = useCallback((type, label, data, source) => {
    const item = { id: generateId(), type, label, data, source, timestamp: Date.now() };
    setItems(prev => {
      const next = [...prev, item];
      saveToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    saveToStorage([]);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ items, push, clear }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
```

- [ ] **Step 2: Wrap App with WorkspaceProvider**

In `platform/shell/src/App.jsx`, import `WorkspaceProvider` and wrap it inside `ToolRegistryProvider`:
```jsx
import { WorkspaceProvider } from './context/WorkspaceContext';

// Inside the App return, wrap the layout:
<BrowserRouter>
  <ToolRegistryProvider>
    <WorkspaceProvider>
      <div style={styles.layout}>
        ...
      </div>
    </WorkspaceProvider>
  </ToolRegistryProvider>
</BrowserRouter>
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:5173. No visible change expected — WorkspaceContext is infrastructure, not UI. Open browser DevTools console and run:

```js
// This won't work directly but confirms no errors on load
console.log('Workspace context loaded')
```

No console errors = pass.

- [ ] **Step 4: Commit**

```bash
git add platform/shell/src/context/WorkspaceContext.jsx platform/shell/src/App.jsx
git commit -m "feat: workspace context for inter-tool data sharing, localStorage backed"
```

---

## Task 7: Alert Triage Tool — Manifest + Server Route

**Files:**
- Create: `tools/alert-triage/manifest.json`
- Create: `tools/alert-triage/server/routes.js`
- Create: `platform/server/tests/alert-triage.test.js`

- [ ] **Step 1: Write the manifest**

Create `tools/alert-triage/manifest.json`:
```json
{
  "id": "alert-triage",
  "name": "Alert Triage Assistant",
  "description": "Paste a SIEM alert. Get severity assessment, likely attack vector, and recommended next steps.",
  "route": "/alert-triage",
  "icon": "shield",
  "tags": ["blue-team", "ai-assisted", "soc"],
  "status": "active"
}
```

- [ ] **Step 2: Write the failing server test**

Create `platform/server/tests/alert-triage.test.js`:
```js
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// Mock claude service so tests don't call the real API
vi.mock('../services/claude.js', () => ({
  askClaude: vi.fn().mockResolvedValue(JSON.stringify({
    severity: 'high',
    attackVector: 'Brute force login attempt',
    summary: 'Multiple failed SSH logins detected from a single IP.',
    recommendedActions: ['Block source IP', 'Review auth logs', 'Enable MFA'],
    confidence: 'high',
  })),
}));

import app from '../index.js';

describe('POST /api/tools/alert-triage/analyze', () => {
  it('returns 400 when alertText is missing', async () => {
    const res = await request(app)
      .post('/api/tools/alert-triage/analyze')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alertText/);
  });

  it('returns triage result for valid alertText', async () => {
    const res = await request(app)
      .post('/api/tools/alert-triage/analyze')
      .send({ alertText: 'Multiple failed SSH logins from 192.168.1.100' });
    expect(res.status).toBe(200);
    expect(res.body.severity).toBe('high');
    expect(Array.isArray(res.body.recommendedActions)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — expect fail**

```bash
cd cybertools && npm test
```

Expected: FAIL — `Cannot find route /api/tools/alert-triage/analyze`

- [ ] **Step 4: Write the alert triage server route**

Create `tools/alert-triage/server/routes.js`:
```js
import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const SYSTEM_PROMPT = `You are a SOC analyst assistant. Analyze the provided SIEM alert and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "attackVector": "brief description of the likely attack vector",
  "summary": "1-2 sentence plain-English summary of what is happening",
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "confidence": "high" | "medium" | "low"
}`;

router.post('/analyze', requireFields(['alertText']), async (req, res) => {
  const { alertText } = req.body;

  if (alertText.length > 10000) {
    return res.status(400).json({ error: 'alertText exceeds maximum length of 10000 characters' });
  }

  try {
    const raw = await askClaude(SYSTEM_PROMPT, alertText);
    const result = JSON.parse(raw);

    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    if (!validSeverities.includes(result.severity)) {
      return res.status(502).json({ error: 'Invalid severity in AI response' });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI response was not valid JSON' });
    }
    console.error('[alert-triage] Error:', err.message);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

export default router;
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd cybertools && npm test
```

Expected: PASS — all 3 tests pass (health + claude + 2 alert-triage tests)

- [ ] **Step 6: Restart server and verify tool is registered**

```bash
# Restart server (Ctrl+C then):
cd cybertools && npm run dev:server
```

Expected in console:
```
[loader] Mounted tool: alert-triage
[loader] 1 tool(s) registered
Server running on port 4000
```

Also verify: `curl http://localhost:4000/api/tools` returns the alert-triage manifest.

- [ ] **Step 7: Commit**

```bash
git add tools/alert-triage/manifest.json tools/alert-triage/server/ platform/server/tests/alert-triage.test.js
git commit -m "feat: alert triage tool manifest and server route with tests"
```

---

## Task 8: Alert Triage Tool — React UI

**Files:**
- Create: `tools/alert-triage/client/index.jsx`

- [ ] **Step 1: Write the alert triage UI**

Create `tools/alert-triage/client/index.jsx`:
```jsx
import { useState } from 'react';

const SEVERITY_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const styles = {
  container: {
    maxWidth: '800px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
    fontSize: '18px',
    marginBottom: '6px',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    padding: '12px',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '12px',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--accent)',
    color: loading ? 'var(--text-muted)' : 'var(--bg-primary)',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 20px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  results: {
    marginTop: '24px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
  },
  severityBadge: (severity) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${SEVERITY_COLORS[severity] || 'var(--border)'}`,
    color: SEVERITY_COLORS[severity] || 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: '16px',
  }),
  label: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  value: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  actionItem: {
    padding: '6px 0',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    borderBottom: '1px solid var(--border)',
  },
  error: {
    color: 'var(--severity-critical)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    marginTop: '12px',
  },
};

export default function AlertTriageTool() {
  const [alertText, setAlertText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleAnalyze() {
    if (!alertText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/alert-triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Alert Triage Assistant</h1>
        <p style={styles.subtitle}>
          Paste a SIEM alert below. Get severity assessment, likely attack vector, and recommended next steps.
        </p>
      </div>

      <textarea
        style={styles.textarea}
        placeholder="Paste alert text here..."
        value={alertText}
        onChange={e => setAlertText(e.target.value)}
        disabled={loading}
      />

      <button
        style={styles.button(loading)}
        onClick={handleAnalyze}
        disabled={loading || !alertText.trim()}
      >
        {loading ? 'Analyzing...' : 'Analyze Alert'}
      </button>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.severityBadge(result.severity)}>
            {result.severity} — Confidence: {result.confidence}
          </div>

          <div style={styles.label}>Summary</div>
          <div style={styles.value}>{result.summary}</div>

          <div style={styles.label}>Attack Vector</div>
          <div style={styles.value}>{result.attackVector}</div>

          <div style={styles.label}>Recommended Actions</div>
          <div>
            {result.recommendedActions.map((action, i) => (
              <div key={i} style={styles.actionItem}>{i + 1}. {action}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify end-to-end in browser**

With server and shell running, open http://localhost:5173.

Expected:
- Sidebar shows "Alert Triage Assistant" with blue-team, ai-assisted, soc tag chips in filter area
- Clicking "Alert Triage Assistant" navigates to `/alert-triage`
- Tool UI renders: title, subtitle, textarea, "Analyze Alert" button
- Paste a sample alert (e.g. "Multiple failed SSH login attempts from IP 203.0.113.42 — 47 attempts in 60 seconds") and click Analyze
- Result panel appears with severity badge, summary, attack vector, recommended actions

- [ ] **Step 3: Test the favorite feature**

Click the ☆ next to "Alert Triage Assistant" in the sidebar. Expected: star turns filled (★), tool moves to "Favorites" section above "All Tools". Refresh the page — favorites should persist.

- [ ] **Step 4: Commit**

```bash
git add tools/alert-triage/client/
git commit -m "feat: alert triage tool react ui"
```

---

## Task 9: Production Readiness

**Files:**
- Create: `platform/server/ecosystem.config.js`
- Modify: `platform/shell/vite.config.js` (base URL env support)

- [ ] **Step 1: Write PM2 ecosystem config**

Create `platform/server/ecosystem.config.js`:
```js
module.exports = {
  apps: [{
    name: 'cybertools-server',
    script: 'index.js',
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
    },
  }],
};
```

- [ ] **Step 2: Update vite.config.js for production base URL**

Replace `platform/shell/vite.config.js` with:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
```

- [ ] **Step 3: Run full test suite one final time**

```bash
cd cybertools && npm test
```

Expected: All tests pass.

- [ ] **Step 4: Build the shell for production**

```bash
cd cybertools && npm run build --workspace=platform/shell
```

Expected: `platform/shell/dist/` created, no build errors.

- [ ] **Step 5: Final commit**

```bash
git add platform/server/ecosystem.config.js platform/shell/vite.config.js
git commit -m "feat: production config — pm2 ecosystem, vite base url env support"
```

---

## Adding Future Tools

To add the next tool (e.g. Incident Report Generator):

1. `mkdir -p tools/incident-report/client tools/incident-report/server`
2. Create `tools/incident-report/manifest.json` with appropriate `id`, `name`, `tags`, `status`
3. Create `tools/incident-report/server/routes.js` — export an Express router
4. Create `tools/incident-report/client/index.jsx` — export a React component as default
5. Restart the server — loader auto-discovers and mounts the new tool

No changes to shell, server, or any other tool required.
