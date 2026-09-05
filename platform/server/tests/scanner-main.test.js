import { describe, it, expect } from 'vitest';
import register from '../../electron/tools/scanner.js';

describe('vuln-scanner main register()', () => {
  it('registers start and cancel invoke handlers', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    expect(typeof handlers['vuln-scanner:start']).toBe('function');
    expect(typeof handlers['vuln-scanner:cancel']).toBe('function');
  });

  it('start rejects an unauthorized sender', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => false });
    const out = await handlers['vuln-scanner:start']({}, { url: 'https://x.com' });
    expect(out.error).toBe('Unauthorized');
  });

  it('start rejects active mode without authorization and does not fetch', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    const out = await handlers['vuln-scanner:start']({}, { url: 'https://x.com', activeMode: true, authorized: false });
    expect(out.error).toBeTruthy();
    expect(out.runId).toBeUndefined();
  });
});
