import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export const MIGRATION_NAME = '001_add_min_capacity'
const SAFE_DEFAULT_MIN_CAPACITY = 1

export async function run(): Promise<boolean> {
  const columnResult: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'courses'
       AND COLUMN_NAME = 'min_capacity'
     LIMIT 1`
  )

  const rows: any[] = Array.isArray(columnResult) ? columnResult : [columnResult]
  const columnExists = Number(rows[0]?.cnt ?? 0) > 0

  if (!columnExists) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE courses ADD COLUMN min_capacity INT NOT NULL DEFAULT ${SAFE_DEFAULT_MIN_CAPACITY} AFTER max_capacity`
    )
    logger.info('MIGRATION_SUCCESS', { name: MIGRATION_NAME, step: 'add_column' })
    return true
  }

  const badResult: any = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM courses
     WHERE min_capacity < 1 OR min_capacity > max_capacity
     LIMIT 1`
  )
  const badRows: any[] = Array.isArray(badResult) ? badResult : [badResult]
  const badCount = Number(badRows[0]?.cnt ?? 0)

  if (badCount > 0) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE courses
       SET min_capacity = LEAST(${SAFE_DEFAULT_MIN_CAPACITY}, max_capacity)
       WHERE min_capacity < 1 OR min_capacity > max_capacity`
    )
    logger.info('MIGRATION_SUCCESS', { name: MIGRATION_NAME, step: 'normalize_existing', fixed: Number(updated) || badCount })
    return true
  }

  logger.info('MIGRATION_SKIP', { name: MIGRATION_NAME, reason: 'already_applied' })
  return false
}

export default { name: MIGRATION_NAME, run }
