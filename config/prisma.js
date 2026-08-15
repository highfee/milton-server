import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const globalForPrisma = globalThis;

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
