import { describe, it, expect } from 'vitest';
import register from '../../electron/tools/network-scanner.js';

describe('network-scanner main register()', () => {
  it('registers start and cancel invoke handlers', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    expect(typeof handlers['network-scanner:start']).toBe('function');
    expect(typeof handlers['network-scanner:cancel']).toBe('function');
  });

  it('start rejects an invalid target without spawning', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    const out = await handlers['network-scanner:start']({}, 'a; rm -rf /', 'quick');
    expect(out.error).toBeTruthy();
    expect(out.runId).toBeUndefined();
  });

  it('start rejects an unauthorized sender', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => false });
    const out = await handlers['network-scanner:start']({}, '10.0.0.1', 'quick');
    expect(out.error).toBe('Unauthorized');
  });
});
