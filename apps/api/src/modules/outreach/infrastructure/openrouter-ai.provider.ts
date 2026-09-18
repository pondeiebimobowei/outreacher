import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  AICompletionInput,
  AICompletionResult,
  AIProviderException,
  AITimeoutException,
} from '../domain/ai-provider.interface';

@Injectable()
export class OpenRouterAIProvider implements AIProvider {
  private readonly logger = new Logger(OpenRouterAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(apiKey?: string, model = 'anthropic/claude-3.5-sonnet') {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl =
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.model = model;
  }

  public async complete(input: AICompletionInput): Promise<AICompletionResult> {
    if (!this.apiKey) {
      throw new AIProviderException('OpenRouter API key is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://outreacher.app',
          'X-Title': 'Outreacher Platform',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          temperature: input.temperature ?? 0.7,
          max_tokens: input.maxTokens ?? 1000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `OpenRouter API error ${response.status}: ${errorText}`,
        );
        throw new AIProviderException(
          `OpenRouter returned status ${response.status}`,
          {
            status: response.status,
            response: errorText,
          },
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = data.choices?.[0]?.message?.content || '';
      return { rawText };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AITimeoutException(
          'OpenRouter request timed out after 30 seconds',
        );
      }
      if (
        error instanceof AIProviderException ||
        error instanceof AITimeoutException
      ) {
        throw error;
      }
      throw new AIProviderException(
        `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
