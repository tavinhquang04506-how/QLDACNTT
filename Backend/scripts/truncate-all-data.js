require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');

async function clearAllData() {
  console.log('🔄 Đang kết nối tới database và lấy danh sách bảng...');
  
  // Lấy toàn bộ các bảng trong schema public
  const res = await db.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);

  const tables = res.rows.map(r => r.tablename);
  console.log(`📋 Tìm thấy ${tables.length} bảng:`, tables.join(', '));

  if (tables.length === 0) {
    console.log('⚠️ Không có bảng nào trong database.');
    return;
  }

  // Đếm số dòng hiện tại trước khi xóa
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

  // Thực hiện TRUNCATE toàn bộ các bảng CASCADE và RESTART IDENTITY
  console.log('\n🗑️ Đang xóa toàn bộ dữ liệu (TRUNCATE ALL TABLES CASCADE RESTART IDENTITY)...');
  const tableList = tables.map(t => `"${t}"`).join(', ');
  await db.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);

  // Reset tất cả sequence về giá trị ban đầu nếu có
  const seqRes = await db.query(`
    SELECT sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public';
  `);
  for (const seq of seqRes.rows) {
    try {
      await db.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1;`);
    } catch (e) {
      // Một số sequence có thể có min value khác 1, restart mặc định
      try {
        await db.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART;`);
      } catch (err) {}
    }
  }

  // Kiểm tra lại sau khi xóa
  console.log('\n✅ Kiểm tra lại dữ liệu sau khi xóa:');
  let totalRowsAfter = 0;
  for (const table of tables) {
    const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const count = countRes.rows[0].count;
    totalRowsAfter += count;
    if (count > 0) {
      console.log(`  ⚠️ Bảng ${table} vẫn còn: ${count} bản ghi`);
    }
  }

  if (totalRowsAfter === 0) {
    console.log('\n🎉 THÀNH CÔNG: Toàn bộ database hiện tại trống không (0 bản ghi)! Cấu trúc các bảng vẫn nguyên vẹn sẵn sàng sử dụng.');
  } else {
    console.log(`\n⚠️ Vẫn còn ${totalRowsAfter} bản ghi.`);
  }
}

clearAllData()
  .then(() => db.pool.end())
  .catch((err) => {
    console.error('❌ Lỗi khi xóa dữ liệu:', err);
    process.exit(1);
  });
