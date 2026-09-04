const fs = require('fs');
const { execSync } = require('child_process');

const TARGET_REGEX = /^[a-zA-Z0-9.\-/]+$/;
const MAX_TARGET_LENGTH = 100;

const SCAN_PROFILES = {
  ping:    { args: ['-sn'],                        label: 'Ping Scan (host discovery only)' },
  quick:   { args: ['-T4', '-F'],                  label: 'Quick Scan (top 100 ports)' },
  full:    { args: ['-T4', '-p-'],                 label: 'Full Port Scan (all 65535 ports)' },
  service: { args: ['-T4', '-sV', '-F'],           label: 'Service Version Detection' },
  os:      { args: ['-T4', '-O', '-F'],            label: 'OS Detection' },
  vuln:    { args: ['-T4', '--script=vuln', '-F'], label: 'Vulnerability Scripts' },
};

function validateTarget(target) {
  if (!target || typeof target !== 'string') return false;
  if (target.length > MAX_TARGET_LENGTH) return false;
  return TARGET_REGEX.test(target);
}

function buildNmapArgs(target, scanType) {
  const t = (target || '').trim();
  if (!validateTarget(t)) throw new Error('Invalid target.');
  const profile = SCAN_PROFILES[scanType];
  if (!profile) throw new Error('Invalid scanType.');
  return ['-oN', '-', ...profile.args, '--', t];
}

function resolveNmapPath() {
  // 1. On PATH
  try {
    const cmd = process.platform === 'win32' ? 'where nmap' : 'which nmap';
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch { /* not on PATH */ }
  // 2. Common install dirs
  if (process.platform === 'win32') {
    const candidates = [];
    for (const drive of ['C', 'D', 'E']) {
      candidates.push(`${drive}:\\Program Files\\Nmap\\nmap.exe`);
      candidates.push(`${drive}:\\Program Files (x86)\\Nmap\\nmap.exe`);
    }
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
  } else {
    for (const c of ['/usr/bin/nmap', '/usr/local/bin/nmap', '/opt/homebrew/bin/nmap']) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

module.exports = { SCAN_PROFILES, validateTarget, buildNmapArgs, resolveNmapPath };
