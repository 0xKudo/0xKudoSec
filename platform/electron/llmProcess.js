/**
 * llmProcess.js — Isolated node-llama-cpp inference worker
 *
 * Runs as a child process spawned by llmWorker.js via child_process.fork().
 * Communicates via process.send() / process.on('message').
 * Crashes here do not take down the Electron main process.
 *
 * Messages in:  { type: 'analyze', modelPath, candidates }
 * Messages out: { type: 'result', id, explanation, cve_safe, cve_note, error }
 *               { type: 'log', level, msg }
 *               { type: 'done' }
 *               { type: 'error', msg }
 */

'use strict';

const https = require('https');
const http = require('http');

function log(level, ...args) {
  process.send({ type: 'log', level, msg: args.join(' ') });
}

async function fetchContext(candidate) {
  const serverUrl = process.env.LLM_SERVER_URL;
  const token = process.env.LLM_AUTH_TOKEN;
  if (!serverUrl || !token) return null;

  const sig = typeof candidate.field_signature === 'object'
    ? candidate.field_signature
    : JSON.parse(candidate.field_signature);

  const params = new URLSearchParams();
  if (sig.event_category) params.set('event_category', sig.event_category);
  if (sig.source) params.set('source', sig.source);
  if (sig.process_name) params.set('process_name', sig.process_name);

  return new Promise((resolve) => {
    const url = `${serverUrl}/api/siem/noise/context?${params.toString()}`;
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

function formatContext(context) {
  if (!context) return '';
  const { decisions = [], suppressionRules = [] } = context;
  if (!decisions.length && !suppressionRules.length) return '';

  const lines = ['Past analyst decisions for similar patterns:'];

  for (const d of decisions) {
    const action = d.decision === 'approved' ? 'APPROVED (safe to suppress)' : 'REJECTED (keep monitoring)';
    lines.push(`- ${d.pattern} → ${action}`);
    if (d.override && d.analyst_note) lines.push(`  [Analyst override] "${d.analyst_note}"`);
    else if (d.llm_explanation) lines.push(`  Reason: ${d.llm_explanation}`);
  }

  if (suppressionRules.length) {
    lines.push('Active suppression rules for similar patterns:');
    for (const r of suppressionRules) {
      lines.push(`- ${r.name}${r.description ? `: ${r.description}` : ''}`);
    }
  }

  return lines.join('\n');
}

function buildPrompt(candidate, contextText) {
  const sig = typeof candidate.field_signature === 'string'
    ? candidate.field_signature
    : JSON.stringify(candidate.field_signature, null, 2);

  const contextSection = contextText
    ? `\n\n${contextText}\n\nUse the above analyst decisions to inform your analysis.`
    : '';

  return `<|system|>
You are a security analyst assistant.${contextSection}<|end|>
<|user|>
Analyze this SIEM event pattern and answer two questions:

Pattern: ${sig}
Frequency: ${candidate.daily_avg || 0} events/day over ${candidate.days || 7} days
No analyst action taken in this period.

1. Is this likely noise? Give a one-sentence explanation.
2. Does this pattern match any known CVE or active attack technique?
   If yes, name the CVE or technique and explain why suppression would be dangerous.
   If no, say "No known CVE match - safe to suppress."

Respond ONLY in JSON with this exact structure:
{"explanation": "...", "cve_safe": true, "cve_note": "..."}<|end|>
<|assistant|>`;
}

function parseResponse(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  // Find the first complete JSON object — non-greedy to avoid matching continuation text
  const match = cleaned.match(/\{[^{}]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : cleaned.slice(0, 500),
        cve_safe: parsed.cve_safe !== false,
        cve_note: typeof parsed.cve_note === 'string' ? parsed.cve_note.trim() : '',
      };
    } catch (_) {}
  }
  // Greedy fallback — try full match in case explanation contains nested text
  const greedyMatch = cleaned.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try {
      const parsed = JSON.parse(greedyMatch[0]);
      return {
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : cleaned.slice(0, 500),
        cve_safe: parsed.cve_safe !== false,
        cve_note: typeof parsed.cve_note === 'string' ? parsed.cve_note.trim() : '',
      };
    } catch (_) {}
  }
  return { explanation: cleaned.slice(0, 500), cve_safe: true, cve_note: '' };
}

process.on('message', async ({ type, modelPath, candidates }) => {
  if (type !== 'analyze') return;

  let getLlama, LlamaCompletion;
  try {
    ({ getLlama, LlamaCompletion } = await import('node-llama-cpp'));
  } catch (e) {
    process.send({ type: 'error', msg: `node-llama-cpp failed to load: ${e.message}` });
    process.exit(1);
  }

  let llama, model;
  try {
    log('INFO', 'Loading model:', modelPath);
    llama = await getLlama({ gpu: 'cuda' });
    model = await llama.loadModel({ modelPath });
    log('INFO', 'Model loaded');
  } catch (e) {
    process.send({ type: 'error', msg: `Failed to load model: ${e.message}` });
    process.exit(1);
  }

  for (const candidate of candidates) {
    let context;
    try {
      log('INFO', 'Analyzing candidate:', candidate.id);
      const analystContext = await fetchContext(candidate);
      const contextText = formatContext(analystContext);
      if (contextText) log('INFO', 'Injecting analyst context:', contextText.slice(0, 200));
      context = await model.createContext({ contextSize: 2048 });
      const sequence = context.getSequence();
      const completion = new LlamaCompletion({ contextSequence: sequence });
      const prompt = buildPrompt(candidate, contextText);
      log('INFO', 'Calling generateCompletion');
      const responseText = await completion.generateCompletion(prompt, {
        maxTokens: 256,
        customStopTriggers: ['<|end|>', '<|user|>', '<|system|>'],
      });
      log('INFO', 'Response:', responseText);
      const parsed = parseResponse(responseText);
      process.send({ type: 'result', id: candidate.id, ...parsed, error: null });
    } catch (e) {
      log('ERROR', 'Candidate error:', e.message);
      process.send({ type: 'result', id: candidate.id, explanation: e.message, cve_safe: true, cve_note: '', error: e.message });
    } finally {
      try { await context?.dispose(); } catch (_) {}
    }
  }

  try { await model?.dispose(); } catch (_) {}
  try { await llama?.dispose(); } catch (_) {}

  process.send({ type: 'done' });
  process.exit(0);
});
