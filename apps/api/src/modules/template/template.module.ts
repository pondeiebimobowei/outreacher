import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { TemplateEngineService } from './domain/template-engine.service';
import { CreateTemplateUseCase } from './application/create-template.use-case';
import { ListTemplatesUseCase } from './application/list-templates.use-case';
import { GetTemplateUseCase } from './application/get-template.use-case';
import { UpdateTemplateUseCase } from './application/update-template.use-case';
import { SetTemplateStepsUseCase } from './application/set-template-steps.use-case';
import { DeleteTemplateUseCase } from './application/delete-template.use-case';
import { PreviewTemplateUseCase } from './application/preview-template.use-case';
import { TemplateController } from './template.controller';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [TemplateController],
  providers: [
    TemplateEngineService,
    CreateTemplateUseCase,
    ListTemplatesUseCase,
    GetTemplateUseCase,
    UpdateTemplateUseCase,
    SetTemplateStepsUseCase,
    DeleteTemplateUseCase,
    PreviewTemplateUseCase,
  ],
  exports: [TemplateEngineService],
})
export class TemplateModule {}
