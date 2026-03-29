import { Router } from 'express';
import express from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';
import { askClaude } from '../../../platform/server/services/claude.js';

const router = Router();
const MAX_LENGTH = 50000;

const VALID_FRAMEWORK_HINTS = [
  'auto', 'nist', 'iso27001', 'cis', 'soc2', 'hipaa', 'pci-dss', 'gdpr', 'cmmc', 'internal', 'other',
];

const CLAUDE_SYSTEM_PROMPT = `You are a compliance officer and security policy expert with deep knowledge of NIST, ISO 27001, CIS Controls, SOC 2, HIPAA, PCI-DSS, GDPR, and CMMC frameworks.

A user has submitted security policy text that may be dense, technical, or full of compliance jargon. Your job is to:
1. Translate it into plain English that non-security staff can understand
2. Extract specific controls and requirements
3. Identify which teams own each requirement
4. List concrete action items for compliance

Respond with a JSON object only — no markdown, no explanation outside the JSON.

The JSON must have these exact fields:
{
  "plainEnglishSummary": "2-4 sentence plain-English overview of what this policy section requires",
  "framework": "identified framework name (e.g. NIST SP 800-53, ISO 27001, CIS Controls, SOC 2, HIPAA, internal) or 'Unknown'",
  "controls": [
    {
      "id": "control ID if present (e.g. AC-2, A.9.1.1) or null",
      "title": "short title for this control",
      "plainEnglish": "what this control means in plain English",
      "requirement": "Mandatory" | "Recommended" | "Optional",
      "ownerTeams": ["teams responsible — e.g. IT, Security, HR, Legal, Engineering, Management"],
      "actionItems": ["concrete steps required to comply with this control"]
    }
  ],
  "complianceGaps": ["common gaps or things organizations often miss when implementing this policy"],
  "recommendations": ["prioritized recommendations for implementing this policy effectively"]
}`;

router.post('/translate', express.json({ limit: '100kb' }), requireFields(['policyText']), async (req, res) => {
  const { policyText, frameworkHint = 'auto' } = req.body;

  if (!policyText.trim()) {
    return res.status(400).json({ error: 'policyText must not be empty' });
  }
  if (policyText.length > MAX_LENGTH) {
    return res.status(400).json({ error: `policyText exceeds maximum length of ${MAX_LENGTH} characters` });
  }
  if (!VALID_FRAMEWORK_HINTS.includes(frameworkHint)) {
    return res.status(400).json({ error: `Invalid frameworkHint. Must be one of: ${VALID_FRAMEWORK_HINTS.join(', ')}` });
  }

  const prompt = [
    frameworkHint !== 'auto' ? `Framework hint: ${frameworkHint.toUpperCase()}` : '',
    `Policy text to translate:\n${policyText}`,
  ].filter(Boolean).join('\n\n');

  let result = {
    plainEnglishSummary: 'Translation unavailable.',
    framework: 'Unknown',
    controls: [],
    complianceGaps: [],
    recommendations: [],
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
