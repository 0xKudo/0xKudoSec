import { Router } from 'express';
import express from 'express';

const router = Router();

const MAX_PREVIEW = 100;
const IS_LOCAL = process.env.NODE_ENV !== 'production';
const MAX_DOWNLOAD = IS_LOCAL ? Infinity : 1_000_000;
const MAX_LENGTH = IS_LOCAL ? 32 : 16;
const MIN_LENGTH = 1;

const CHAR_SETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const LEET_MAP = {
  a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', b: '8', g: '9',
};

function randomWord(charset, length) {
  let word = '';
  for (let i = 0; i < length; i++) {
    word += charset[Math.floor(Math.random() * charset.length)];
  }
  return word;
}

function cartesianProduct(charset, length) {
  const total = Math.pow(charset.length, length);

  // If exhaustive enumeration fits within download limit, do it exactly
  if (total <= MAX_DOWNLOAD) {
    const results = [];
    for (let i = 0; i < total; i++) {
      let n = i;
      let word = '';
      for (let j = 0; j < length; j++) {
        word = charset[n % charset.length] + word;
        n = Math.floor(n / charset.length);
      }
      results.push(word);
    }
    return { words: results, sampled: false };
  }

  // Otherwise random sample up to MAX_PREVIEW for preview, MAX_DOWNLOAD for download
  const sampleLimit = MAX_DOWNLOAD;
  const seen = new Set();
  const results = [];
  const attempts = sampleLimit * 3;
  for (let i = 0; i < attempts && results.length < sampleLimit; i++) {
    const w = randomWord(charset, length);
    if (!seen.has(w)) {
      seen.add(w);
      results.push(w);
    }
  }
  return { words: results, sampled: true };
}

// Also remove old MAX_ENTRIES references in pattern route
const MAX_ENTRIES = 10000; // kept for pattern generator only

function applyLeet(word) {
  return word.split('').map(c => LEET_MAP[c.toLowerCase()] || c).join('');
}

function generatePatternVariants(baseWords, rules, yearStart, yearEnd, symbols) {
  const results = new Set();
  const symList = symbols || '!@#$';
  const symChars = symList.split('');

  for (const base of baseWords) {
    const w = base.trim();
    if (!w) continue;
    const wLower = w.toLowerCase();
    const wUpper = w.toUpperCase();
    const wCapital = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    const wLeet = applyLeet(wLower);

    if (rules.includes('base')) {
      results.add(w);
      results.add(wLower);
      results.add(wUpper);
      results.add(wCapital);
    }

    if (rules.includes('leet')) {
      results.add(wLeet);
      results.add(wLeet.charAt(0).toUpperCase() + wLeet.slice(1));
    }

    if (rules.includes('digits')) {
      for (let d = 0; d <= 99; d++) {
        const n = String(d).padStart(2, '0');
        results.add(wLower + n);
        results.add(wCapital + n);
        results.add(n + wLower);
      }
      for (let d = 0; d <= 9; d++) {
        results.add(wLower + d);
        results.add(wCapital + d);
      }
    }

    if (rules.includes('years')) {
      const y1 = Math.max(1970, Math.min(2030, parseInt(yearStart) || 2020));
      const y2 = Math.max(y1, Math.min(2030, parseInt(yearEnd) || 2024));
      for (let y = y1; y <= y2; y++) {
        results.add(wLower + y);
        results.add(wCapital + y);
        results.add(wUpper + y);
        if (rules.includes('leet')) results.add(wLeet + y);
        // short year
        const short = String(y).slice(2);
        results.add(wLower + short);
        results.add(wCapital + short);
      }
    }

    if (rules.includes('symbols')) {
      for (const sym of symChars) {
        results.add(wLower + sym);
        results.add(wCapital + sym);
        if (rules.includes('digits')) {
          for (let d = 0; d <= 9; d++) {
            results.add(wCapital + d + sym);
            results.add(wCapital + sym + d);
          }
        }
        if (rules.includes('years')) {
          const y1 = Math.max(1970, Math.min(2030, parseInt(yearStart) || 2020));
          const y2 = Math.max(y1, Math.min(2030, parseInt(yearEnd) || 2024));
          for (let y = y1; y <= y2; y++) {
            results.add(wCapital + y + sym);
            results.add(wCapital + sym + y);
          }
        }
      }
    }

    if (results.size >= MAX_ENTRIES) break;
  }

  return [...results].slice(0, MAX_ENTRIES);
}

