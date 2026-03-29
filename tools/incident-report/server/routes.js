import { Router } from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

const SYSTEM_PROMPT = `You are a cybersecurity incident response specialist.
Analyze the incident description and produce a structured incident report.
Respond with a JSON object only — no markdown, no explanation, just the JSON.

The JSON must have these exact fields:
{
  "title": "concise incident title",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "classification": "type of incident (e.g. Credential Attack, Data Exfiltration, Ransomware)",
  "detectedAt": "",
  "reportedAt": "",
  "executiveSummary": "2-3 sentence plain-English summary for leadership",
  "technicalDetails": "detailed technical description of what occurred",
  "impactAssessment": "actual or potential business and technical impact",
  "containmentSteps": "steps that were or should be taken immediately to contain the incident",
  "recommendedRemediation": "long-term remediation and hardening steps",
  "lessonsLearned": "what this incident reveals about gaps in controls or process"
}

Leave detectedAt and reportedAt as empty strings — those are filled in by the analyst.`;

router.post('/analyze', requireFields(['incidentText']), async (req, res) => {
  const { incidentText, severity } = req.body;

  if (incidentText.length > 10000) {
    return res.status(400).json({ error: 'incidentText exceeds maximum length of 10000 characters' });
  }

  let userMessage = incidentText;
  if (severity && typeof severity === 'string' && VALID_SEVERITIES.includes(severity)) {
    userMessage += `\n\nSeverity hint from analyst: ${severity}`;
  }

  try {
    const raw = await askClaude(SYSTEM_PROMPT, userMessage);
    const result = JSON.parse(raw);

    if (!VALID_SEVERITIES.includes(result.severity)) {
      return res.status(502).json({ error: 'Invalid severity in AI response' });
    }

    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI response was not valid JSON' });
    }
    console.error('[incident-report] Error:', err.message);
    res.status(500).json({ error: 'Report generation failed. Please try again.' });
  }
});

export default router;
