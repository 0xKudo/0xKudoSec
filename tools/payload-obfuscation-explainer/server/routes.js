import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();
const MAX_LENGTH = 50000;

const VALID_ENCODING_HINTS = [
  'auto', 'base64', 'hex', 'url', 'html', 'unicode', 'rot13',
  'powershell', 'javascript', 'python', 'bash', 'binary', 'other',
];

const CLAUDE_SYSTEM_PROMPT = `You are a malware analyst and reverse engineering expert specializing in payload deobfuscation.
A user has submitted an obfuscated or encoded payload for analysis. Your job is to:
1. Identify the encoding/obfuscation layers
2. Decode and deobfuscate the payload step by step
3. Explain in plain English what the payload does and whether it is malicious

Respond with a JSON object only — no markdown, no explanation outside the JSON.

The JSON must have these exact fields:
{
  "decodedPayload": "the fully decoded/deobfuscated payload content as a string",
  "encodingLayers": ["list of encoding or obfuscation techniques identified, in order"],
  "payloadType": "type of payload (e.g. shell command, PowerShell script, JavaScript, SQL injection, reverse shell, dropper, etc.)",
  "intent": "one sentence describing what this payload is trying to do",
  "threatLevel": "critical" | "high" | "medium" | "low" | "benign" | "unknown",
  "isMalicious": true | false,
  "indicators": ["specific IOCs or suspicious patterns found (IPs, domains, commands, registry keys, etc.)"],
  "explanation": "plain-English paragraph explaining what the payload does step by step, suitable for a junior analyst"
}

If you cannot decode the payload, explain why in the explanation field and set decodedPayload to null.
Never execute or simulate execution of any payload — only analyze statically.`;

router.post('/analyze', requireFields(['payload']), async (req, res) => {
  const { payload, encodingHint = 'auto', context = '' } = req.body;

  if (!payload.trim()) {
    return res.status(400).json({ error: 'payload must not be empty' });
  }
  if (payload.length > MAX_LENGTH) {
    return res.status(400).json({ error: `payload exceeds maximum length of ${MAX_LENGTH} characters` });
  }
  if (!VALID_ENCODING_HINTS.includes(encodingHint)) {
    return res.status(400).json({ error: `Invalid encodingHint. Must be one of: ${VALID_ENCODING_HINTS.join(', ')}` });
  }

  const prompt = [
    encodingHint !== 'auto' ? `Encoding hint: ${encodingHint}` : '',
    context ? `Additional context: ${context}` : '',
    `Payload to analyze:\n${payload}`,
  ].filter(Boolean).join('\n\n');

  let result = {
    decodedPayload: null,
    encodingLayers: [],
    payloadType: 'unknown',
    intent: 'Unable to analyze.',
    threatLevel: 'unknown',
    isMalicious: false,
    indicators: [],
    explanation: 'Analysis unavailable.',
  };

  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, prompt);
    result = JSON.parse(raw);
  } catch {
    // Return default on failure
  }

  res.json(result);
});

export default router;
