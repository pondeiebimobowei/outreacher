import { Injectable } from '@nestjs/common';
import { Company, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { CompanyDuplicateNameError } from '../domain/company.domain';
import {
  CreateCompanyData,
  ICompanyRepository,
  UpdateCompanyData,
} from '../domain/company.repository.interface';

@Injectable()
export class PrismaCompanyRepository implements ICompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyData): Promise<Company> {
    try {
      return await this.prisma.company.create({
        data: {
          workspaceId: data.workspaceId,
          name: data.name,
          normalizedName: data.normalizedName,
          websiteUrl: data.websiteUrl,
          domain: data.domain,
          description: data.description,
          industry: data.industry,
          location: data.location,
          linkedinUrl: data.linkedinUrl,
          status: data.status,
        },
      });
    } catch (error: any) {
      if (this.isUniqueConstraintError(error)) {
        throw new CompanyDuplicateNameError(
          data.workspaceId,
          data.normalizedName,
        );
      }
      throw error;
    }
  }

  async findById(workspaceId: string, id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: {
        id,
        workspaceId,
      },
    });
  }

  async findByNormalizedName(
    workspaceId: string,
    normalizedName: string,
  ): Promise<Company | null> {
    return this.prisma.company.findUnique({
      where: {
        workspaceId_normalizedName: {
          workspaceId,
          normalizedName,
        },
      },
    });
  }

  async findManyByWorkspace(workspaceId: string): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    data: UpdateCompanyData,
  ): Promise<Company | null> {
    // First ensure company exists in current workspace
    const existing = await this.findById(workspaceId, id);
    if (!existing) {
      return null;
    }

    try {
      return await this.prisma.company.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.normalizedName !== undefined && {
            normalizedName: data.normalizedName,
          }),
          ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl }),
          ...(data.domain !== undefined && { domain: data.domain }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.industry !== undefined && { industry: data.industry }),
          ...(data.location !== undefined && { location: data.location }),
          ...(data.linkedinUrl !== undefined && {
            linkedinUrl: data.linkedinUrl,
          }),
          ...(data.status !== undefined && { status: data.status }),
        },
      });
    } catch (error: any) {
      if (this.isUniqueConstraintError(error)) {
        const targetNormalizedName =
          data.normalizedName ?? existing.normalizedName;
        throw new CompanyDuplicateNameError(workspaceId, targetNormalizedName);
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: any): boolean {
    return (
      error?.code === 'P2002' ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002')
    );
  }
}
