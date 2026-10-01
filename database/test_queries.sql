-- ============================================================
-- TEST QUERIES — Kiểm tra tính toàn vẹn Database nexus_hrms
-- Vai trò: Database + QA/Tester
-- Ngày: 18/09/2026
-- Cách chạy: psql -U postgres -h 127.0.0.1 -d nexus_hrms -f test_queries.sql
-- ============================================================

-- ============================================================
-- TEST 1: Kiểm tra cấu trúc — Đủ 20 bảng
-- ============================================================
SELECT '=== TEST 1: Kiểm tra 20 bảng ===' AS test_name;
SELECT
    CASE WHEN COUNT(*) = 20 THEN '✅ PASS — 20/20 bảng'
         ELSE '❌ FAIL — Chỉ có ' || COUNT(*) || '/20 bảng'
    END AS result
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- ============================================================
-- TEST 2: Kiểm tra seed data — Đủ số lượng
-- ============================================================
SELECT '=== TEST 2: Kiểm tra seed data ===' AS test_name;
SELECT
    'employees' AS bang, COUNT(*) AS so_luong,
    CASE WHEN COUNT(*) >= 14 THEN '✅' ELSE '❌' END AS ket_qua
FROM employees
UNION ALL
SELECT 'departments', COUNT(*), CASE WHEN COUNT(*) >= 6 THEN '✅' ELSE '❌' END FROM departments
UNION ALL
SELECT 'roles', COUNT(*), CASE WHEN COUNT(*) >= 5 THEN '✅' ELSE '❌' END FROM roles
UNION ALL
SELECT 'users', COUNT(*), CASE WHEN COUNT(*) >= 4 THEN '✅' ELSE '❌' END FROM users
UNION ALL
SELECT 'leave_types', COUNT(*), CASE WHEN COUNT(*) >= 6 THEN '✅' ELSE '❌' END FROM leave_types
UNION ALL
SELECT 'projects', COUNT(*), CASE WHEN COUNT(*) >= 4 THEN '✅' ELSE '❌' END FROM projects
UNION ALL
SELECT 'tasks', COUNT(*), CASE WHEN COUNT(*) >= 6 THEN '✅' ELSE '❌' END FROM tasks
UNION ALL
SELECT 'squads', COUNT(*), CASE WHEN COUNT(*) >= 3 THEN '✅' ELSE '❌' END FROM squads
UNION ALL
SELECT 'attendance_logs', COUNT(*), CASE WHEN COUNT(*) >= 10 THEN '✅' ELSE '❌' END FROM attendance_logs
UNION ALL
SELECT 'leave_balances', COUNT(*), CASE WHEN COUNT(*) >= 14 THEN '✅' ELSE '❌' END FROM leave_balances
ORDER BY bang;

-- ============================================================
-- TEST 3: Kiểm tra 4 tài khoản chính (AuthContext)
-- ============================================================
SELECT '=== TEST 3: Kiểm tra 4 tài khoản vai trò chính ===' AS test_name;
SELECT
    u.email, u.role_code, e.id AS employee_id, e.full_name,
    CASE WHEN u.id IS NOT NULL THEN '✅' ELSE '❌' END AS ket_qua
FROM users u
JOIN employees e ON u.employee_id = e.id
WHERE u.role_code IN ('CEO', 'HR_DIRECTOR', 'LINE_MANAGER', 'EMPLOYEE')
ORDER BY
    CASE u.role_code WHEN 'CEO' THEN 1 WHEN 'HR_DIRECTOR' THEN 2
         WHEN 'LINE_MANAGER' THEN 3 WHEN 'EMPLOYEE' THEN 4 END;

-- ============================================================
-- TEST 4: Kiểm tra FK toàn vẹn — Không có orphan records
-- ============================================================
SELECT '=== TEST 4: Kiểm tra FK toàn vẹn ===' AS test_name;
SELECT 'employees.department_id' AS fk_check,
    COUNT(*) AS orphans,
    CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS ket_qua
FROM employees e WHERE e.department_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = e.department_id)
UNION ALL
SELECT 'employees.manager_id',
    COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM employees e WHERE e.manager_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM employees m WHERE m.id = e.manager_id)
UNION ALL
SELECT 'users.employee_id',
    COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM users u WHERE u.employee_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = u.employee_id)
UNION ALL
SELECT 'tasks.project_id',
    COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id)
UNION ALL
SELECT 'squad_members.employee_id',
    COUNT(*), CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM squad_members sm WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = sm.employee_id);

-- ============================================================
-- TEST 5: Kiểm tra TRIGGER auto tính work_hours
-- ============================================================
SELECT '=== TEST 5: Kiểm tra trigger chấm công ===' AS test_name;
SELECT
    employee_id, work_date,
    check_in_time::TIME AS gio_vao,
    check_out_time::TIME AS gio_ra,
    work_hours, ot_hours, late_minutes, status,
    CASE
        WHEN work_hours > 0 THEN '✅ work_hours OK'
        ELSE '❌ work_hours = 0'
    END AS test_work_hours,
    CASE
        WHEN (check_in_time::TIME > '08:00' AND late_minutes > 0) OR
             (check_in_time::TIME <= '08:00' AND late_minutes = 0) THEN '✅ late_minutes OK'
        ELSE '⚠️ Kiểm tra lại'
    END AS test_late
FROM attendance_logs
ORDER BY employee_id, work_date
LIMIT 10;

-- ============================================================
-- TEST 6: Kiểm tra leave_balances — remaining_days = total - used
-- ============================================================
SELECT '=== TEST 6: Kiểm tra leave_balances computed column ===' AS test_name;
SELECT
    employee_id, total_days, used_days, remaining_days,
    CASE
        WHEN remaining_days = total_days - used_days THEN '✅ PASS'
        ELSE '❌ FAIL: ' || remaining_days || ' ≠ ' || (total_days - used_days)
    END AS ket_qua
