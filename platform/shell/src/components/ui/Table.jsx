/**
 * Table — consistent data table styling with a horizontal-scroll wrapper.
 * Tools supply their own <thead>/<tbody> markup; the .kudo-table class styles
 * th/td (sticky header, row hover, ellipsis). Add className="flagged" on a <tr>
 * to highlight it.
 *
 *   <Table>
 *     <thead><tr><th>Name</th>…</tr></thead>
 *     <tbody>{rows.map(r => <tr key={r.id}><td>{r.name}</td>…</tr>)}</tbody>
 *   </Table>
 */
export function Table({ children, className = '', wrapStyle, ...rest }) {
  return (
    <div className="kudo-table-wrap" style={wrapStyle}>
      <table className={`kudo-table ${className}`.trim()} {...rest}>
        {children}
      </table>
    </div>
  );
}
