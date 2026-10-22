import Anthropic from '@anthropic-ai/sdk';
import type { AICompletion, AIProvider, AIRequest } from '@sidekick/core';

export const defaultClaudeModel = 'claude-opus-5-5';

/**
 * Claude through the Anthropic Messages API with a key from the OS credential store.
 *
 * Sampling `temperature` is not sent: the current API rejects it on every model. Depth is set
 * with `output_config.effort` instead, and thinking stays adaptive (Claude Opus 5.5 cannot turn
 * it off). A server-side fallback re-runs a safety-declined request on another model; a final
 * refusal is still surfaced as an error rather than partial text.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = defaultClaudeModel,
  ) {
    // The SDK retries 429/5xx itself; the caller's AbortSignal and timeout still bound each call.
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  async generate(request: AIRequest): Promise<string> {
    return (await this.generateDetailed(request)).text;
  }

  async generateDetailed(request: AIRequest): Promise<AICompletion> {
    const timeoutMs = request.timeoutMs ?? 45_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000)
      throw new Error('AI request timeout must be between 1 and 120 seconds.');
    const maxTokens = request.maxOutputTokens ?? 16_000;
    if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 16_384)
      throw new Error('AI output limit must be between 128 and 16384 tokens.');
    const signal = request.signal
      ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          thinking: { type: 'adaptive' },
          output_config: { effort: request.reasoningEffort ?? 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal, timeout: timeoutMs },
      );
    } catch (error) {
      if (signal.aborted) throw error;
      // Status only: provider messages can echo request content and never reach logs or the UI.
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      throw new Error(`AI provider request failed${status ? ` (${status})` : ''}.`);
    }
    if (response.stop_reason === 'refusal')
      throw new Error('The AI provider declined this request.');
    if (response.stop_reason !== 'end_turn')
      throw new Error('The AI provider stopped before finishing its answer.');
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    if (!text) throw new Error('The AI provider returned an empty answer.');
    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
