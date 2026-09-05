// Catalog-wide Sigma coverage measurement (Sigma Full Coverage, cross-cutting).
//
// Opt-in: runs only when SIGMA_COVERAGE=1 and SIGMA_ARCHIVE points at a local
// SigmaHQ .tar.gz (no network in CI). It runs every rule through sigmaToRule,
// tallies exact / approximate / rejected and the per-reject-bucket breakdown,
// prints the table, and asserts a floor on the supported rate.
//
// Usage:
//   curl -L https://github.com/SigmaHQ/sigma/archive/refs/tags/r2026-07-01.tar.gz -o /tmp/sigma.tar.gz
//   SIGMA_COVERAGE=1 SIGMA_ARCHIVE=/tmp/sigma.tar.gz npx vitest run tests/sigmaCoverage.test.js

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import zlib from 'zlib';
import tarStream from 'tar-stream';
import { classifyEntry, entryToRow, summarize } from '../services/sigmaCron.js';

const ENABLED = process.env.SIGMA_COVERAGE === '1' && !!process.env.SIGMA_ARCHIVE;

async function readArchive(path) {
  const gunzip = zlib.createGunzip();
  const extract = tarStream.extract();
  const entries = [];
  const done = new Promise((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const classification = header.type === 'file' ? classifyEntry(header.name) : null;
      if (!classification) { stream.resume(); stream.on('end', next); return; }
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('end', () => { entries.push({ classification, content: Buffer.concat(chunks).toString('utf8') }); next(); });
      stream.on('error', reject);
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
  });
  fs.createReadStream(path).pipe(gunzip).pipe(extract);
  await done;
  return entries;
}

describe.runIf(ENABLED)('SigmaHQ catalog coverage', () => {
  it('measures supported rate and fidelity across the whole catalog', async () => {
    const entries = await readArchive(process.env.SIGMA_ARCHIVE);
    const rows = entries.map((e) => entryToRow(e.classification, e.content, 'coverage'));
    const summary = summarize(rows);
    const supportedRate = summary.converted / summary.total;

    // Human-readable breakdown for the run log / commit body.
    // eslint-disable-next-line no-console
    console.log('[sigma coverage]', JSON.stringify({
      total: summary.total,
      converted: summary.converted,
      rejected: summary.rejected,
      supported_rate: Number(supportedRate.toFixed(4)),
      fidelity: summary.fidelity,
      reject_reasons: summary.reject_reasons,
    }, null, 2));

    expect(summary.total).toBeGreaterThan(1000);
    // Floor: measured 0.961 on tag r2026-07-01 (up from 0.083 pre-effort). Guard
    // against regressions with a 0.90 floor; raise if a later tag measures higher.
    expect(supportedRate).toBeGreaterThanOrEqual(0.9);
  }, 120000);
});
