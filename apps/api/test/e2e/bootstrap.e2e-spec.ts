import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

describe('AppModule Bootstrap', () => {
  it('should compile AppModule', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleFixture).toBeDefined();
  });
});
