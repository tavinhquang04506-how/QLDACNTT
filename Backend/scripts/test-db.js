/**
 * test-db.js — PostgreSQL Database Connection & Schema Alignment Validator
 * NEXUS HRMS
 * 
 * Usage:
 *   node scripts/test-db.js
 *   npm run db:test
 */

const path = require('path');
const fs = require('fs');

// Load .env relative to Backend directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../db');

// 20 bảng chuẩn trong database/schema.sql
const DEFAULT_SCHEMA_TABLES = [
  'roles',
  'departments',
  'positions',
  'employees',
  'users',
  'user_roles',
  'attendance_logs',
  'leave_types',
  'leave_requests',
  'leave_balances',
  'payroll_periods',
  'payslips',
  'projects',
  'tasks',
  'task_logs',
  'squads',
  'squad_members',
  'squad_messages',
  'audit_logs',
  'notifications',
];

// Danh sách bảng đối chiếu từ brief
const BRIEF_TABLES = [
  'departments',
  'job_titles',
  'employees',
  'users',
  'contracts',
  'salary_history',
  'shifts',
  'attendance_logs',
  'overtime_requests',
  'leave_balances',
  'leave_requests',
  'leave_approvals',
  'payroll_periods',
  'payroll_runs',
  'payslips',
  'projects',
  'project_members',
  'squads',
  'tasks',
  'notifications',
];

async function testDatabase() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🐘 NEXUS HRMS — PostgreSQL Connection & Schema Test      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`📡 Host:      ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 5432}`);
  console.log(`📦 Database:  ${process.env.DB_NAME || 'nexus_hrms'}`);
  console.log(`👤 User:      ${process.env.DB_USER || 'postgres'}`);
  console.log('────────────────────────────────────────────────────────────');

  let client;
  try {
    const startTime = Date.now();
    client = await pool.connect();
    const connectMs = Date.now() - startTime;
    console.log(`✅ [OK] Kết nối PostgreSQL thành công (${connectMs}ms)\n`);

    // 1. Kiểm tra thông tin server database
    const dbInfoRes = await client.query('SELECT version(), current_database(), NOW() AS server_time');
    const dbInfo = dbInfoRes.rows[0];
    console.log(`ℹ️  DB Version:   ${dbInfo.version.split(' on ')[0]}`);
    console.log(`ℹ️  Server Time:  ${dbInfo.server_time}`);
    console.log('');

    // 2. Query danh sách bảng trong public schema
    const tablesQuery = `
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const res = await client.query(tablesQuery);
    const allEntities = res.rows;
    const baseTables = allEntities.filter(r => r.table_type === 'BASE TABLE').map(r => r.table_name);
    const views = allEntities.filter(r => r.table_type === 'VIEW').map(r => r.table_name);

    console.log(`📊 Tìm thấy tổng cộng: ${baseTables.length} base tables và ${views.length} views trong public schema.`);

    // 3. Đọc schema.sql chuẩn nếu file tồn tại
    let expectedTables = DEFAULT_SCHEMA_TABLES;
    const schemaSqlPaths = [
      path.resolve(__dirname, '../../database/schema.sql'),
      path.resolve(__dirname, '../database/schema.sql'),
      path.resolve(process.cwd(), 'database/schema.sql'),
    ];

    for (const p of schemaSqlPaths) {
      if (fs.existsSync(p)) {
        try {
          const sqlContent = fs.readFileSync(p, 'utf8');
          const matches = [...sqlContent.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi)];
          if (matches.length > 0) {
            expectedTables = matches.map(m => m[1]);
            console.log(`📖 Đã load danh sách ${expectedTables.length} bảng chuẩn từ: ${p}`);
            break;
          }
        } catch {
          // Fallback to default schema tables
        }
      }
    }

    // 4. So sánh danh sách bảng với schema.sql
    console.log('\n📋 Chi tiết 20 bảng chuẩn trong database/schema.sql:');
    let matchedCount = 0;
    const missingTables = [];

    expectedTables.forEach((table, index) => {
      const exists = baseTables.includes(table);
      const num = String(index + 1).padStart(2, ' ');
      if (exists) {
        matchedCount++;
        console.log(`  ${num}. [✓ OK]    ${table}`);
      } else {
        missingTables.push(table);
        console.log(`  ${num}. [✗ MISS]  ${table}`);
      }
    });

    if (views.length > 0) {
      console.log(`\n👁️  Views hỗ trợ: ${views.join(', ')}`);
    }

    console.log('\n────────────────────────────────────────────────────────────');
    console.log(`📈 Kết quả: ${matchedCount}/${expectedTables.length} bảng chuẩn đã sẵn sàng (${Math.round((matchedCount / expectedTables.length) * 100)}%)`);

    if (missingTables.length > 0) {
      console.warn(`⚠️  Cảnh báo: Còn thiếu ${missingTables.length} bảng: ${missingTables.join(', ')}`);
      console.warn('💡 Gợi ý: Hãy import database/schema.sql để khởi tạo đầy đủ các bảng.');
    } else {
      console.log('🎉 TRẠNG THÁI: TẤT CẢ 20 BẢNG CHUẨN ĐỀU ĐÃ ĐỒNG BỘ VÀ KHỚP 100%!');
    }
    console.log('────────────────────────────────────────────────────────────');

    return { success: missingTables.length === 0, matchedCount, total: expectedTables.length };
  } catch (error) {
    console.error('\n❌ [ERROR] Không thể kết nối tới cơ sở dữ liệu PostgreSQL!');
    console.error(`Chi tiết lỗi: ${error.message}`);
    console.error('\n🛠️  Gợi ý khắc phục:');
    console.error('  1. Kiểm tra service PostgreSQL đã được khởi động chưa.');
    console.error('     Windows: Chạy services.msc hoặc lệnh "net start postgresql-x64-16"');
    console.error('  2. Kiểm tra thông tin cấu hình trong file Backend/.env:');
    console.error(`     - DB_HOST:     ${process.env.DB_HOST || '127.0.0.1'}`);
    console.error(`     - DB_PORT:     ${process.env.DB_PORT || 5432}`);
    console.error(`     - DB_NAME:     ${process.env.DB_NAME || 'nexus_hrms'}`);
    console.error(`     - DB_USER:     ${process.env.DB_USER || 'postgres'}`);
    console.error('     - DB_PASSWORD: (đã thiết lập)');
    console.error('  3. Đảm bảo database đã được tạo và import schema:');
    console.error('     psql -U postgres -c "CREATE DATABASE nexus_hrms;"');
    console.error('     psql -U postgres -d nexus_hrms -f database/schema.sql');
    console.error('────────────────────────────────────────────────────────────');
    process.exitCode = 1;
    return { success: false, error: error.message };
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

if (require.main === module) {
  testDatabase().then(result => {
    process.exitCode = result.success ? 0 : 1;
  });
}

module.exports = { testDatabase, DEFAULT_SCHEMA_TABLES, BRIEF_TABLES };
