import { Router } from 'express';
import { spawn } from 'child_process';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

// Strict target validation — IP, CIDR, or hostname only. No shell metacharacters.
const TARGET_REGEX = /^[a-zA-Z0-9.\-/]+$/;
const MAX_TARGET_LENGTH = 100;

// Whitelisted scan profiles — user never controls nmap flags directly
const SCAN_PROFILES = {
  ping:       { args: ['-sn'], label: 'Ping Scan (host discovery only)' },
  quick:      { args: ['-T4', '-F'], label: 'Quick Scan (top 100 ports)' },
  full:       { args: ['-T4', '-p-'], label: 'Full Port Scan (all 65535 ports)' },
  service:    { args: ['-T4', '-sV', '-F'], label: 'Service Version Detection' },
  os:         { args: ['-T4', '-O', '-F'], label: 'OS Detection' },
  vuln:       { args: ['-T4', '--script=vuln', '-F'], label: 'Vulnerability Scripts' },
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
  if (!TARGET_REGEX.test(target)) return false;
  // Block private ranges being scanned from production — allow localhost and private IPs for local use
  return true;
}

function runNmap(target, args) {
  return new Promise((resolve, reject) => {
    const nmapBin = process.platform === 'win32' ? 'nmap' : 'nmap';
    // Build final args: output flags + profile args + target (target always last, never interpolated into flags)
    const finalArgs = ['-oN', '-', ...args, '--', target];
    const proc = spawn(nmapBin, finalArgs, { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

    proc.on('close', code => {
      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `nmap exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', err => {
      reject(new Error(`Failed to start nmap: ${err.message}. Is nmap installed?`));
    });

    // Hard timeout — kill scan after 5 minutes
    setTimeout(() => {
      proc.kill();
      reject(new Error('Scan timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

router.post('/scan', requireFields(['target']), async (req, res) => {
  const { target, scanType = 'quick' } = req.body;

  if (!validateTarget(target.trim())) {
    return res.status(400).json({ error: 'Invalid target. Must be a valid IP address, CIDR range, or hostname (no special characters).' });
  }

  if (!SCAN_PROFILES[scanType]) {
    return res.status(400).json({ error: `Invalid scanType. Must be one of: ${Object.keys(SCAN_PROFILES).join(', ')}` });
  }

  const profile = SCAN_PROFILES[scanType];

  let rawOutput = '';
  try {
    rawOutput = await runNmap(target.trim(), profile.args);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Claude analysis — non-fatal
  let analysis = { summary: 'Analysis unavailable.', riskLevel: 'unknown', findings: [], recommendations: [] };
  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, `Scan type: ${profile.label}\nTarget: ${target.trim()}\n\nNmap output:\n${rawOutput.slice(0, 8000)}`);
    analysis = JSON.parse(raw);
  } catch {
    // Return raw output even if Claude fails
  }

  res.json({
    target: target.trim(),
    scanType,
    scanLabel: profile.label,
    rawOutput,
    ...analysis,
  });
});

router.get('/scan-types', (req, res) => {
  res.json(Object.entries(SCAN_PROFILES).map(([key, val]) => ({ value: key, label: val.label })));
});

export default router;
