// platform/server/services/correlation/ahoCorasick.js
// Aho-Corasick multi-pattern substring search (XDR Sigma catalog Phase D2).
//
// buildAhoCorasick(patterns) compiles a set of needle strings into an automaton;
// automaton.search(text) returns the SET of pattern INDICES whose needle occurs as
// a substring of text, in a single O(|text| + matches) pass regardless of how many
// patterns there are. The matcher uses one automaton per (field, case-mode) so a
// single scan of a field value tests thousands of `contains`/`eq` predicates.
//
// Indices (not the strings) are returned so the caller maps each hit to its rule(s);
// duplicate patterns therefore each get their own index and both fire.

// Build the trie + failure links. Nodes are plain objects with a Map of children.
export function buildAhoCorasick(patterns) {
  const root = { children: new Map(), fail: null, out: [] };

  patterns.forEach((pat, idx) => {
    if (typeof pat !== 'string' || pat.length === 0) return; // empty needle matches nothing useful
    let node = root;
    for (const ch of pat) {
      let next = node.children.get(ch);
      if (!next) { next = { children: new Map(), fail: null, out: [] }; node.children.set(ch, next); }
      node = next;
    }
    node.out.push(idx);
  });

  // BFS to set failure links and merge outputs along them.
  const queue = [];
  for (const child of root.children.values()) { child.fail = root; queue.push(child); }
  while (queue.length) {
    const node = queue.shift();
    for (const [ch, child] of node.children) {
      let f = node.fail;
      while (f && !f.children.has(ch)) f = f.fail;
      child.fail = f ? f.children.get(ch) : root;
      if (!child.fail) child.fail = root;
      // Merge the fail node's outputs so a match at `child` also reports suffixes.
      if (child.fail.out.length) child.out = child.out.concat(child.fail.out);
      queue.push(child);
    }
  }

  return {
    search(text) {
      const hits = new Set();
      if (typeof text !== 'string' || text.length === 0) return hits;
      let node = root;
      for (const ch of text) {
        while (node !== root && !node.children.has(ch)) node = node.fail;
        node = node.children.get(ch) || root;
        if (node.out.length) for (const idx of node.out) hits.add(idx);
      }
      return hits;
    },
  };
}