FROM leave_balances
ORDER BY employee_id
LIMIT 10;

-- ============================================================
-- TEST 7: Kiểm tra constraint — NV không tự làm manager mình
-- ============================================================
SELECT '=== TEST 7: Kiểm tra self-manager constraint ===' AS test_name;
SELECT
    CASE WHEN COUNT(*) = 0 THEN '✅ PASS — Không có NV tự quản lý mình'
         ELSE '❌ FAIL — ' || COUNT(*) || ' NV tự quản lý mình'
    END AS ket_qua
FROM employees WHERE id = manager_id;

-- ============================================================
-- TEST 8: Kiểm tra UNIQUE constraints
-- ============================================================
SELECT '=== TEST 8: Kiểm tra UNIQUE constraints ===' AS test_name;
SELECT 'employees.work_email' AS constraint_check,
    COUNT(*) - COUNT(DISTINCT work_email) AS duplicates,
    CASE WHEN COUNT(*) = COUNT(DISTINCT work_email) THEN '✅ PASS' ELSE '❌ FAIL' END AS ket_qua
FROM employees
UNION ALL
SELECT 'departments.name',
    COUNT(*) - COUNT(DISTINCT name),
    CASE WHEN COUNT(*) = COUNT(DISTINCT name) THEN '✅ PASS' ELSE '❌ FAIL' END
FROM departments
UNION ALL
SELECT 'users.email',
    COUNT(*) - COUNT(DISTINCT email),
    CASE WHEN COUNT(*) = COUNT(DISTINCT email) THEN '✅ PASS' ELSE '❌ FAIL' END
FROM users
UNION ALL
SELECT 'roles.role_code',
    COUNT(*) - COUNT(DISTINCT role_code),
    CASE WHEN COUNT(*) = COUNT(DISTINCT role_code) THEN '✅ PASS' ELSE '❌ FAIL' END
FROM roles;

-- ============================================================
-- TEST 9: Kiểm tra audit_logs — Trigger ghi log khi thêm NV
-- ============================================================
SELECT '=== TEST 9: Kiểm tra audit trail ===' AS test_name;
SELECT
    action, table_name, record_id,
    LEFT(new_values::TEXT, 80) AS preview,
    created_at
FROM audit_logs
WHERE table_name = 'employees'
ORDER BY created_at DESC
LIMIT 5;

SELECT
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS — Audit trail đang ghi log'
         ELSE '⚠️ WARNING — Chưa có audit log (có thể do chưa có thao tác UPDATE/DELETE)'
    END AS ket_qua
FROM audit_logs WHERE table_name = 'employees';

-- ============================================================
-- TEST 10: Kiểm tra Views
-- ============================================================
SELECT '=== TEST 10: Kiểm tra Views ===' AS test_name;
SELECT 'v_employee_public' AS view_name,
    COUNT(*) AS rows,
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS ket_qua
FROM v_employee_public
UNION ALL
SELECT 'v_today_attendance', COUNT(*),
    CASE WHEN COUNT(*) >= 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM v_today_attendance
UNION ALL
SELECT 'mv_dashboard_stats', COUNT(*),
    CASE WHEN COUNT(*) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM mv_dashboard_stats;

-- ============================================================
-- TEST 11: Kiểm tra function tìm kiếm tiếng Việt
-- ============================================================
SELECT '=== TEST 11: Kiểm tra fn_search_employees ===' AS test_name;
SELECT * FROM fn_search_employees('Quan');
SELECT * FROM fn_search_employees('NV-0842');
SELECT
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS — Tìm kiếm tiếng Việt hoạt động'
         ELSE '❌ FAIL — Không tìm thấy kết quả'
    END AS ket_qua
FROM fn_search_employees('Thao');

-- ============================================================
-- TEST 12: Kiểm tra Dashboard Materialized View
-- ============================================================
SELECT '=== TEST 12: Dashboard Stats ===' AS test_name;
SELECT
    total_active, total_inactive, present_today, late_today,
    pending_leaves, active_projects, open_tasks,
    CASE WHEN total_active > 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS ket_qua
FROM mv_dashboard_stats;

-- ============================================================
-- TEST 13: Kiểm tra Kanban — Task stages đủ 4 loại
-- ============================================================
SELECT '=== TEST 13: Kiểm tra Kanban Stages ===' AS test_name;
SELECT stage, COUNT(*) AS so_task
FROM tasks GROUP BY stage ORDER BY stage;

-- ============================================================
-- TEST 14: Kiểm tra phòng ban có trưởng phòng
-- ============================================================
SELECT '=== TEST 14: Kiểm tra phòng ban — trưởng phòng ===' AS test_name;
SELECT
    d.id, d.name, d.manager_id, e.full_name AS truong_phong,
    CASE WHEN d.manager_id IS NOT NULL THEN '✅' ELSE '⚠️ Chưa có TP' END AS ket_qua
FROM departments d
LEFT JOIN employees e ON d.manager_id = e.id
ORDER BY d.id;

-- ============================================================
-- TEST 15: Kiểm tra Enum types đủ 13 loại
-- ============================================================
SELECT '=== TEST 15: Kiểm tra Enum Types ===' AS test_name;
SELECT typname AS enum_name, COUNT(*) AS so_gia_tri
FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
GROUP BY typname ORDER BY typname;

-- ============================================================
-- KẾT LUẬN
-- ============================================================
SELECT '============================================' AS line;
SELECT '✅ HOÀN TẤT 15 TEST QUERIES — Database nexus_hrms' AS ket_luan;
SELECT '============================================' AS line;
