import { Router } from 'express';
import express from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';
import multer from 'multer';

const router = Router();
const MAX_LENGTH = 200000;
const VALID_LOG_TYPES = ['auto', 'firewall', 'netflow', 'zeek', 'suricata', 'pcap-summary', 'syslog', 'other'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 }, // 500kb
});

const CLAUDE_SYSTEM_PROMPT = `You are a SOC analyst and network security expert reviewing network log data.
Analyze the provided logs and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "summary": "2-3 sentence plain-English summary of what the logs show and the overall threat posture",
  "threatLevel": "critical" | "high" | "medium" | "low" | "clean",
  "threats": [
    {
      "type": "threat type (e.g. Port Scan, Brute Force, C2 Beacon, Data Exfiltration, Lateral Movement)",
      "source": "source IP or host if identifiable",
      "destination": "destination IP or host if identifiable",
      "detail": "specific detail about this threat",
      "severity": "critical" | "high" | "medium" | "low"
    }
  ],
  "anomalies": ["list of unusual patterns that may not be confirmed threats"],
  "suspiciousIPs": ["list of IP addresses that appear suspicious"],
  "recommendations": ["actionable recommendations based on findings"]
}`;

function detectLogType(logData) {
  if (/IN=\w+.*SRC=.*DST=/i.test(logData)) return 'firewall';
  if (/proto\s+\d+.*bytes/i.test(logData) || /srcip|dstip|srcport|dstport/i.test(logData)) return 'netflow';
  if (/\bzeek\b|\bconn\.log\b|\bhttp\.log\b|\bdns\.log\b/i.test(logData)) return 'zeek';
  if (/"alert"|"signature_id"|"category"/i.test(logData)) return 'suricata';
  if (/kernel:|sshd:|firewalld:/i.test(logData)) return 'syslog';
  return 'other';
}

async function analyzeLog(logData, logType) {
  if (!logData.trim()) return null;
  if (logData.length > MAX_LENGTH) return null;

  const resolvedType = logType === 'auto' ? detectLogType(logData) : logType;
  const prompt = `Log type: ${resolvedType}\n\nLog data:\n${logData.slice(0, MAX_LENGTH)}`;

  try {
    const raw = await askClaude(CLAUDE_SYSTEM_PROMPT, prompt);
    const analysis = JSON.parse(raw);
    return { ...analysis, logType: resolvedType };
  } catch {
    return { summary: 'Analysis unavailable.', threatLevel: 'unknown', threats: [], anomalies: [], suspiciousIPs: [], recommendations: [], logType: resolvedType };
  }
}

router.post('/analyze', express.json({ limit: '250kb' }), requireFields(['logData']), async (req, res) => {
  const { logData, logType = 'auto' } = req.body;

  if (!logData.trim()) {
    return res.status(400).json({ error: 'logData must not be empty' });
  }
  if (logData.length > MAX_LENGTH) {
    return res.status(400).json({ error: `logData exceeds maximum length of ${MAX_LENGTH} characters` });
  }
  if (!VALID_LOG_TYPES.includes(logType)) {
    return res.status(400).json({ error: `Invalid logType. Must be one of: ${VALID_LOG_TYPES.join(', ')}` });
  }

  const result = await analyzeLog(logData, logType);
  res.json(result);
});

router.post('/analyze-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const allowedExtensions = ['.log', '.txt', '.csv', '.json', '.pcap', '.cap'];
  const ext = req.file.originalname.toLowerCase().slice(req.file.originalname.lastIndexOf('.'));
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: `Unsupported file type. Allowed: ${allowedExtensions.join(', ')}` });
  }

  const logData = req.file.buffer.toString('utf-8');
  if (logData.length > MAX_LENGTH) {
    return res.status(400).json({ error: `File content exceeds maximum length of ${MAX_LENGTH} characters` });
  }

  const logType = req.body.logType || 'auto';
  if (!VALID_LOG_TYPES.includes(logType)) {
    return res.status(400).json({ error: `Invalid logType. Must be one of: ${VALID_LOG_TYPES.join(', ')}` });
  }

  const result = await analyzeLog(logData, logType);
  res.json(result);
});

export default router;
