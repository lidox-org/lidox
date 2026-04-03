import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { env } from '../config/env';
import { AuthService } from './auth.service';

/**
 * Extract JWT from Authorization header first, fall back to cookie.
 */
function extractJwtFromRequest(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;

  // Fall back to cookie
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: extractJwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; jti: string }) {
    // Check Redis deny set
    const denied = await this.authService.isJtiDenied(payload.jti);
    if (denied) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      jti: payload.jti,
    };
  }
}
