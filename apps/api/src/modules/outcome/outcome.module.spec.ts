import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { OutcomeModule } from './outcome.module';
import { WorkspaceGuard } from '../workspaces/workspace.guard';

describe('OutcomeModule', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://dummy@localhost:5432/dummy';
  });

  it('should compile the module and resolve WorkspaceGuard dependencies', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }), // Required for PrismaModule/ConfigService within this isolated graph
        OutcomeModule
      ],
    }).compile();

    expect(module).toBeDefined();

    // Verify the guard can actually be resolved
    const guard = module.get(WorkspaceGuard);
    expect(guard).toBeDefined();
  });
});
