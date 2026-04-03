export const env = {
  /** Server */
  PORT: parseInt(process.env.API_PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',

  /** Database */
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgres://lidox:lidox_dev@localhost:5432/lidox',

  /** Redis */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /** JWT */
  JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '15m',
  REFRESH_TOKEN_EXPIRATION_DAYS: parseInt(
    process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '7',
    10,
  ),

  /** AI / Groq */
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_DEFAULT_MODEL: process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile',
} as const;
