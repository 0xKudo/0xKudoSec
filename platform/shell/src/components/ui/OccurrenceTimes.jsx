/**
 * OccurrenceTimes: for a deduplicated alert/event (count > 1), list every
 * recorded occurrence time in chronological order instead of a single timestamp.
 *
 * <OccurrenceTimes times={alert.occurrence_times} count={alert.count} />
 *
 * Renders nothing when there is only one (or zero) recorded occurrence — the
 * single "Time" field already covers that case.
 */

const styles = {
  wrap: { marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' },
  label: {
    fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '8px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '180px', overflowY: 'auto' },
  row: { display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.6 },
  idx: { color: 'var(--text-subtle)', minWidth: '28px', textAlign: 'right' },
  note: { fontSize: '10px', color: 'var(--text-subtle)', marginTop: '6px' },
  count: { fontSize: '10px', color: 'var(--text-subtle)', marginBottom: '4px' },
};

/** Normalize a raw occurrence_times value into sorted (oldest first) Dates. */
export function sortedOccurrences(times) {
  if (!Array.isArray(times)) return [];
  return times
    .map(t => new Date(t))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);
}

/**
 * TimeFieldValue: the contents of an info card's "Time" field.
 *
 * For a deduplicated event (count > 1) this lists EVERY recorded occurrence in
 * chronological order, not just the latest one. Falls back to the single
 * timestamp when there is only one occurrence.
 */
export function TimeFieldValue({ times, count, fallback }) {
  const sorted = sortedOccurrences(times);

  if (sorted.length <= 1) {
    const only = sorted[0];
    return <>{only ? only.toLocaleString() : (fallback || '-')}</>;
  }

  const total = count || sorted.length;
  const capped = total > sorted.length;

  return (
    <div>
      <div style={styles.count}>{total} occurrences</div>
      <div className="kudo-scroll" style={styles.list}>
        {sorted.map((d, i) => (
          <div key={i} style={styles.row}>
            <span style={styles.idx}>{i + 1}.</span>
            <span>{d.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {capped && (
        <div style={styles.note}>Showing the most recent {sorted.length} of {total} occurrences.</div>
      )}
    </div>
  );
}

export function OccurrenceTimes({ times, count }) {
  const sorted = sortedOccurrences(times);
  if (sorted.length <= 1) return null;

  const total = count || sorted.length;
  const capped = total > sorted.length;

  return (
    <div style={styles.wrap}>
      <div style={styles.label}>Occurrences ({total})</div>
      <div className="kudo-scroll" style={styles.list}>
        {sorted.map((d, i) => (
          <div key={i} style={styles.row}>
            <span style={styles.idx}>{i + 1}.</span>
            <span>{d.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {capped && (
        <div style={styles.note}>Showing the most recent {sorted.length} of {total} occurrences.</div>
      )}
    </div>
  );
}
