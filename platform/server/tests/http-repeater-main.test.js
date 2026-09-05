import { describe, it, expect } from 'vitest';
import register from '../../electron/tools/http-repeater.js';

describe('http-repeater main register()', () => {
  it('registers the send invoke handler', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { isValidSender: () => true });
    expect(typeof handlers['http-repeater:send']).toBe('function');
  });

  it('rejects an unauthorized sender without fetching', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { isValidSender: () => false });
    const out = await handlers['http-repeater:send']({}, { method: 'GET', url: 'https://example.com' });
    expect(out.error).toBe('Unauthorized');
  });

  it('rejects an invalid request without fetching', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { isValidSender: () => true });
    const out = await handlers['http-repeater:send']({}, { method: 'BOGUS', url: 'https://example.com' });
    expect(out.error).toBeTruthy();
    expect(out.status).toBeUndefined();
  });
});
