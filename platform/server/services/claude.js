import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set. Check your .env file.');
}

export const claudeClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Send a prompt to Claude and return the text response.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function askClaude(systemPrompt, userMessage) {
  const message = await claudeClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }
  // Strip markdown code fences if Claude wraps JSON in ```json ... ```
  return block.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}