function buildCharset(charsets, customChars) {
  let charset = '';
  for (const cs of charsets) {
    if (CHAR_SETS[cs]) charset += CHAR_SETS[cs];
  }
  if (charsets.includes('custom') && customChars) {
    charset += customChars.slice(0, 50);
  }
  return [...new Set(charset.split(''))].join('');
}

function validateCharsetRequest(body) {
  const { charsets, minLength, maxLength } = body || {};
  if (!Array.isArray(charsets) || charsets.length === 0) {
    return 'charsets must be a non-empty array';
  }
  if (minLength === undefined || minLength === null || maxLength === undefined || maxLength === null) {
    return 'minLength and maxLength are required';
  }
  const min = parseInt(minLength);
  const max = parseInt(maxLength);
  if (isNaN(min) || isNaN(max) || min < MIN_LENGTH || max > MAX_LENGTH || min > max) {
    return `minLength and maxLength must be between ${MIN_LENGTH} and ${MAX_LENGTH}, min <= max`;
  }
  return null;
}

// POST /charset/preview — returns first 100 entries as JSON for UI display
router.post('/charset/preview', express.json({ limit: '10kb' }), (req, res) => {
  const err = validateCharsetRequest(req.body);
  if (err) return res.status(400).json({ error: err });

  const { charsets, customChars, minLength, maxLength } = req.body;
  const charset = buildCharset(charsets, customChars);
  if (!charset) return res.status(400).json({ error: 'No valid characters in selected charsets' });

  const min = parseInt(minLength);
  const max = parseInt(maxLength);
  const preview = [];

  for (let len = min; len <= max && preview.length < MAX_PREVIEW; len++) {
    const { words } = cartesianProduct(charset, len);
    for (const w of words) {
      preview.push(w);
      if (preview.length >= MAX_PREVIEW) break;
    }
  }

  // Estimate total count
  const ESTIMATE_CAP = 1_000_000_000; // cap estimate display at 1B regardless
  let estimated = 0;
  for (let len = min; len <= max; len++) {
    estimated += Math.pow(charset.length, len);
    if (estimated > ESTIMATE_CAP) { estimated = ESTIMATE_CAP; break; }
  }
  const capped = !IS_LOCAL && estimated >= MAX_DOWNLOAD;

  res.json({ preview, estimated: Math.floor(estimated), capped, isLocal: IS_LOCAL });
});

// POST /charset/download — streams full wordlist as .txt file (no buffering)
router.post('/charset/download', express.json({ limit: '10kb' }), (req, res) => {
  const err = validateCharsetRequest(req.body);
  if (err) return res.status(400).json({ error: err });

  const { charsets, customChars, minLength, maxLength } = req.body;
  const charset = buildCharset(charsets, customChars);
  if (!charset) return res.status(400).json({ error: 'No valid characters in selected charsets' });

  const min = parseInt(minLength);
  const max = parseInt(maxLength);
  const charLen = charset.length;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wordlist.txt"');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  let count = 0;
  let done = false;
  const CHUNK_SIZE = 1000; // write in batches to keep memory low

  for (let len = min; len <= max && !done; len++) {
    const total = Math.pow(charLen, len);
    let buf = '';

    for (let i = 0; i < total && !done; i++) {
      let n = i;
      let word = '';
      for (let j = 0; j < len; j++) {
        word = charset[n % charLen] + word;
        n = Math.floor(n / charLen);
      }
      buf += word + '\n';
      count++;

      if (count % CHUNK_SIZE === 0) {
        res.write(buf);
        buf = '';
      }
      if (count >= MAX_DOWNLOAD) done = true;
    }

    if (buf) res.write(buf); // flush remaining
  }

  res.end();
});

// POST /pattern — generate from base words + rules
router.post('/pattern', express.json({ limit: '10kb' }), (req, res) => {
  const { baseWords, rules, yearStart, yearEnd, symbols } = req.body || {};

  if (!Array.isArray(baseWords) || baseWords.length === 0) {
    return res.status(400).json({ error: 'baseWords must be a non-empty array' });
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: 'rules must be a non-empty array' });
  }

  const validRules = ['base', 'leet', 'digits', 'years', 'symbols'];
  for (const r of rules) {
    if (!validRules.includes(r)) {
      return res.status(400).json({ error: `Invalid rule: ${r}. Valid rules: ${validRules.join(', ')}` });
    }
  }

  if (baseWords.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 base words allowed' });
  }

  const wordlist = generatePatternVariants(baseWords, rules, yearStart, yearEnd, symbols);

  res.json({
    wordlist,
    count: wordlist.length,
    truncated: wordlist.length >= MAX_ENTRIES,
  });
});

export default router;
