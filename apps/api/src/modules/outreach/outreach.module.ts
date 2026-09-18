import { Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { OutreachController } from './outreach.controller';
import { GenerateOutreachUseCase } from './application/generate-outreach.use-case';
import { UpdateDraftUseCase } from './application/update-draft.use-case';
import { ApproveDraftUseCase } from './application/approve-draft.use-case';
import { OutreachGenerationWorker } from './worker/outreach-generation.worker';
import { MockAIProvider } from './infrastructure/mock-ai.provider';
import { OpenRouterAIProvider } from './infrastructure/openrouter-ai.provider';
import { AnthropicAIProvider } from './infrastructure/anthropic-ai.provider';

const aiProviderFactory: Provider = {
  provide: 'AIProvider',
  useFactory: () => {
    const providerName = (process.env.AI_PROVIDER || '').toUpperCase();
    const env = process.env.NODE_ENV;

    if (
      providerName === 'MOCK' ||
      env === 'test' ||
      (!providerName && env !== 'production')
    ) {
      return new MockAIProvider();
    }

    if (providerName === 'OPENROUTER') {
      return new OpenRouterAIProvider();
    }

    if (providerName === 'ANTHROPIC') {
      return new AnthropicAIProvider();
    }

    throw new Error(
      `Invalid AI_PROVIDER configuration: "${process.env.AI_PROVIDER}". Must be "MOCK", "OPENROUTER", or "ANTHROPIC".`,
    );
  },
};

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [OutreachController],
  providers: [
    GenerateOutreachUseCase,
    UpdateDraftUseCase,
    ApproveDraftUseCase,
    OutreachGenerationWorker,
    aiProviderFactory,
  ],
  exports: [
    GenerateOutreachUseCase,
    UpdateDraftUseCase,
    ApproveDraftUseCase,
    OutreachGenerationWorker,
    'AIProvider',
  ],
})
export class OutreachModule {}
