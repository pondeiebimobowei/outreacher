import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, WorkspaceRole } from '@repo/db';
import * as bcrypt from 'bcrypt';
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  AppUnauthorizedException,
  AppValidationException,
} from '../../common/errors/application.exception';
import { PrismaService } from '../../database/prisma.service';
import { GoogleUserInfo } from './google-oidc.service';

export interface SignupDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  workspaceId: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signupPassword(dto: SignupDto) {
    try {
      const email = dto.email.toLowerCase().trim();

      if (!dto.password || dto.password.length < 8) {
        throw new AppValidationException(
          'Password must be at least 8 characters long.',
        );
      }

      // Check if identity or user exists
      const existingIdentity = await this.prisma.authIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: AuthProvider.PASSWORD,
            providerUserId: email,
          },
        },
      });

      if (existingIdentity) {
        throw new AppConflictException(
          'An account with this email address already exists.',
        );
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppConflictException(
          'An account with this email address already exists.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const firstName = dto.firstName.trim();
      const lastName = dto.lastName.trim();
      const workspaceName = firstName
        ? `${firstName}'s Workspace`
        : 'Personal Workspace';

      // Single transaction for atomic User + AuthIdentity + Workspace + WorkspaceMember creation
      const { user, workspace } = await this.prisma.$transaction(
        async (tx: any) => {
          const newUser = await tx.user.create({
            data: {
              email,
              firstName,
              lastName,
            },
          });

          await tx.authIdentity.create({
            data: {
              userId: newUser.id,
              provider: AuthProvider.PASSWORD,
              providerUserId: email,
              email,
              passwordHash,
            },
          });

          const newWorkspace = await tx.workspace.create({
            data: {
              name: workspaceName,
            },
          });

          await tx.workspaceMember.create({
            data: {
              workspaceId: newWorkspace.id,
              userId: newUser.id,
              role: WorkspaceRole.OWNER,
            },
          });

          return { user: newUser, workspace: newWorkspace };
        },
      );

      const token = this.generateToken(user.id, workspace.id, user.email);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        token,
      };
    } catch (err) {
      if (
        err instanceof AppConflictException ||
        err instanceof AppValidationException
      ) {
        throw err;
      }
      if ((err as any)?.code === 'P2002') {
        throw new AppConflictException(
          'An account with this email address already exists.',
        );
      }
      throw err;
    }
  }

  async loginPassword(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.PASSWORD,
          providerUserId: email,
        },
      },
      include: {
        user: true,
      },
    });

    if (!identity || !identity.passwordHash || !identity.user) {
      throw new AppUnauthorizedException('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(dto.password, identity.passwordHash);
    if (!isMatch) {
      throw new AppUnauthorizedException('Invalid email or password.');
    }

    const member = await this.prisma.workspaceMember.findFirst({
      where: { userId: identity.userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!member || !member.workspace) {
      throw new AppNotFoundException('Workspace not found for user.');
    }

    const token = this.generateToken(
      identity.user.id,
      member.workspace.id,
      identity.user.email,
    );

    return {
      user: {
        id: identity.user.id,
        email: identity.user.email,
        firstName: identity.user.firstName,
        lastName: identity.user.lastName,
      },
      workspace: {
        id: member.workspace.id,
        name: member.workspace.name,
      },
      token,
    };
  }

  async handleGoogleCallback(userInfo: GoogleUserInfo) {
    if (!userInfo.emailVerified) {
      throw new AppUnauthorizedException(
        'Google account email is not verified.',
      );
    }

    const googleEmail = userInfo.email.toLowerCase().trim();

    // Look up existing Google AuthIdentity
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GOOGLE,
          providerUserId: userInfo.sub,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity && existingIdentity.user) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { userId: existingIdentity.userId },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!member || !member.workspace) {
        throw new AppNotFoundException('Workspace not found for user.');
      }

      const token = this.generateToken(
        existingIdentity.user.id,
        member.workspace.id,
        existingIdentity.user.email,
      );

      return {
        user: {
          id: existingIdentity.user.id,
          email: existingIdentity.user.email,
          firstName: existingIdentity.user.firstName,
          lastName: existingIdentity.user.lastName,
        },
        workspace: {
          id: member.workspace.id,
          name: member.workspace.name,
        },
        token,
      };
    }

    // Identity doesn't exist yet. Check if email matches existing account from another provider (no silent merging)
    const existingEmailUser = await this.prisma.user.findUnique({
      where: { email: googleEmail },
    });

    if (existingEmailUser) {
      throw new AppConflictException(
        'An account with this email address already exists. Please log in with your password.',
      );
    }

    // Atomic creation of new User + AuthIdentity + Workspace + WorkspaceMember
    let firstName = userInfo.givenName?.trim();
    let lastName = userInfo.familyName?.trim();

    // Fallback if given/family name are not present
    if (!firstName) {
      const displayName = userInfo.givenName?.trim() || null;
      firstName = displayName ? displayName.split(' ')[0] : 'User';
      if (!lastName) {
        lastName =
          displayName && displayName.includes(' ')
            ? displayName.split(' ').slice(1).join(' ')
            : '';
      }
    }

    const workspaceName = firstName
      ? `${firstName}'s Workspace`
      : 'Personal Workspace';

    const { user, workspace } = await this.prisma.$transaction(
      async (tx: any) => {
        const newUser = await tx.user.create({
          data: {
            email: googleEmail,
            firstName,
            lastName: lastName || '',
          },
        });

        await tx.authIdentity.create({
          data: {
            userId: newUser.id,
            provider: AuthProvider.GOOGLE,
            providerUserId: userInfo.sub,
            email: googleEmail,
            passwordHash: null,
          },
        });

        const newWorkspace = await tx.workspace.create({
          data: {
            name: workspaceName,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: newWorkspace.id,
            userId: newUser.id,
            role: WorkspaceRole.OWNER,
          },
        });

        return { user: newUser, workspace: newWorkspace };
      },
    );

    const token = this.generateToken(user.id, workspace.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      token,
    };
  }

  async validateSession(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppUnauthorizedException('User not found.');
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: { workspace: true },
    });

    if (!member || !member.workspace) {
      throw new AppForbiddenException('Access to workspace denied.');
    }

    let ownerId = member.userId;
    if (member.role === WorkspaceRole.OWNER) {
      ownerId = member.userId;
    } else {
      const ownerMember = await this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          role: WorkspaceRole.OWNER,
        },
        select: { userId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (ownerMember) {
        ownerId = ownerMember.userId;
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      workspace: {
        id: member.workspace.id,
        name: member.workspace.name,
        ownerId,
      },
    };
  }

  generateToken(userId: string, workspaceId: string, email: string): string {
    const payload: JwtPayload = {
      sub: userId,
      workspaceId,
      email,
    };
    return this.jwtService.sign(payload);
  }
}
