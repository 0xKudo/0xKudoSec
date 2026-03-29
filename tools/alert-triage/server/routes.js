import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const SYSTEM_PROMPT = `You are a SOC analyst assistant. Analyze the provided SIEM alert and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "attackVector": "brief description of the likely attack vector",
  "summary": "1-2 sentence plain-English summary of what is happening",
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "confidence": "high" | "medium" | "low"
}`;

router.post('/analyze', requireFields(['alertText']), async (req, res) => {
  const { alertText } = req.body;

  if (alertText.length > 10000) {
    return res.status(400).json({ error: 'alertText exceeds maximum length of 10000 characters' });
  }

  try {
    const raw = await askClaude(SYSTEM_PROMPT, alertText);
    const result = JSON.parse(raw);

    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    if (!validSeverities.includes(result.severity)) {
      return res.status(502).json({ error: 'Invalid severity in AI response' });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI response was not valid JSON' });
    }
    console.error('[alert-triage] Error:', err.message);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

export default router;
