import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  /** PostgreSQL connection string */
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://lidox:lidox@localhost:5432/lidox',

  /** Redis connection URL */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /** Secret used to verify JWT tokens */
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',

  /** Port the sync server listens on */
  SYNC_PORT: parseInt(process.env.SYNC_PORT || '3002', 10),
} as const;
