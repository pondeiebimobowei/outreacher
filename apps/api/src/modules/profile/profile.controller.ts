import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import express from 'express';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { RequestWorkspace } from '../../types/express';
import { GetCareerProfileUseCase } from './application/get-career-profile.use-case';
import { UpdateCareerProfileUseCase } from './application/update-career-profile.use-case';
import { UpdateCareerProfileDto } from './dto/update-career-profile.dto';

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly getCareerProfileUseCase: GetCareerProfileUseCase,
    private readonly updateCareerProfileUseCase: UpdateCareerProfileUseCase,
  ) {}

  @Get()
  async getProfile(@Req() req: express.Request) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.getCareerProfileUseCase.execute(workspace.id);
  }

  @Patch()
  async updateProfile(
    @Req() req: express.Request,
    @Body() dto: UpdateCareerProfileDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.updateCareerProfileUseCase.execute(workspace.id, dto);
  }
}
