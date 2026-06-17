import Anthropic from '@anthropic-ai/sdk';

// Lazy-init: constructing eagerly at module load time meant any missing
// ANTHROPIC_API_KEY crashed the entire server process (every tool route
// transitively imports this file via loadTools()). In Electron local mode,
// that made it impossible to even reach the Configuration UI to enter a key.
// Deferring construction until first actual use lets the server start and
// serve everything else; only Claude-backed tool calls fail until a key is set.
let _claudeClient = null;

function getClaudeClient() {
  if (!_claudeClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Check your .env file or add it in Configuration.');
    }
    _claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _claudeClient;
}

// Proxy preserves `claudeClient.messages.create(...)`-style direct access
// (used by tests) while still deferring real construction until first use.
export const claudeClient = new Proxy({}, {
  get(_target, prop) {
    return getClaudeClient()[prop];
  },
});

/**
 * Send a prompt to Claude and return the text response.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function askClaude(systemPrompt, userMessage) {
  const message = await getClaudeClient().messages.create({
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
