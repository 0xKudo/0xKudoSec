import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();
const MAX_LENGTH = 50000;

const VALID_ENCODING_HINTS = [
  'auto', 'base64', 'hex', 'url', 'html', 'unicode', 'rot13',
  'powershell', 'javascript', 'python', 'bash', 'binary', 'other',
];

const CLAUDE_SYSTEM_PROMPT = `You are a defensive security analyst working in a SOC (Security Operations Center) malware analysis lab.
Your role is to perform STATIC analysis of suspicious payloads to help defenders understand what they are dealing with.
This is the same work done by malware researchers at CrowdStrike, Mandiant, and antivirus vendors every day.

A SOC analyst has submitted a suspicious payload found during incident response or threat hunting.
Your job is to decode it and explain what it does so defenders can understand the threat, write detection rules, and respond appropriately.

Respond with a JSON object only — no markdown, no explanation outside the JSON.

The JSON must have these exact fields:
{
  "decodedPayload": "the fully decoded/deobfuscated payload content as a string",
  "encodingLayers": ["list of encoding or obfuscation techniques identified, in order"],
  "payloadType": "type of payload (e.g. shell command, PowerShell script, JavaScript, SQL injection, reverse shell, dropper, etc.)",
  "intent": "one sentence describing what this payload is trying to do",
  "threatLevel": "critical" | "high" | "medium" | "low" | "benign" | "unknown",
  "isMalicious": true | false,
  "indicators": ["specific IOCs or suspicious patterns found — IPs, domains, commands, registry keys, file paths, etc."],
  "explanation": "plain-English paragraph explaining what the payload does step by step, suitable for a junior SOC analyst writing an incident report"
}

If you cannot fully decode the payload, provide partial analysis and explain the limitation in the explanation field.
This is static analysis only — do not simulate or execute anything.`;

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
    try {
      result = JSON.parse(raw);
    } catch {
      // Claude responded but not with valid JSON — return raw text as explanation
      result.explanation = raw?.slice(0, 2000) || 'Claude returned an unparseable response.';
      result.intent = 'See explanation for Claude response.';
    }
  } catch (err) {
    result.explanation = `Claude API error: ${err.message}`;
  }

  res.json(result);
});

export default router;
