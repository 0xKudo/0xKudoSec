import { describe, it, expect } from 'vitest';
import register from '../../electron/tools/subdomain-enum.js';

describe('subdomain-enum main register()', () => {
  it('registers start and cancel invoke handlers', () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    expect(typeof handlers['subdomain-enum:start']).toBe('function');
    expect(typeof handlers['subdomain-enum:cancel']).toBe('function');
  });

  it('start rejects an unauthorized sender', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => false });
    const out = await handlers['subdomain-enum:start']({}, { domain: 'example.com' });
    expect(out.error).toBe('Unauthorized');
  });

  it('start rejects an invalid domain without a runId', async () => {
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    register(ipcMain, { getMainWindow: () => null, isValidSender: () => true });
    const out = await handlers['subdomain-enum:start']({}, { domain: 'not a domain' });
    expect(out.error).toBeTruthy();
    expect(out.runId).toBeUndefined();
  });
});
