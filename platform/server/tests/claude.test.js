import { describe, it, expect } from 'vitest';
import { claudeClient } from '../services/claude.js';

describe('claudeClient', () => {
  it('is defined and has a messages property', () => {
    expect(claudeClient).toBeDefined();
    expect(typeof claudeClient.messages).toBe('object');
  });
});
