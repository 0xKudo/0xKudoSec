// platform/server/services/correlation/sigmaCondition.js
// A parser for the Sigma detection `condition` grammar. It produces a small AST
// that sigma.js walks into a where-tree. It does NOT resolve selection names or
// field maps — it only understands the boolean structure.
//
// Grammar (Sigma precedence: not > and > or; parentheses group):
//   expr    := orExpr
//   orExpr  := andExpr ( 'or' andExpr )*
//   andExpr := unary  ( 'and' unary )*
//   unary   := 'not' unary | primary
//   primary := '(' expr ')' | ofExpr | IDENT
//   ofExpr  := QUANT 'of' PATTERN         (QUANT = '1' | 'all' | <int>; PATTERN = IDENT with optional trailing '*' | 'them')
//
// AST node shapes:
//   { op: 'and'|'or', nodes: [...] }   flattened same-operator chain
//   { op: 'not', node }
//   { ref: '<name>' }
//   { of: { quant: '1'|'all'|<int>, pattern: '<glob>'|'them' } }
//
// Anything malformed throws SigmaUnsupportedError (imported from sigma.js) so the
// caller reports it with the exact construct, consistent with the rest of the
// converter. Aggregation pipes ("| count() ...") are stripped by sigma.js before
// this parser ever sees the condition.

import { SigmaUnsupportedError } from './sigma.js';

function reject(msg) {
  throw new SigmaUnsupportedError(msg);
}

// Tokenize into keywords, an integer quantifier, parens, and identifiers (which
// may carry a trailing '*' glob). Whitespace separates tokens; parens are their
// own tokens even when adjacent to identifiers.
function tokenize(input) {
  const tokens = [];
  const re = /\s*(\(|\)|[A-Za-z0-9_*.\-]+)/g;
  let m;
  let lastIndex = 0;
  while ((m = re.exec(input)) !== null) {
    if (m.index !== lastIndex) reject(`condition has an unexpected character near "${input.slice(lastIndex)}".`);
    lastIndex = re.lastIndex;
    const raw = m[1];
    const lower = raw.toLowerCase();
    if (raw === '(' || raw === ')') tokens.push({ type: raw });
    else if (lower === 'and' || lower === 'or' || lower === 'not' || lower === 'of' || lower === 'them') {
      tokens.push({ type: lower });
    } else if (/^\d+$/.test(raw)) tokens.push({ type: 'int', value: Number(raw) });
    else tokens.push({ type: 'ident', value: raw });
  }
  if (lastIndex !== input.length && input.slice(lastIndex).trim() !== '') {
    reject(`condition has an unexpected character near "${input.slice(lastIndex)}".`);
  }
  return tokens;
}

export function parseCondition(condition) {
  const text = String(condition == null ? '' : condition).trim();
  if (!text) reject('detection has an empty condition.');
  const tokens = tokenize(text);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const t = next();
    if (!t || t.type !== type) reject(`condition is malformed (expected "${type}").`);
    return t;
  };

  function parseExpr() { return parseOr(); }

  function parseOr() {
    const nodes = [parseAnd()];
    while (peek() && peek().type === 'or') { next(); nodes.push(parseAnd()); }
    return nodes.length === 1 ? nodes[0] : { op: 'or', nodes };
  }

  function parseAnd() {
    const nodes = [parseUnary()];
    while (peek() && peek().type === 'and') { next(); nodes.push(parseUnary()); }
    return nodes.length === 1 ? nodes[0] : { op: 'and', nodes };
  }

  function parseUnary() {
    if (peek() && peek().type === 'not') { next(); return { op: 'not', node: parseUnary() }; }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) reject('condition ended unexpectedly.');
    if (t.type === '(') {
      next();
      const inner = parseExpr();
      expect(')');
      return inner;
    }
    // Quantified "of" expressions. '<int> of X' arrives as an int token; 'all of
    // X' as an ident whose value is "all" (not a reserved keyword).
    if (t.type === 'int') {
      next();
      expect('of');
      // '1 of' is the canonical "any" quantifier and is kept as the string '1';
      // other counts stay numeric ('N of them').
      const quant = t.value === 1 ? '1' : t.value;
      return { of: { quant, pattern: parsePattern() } };
    }
    if (t.type === 'ident') {
      if (t.value.toLowerCase() === 'all' && tokens[pos + 1] && tokens[pos + 1].type === 'of') {
        next(); // all
        next(); // of
        return { of: { quant: 'all', pattern: parsePattern() } };
      }
      next();
      return { ref: t.value };
    }
    reject(`condition has an unexpected token "${t.type}".`);
  }

  function parsePattern() {
    const t = next();
    if (!t) reject('condition "of" is missing its pattern.');
    if (t.type === 'them') return 'them';
    if (t.type === 'ident') return t.value;
    reject('condition "of" must be followed by a selection pattern or "them".');
  }

  const ast = parseExpr();
  if (pos !== tokens.length) reject('condition has trailing tokens after a complete expression.');
  return ast;
}
