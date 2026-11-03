import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}

export { prisma }

export { prisma as prismaClient }
