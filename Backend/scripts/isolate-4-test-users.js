require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');

const PRESERVED_EMP_IDS = ['NV-0001', 'NV-1001', 'NV-1002', 'NV-0842'];

async function isolate4TestUsers() {
  const client = await db.pool.connect();
  try {
    console.log('🔄 Bắt đầu cô lập Database: Xóa sạch dữ liệu nghiệp vụ, chỉ giữ 4 tài khoản 4 cấp bậc...');
    await client.query('BEGIN');

    // 1. Danh sách các bảng nghiệp vụ cần xóa trắng 100%
    const businessTables = [
      'attendance_appeals',
      'attendance_logs',
      'leave_requests',
      'leave_balances',
      'payslips',
      'payroll_periods',
      'task_logs',
      'tasks',
      'squad_messages',
      'squad_members',
      'squads',
      'projects',
      'ot_requests',
      'medical_claims',
      'company_notices',
      'notification_reads',
      'notifications',
      'performance_reviews',
      'pip_plans',
      'audit_logs',
      'refresh_tokens',
      'contracts'
    ];

    console.log('🗑️ 1. Xóa sạch toàn bộ bảng dữ liệu nghiệp vụ (TRUNCATE)...');
    for (const table of businessTables) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
        console.log(`   ✓ Đã làm rỗng bảng: ${table}`);
      } catch (err) {
        console.warn(`   ⚠️ Bỏ qua ${table}: ${err.message}`);
      }
    }

    // 2. Xóa user_roles của 46 nhân sự khác
    console.log('🛡️ 2. Xóa quyền user_roles của các tài khoản ngoài 4 tài khoản chỉ định...');
    await client.query(`
      DELETE FROM user_roles 
      WHERE user_id NOT IN (
        SELECT id FROM users WHERE employee_id = ANY($1)
      );
    `, [PRESERVED_EMP_IDS]);

    // 3. Xóa các tài khoản users ngoài 4 tài khoản chỉ định
    console.log('👤 3. Xóa các tài khoản users ngoài 4 tài khoản chỉ định...');
    const delUsersRes = await client.query(`
      DELETE FROM users 
      WHERE employee_id IS NULL OR employee_id != ALL($1)
      RETURNING id, email, employee_id;
    `, [PRESERVED_EMP_IDS]);
    console.log(`   ✓ Đã xóa ${delUsersRes.rowCount} tài khoản users.`);

    // 4. Cập nhật departments để gỡ bỏ manager_id của các nhân sự bị xóa
    console.log('🏢 4. Gỡ bỏ manager_id của các phòng ban không thuộc 4 nhân sự giữ lại...');
    await client.query(`
      UPDATE departments 
      SET manager_id = NULL 
      WHERE manager_id IS NOT NULL AND manager_id != ALL($1);
    `, [PRESERVED_EMP_IDS]);

    // 5. Xóa 46 nhân sự còn lại trong bảng employees
    console.log('👥 5. Xóa 46 nhân sự trong bảng employees...');
    const delEmpRes = await client.query(`
      DELETE FROM employees 
      WHERE id != ALL($1)
      RETURNING id, full_name;
    `, [PRESERVED_EMP_IDS]);
    console.log(`   ✓ Đã xóa ${delEmpRes.rowCount} nhân sự.`);

    // Reset sequence notifications nếu cần
    try {
      await client.query(`ALTER SEQUENCE IF EXISTS seq_notif_id RESTART WITH 1;`);
      await client.query(`ALTER SEQUENCE IF EXISTS seq_leave_id RESTART WITH 1;`);
      await client.query(`ALTER SEQUENCE IF EXISTS seq_ot_id RESTART WITH 1;`);
      await client.query(`ALTER SEQUENCE IF EXISTS seq_task_id RESTART WITH 1;`);
    } catch (e) {
      console.warn('   ⚠️ Reset sequence:', e.message);
    }

    await client.query('COMMIT');
    console.log('\n✅ Giao dịch COMMIT thành công!');

    // 6. Kiểm tra lại toàn bộ số dòng trong database
    console.log('\n📊 THỐNG KÊ SỐ LƯỢNG BẢN GHI SAU KHI CÔ LẬP:');
    const tableRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    let nonZeroTables = [];
    let zeroCount = 0;
    for (const row of tableRes.rows) {
      const tbl = row.tablename;
      const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM "${tbl}";`);
      const cnt = countRes.rows[0].cnt;
      if (cnt > 0) {
        nonZeroTables.push({ table: tbl, count: cnt });
      } else {
        zeroCount++;
      }
    }

    console.log(`- Số bảng trống hoàn toàn (0 bản ghi): ${zeroCount}`);
    console.log('- Các bảng còn dữ liệu (danh mục & 4 tài khoản):');
    nonZeroTables.forEach(t => console.log(`   • ${t.table}: ${t.count} bản ghi`));

    // 7. Hiển thị thông tin 4 tài khoản còn lại
    console.log('\n🎯 DANH SÁCH 4 TÀI KHOẢN ĐƯỢC BẢO LƯU:');
    const usersRes = await client.query(`
      SELECT u.id, u.email, u.role_code, u.is_active, e.id as emp_id, e.full_name, e.job_title, d.name as dept_name
      FROM users u
      JOIN employees e ON u.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.id;
    `);

    usersRes.rows.forEach((u, i) => {
      console.log(`  ${i + 1}. [${u.role_code}] ${u.full_name} (${u.emp_id}) - Email: ${u.email} - Phòng: ${u.dept_name}`);
    });

    console.log('\n✨ Database đã được cô lập hoàn hảo ở trạng thái RỖNG Nghiệp Vụ!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi cô lập database:', error);
    throw error;
  } finally {
    client.release();
    await db.pool.end();
  }
}

isolate4TestUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
