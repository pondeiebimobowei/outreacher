import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CreateCompanyUseCase } from './application/create-company.use-case';
import { GetCompanyUseCase } from './application/get-company.use-case';
import { ListCompaniesUseCase } from './application/list-companies.use-case';
import { UpdateCompanyUseCase } from './application/update-company.use-case';
import { CompanyController } from './company.controller';
import { COMPANY_REPOSITORY_TOKEN } from './domain/company.repository.interface';
import { PrismaCompanyRepository } from './infrastructure/prisma-company.repository';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyController],
  providers: [
    {
      provide: COMPANY_REPOSITORY_TOKEN,
      useClass: PrismaCompanyRepository,
    },
    CreateCompanyUseCase,
    ListCompaniesUseCase,
    GetCompanyUseCase,
    UpdateCompanyUseCase,
  ],
  exports: [
    COMPANY_REPOSITORY_TOKEN,
    CreateCompanyUseCase,
    ListCompaniesUseCase,
    GetCompanyUseCase,
    UpdateCompanyUseCase,
  ],
})
export class CompanyModule {}
