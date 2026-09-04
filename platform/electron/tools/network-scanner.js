const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const core = require('./network-scanner-core.js');

const SCAN_TIMEOUT_MS = 5 * 60 * 1000;
const active = new Map(); // runId -> { proc, timeout }

function register(ipcMain, { getMainWindow, isValidSender }) {
  function emit(channel, payload) {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  ipcMain.handle('network-scanner:start', async (event, target, scanType) => {
    if (isValidSender && !isValidSender(event)) return { error: 'Unauthorized' };

    let args;
    try {
      args = core.buildNmapArgs(target, scanType);
    } catch (e) {
      return { error: e.message };
    }

    const nmapPath = core.resolveNmapPath();
    if (!nmapPath) return { error: 'nmap is not installed. Install it from the Network Scanner panel.' };

    const runId = randomUUID();
    const profile = core.SCAN_PROFILES[scanType];
    const cleanTarget = String(target).trim();
    let fullOutput = '';

    const proc = spawn(nmapPath, args, { shell: false });

    const timeout = setTimeout(() => {
      const entry = active.get(runId);
      if (entry) {
        entry.proc.kill();
        active.delete(runId);
        emit('network-scanner:error', { runId, error: 'Scan timed out after 5 minutes.' });
      }
    }, SCAN_TIMEOUT_MS);

    active.set(runId, { proc, timeout });

    proc.stdout.on('data', chunk => {
      const text = chunk.toString();
      fullOutput += text;
      text.split('\n').forEach(line => { if (line.trim()) emit('network-scanner:line', { runId, line }); });
    });
    proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) emit('network-scanner:line', { runId, line: text });
    });
    proc.on('error', err => {
      clearTimeout(timeout);
      active.delete(runId);
      emit('network-scanner:error', { runId, error: `Failed to start nmap: ${err.message}` });
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timeout);
      active.delete(runId);
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return; // cancel path already messaged
      if (code !== 0 && !fullOutput) {
        emit('network-scanner:error', { runId, error: `nmap exited with code ${code}` });
        return;
      }
      emit('network-scanner:done', {
        runId, target: cleanTarget, scanType, scanLabel: profile.label, rawOutput: fullOutput,
      });
    });

    return { runId };
  });

  ipcMain.handle('network-scanner:cancel', async (event, runId) => {
    if (isValidSender && !isValidSender(event)) return { ok: false };
    const entry = active.get(runId);
    if (entry) {
      clearTimeout(entry.timeout);
      entry.proc.kill();
      active.delete(runId);
      emit('network-scanner:error', { runId, error: 'Scan stopped.' });
      return { ok: true };
    }
    return { ok: false };
  });
}

module.exports = register;
module.exports.register = register;
