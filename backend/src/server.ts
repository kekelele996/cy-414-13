import { app } from './app'
import { appConfig } from './config/app'
import { runMigrations } from './migrations'
import { logger } from './utils/logger'

async function bootstrap() {
  try {
    await runMigrations()
  } catch (err: any) {
    logger.error('MIGRATION_ABORT', { message: err?.message || String(err) })
    console.error('[FATAL] Database migration failed:', err?.message || err)
    process.exit(1)
  }

  const server = app.listen(appConfig.port, () => {
    logger.info('BACKEND_START', { port: appConfig.port })
    console.log(`FitPro backend listening on ${appConfig.port}`)
  })

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0))
  })
}

bootstrap()

