import { logger } from '../utils/logger'
import * as m001 from './001_add_min_capacity'

const migrations = [m001]

export async function runMigrations(): Promise<{ applied: number; total: number }> {
  let applied = 0
  for (const m of migrations) {
    try {
      const ok = await m.run()
      if (ok) applied++
    } catch (err: any) {
      logger.error('MIGRATION_FAILED', { name: (m as any).MIGRATION_NAME || 'unknown', message: err?.message || String(err) })
      throw err
    }
  }
  logger.info('MIGRATION_DONE', { applied, total: migrations.length })
  return { applied, total: migrations.length }
}

export default runMigrations
