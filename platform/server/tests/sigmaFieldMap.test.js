import { describe, it, expect } from 'vitest';
import { resolveField, mapSigmaField } from '../services/correlation/sigmaFieldMap.js';

describe('resolveField — two-tier resolution', () => {
  it('resolves a mapped field to a first-class column', () => {
    expect(resolveField('TargetFilename')).toEqual({ kind: 'column', field: 'file_path' });
    expect(resolveField('Image')).toEqual({ kind: 'column', field: 'process_name' });
  });

  it('falls back to a raw accessor for an unmapped but valid field name', () => {
    expect(resolveField('ScriptBlockText')).toEqual({ kind: 'raw', name: 'ScriptBlockText' });
    expect(resolveField('Hashes')).toEqual({ kind: 'raw', name: 'Hashes' });
    expect(resolveField('Provider.Name-1')).toEqual({ kind: 'raw', name: 'Provider.Name-1' });
  });

  it('returns null for an invalid identifier (no SQL-unsafe field names)', () => {
    expect(resolveField('bad name!')).toBeNull();
    expect(resolveField("x'; DROP")).toBeNull();
    expect(resolveField('')).toBeNull();
  });

  it('mapSigmaField still returns the mapped key or null (backward compat)', () => {
    expect(mapSigmaField('Image')).toBe('process_name');
    expect(mapSigmaField('ScriptBlockText')).toBeNull();
  });
});
