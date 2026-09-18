import { Injectable } from '@nestjs/common';
import {
  AIProvider,
  AICompletionInput,
  AICompletionResult,
  AIProviderException,
} from '../domain/ai-provider.interface';

@Injectable()
export class MockAIProvider implements AIProvider {
  public async complete(input: AICompletionInput): Promise<AICompletionResult> {
    if (input.userPrompt.includes('TRIGGER_MOCK_TIMEOUT')) {
      throw new AIProviderException('Mock AI Provider request timed out');
    }
    if (input.userPrompt.includes('TRIGGER_MOCK_MALFORMED')) {
      return { rawText: 'Invalid JSON response from mock' };
    }
    if (input.userPrompt.includes('TRIGGER_MOCK_HALLUCINATION')) {
      return {
        rawText: JSON.stringify({
          subject: 'Application for your Senior Backend position',
          body: 'Hi, I saw your job posting and wanted to apply for the open role.',
        }),
      };
    }

    // Default valid mock response
    return {
      rawText: JSON.stringify({
        subject: 'Exploring engineering collaboration and technical alignment',
        body: 'Hello, I have been following your team technical work and wanted to connect regarding engineering background and alignment.',
      }),
    };
  }
}
