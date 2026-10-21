require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');
const { assertSafeTestDatabase } = require('../src/utils/testDbGuard');

async function clearAllData() {
  await assertSafeTestDatabase(db, 'scripts/truncate-all-data.js');
  console.log('🔄 Đang kết nối tới database và lấy danh sách bảng...');

  const res = await db.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  const tables = res.rows.map((r) => r.tablename);
  console.log(`📋 Tìm thấy ${tables.length} bảng:`, tables.join(', '));

  if (tables.length === 0) {
    console.log('⚠️ Không có bảng nào trong database.');
    return;
  }

  console.log('\n📊 Số lượng bản ghi trước khi xóa:');
  let totalRowsBefore = 0;
  for (const table of tables) {
    const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const count = countRes.rows[0].count;
    totalRowsBefore += count;
    if (count > 0) {
      console.log(`  - ${table}: ${count} bản ghi`);
    }
  }
  console.log(`=> Tổng cộng: ${totalRowsBefore} bản ghi.`);

  console.log('\n🗑️ Đang xóa toàn bộ dữ liệu (TRUNCATE ALL TABLES CASCADE RESTART IDENTITY)...');
  const tableList = tables.map((t) => `"${t}"`).join(', ');
  await db.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);

  const seqRes = await db.query(`
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public';
  `);
  for (const seq of seqRes.rows) {
    try {
      await db.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1;`);
    } catch (e) {
      try {
        await db.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART;`);
      } catch (err) {}
    }
  }

  console.log('\n✅ Kiểm tra lại dữ liệu sau khi xóa:');
  let totalRowsAfter = 0;
  for (const table of tables) {
    const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const count = countRes.rows[0].count;
    totalRowsAfter += count;
    console.log(`  - ${table}: ${count} bản ghi`);
  }

  console.log(`\n🎉 ĐÃ XÓA SẠCH DỮ LIỆU THÀNH CÔNG! Tổng số bản ghi còn lại: ${totalRowsAfter}`);
}

clearAllData()
  .then(() => {
    db.pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Lỗi khi xóa dữ liệu:', err);
    db.pool.end();
    process.exit(1);
  });
