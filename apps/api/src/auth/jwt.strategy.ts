import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { env } from '../config/env';
import { AuthService } from './auth.service';

function extractJwtFromRequest(req: Request): string | null {
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
