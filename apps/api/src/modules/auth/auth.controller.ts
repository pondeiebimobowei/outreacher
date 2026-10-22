import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { AppValidationException } from '../../common/errors/application.exception';
import { RequestUser, RequestWorkspace } from '../../types/express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { GoogleOidcService } from './google-oidc.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleOidcService: GoogleOidcService,
    private readonly configService: ConfigService,
  ) {}

  private setSessionCookie(res: express.Response, token: string) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    res.cookie('career_os_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearSessionCookie(res: express.Response) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    res.cookie('career_os_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 0,
    });
  }

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.signupPassword(dto);
    this.setSessionCookie(res, result.token);
    return {
      user: result.user,
      workspace: result.workspace,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.loginPassword(dto);
    this.setSessionCookie(res, result.token);
    return {
      user: result.user,
      workspace: result.workspace,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: express.Response) {
    this.clearSessionCookie(res);
    return { success: true };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: any, @Req() req: express.Request) {
    const workspace = req.workspace as RequestWorkspace;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
      },
    };
  }

  @Public()
  @Get('google')
  async initiateGoogleAuth(@Res() res: express.Response) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const state = this.googleOidcService.generateState();
    const { codeVerifier, codeChallenge } =
      this.googleOidcService.generatePkce();

    const cookiePayload = Buffer.from(
      JSON.stringify({ state, codeVerifier }),
    ).toString('base64');

    res.cookie('career_os_oauth_state', cookiePayload, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/api/v1/auth/google/callback',
      maxAge: 10 * 60 * 1000,
    });

    const redirectUrl = this.googleOidcService.buildAuthorizationUrl(
      state,
      codeChallenge,
    );

    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const oauthCookie = req.cookies['career_os_oauth_state'];

    res.cookie('career_os_oauth_state', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/api/v1/auth/google/callback',
      maxAge: 0,
    });

    if (!code || !state || !oauthCookie) {
      throw new AppValidationException(
        'Invalid or missing state / authorization code.',
      );
    }

    let parsedCookie: { state: string; codeVerifier: string };
    try {
      const decoded = Buffer.from(oauthCookie, 'base64').toString('utf-8');
      parsedCookie = JSON.parse(decoded);
    } catch {
      throw new AppValidationException('Malformed state token.');
    }

    if (parsedCookie.state !== state) {
      throw new AppValidationException(
        'State token mismatch. Possible CSRF attempt.',
      );
    }

    const userInfo = await this.googleOidcService.exchangeCodeAndGetUserInfo(
      code,
      parsedCookie.codeVerifier,
    );

    const result = await this.authService.handleGoogleCallback(userInfo);

    this.setSessionCookie(res, result.token);

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    return res.redirect(frontendUrl);
  }
}
