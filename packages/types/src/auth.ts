import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  accessToken: z.string(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  jti: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
