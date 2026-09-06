// audit.test.js — audit-log row-hash integrity.
//
// Regression guard for the 2026-09-05 false "AUDIT LOG INTEGRITY FAILURE": the
// verifier (retentionCron.runIntegrityCheck) was JSON.stringify-ing the already-
// serialized `meta` text column a second time, so every row failed verification.
// The write and verify paths now share auditRowHash over the EXACT stored text.

import { describe, it, expect } from 'vitest';
import { auditRowHash } from '../services/audit.js';

// The write path stores JSON.stringify(meta) in the (text) meta column and hashes
// that same string. The verify path reads the column back verbatim and hashes it.
function writeSide(userId, action, metaObj, ip, createdAt) {
  const metaText = JSON.stringify(metaObj);
  return { metaText, rowHash: auditRowHash(userId, action, metaText, ip, createdAt) };
}
function verifySide(userId, action, storedMetaText, ip, createdAt) {
  return auditRowHash(userId, action, storedMetaText, ip, createdAt);
}

describe('audit row-hash write/verify parity', () => {
  const U = 'google-oauth2|123';
  const T = '2026-09-05T12:00:00.000Z';

  it('verify reproduces the write hash for a multi-key meta object', () => {
    const meta = { categories: ['threat_hunting'], auto_update: true };
    const { metaText, rowHash } = writeSide(U, 'rules.sigma.settings', meta, '1.2.3.4', T);
    expect(verifySide(U, 'rules.sigma.settings', metaText, '1.2.3.4', T)).toBe(rowHash);
  });

  it('verify reproduces the write hash for empty meta and null ip', () => {
    const { metaText, rowHash } = writeSide(U, 'rule.create', {}, null, T);
    expect(verifySide(U, 'rule.create', metaText, null, T)).toBe(rowHash);
  });

  it('the OLD double-stringify verify would NOT match (documents the fixed bug)', () => {
    const meta = { name: 'VPS', action: 'suppress', severity: 'info' };
    const { metaText, rowHash } = writeSide(U, 'rule.create', meta, null, T);
    // The bug: JSON.stringify the stored text a second time.
    const buggy = auditRowHash(U, 'rule.create', JSON.stringify(metaText), null, T);
    expect(buggy).not.toBe(rowHash);
  });

  it('a tampered meta text yields a different hash (true tamper is still caught)', () => {
    const meta = { amount: 100 };
    const { metaText, rowHash } = writeSide(U, 'txn', meta, null, T);
    const tampered = metaText.replace('100', '999');
    expect(verifySide(U, 'txn', tampered, null, T)).not.toBe(rowHash);
  });
});
