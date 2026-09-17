/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import express from 'express';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { CreateCompanyUseCase } from './application/create-company.use-case';
import { GetCompanyUseCase } from './application/get-company.use-case';
import { ListCompaniesUseCase } from './application/list-companies.use-case';
import { UpdateCompanyUseCase } from './application/update-company.use-case';
import { CompanyController } from './company.controller';

describe('CompanyController', () => {
  let controller: CompanyController;
  let createUseCase: jest.Mocked<CreateCompanyUseCase>;
  let listUseCase: jest.Mocked<ListCompaniesUseCase>;
  let getUseCase: jest.Mocked<GetCompanyUseCase>;
  let updateUseCase: jest.Mocked<UpdateCompanyUseCase>;

  const mockReq = {
    workspace: { id: 'ws-123' },
  } as unknown as express.Request;

  beforeEach(async () => {
    createUseCase = { execute: jest.fn() } as any;
    listUseCase = { execute: jest.fn() } as any;
    getUseCase = { execute: jest.fn() } as any;
    updateUseCase = { execute: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [
        { provide: CreateCompanyUseCase, useValue: createUseCase },
        { provide: ListCompaniesUseCase, useValue: listUseCase },
        { provide: GetCompanyUseCase, useValue: getUseCase },
        { provide: UpdateCompanyUseCase, useValue: updateUseCase },
      ],
    }).compile();

    controller = module.get<CompanyController>(CompanyController);
  });

  it('throws AppUnauthorizedException if workspace context is missing from request', async () => {
    const unauthedReq = {} as express.Request;
    await expect(controller.listCompanies(unauthedReq)).rejects.toThrow(
      AppUnauthorizedException,
    );
  });

  it('delegates createCompany to CreateCompanyUseCase with workspace ID', async () => {
    const dto = { name: 'Acme Corp' };
    createUseCase.execute.mockResolvedValue({ id: 'comp-1' } as any);

    const result = await controller.createCompany(mockReq, dto);

    expect(createUseCase.execute).toHaveBeenCalledWith('ws-123', dto);
    expect(result).toEqual({ id: 'comp-1' });
  });

  it('delegates listCompanies to ListCompaniesUseCase with workspace ID', async () => {
    listUseCase.execute.mockResolvedValue([{ id: 'comp-1' }] as any);

    const result = await controller.listCompanies(mockReq);

    expect(listUseCase.execute).toHaveBeenCalledWith('ws-123');
    expect(result).toEqual([{ id: 'comp-1' }]);
  });

  it('delegates getCompany to GetCompanyUseCase with workspace ID and company ID', async () => {
    getUseCase.execute.mockResolvedValue({ id: 'comp-1' } as any);

    const result = await controller.getCompany(mockReq, 'comp-1');

    expect(getUseCase.execute).toHaveBeenCalledWith('ws-123', 'comp-1');
    expect(result).toEqual({ id: 'comp-1' });
  });

  it('delegates updateCompany to UpdateCompanyUseCase with workspace ID and company ID', async () => {
    const dto = { description: 'Updated' };
    updateUseCase.execute.mockResolvedValue({ id: 'comp-1' } as any);

    const result = await controller.updateCompany(mockReq, 'comp-1', dto);

    expect(updateUseCase.execute).toHaveBeenCalledWith('ws-123', 'comp-1', dto);
    expect(result).toEqual({ id: 'comp-1' });
  });
});
