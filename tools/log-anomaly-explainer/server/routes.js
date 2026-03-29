import { Router } from 'express';
import express from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';
import multer from 'multer';

const router = Router();
const MAX_LENGTH = 200000;

const VALID_LOG_SOURCES = [
  'auto', 'syslog', 'auth', 'apache', 'nginx', 'windows-event',
  'application', 'docker', 'kubernetes', 'database', 'other',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 },
});

const CLAUDE_SYSTEM_PROMPT = `You are a senior SOC analyst and log analysis expert.
A user has submitted log data and wants you to identify anomalies, explain them in plain English, and recommend actions.
Respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "summary": "2-3 sentence overview of what the logs show and whether anomalies were found",
  "severityLevel": "critical" | "high" | "medium" | "low" | "clean",
  "anomalies": [
    {
      "title": "short name for this anomaly",
      "explanation": "plain-English explanation of what this anomaly means and why it is concerning",
      "severity": "critical" | "high" | "medium" | "low",
      "lineRefs": ["relevant log lines or patterns that triggered this finding"]
    }
  ],
  "recommendations": ["actionable next steps based on the anomalies found"]
}

If no anomalies are found, return an empty anomalies array and severityLevel of "clean".`;

function detectLogSource(logText) {
  if (/sshd\[|Failed password|Accepted password|Invalid user/i.test(logText)) return 'auth';
  if (/apache|nginx|GET \/|POST \/|HTTP\/[12]/i.test(logText)) return 'apache';
  if (/EventID|Windows|Security|Application|System.*Event/i.test(logText)) return 'windows-event';
  if (/container|pod|kubectl|k8s/i.test(logText)) return 'kubernetes';
  if (/docker/i.test(logText)) return 'docker';
  if (/mysql|postgres|ora-\d{5}|sql/i.test(logText)) return 'database';
  if (/kernel:|systemd\[|sudo\[/i.test(logText)) return 'syslog';
  return 'other';
}

async function analyzeLog(logText, logSource) {
  const resolvedSource = logSource === 'auto' ? detectLogSource(logText) : logSource;
  const prompt = `Log source: ${resolvedSource}\n\nLog data:\n${logText.slice(0, MAX_LENGTH)}`;

  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, prompt);
    const analysis = JSON.parse(raw);
    return { ...analysis, logSource: resolvedSource };
  } catch {
    return {
      summary: 'Analysis unavailable.',
      severityLevel: 'unknown',
      anomalies: [],
      recommendations: [],
      logSource: resolvedSource,
    };
  }
}

router.post('/analyze', express.json({ limit: '250kb' }), requireFields(['logText']), async (req, res) => {
  const { logText, logSource = 'auto' } = req.body;

  if (!logText.trim()) {
    return res.status(400).json({ error: 'logText must not be empty' });
  }
  if (!VALID_LOG_SOURCES.includes(logSource)) {
    return res.status(400).json({ error: `Invalid logSource. Must be one of: ${VALID_LOG_SOURCES.join(', ')}` });
  }

  const result = await analyzeLog(logText, logSource);
  res.json(result);
});

router.post('/analyze-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const allowedExtensions = ['.log', '.txt', '.csv', '.json'];
  const ext = req.file.originalname.toLowerCase().slice(req.file.originalname.lastIndexOf('.'));
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: `Unsupported file type. Allowed: ${allowedExtensions.join(', ')}` });
  }

  const logText = req.file.buffer.toString('utf-8');
  if (logText.length > MAX_LENGTH) {
    return res.status(400).json({ error: `File content exceeds maximum length of ${MAX_LENGTH} characters` });
  }

  const logSource = req.body.logSource || 'auto';
  if (!VALID_LOG_SOURCES.includes(logSource)) {
    return res.status(400).json({ error: `Invalid logSource. Must be one of: ${VALID_LOG_SOURCES.join(', ')}` });
  }

  const result = await analyzeLog(logText, logSource);
  res.json(result);
});

export default router;
