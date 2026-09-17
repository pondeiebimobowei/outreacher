import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, JwtPayload } from '../auth.service';

function extractJwtFromCookieOrHeader(req: Request): string | null {
  if (req && req.cookies && req.cookies['career_os_session']) {
    return req.cookies['career_os_session'];
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret =
      configService.get<string>('AUTH_SECRET') ||
      'development_auth_secret_min_16_chars';

    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    if (!payload || !payload.sub || !payload.workspaceId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    try {
      const session = await this.authService.validateSession(
        payload.sub,
        payload.workspaceId,
      );

      // Attach user and workspace context to request
      req.user = session.user;
      req.workspace = session.workspace;

      return session.user;
    } catch (err) {
      throw new UnauthorizedException('Session validation failed');
    }
  }
}
