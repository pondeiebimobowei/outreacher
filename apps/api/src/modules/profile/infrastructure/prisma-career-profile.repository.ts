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
    try {
      const record = await this.prisma.careerProfile.upsert({
        where: { workspaceId },
        create: { workspaceId },
        update: {},
      });
      return this.mapToDomain(record);
    } catch (err: unknown) {
      if ((err as any)?.code === 'P2002') {
        const existing = await this.prisma.careerProfile.findUnique({
          where: { workspaceId },
        });
        if (existing) {
          return this.mapToDomain(existing);
        }
      }
      throw err;
    }
  }

  async updateProfile(
    workspaceId: string,
    changes: CareerProfileChanges,
  ): Promise<CareerProfileDomain> {
    const record: CareerProfileDomain = await this.prisma.careerProfile.upsert({
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
        ...(changes.currentRole !== undefined && {
          currentRole: changes.currentRole,
        }),
        ...(changes.yearsExperience !== undefined && {
          yearsExperience: changes.yearsExperience,
        }),
        ...(changes.careerGoals !== undefined && {
          careerGoals: changes.careerGoals,
        }),
        ...(changes.backgroundAndPositioning !== undefined && {
          backgroundAndPositioning: changes.backgroundAndPositioning,
        }),
      },
      update: changes,
    });
    return this.mapToDomain(record);
  }

  private mapToDomain(record: CareerProfileDomain): CareerProfileDomain {
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
      currentRole: record.currentRole,
      yearsExperience: record.yearsExperience,
      careerGoals: record.careerGoals,
      backgroundAndPositioning: record.backgroundAndPositioning,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
