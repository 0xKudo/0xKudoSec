import { Router } from 'express';
import express from 'express';

const router = Router();

function rot13(str) {
  return str.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function hexToStr(hex) {
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return Buffer.from(bytes).toString('utf8');
}

function strToHex(str) {
  return Buffer.from(str, 'utf8').toString('hex');
}

function strToBinary(str) {
  return str.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

function binaryToStr(bin) {
  const clean = bin.trim().replace(/\s+/g, ' ');
  const bytes = clean.split(' ');
  if (bytes.some(b => !/^[01]{8}$/.test(b))) throw new Error('Invalid binary — must be 8-bit groups separated by spaces');
  return bytes.map(b => String.fromCharCode(parseInt(b, 2))).join('');
}

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT — must have 3 parts');
  function decodeSegment(seg) {
    const padded = seg + '='.repeat((4 - seg.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
  }
  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  return { header, payload, signature: parts[2], note: 'Signature not verified — client-side inspection only' };
}

function decodeUnicode(str) {
  // Handle \uXXXX and \UXXXXXXXX and &#xXXXX; and &#DDDDD;
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function encodeUnicode(str) {
  return [...str].map(c => {
    const cp = c.codePointAt(0);
    if (cp > 127) return `\\u${cp.toString(16).padStart(4, '0')}`;
    return c;
  }).join('');
}

const OPERATIONS = {
  // URL
  'url-decode': (input) => decodeURIComponent(input),
  'url-encode': (input) => encodeURIComponent(input),
  'url-encode-full': (input) => [...input].map(c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`).join(''),

  // HTML
  'html-decode': (input) => input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10))),
  'html-encode': (input) => input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'),

  // Base64
  'base64-decode': (input) => Buffer.from(input.trim(), 'base64').toString('utf8'),
  'base64-encode': (input) => Buffer.from(input, 'utf8').toString('base64'),
  'base64url-decode': (input) => Buffer.from(input.trim(), 'base64url').toString('utf8'),
  'base64url-encode': (input) => Buffer.from(input, 'utf8').toString('base64url'),

  // Hex
  'hex-decode': (input) => hexToStr(input),
  'hex-encode': (input) => strToHex(input),

  // Binary
  'binary-decode': (input) => binaryToStr(input),
  'binary-encode': (input) => strToBinary(input),

  // ROT13
  'rot13': (input) => rot13(input),

  // Unicode
  'unicode-decode': (input) => decodeUnicode(input),
  'unicode-encode': (input) => encodeUnicode(input),

  // JWT
  'jwt-decode': (input) => JSON.stringify(decodeJwt(input.trim()), null, 2),
};

// POST /transform
router.post('/transform', express.json({ limit: '50kb' }), (req, res) => {
  const { input, operation } = req.body || {};

  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'input is required' });
  }
  if (!operation || typeof operation !== 'string') {
    return res.status(400).json({ error: 'operation is required' });
  }
  if (!OPERATIONS[operation]) {
    return res.status(400).json({ error: `Unknown operation: ${operation}. Valid: ${Object.keys(OPERATIONS).join(', ')}` });
  }

  try {
    const output = OPERATIONS[operation](input);
    res.json({ output: typeof output === 'string' ? output : JSON.stringify(output, null, 2) });
  } catch (err) {
    res.status(422).json({ error: err.message || 'Transform failed' });
  }
});

// GET /operations — list all available operations
router.get('/operations', (req, res) => {
  res.json({ operations: Object.keys(OPERATIONS) });
});

export default router;
