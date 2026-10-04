import { Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { EmailModule } from '../email/email.module';
import { OutreachesController } from './outreaches.controller';
import { UpdateDraftUseCase } from './application/update-draft.use-case';
import { ApproveDraftUseCase } from './application/approve-draft.use-case';
import { GenerateDirectOutreachUseCase } from './application/generate-direct-outreach.use-case';
import { UpdateDirectOutreachUseCase } from './application/update-direct-outreach.use-case';
import { OutreachGenerationWorker } from './worker/outreach-generation.worker';
import { MockAIProvider } from './infrastructure/mock-ai.provider';
import { OpenRouterAIProvider } from './infrastructure/openrouter-ai.provider';
import { AnthropicAIProvider } from './infrastructure/anthropic-ai.provider';

import { TemplateModule } from '../template/template.module';
import { CreateOutreachUseCase } from './application/create-outreach.use-case';
import { GetOutreachUseCase } from './application/get-outreach.use-case';
import { SendOutreachUseCase } from './application/send-outreach.use-case';
import { ResumeOutreachUseCase } from './application/resume-outreach.use-case';

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
  imports: [PrismaModule, WorkspaceModule, EmailModule, TemplateModule],
  controllers: [OutreachesController],
  providers: [
    CreateOutreachUseCase,
    GetOutreachUseCase,
    UpdateDraftUseCase,
    ApproveDraftUseCase,
    GenerateDirectOutreachUseCase,
    UpdateDirectOutreachUseCase,
    SendOutreachUseCase,
    ResumeOutreachUseCase,
    OutreachGenerationWorker,
    aiProviderFactory,
  ],
  exports: [
    CreateOutreachUseCase,
    GetOutreachUseCase,
    UpdateDraftUseCase,
    ApproveDraftUseCase,
    GenerateDirectOutreachUseCase,
    UpdateDirectOutreachUseCase,
    SendOutreachUseCase,
    ResumeOutreachUseCase,
    OutreachGenerationWorker,
    'AIProvider',
  ],
})
export class OutreachModule {}
