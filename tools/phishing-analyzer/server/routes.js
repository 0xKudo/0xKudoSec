import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const VALID_VERDICTS = ['phishing', 'suspicious', 'legitimate', 'unknown'];

const SYSTEM_PROMPT = `You are a cybersecurity analyst specializing in email threat analysis.
Analyze the provided email and respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "verdict": "phishing" | "suspicious" | "legitimate" | "unknown",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence plain-English summary of the email and why it is or isn't suspicious",
  "indicators": [
    { "type": "indicator-type", "detail": "specific detail found in the email" }
  ],
  "suspiciousUrls": ["url1", "url2"],
  "suspiciousSender": "sender address or domain if suspicious, empty string if not",
  "recommendedActions": ["action 1", "action 2"]
}

Indicator types to use (use only these): sender-spoofing, urgency, suspicious-link, credential-harvesting,
attachment-risk, brand-impersonation, grammar-issues, unusual-request, header-anomaly, lookalike-domain.

If no suspicious URLs are found, return an empty array for suspiciousUrls.
If no suspicious sender, return an empty string for suspiciousSender.`;

router.post('/analyze', requireFields(['emailText']), async (req, res) => {
  const { emailText } = req.body;

  if (emailText.length > 20000) {
    return res.status(400).json({ error: 'emailText exceeds maximum length of 20000 characters' });
  }

  try {
    const raw = await askClaude(SYSTEM_PROMPT, emailText);
    const result = JSON.parse(raw);

    if (!VALID_VERDICTS.includes(result.verdict)) {
      return res.status(502).json({ error: 'Invalid verdict in AI response' });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI response was not valid JSON' });
    }
    console.error('[phishing-analyzer] Error:', err.message);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

export default router;
