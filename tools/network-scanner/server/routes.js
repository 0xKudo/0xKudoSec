import { Router } from 'express';
import express from 'express';
import { spawn } from 'child_process';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const TARGET_REGEX = /^[a-zA-Z0-9.\-/]+$/;
const MAX_TARGET_LENGTH = 100;
const SCAN_ID_REGEX = /^[\d]+-[a-z0-9]+$/;

const SCAN_PROFILES = {
  ping:    { args: ['-sn'],                      label: 'Ping Scan (host discovery only)' },
  quick:   { args: ['-T4', '-F'],                label: 'Quick Scan (top 100 ports)' },
  full:    { args: ['-T4', '-p-'],               label: 'Full Port Scan (all 65535 ports)' },
  service: { args: ['-T4', '-sV', '-F'],         label: 'Service Version Detection' },
  os:      { args: ['-T4', '-O', '-F'],          label: 'OS Detection' },
  vuln:    { args: ['-T4', '--script=vuln', '-F'], label: 'Vulnerability Scripts' },
};

const CLAUDE_SYSTEM_PROMPT = `You are a network security analyst reviewing nmap scan results.
Analyze the provided scan output and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "summary": "2-3 sentence plain-English summary of what was found",
  "riskLevel": "critical" | "high" | "medium" | "low" | "clean",
  "findings": ["specific findings from the scan results"],
  "recommendations": ["actionable security recommendations based on findings"]
}`;

function validateTarget(target) {
  if (!target || typeof target !== 'string') return false;
  if (target.length > MAX_TARGET_LENGTH) return false;
  return TARGET_REGEX.test(target);
}

// Pending scans: scanId → { target, profile, status: 'pending' | 'running' | 'done' | 'error' }
const pendingScans = new Map();
// Active nmap processes: scanId → ChildProcess
const activeScans = new Map();

// POST /scan — validate, register scanId, return immediately
router.post('/scan', express.json({ limit: '10kb' }), requireFields(['target']), (req, res) => {
  const { target, scanType = 'quick' } = req.body;

  if (!validateTarget(target.trim())) {
    return res.status(400).json({ error: 'Invalid target. Must be a valid IP, CIDR range, or hostname.' });
  }
  if (!SCAN_PROFILES[scanType]) {
    return res.status(400).json({ error: `Invalid scanType. Must be one of: ${Object.keys(SCAN_PROFILES).join(', ')}` });
  }

  const scanId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  pendingScans.set(scanId, { target: target.trim(), profile: SCAN_PROFILES[scanType], scanType, status: 'pending' });

  // Clean up if client never opens the stream
  setTimeout(() => { if (pendingScans.has(scanId)) pendingScans.delete(scanId); }, 30000);

  res.json({ scanId, target: target.trim(), scanType, scanLabel: SCAN_PROFILES[scanType].label });
});

// GET /scan-stream/:scanId — SSE stream
router.get('/scan-stream/:scanId', (req, res) => {
  const { scanId } = req.params;

  if (!SCAN_ID_REGEX.test(scanId)) {
    return res.status(400).json({ error: 'Invalid scanId.' });
  }

  const scan = pendingScans.get(scanId);
  if (!scan) {
    return res.status(404).json({ error: 'Unknown or expired scanId.' });
  }

  pendingScans.delete(scanId);
  scan.status = 'running';

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const finalArgs = ['-oN', '-', ...scan.profile.args, '--', scan.target];
  const proc = spawn('nmap', finalArgs, { shell: false });
  activeScans.set(scanId, proc);

  let fullOutput = '';

  proc.stdout.on('data', chunk => {
    const text = chunk.toString();
    fullOutput += text;
    // Stream each non-empty line individually
    text.split('\n').forEach(line => {
      if (line.trim()) send('line', { line });
    });
  });

  proc.stderr.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) send('line', { line: text });
  });

  proc.on('close', async (code, signal) => {
    activeScans.delete(scanId);

    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      send('cancelled', {});
      res.end();
      return;
    }

    if (code !== 0 && !fullOutput) {
      send('error', { error: `nmap exited with code ${code}` });
      res.end();
      return;
    }

    // Signal nmap done, Claude starting
    send('analyzing', {});

    let analysis = { summary: 'Analysis unavailable.', riskLevel: 'unknown', findings: [], recommendations: [] };
    try {
      const raw = await askClaude(
        CLAUDE_SYSTEM_PROMPT,
        `Scan type: ${scan.profile.label}\nTarget: ${scan.target}\n\nNmap output:\n${fullOutput.slice(0, 8000)}`
      );
      analysis = JSON.parse(raw);
    } catch {}

    send('done', {
      target: scan.target,
      scanType: scan.scanType,
      scanLabel: scan.profile.label,
      rawOutput: fullOutput,
      scanId,
      ...analysis,
    });

    res.end();
  });

  proc.on('error', err => {
    activeScans.delete(scanId);
    send('error', { error: `Failed to start nmap: ${err.message}. Is nmap installed?` });
    res.end();
  });

  // Hard timeout
  const timeout = setTimeout(() => {
    if (activeScans.has(scanId)) {
      proc.kill();
      activeScans.delete(scanId);
      send('error', { error: 'Scan timed out after 5 minutes.' });
      res.end();
    }
  }, 5 * 60 * 1000);

  // Client disconnect — kill nmap
  req.on('close', () => {
    clearTimeout(timeout);
    const p = activeScans.get(scanId);
    if (p) { p.kill(); activeScans.delete(scanId); }
  });
});

// POST /cancel/:scanId
router.post('/cancel/:scanId', (req, res) => {
  const { scanId } = req.params;
  if (!SCAN_ID_REGEX.test(scanId)) {
    return res.status(400).json({ error: 'Invalid scanId.' });
  }
  // Cancel before stream opens
  if (pendingScans.has(scanId)) {
    pendingScans.delete(scanId);
    return res.json({ cancelled: true });
  }
  // Cancel running scan
  const proc = activeScans.get(scanId);
  if (!proc) return res.status(404).json({ error: 'No active scan with that ID.' });
  proc.kill();
  activeScans.delete(scanId);
  res.json({ cancelled: true });
});

router.get('/scan-types', (req, res) => {
  res.json(Object.entries(SCAN_PROFILES).map(([key, val]) => ({ value: key, label: val.label })));
});

export default router;
