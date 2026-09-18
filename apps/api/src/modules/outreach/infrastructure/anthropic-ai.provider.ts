import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  AICompletionInput,
  AICompletionResult,
  AIProviderException,
  AITimeoutException,
} from '../domain/ai-provider.interface';

@Injectable()
export class AnthropicAIProvider implements AIProvider {
  private readonly logger = new Logger(AnthropicAIProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = model;
  }

  public async complete(input: AICompletionInput): Promise<AICompletionResult> {
    if (!this.apiKey) {
      throw new AIProviderException('Anthropic API key is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          system: input.systemPrompt,
          messages: [{ role: 'user', content: input.userPrompt }],
          max_tokens: input.maxTokens ?? 1000,
          temperature: input.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Anthropic API error ${response.status}: ${errorText}`,
        );
        throw new AIProviderException(
          `Anthropic returned status ${response.status}`,
          {
            status: response.status,
            response: errorText,
          },
        );
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const rawText = data.content?.find((c) => c.type === 'text')?.text || '';
      return { rawText };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AITimeoutException(
          'Anthropic request timed out after 30 seconds',
        );
      }
      if (
        error instanceof AIProviderException ||
        error instanceof AITimeoutException
      ) {
        throw error;
      }
      throw new AIProviderException(
        `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
