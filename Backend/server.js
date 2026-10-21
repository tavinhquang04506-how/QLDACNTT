// ============================================
// server.js — NEXUS HR Backend Entry Point
// ============================================
const http = require('http');
const config = require('./src/config/env');
const app = require('./src/app');
const db = require('./src/config/db');
const { initSocket } = require('./src/socket');
const { checkSchemaReadiness } = require('./src/utils/schemaReadiness');

const server = http.createServer(app);
initSocket(server);

server.listen(config.port, async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   🚀 NEXUS HR Backend API                 ║');
  console.log(`║   📡 http://localhost:${config.port}                 ║`);
  console.log(`║   📖 http://localhost:${config.port}/api              ║`);
  console.log(`║   💚 http://localhost:${config.port}/api/health       ║`);
  console.log(`║   🩺 http://localhost:${config.port}/api/health/ready ║`);
  console.log(`║   ⚡ WebSocket: ws://localhost:${config.port}/ws        ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  try {
    const result = await db.query(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = $1',
      ['public']
    );
    const readiness = await checkSchemaReadiness(db);
    console.log(`📦 Database: ${config.db.database} (${result.rows[0].tables} tables)`);
    console.log(`🔗 PostgreSQL: ${config.db.host}:${config.db.port}`);
    if (readiness.ready) {
      console.log(`✅ Schema Readiness: READY (${readiness.appliedMigrationsCount}/${readiness.expectedMigrationsCount} migrations applied)`);
    } else {
      console.warn(
        `⚠️  Schema Readiness: ${readiness.status} (${readiness.appliedMigrationsCount}/${readiness.expectedMigrationsCount} migrations applied)`
      );
      if (readiness.pendingMigrations.length > 0) {
        console.warn(`   Pending migrations: ${readiness.pendingMigrations.join(', ')}`);
      }
      if (readiness.missingStructures.length > 0) {
        console.warn(`   Missing structures: ${readiness.missingStructures.join(', ')}`);
      }
      console.warn('   Run `npm run db:preflight --prefix Backend` and follow docs/remediation/MIGRATION_RUNBOOK.md before serving production traffic.');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});
