/**
 * smoke-test.js — Backend API Endpoint Smoke Test
 * NEXUS HRMS
 * 
 * Verifies:
 *   1. GET /api/health    -> 200 OK & { status: 'OK' }
 *   2. GET /api           -> 200 OK & Endpoint catalog
 *   3. POST /api/auth/login -> 200 OK & JWT token
 *   4. GET /api/auth/me   -> 200 OK & Authenticated user profile
 *   5. GET /api/employees -> 200 OK & Employee directory data
 * 
 * Usage:
 *   node scripts/smoke-test.js
 *   npm run test:smoke
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.TEST_API_URL || `http://localhost:${PORT}`;

// Danh sách tài khoản kiểm thử đăng nhập (ưu tiên tài khoản theo cấu hình / brief, fallback về seed data)
const LOGIN_CANDIDATES = [
  {
    email: process.env.TEST_EMAIL || 'admin@nexus.vn',
    password: process.env.TEST_PASSWORD || 'password123',
    description: 'Tài khoản cấu hình / brief (admin@nexus.vn)',
  },
  {
    email: 'hrd@fwbnexus.vn',
    password: 'Hrd@123456',
    description: 'Tài khoản HR Director (hrd@fwbnexus.vn)',
  },
  {
    email: 'ceo@fwbnexus.vn',
    password: 'Ceo@123456',
    description: 'Tài khoản CEO (ceo@fwbnexus.vn)',
  },
  {
    email: 'employee@fwbnexus.vn',
    password: 'Emp@123456',
    description: 'Tài khoản Nhân viên (employee@fwbnexus.vn)',
  },
];

async function runSmokeTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 NEXUS HRMS — Backend API Endpoint Smoke Test          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`🎯 API Base URL: ${BASE_URL}`);
  console.log('────────────────────────────────────────────────────────────\n');

  let token = null;
  let loggedInUser = null;
  const results = [];

  // Helper gửi HTTP request với timeout
  async function apiFetch(endpoint, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${BASE_URL}${endpoint}`;
      const res = await fetch(url, { ...options, signal: controller.signal });
      const contentType = res.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      return { status: res.status, statusText: res.statusText, ok: res.ok, data };
    } finally {
      clearTimeout(timer);
    }
  }

  // Kiểm tra trước: Backend có đang chạy không?
  try {
    await apiFetch('/api/health', { method: 'GET' }, 2500);
  } catch (err) {
    const isConnRefused = 
      err.cause?.code === 'ECONNREFUSED' ||
      err.code === 'ECONNREFUSED' ||
      err.name === 'AbortError' ||
      (err.message && err.message.toLowerCase().includes('fetch failed'));

    if (isConnRefused) {
      console.log('❌ Backend chưa được bật.');
      console.log('👉 Vui lòng chạy \'npm run dev\' hoặc \'npm run dev:backend\' trước khi chạy smoke-test.\n');
      console.log(`   (Chi tiết: Không thể kết nối tới ${BASE_URL}/api/health)`);
      console.log('────────────────────────────────────────────────────────────');
      process.exitCode = 1;
      return { success: false, error: 'BACKEND_NOT_RUNNING' };
    }
  }

  // ---------------------------------------------------------
  // Bước 1: GET /api/health
  // ---------------------------------------------------------
  try {
    const res = await apiFetch('/api/health');
    const isOk = res.status === 200 && res.data?.status === 'OK';
    if (isOk) {
      console.log(`[PASS] Bước 1: GET /api/health → HTTP ${res.status} OK`);
      console.log(`       Trạng thái: ${res.data.status} | Database: ${res.data.database} | Server: ${res.data.server} | Uptime: ${res.data.uptime}`);
      results.push({ step: 1, name: 'GET /api/health', success: true });
    } else {
      console.log(`[FAIL] Bước 1: GET /api/health → HTTP ${res.status} ${res.statusText}`);
      console.log(`       Dữ liệu nhận được: ${JSON.stringify(res.data)}`);
      results.push({ step: 1, name: 'GET /api/health', success: false });
    }
  } catch (error) {
    console.log(`[FAIL] Bước 1: GET /api/health → Lỗi mạng/kết nối: ${error.message}`);
    results.push({ step: 1, name: 'GET /api/health', success: false, error: error.message });
  }

  // ---------------------------------------------------------
  // Bước 2: GET /api
  // ---------------------------------------------------------
  try {
    const res = await apiFetch('/api');
    const hasEndpoints = res.status === 200 && res.data?.endpoints;
    if (hasEndpoints) {
      const endpointGroups = Object.keys(res.data.endpoints);
      console.log(`[PASS] Bước 2: GET /api → HTTP ${res.status} OK`);
      console.log(`       API Catalog: ${res.data.name} (v${res.data.version || '1.0.0'})`);
      console.log(`       Nhóm endpoints (${endpointGroups.length}): ${endpointGroups.join(', ')}`);
      results.push({ step: 2, name: 'GET /api', success: true });
    } else {
      console.log(`[FAIL] Bước 2: GET /api → HTTP ${res.status} ${res.statusText} (Không tìm thấy danh sách endpoints)`);
      results.push({ step: 2, name: 'GET /api', success: false });
    }
  } catch (error) {
    console.log(`[FAIL] Bước 2: GET /api → Lỗi mạng/kết nối: ${error.message}`);
    results.push({ step: 2, name: 'GET /api', success: false, error: error.message });
  }

  // ---------------------------------------------------------
  // Bước 3: POST /api/auth/login
  // ---------------------------------------------------------
  let loginSuccess = false;
  for (const candidate of LOGIN_CANDIDATES) {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidate.email, password: candidate.password }),
      });

      if (res.status === 200 && res.data?.token) {
        token = res.data.token;
        loggedInUser = res.data.user;
        loginSuccess = true;
        console.log(`[PASS] Bước 3: POST /api/auth/login → HTTP ${res.status} OK`);
        console.log(`       Tài khoản: ${candidate.email} (${candidate.description})`);
        console.log(`       Đăng nhập thành công: ${loggedInUser?.fullName || 'N/A'} (Vai trò: ${loggedInUser?.roleCode || 'N/A'})`);
        console.log(`       JWT Token: ${token.substring(0, 24)}... (Đã nhận token xác thực)`);
        results.push({ step: 3, name: 'POST /api/auth/login', success: true });
        break;
      }
    } catch {
      // Thử tài khoản tiếp theo nếu có lỗi kết nối tạm thời
    }
  }

  if (!loginSuccess) {
    console.log('[FAIL] Bước 3: POST /api/auth/login → Không thể đăng nhập.');
    console.log('       Đã thử: admin@nexus.vn, hrd@fwbnexus.vn, ceo@fwbnexus.vn, employee@fwbnexus.vn.');
    results.push({ step: 3, name: 'POST /api/auth/login', success: false });
  }

  // ---------------------------------------------------------
  // Bước 4: GET /api/auth/me
  // ---------------------------------------------------------
  if (token) {
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const isOk = res.status === 200 && res.data?.success && res.data?.user;
      if (isOk) {
        const u = res.data.user;
        console.log(`[PASS] Bước 4: GET /api/auth/me → HTTP ${res.status} OK`);
        console.log(`       Thông tin cá nhân: ${u.fullName} (Email: ${u.email})`);
        console.log(`       Phòng ban: ${u.departmentName || 'N/A'} | Vị trí: ${u.positionName || u.jobTitle || 'N/A'}`);
        results.push({ step: 4, name: 'GET /api/auth/me', success: true });
      } else {
        console.log(`[FAIL] Bước 4: GET /api/auth/me → HTTP ${res.status} ${res.statusText}`);
        console.log(`       Dữ liệu trả về: ${JSON.stringify(res.data)}`);
        results.push({ step: 4, name: 'GET /api/auth/me', success: false });
      }
    } catch (error) {
      console.log(`[FAIL] Bước 4: GET /api/auth/me → Lỗi: ${error.message}`);
      results.push({ step: 4, name: 'GET /api/auth/me', success: false, error: error.message });
    }
  } else {
    console.log('[SKIP] Bước 4: GET /api/auth/me → Bỏ qua do bước 3 chưa có JWT token');
    results.push({ step: 4, name: 'GET /api/auth/me', success: false, skipped: true });
  }

  // ---------------------------------------------------------
  // Bước 5: GET /api/employees
  // ---------------------------------------------------------
  if (token) {
    try {
      const res = await apiFetch('/api/employees', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const isOk = res.status === 200 && res.data?.success;
      if (isOk) {
        const count = res.data.total ?? (Array.isArray(res.data.data) ? res.data.data.length : 0);
        console.log(`[PASS] Bước 5: GET /api/employees → HTTP ${res.status} OK`);
        console.log(`       Danh sách nhân viên: ${count} nhân sự trong cơ sở dữ liệu`);
        results.push({ step: 5, name: 'GET /api/employees', success: true });
      } else {
        console.log(`[FAIL] Bước 5: GET /api/employees → HTTP ${res.status} ${res.statusText}`);
        console.log(`       Dữ liệu trả về: ${JSON.stringify(res.data)}`);
        results.push({ step: 5, name: 'GET /api/employees', success: false });
      }
    } catch (error) {
      console.log(`[FAIL] Bước 5: GET /api/employees → Lỗi: ${error.message}`);
      results.push({ step: 5, name: 'GET /api/employees', success: false, error: error.message });
    }
  } else {
    console.log('[SKIP] Bước 5: GET /api/employees → Bỏ qua do bước 3 chưa có JWT token');
    results.push({ step: 5, name: 'GET /api/employees', success: false, skipped: true });
  }

  // ---------------------------------------------------------
  // Báo cáo tổng kết
  // ---------------------------------------------------------
  console.log('\n────────────────────────────────────────────────────────────');
  const passedCount = results.filter(r => r.success).length;
  console.log(`📊 TỔNG KẾT SMOKE TEST: ${passedCount}/${results.length} bước vượt qua thành công!`);
  if (passedCount === results.length) {
    console.log('🎉 TẤT CẢ ENDPOINTS SMOKE TEST ĐỀU HOẠT ĐỘNG HOÀN HẢO!');
  } else {
    console.log('⚠️  Một số bước kiểm thử không thành công.');
  }
  console.log('────────────────────────────────────────────────────────────');

  const allPassed = passedCount === results.length;
  if (!allPassed) {
    process.exitCode = 1;
  }
  return { success: allPassed, passedCount, total: results.length, results };
}

if (require.main === module) {
  runSmokeTests().then(result => {
    process.exitCode = result.success ? 0 : 1;
  });
}

module.exports = { runSmokeTests };
