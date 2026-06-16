import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export const MIGRATION_NAME = '001_add_min_capacity'
const DEFAULT_MIN_CAPACITY = 999

export async function run(): Promise<boolean> {
  const result: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'courses'
       AND COLUMN_NAME = 'min_capacity'
     LIMIT 1`
  )

  const rows: any[] = Array.isArray(result) ? result : [result]
  const count = Number(rows[0]?.cnt ?? 0)

  if (count > 0) {
    logger.info('MIGRATION_SKIP', { name: MIGRATION_NAME, reason: 'column_already_exists' })
    return false
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE courses ADD COLUMN min_capacity INT NOT NULL DEFAULT ${DEFAULT_MIN_CAPACITY} AFTER max_capacity`
  )

  logger.info('MIGRATION_SUCCESS', { name: MIGRATION_NAME })
  return true
}

export default { name: MIGRATION_NAME, run }
