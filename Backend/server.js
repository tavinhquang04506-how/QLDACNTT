// ============================================
// server.js — NEXUS HR Backend Entry Point
// ============================================
const http = require('http');
const config = require('./src/config/env');
const app = require('./src/app');
const db = require('./src/config/db');
const { initSocket } = require('./src/socket');

const server = http.createServer(app);
initSocket(server);

server.listen(config.port, async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   🚀 NEXUS HR Backend API                 ║');
  console.log(`║   📡 http://localhost:${config.port}                 ║`);
  console.log(`║   📖 http://localhost:${config.port}/api              ║`);
  console.log(`║   💚 http://localhost:${config.port}/api/health       ║`);
  console.log(`║   ⚡ WebSocket: ws://localhost:${config.port}/ws        ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');

  try {
    const result = await db.query(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = $1',
      ['public']
    );
    console.log(`📦 Database: ${config.db.database} (${result.rows[0].tables} tables)`);
    console.log(`🔗 PostgreSQL: ${config.db.host}:${config.db.port}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});
