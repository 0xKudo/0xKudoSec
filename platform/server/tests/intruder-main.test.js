import { describe, it, expect } from 'vitest';
import register from '../../electron/tools/intruder.js';

describe('intruder main register()', () => {
  it('registers start and cancel invoke handlers', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    expect(typeof handlers['intruder:start']).toBe('function');
    expect(typeof handlers['intruder:cancel']).toBe('function');
  });

  it('start rejects an unauthorized sender', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => false });
    const out = await handlers['intruder:start']({}, { method: 'GET', urlTemplate: 'https://x/?q=§a§', payloads: ['a'] });
    expect(out.error).toBe('Unauthorized');
  });

  it('start rejects an invalid config without a runId', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    const out = await handlers['intruder:start']({}, { method: 'GET', urlTemplate: 'https://x/no-marker', payloads: ['a'] });
    expect(out.error).toBeTruthy();
    expect(out.runId).toBeUndefined();
  });
});
