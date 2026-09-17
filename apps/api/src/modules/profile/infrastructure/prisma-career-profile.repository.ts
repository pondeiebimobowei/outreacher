import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  CareerProfileDomain,
  CareerProfileChanges,
} from '../domain/career-profile.domain';
import { ICareerProfileRepository } from '../domain/career-profile.repository.interface';

@Injectable()
export class PrismaCareerProfileRepository implements ICareerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrInitializeProfile(
    workspaceId: string,
  ): Promise<CareerProfileDomain> {
    const record = await this.prisma.careerProfile.upsert({
      where: { workspaceId },
      create: { workspaceId },
      update: {},
    });
    return this.mapToDomain(record);
  }

  async updateProfile(
    workspaceId: string,
    changes: CareerProfileChanges,
  ): Promise<CareerProfileDomain> {
    const record = await this.prisma.careerProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...(changes.headline !== undefined && { headline: changes.headline }),
        ...(changes.summary !== undefined && { summary: changes.summary }),
        ...(changes.experienceSummary !== undefined && {
          experienceSummary: changes.experienceSummary,
        }),
        ...(changes.targetRoles !== undefined && {
          targetRoles: changes.targetRoles,
        }),
        ...(changes.targetIndustries !== undefined && {
          targetIndustries: changes.targetIndustries,
        }),
        ...(changes.targetLocations !== undefined && {
          targetLocations: changes.targetLocations,
        }),
        ...(changes.skills !== undefined && { skills: changes.skills }),
        ...(changes.portfolioUrl !== undefined && {
          portfolioUrl: changes.portfolioUrl,
        }),
        ...(changes.githubUrl !== undefined && {
          githubUrl: changes.githubUrl,
        }),
        ...(changes.linkedinUrl !== undefined && {
          linkedinUrl: changes.linkedinUrl,
        }),
        ...(changes.websiteUrl !== undefined && {
          websiteUrl: changes.websiteUrl,
        }),
      },
      update: changes,
    });
    return this.mapToDomain(record);
  }

  private mapToDomain(record: any): CareerProfileDomain {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      headline: record.headline,
      summary: record.summary,
      experienceSummary: record.experienceSummary,
      targetRoles: record.targetRoles ?? [],
      targetIndustries: record.targetIndustries ?? [],
      targetLocations: record.targetLocations ?? [],
      skills: record.skills ?? [],
      portfolioUrl: record.portfolioUrl,
      githubUrl: record.githubUrl,
      linkedinUrl: record.linkedinUrl,
      websiteUrl: record.websiteUrl,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
