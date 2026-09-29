#!/usr/bin/env node
/**
 * Reproducible End-to-End Browser DOM/UI & Cross-Layer Verification Script (R08 / R14 / R17 / R18 / R19 / F27)
 * Runs against isolated `nexus_hrms_test` database, spawns backend (:8000) + frontend (:3000),
 * drives Headless Chrome via Chrome DevTools Protocol (CDP) using real DOM/UI interactions:
 *   1. Settings UI form fill -> click Save button -> browser reload -> verify DOM input values + DB/API
 *   2. Real UI Login & DOM content verification for 2 EMPLOYEEs (same role) + 2 LINE_MANAGERs (different departments)
 *   3. UI-initiated HTTP 403 & HTTP 500 error handling + R17 UI E2E (GET /api/settings 500 -> backend recovers -> Save blocked -> Retry loads baseline -> Save diff patch -> reload error blocks Save)
 *   4. UI Pagination button clicks ('Sau' / 'Trước') on /directory table with >50 records -> verify rendered <tr> rows across all pages
 *   5. R18 + R19 UI Payroll: Stale payroll blocked in Lock Modal -> Recalculate preserves HR bonus -> Lock -> Multi-period (2028-09 & 2028-10), multi-employee (3+ positive + 0-net + missing-bank) CSV download & full row/column/sum reconciliation + negative tests (swapped amounts, dropped row, cross-period)
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nexus_hrms_test';

const db = require('../src/config/db');
const app = require('../src/app');
const { initSocket } = require('../src/socket');
const settingsService = require('../src/modules/settings/service');
const {
  reconcilePayrollReportCsv,
  reconcileBankTransferCsv,
} = require('../src/utils/csvReconciler');
const { assertSafeTestDatabase } = require('../src/utils/testDbGuard');
const { createTestEmployee, deleteTestEmployees } = require('../tests/helpers/employees');
const { createTestUser, deleteTestUsers } = require('../tests/helpers/users');
const { giveBalance, deleteTestLeaves } = require('../tests/helpers/leaves');

const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 8000);
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 3000);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9229);

function findChromeBinary() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Could not find Chrome or Edge binary for headless E2E verification');
}

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method && this.eventHandlers.has(msg.method)) {
        for (const handler of this.eventHandlers.get(msg.method)) {
          Promise.resolve(handler(msg.params)).catch(() => {});
        }
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, []);
    this.eventHandlers.get(method).push(handler);
  }

  clearListeners(method) {
    this.eventHandlers.delete(method);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`CDP Eval Error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async navigate(url, waitMs = 1800) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async reload(waitMs = 2000) {
    await this.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async waitForSelector(selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.eval(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (exists) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Timed out waiting for DOM selector: ${selector}`);
  }

  async fillInput(selector, value) {
    await this.waitForSelector(selector);
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      const proto = el.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {
        desc.set.call(el, String(${JSON.stringify(value)}));
      } else {
        el.value = String(${JSON.stringify(value)});
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(ok, true, `Failed to fill input ${selector}`);
  }

  async click(selector, waitMs = 400) {
    await this.waitForSelector(selector);
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.disabled) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    assert.equal(ok, true, `Failed to click ${selector}`);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function createRoleAccount({
  role,
  departmentId = 'DEPT-IT',
  fullName,
  baseSalary = 20000000,
  bankAccount = '0071001234567',
  bankName = 'Vietcombank',
}) {
  const emp = await createTestEmployee({ departmentId, status: 'DANG_LAM_VIEC' });
  await db.query(
    "UPDATE employees SET full_name = COALESCE($2, full_name), base_salary = COALESCE($3, base_salary), joined_date = '2020-01-01', bank_account = $4, bank_name = $5 WHERE id = $1",
    [emp.id, fullName || null, baseSalary || null, bankAccount, bankName]
  );
  emp.full_name = fullName || emp.full_name;
  const user = await createTestUser({ role, employeeId: emp.id, password: 'Password@123' });
  return { emp, user, password: 'Password@123' };
}

/**
 * Perform authentic UI login via the /login page form inputs and submit button.
 */
async function loginViaUi(cdp, email, password) {
  await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/login`, 1000);
  await cdp.eval(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} return true; })()`);
  await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/login`, 1500);
  await cdp.waitForSelector('input[type="text"]', 10000);

  await cdp.fillInput('input[type="text"]', email);
  await cdp.fillInput('input[type="password"]', password);
  await cdp.click('button[type="submit"]', 1600);

  const start = Date.now();
  while (Date.now() - start < 8000) {
    const pathname = await cdp.eval('window.location.pathname');
    if (pathname === '/dashboard' || pathname === '/portal') {
      return pathname;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const errText = await cdp.eval('document.body.innerText');
  throw new Error(`UI Login did not redirect from /login for ${email}. Page text: ${errText.slice(0, 300)}`);
}

async function waitForDownloadedCsv(downloadDir, prefix, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = fs.existsSync(downloadDir) ? fs.readdirSync(downloadDir) : [];
    const match = files.find((f) => f.startsWith(prefix) && f.endsWith('.csv') && !f.endsWith('.crdownload'));
    if (match) {
      const fullPath = path.join(downloadDir, match);
      const stat = fs.statSync(fullPath);
      if (stat.size > 0) return { filename: match, fullPath, content: fs.readFileSync(fullPath, 'utf8') };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for downloaded CSV with prefix "${prefix}" in ${downloadDir}`);
}

async function main() {
  assert.match(process.env.DB_NAME || '', /_test$/, 'E2E verification must only run on *_test database');
  const verifiedDb = await assertSafeTestDatabase(db, { context: 'e2e-browser-verify.main' });
  console.log('=== [R14-R23 UI-DRIVEN E2E VERIFICATION START] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);
  console.log(`DB_NAME=${process.env.DB_NAME} (current_database()=${verifiedDb})`);

  const downloadDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `nexus-e2e-downloads-${Date.now()}`);
  fs.mkdirSync(downloadDir, { recursive: true });

  // 1. Start Backend HTTP + WS server on BACKEND_PORT (dual-stack localhost + 127.0.0.1)
  const backendServer = http.createServer(app);
  initSocket(backendServer);
  await new Promise((resolve) => backendServer.listen(BACKEND_PORT, resolve));
  console.log(`[SERVER] Backend listening on http://127.0.0.1:${BACKEND_PORT}`);

  // 2. Start Vite Frontend server on FRONTEND_PORT if not already running
  let viteProc = null;
  let viteAlreadyUp = false;
  try {
    const check = await fetch(`http://127.0.0.1:${FRONTEND_PORT}`);
    if (check.status < 500) viteAlreadyUp = true;
  } catch {}

  if (!viteAlreadyUp) {
    viteProc = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'npx',
      process.platform === 'win32'
        ? ['/c', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)]
        : ['vite', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)],
      { cwd: path.resolve(__dirname, '../../FrontEnd'), stdio: 'ignore' }
    );
    await waitForHttp(`http://127.0.0.1:${FRONTEND_PORT}`);
  }
  console.log(`[SERVER] Frontend reachable on http://127.0.0.1:${FRONTEND_PORT}`);

  // 3. Launch Headless Chrome with remote debugging
  const chromeBin = findChromeBinary();
  const userDataDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `nexus-e2e-cdp-${Date.now()}`);
  const chromeProc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      `http://127.0.0.1:${FRONTEND_PORT}/login`,
    ],
    { stdio: 'ignore' }
  );

  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, 'No CDP page target found');

  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  const originalSettings = await settingsService.getSettings();
  try {
    // =========================================================================
    // SCENARIO 1: UI Settings Form Fill -> Click Save Button -> Reload -> Verify DOM & DB
    // =========================================================================
    const hrAcc = await createRoleAccount({ role: 'HR_DIRECTOR', departmentId: 'DEPT-HR', fullName: 'Giám Đốc Nhân Sự E2E' });
    const hrLanding = await loginViaUi(cdp, hrAcc.user.email, hrAcc.password);
    assert.equal(hrLanding, '/dashboard');

    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/settings`, 2200);
    await cdp.waitForSelector('[data-testid="input-max-ot-per-month"]');

    // Fill Attendance tab inputs via DOM
    await cdp.fillInput('[data-testid="input-late-grace-minutes"]', '20');
    await cdp.fillInput('[data-testid="input-max-ot-per-month"]', '36');

    // Switch to Tax & BHXH tab via DOM click and fill tax/policy inputs
    await cdp.click('[data-testid="settings-tab-tax"]', 400);
    await cdp.fillInput('[data-testid="input-pit-deduction"]', '15500000');
    await cdp.fillInput('[data-testid="input-dependent-deduction"]', '6200000');
    await cdp.fillInput('[data-testid="input-default-allowances"]', '1900000');
    await cdp.fillInput('[data-testid="input-policy-effective-from"]', '2028-06');

    // Click Save button in DOM
    await cdp.click('[data-testid="settings-save-btn"]', 1200);
    const saveBtnTextAfterClick = await cdp.eval(`document.querySelector('[data-testid="settings-save-btn"]')?.innerText || ''`);
    const hasErrorAfterSave = await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-error-banner"]'))`);
    assert.equal(hasErrorAfterSave, false, 'Settings UI save must not display error banner');
    assert.match(saveBtnTextAfterClick, /Đã lưu cấu hình thành công/i);

    // Reload browser page and inspect rendered DOM input values + DB state
    await cdp.reload(2200);
    await cdp.waitForSelector('[data-testid="input-max-ot-per-month"]');
    const domAttInputs = await cdp.eval(`({
      lateGrace: document.querySelector('[data-testid="input-late-grace-minutes"]')?.value,
      maxOt: document.querySelector('[data-testid="input-max-ot-per-month"]')?.value,
    })`);
    await cdp.click('[data-testid="settings-tab-tax"]', 400);
    const domTaxInputs = await cdp.eval(`({
      pitDeduction: document.querySelector('[data-testid="input-pit-deduction"]')?.value,
      dependentDeduction: document.querySelector('[data-testid="input-dependent-deduction"]')?.value,
      defaultAllowances: document.querySelector('[data-testid="input-default-allowances"]')?.value,
      policyEffectiveFrom: document.querySelector('[data-testid="input-policy-effective-from"]')?.value,
    })`);

    const dbSettingsAfterUiSave = await settingsService.getSettings();
    const dbPolicyVersionRow = (
      await db.query("SELECT * FROM system_policy_versions WHERE effective_from = '2028-06'")
    ).rows[0];

    assert.equal(domAttInputs.lateGrace, '20');
    assert.equal(domAttInputs.maxOt, '36');
    assert.equal(domTaxInputs.pitDeduction, '15500000');
    assert.equal(domTaxInputs.dependentDeduction, '6200000');
    assert.equal(domTaxInputs.defaultAllowances, '1900000');
    assert.equal(domTaxInputs.policyEffectiveFrom, '2028-06');

    assert.equal(Number(dbSettingsAfterUiSave.max_ot_per_month), 36);
    assert.equal(Number(dbSettingsAfterUiSave.personal_income_tax_deduction), 15500000);
    assert.ok(dbPolicyVersionRow && dbPolicyVersionRow.policy, 'system_policy_versions must store version 2028-06');
    assert.equal(Number(dbPolicyVersionRow.policy.personal_income_tax_deduction), 15500000);
    assert.equal(Number(dbPolicyVersionRow.policy.default_allowances), 1900000);
    console.log(
      `[ASSERT 1 PASS] UI Settings Form Save + Reload: DOM maxOt=${domAttInputs.maxOt}, DOM pitDeduction=${domTaxInputs.pitDeduction}, DOM policyEffectiveFrom=${domTaxInputs.policyEffectiveFrom}, DB system_policy_versions(2028-06)=${dbPolicyVersionRow.policy.personal_income_tax_deduction}`
    );

    // Restore baseline settings before payroll scenarios
    await db.query("DELETE FROM system_policy_versions WHERE effective_from = '2028-06'");
    await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null);

    // =========================================================================
    // SCENARIO 2: UI Login & Rendered DOM Scope Check (2 EMPLOYEEs + 2 LINE_MANAGERs)
    // =========================================================================
    const empA = await createRoleAccount({ role: 'EMPLOYEE', departmentId: 'DEPT-IT', fullName: 'Nguyễn Văn An E2E', baseSalary: 20000000 });
    const empB = await createRoleAccount({ role: 'EMPLOYEE', departmentId: 'DEPT-IT', fullName: 'Trần Thị Bình E2E', baseSalary: 32000000 });
    await giveBalance(empA.emp.id, new Date().getFullYear(), 9.5);
    await giveBalance(empB.emp.id, new Date().getFullYear(), 4.0);

    const itMgr = await createRoleAccount({ role: 'LINE_MANAGER', departmentId: 'DEPT-IT', fullName: 'Quản Lý Kỹ Thuật E2E' });
    const salesMgr = await createRoleAccount({ role: 'LINE_MANAGER', departmentId: 'DEPT-SALES', fullName: 'Quản Lý Kinh Doanh E2E' });
    const salesSub = await createRoleAccount({ role: 'EMPLOYEE', departmentId: 'DEPT-SALES', fullName: 'Lê Kinh Doanh E2E' });

    // 2a. Log in via UI as Employee A and inspect rendered /portal DOM
    const empALanding = await loginViaUi(cdp, empA.user.email, empA.password);
    assert.equal(empALanding, '/portal');
    await new Promise((r) => setTimeout(r, 1500));
    const empAPortalDom = await cdp.eval('document.body.innerText');
    assert.ok(empAPortalDom.includes('Nguyễn Văn An E2E'), 'Employee A portal DOM must show Employee A name');
    assert.ok(empAPortalDom.includes(empA.emp.id), 'Employee A portal DOM must show Employee A ID');
    assert.ok(empAPortalDom.includes('9.5'), 'Employee A portal DOM must show Employee A leave balance 9.5');
    assert.equal(empAPortalDom.includes('Trần Thị Bình E2E'), false, 'Employee A portal DOM must not show Employee B name');

    // 2b. Log in via UI as Employee B and inspect rendered /portal DOM
    const empBLanding = await loginViaUi(cdp, empB.user.email, empB.password);
    assert.equal(empBLanding, '/portal');
    await new Promise((r) => setTimeout(r, 1500));
    const empBPortalDom = await cdp.eval('document.body.innerText');
    assert.ok(empBPortalDom.includes('Trần Thị Bình E2E'), 'Employee B portal DOM must show Employee B name');
    assert.ok(empBPortalDom.includes(empB.emp.id), 'Employee B portal DOM must show Employee B ID');
    assert.equal(empBPortalDom.includes('Nguyễn Văn An E2E'), false, 'Employee B portal DOM must not show Employee A name');

    // 2c. Log in via UI as IT Line Manager -> navigate to /directory -> inspect rendered DOM table rows
    await loginViaUi(cdp, itMgr.user.email, itMgr.password);
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/directory`, 2200);
    await cdp.waitForSelector('[data-testid="directory-row"]');
    const itMgrDomRows = await cdp.eval(`Array.from(document.querySelectorAll('[data-testid="directory-row"]')).map(tr => ({
      empId: tr.getAttribute('data-emp-id'),
      text: tr.innerText
    }))`);
    assert.ok(itMgrDomRows.length > 0, 'IT Manager must see rendered department rows in DOM');
    assert.equal(
      itMgrDomRows.some((r) => r.empId === salesSub.emp.id || r.text.includes('Lê Kinh Doanh E2E')),
      false,
      'IT Manager DOM table must never render DEPT-SALES employee'
    );

    // 2d. Log in via UI as Sales Line Manager -> navigate to /directory -> inspect rendered DOM table rows
    await loginViaUi(cdp, salesMgr.user.email, salesMgr.password);
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/directory`, 2200);
    await cdp.waitForSelector('[data-testid="directory-row"]');
    const salesMgrDomRows = await cdp.eval(`Array.from(document.querySelectorAll('[data-testid="directory-row"]')).map(tr => ({
      empId: tr.getAttribute('data-emp-id'),
      text: tr.innerText
    }))`);
    assert.ok(
      salesMgrDomRows.some((r) => r.empId === salesSub.emp.id && r.text.includes('Lê Kinh Doanh E2E')),
      'Sales Manager DOM table must render DEPT-SALES subordinate'
    );
    assert.equal(
      salesMgrDomRows.some((r) => r.empId === empA.emp.id || r.text.includes('Nguyễn Văn An E2E')),
      false,
      'Sales Manager DOM table must never render DEPT-IT employee'
    );
    console.log(
      `[ASSERT 2 PASS] UI Scope Isolation: EmpA Portal=('Nguyễn Văn An E2E', 9.5 days), EmpB Portal=('Trần Thị Bình E2E'), IT Manager DOM rows=${itMgrDomRows.length} (0 Sales), Sales Manager DOM rows=${salesMgrDomRows.length} (includes ${salesSub.emp.id}, 0 IT)`
    );

    // =========================================================================
    // SCENARIO 3: UI-Triggered HTTP 403 & HTTP 500 + R17 Settings Load Failure Guard & Retry Flow
    // =========================================================================
    await loginViaUi(cdp, hrAcc.user.email, hrAcc.password);
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/settings`, 2200);
    await cdp.waitForSelector('[data-testid="settings-save-btn"]');

    // 3a. Trigger real HTTP 403 from backend when clicking Save on /settings by temporarily changing DB role_code to EMPLOYEE
    await db.query("UPDATE users SET role_code = 'EMPLOYEE' WHERE id = $1", [hrAcc.user.id]);
    try {
      await cdp.fillInput('[data-testid="input-max-ot-per-month"]', '48');
      await cdp.click('[data-testid="settings-save-btn"]', 1200);
      const err403Dom = await cdp.eval(`({
        errorBanner: document.querySelector('[data-testid="settings-error-banner"]')?.innerText || '',
        btnText: document.querySelector('[data-testid="settings-save-btn"]')?.innerText || ''
      })`);
      assert.ok(err403Dom.errorBanner.length > 0, '403 UI save must render error banner in DOM');
      assert.doesNotMatch(err403Dom.btnText, /Đã lưu cấu hình thành công/i, '403 UI save must never show success text');
    } finally {
      await db.query("UPDATE users SET role_code = 'HR_DIRECTOR' WHERE id = $1", [hrAcc.user.id]);
    }

    // 3b. Trigger real HTTP 500 from backend on UI-initiated requests by simulating DB failure in db.query / db.withTransaction
    const origQuery = db.query.bind(db);
    const origWithTx = db.withTransaction.bind(db);
    let simulateDb500 = true;
    db.query = async (sql, params) => {
      if (simulateDb500 && /system_settings|FROM employees e/i.test(String(sql))) {
        throw new Error('SIMULATED_DB_FAILURE_500');
      }
      return origQuery(sql, params);
    };
    db.withTransaction = async (fn) => {
      if (simulateDb500) {
        throw new Error('SIMULATED_DB_FAILURE_500');
      }
      return origWithTx(fn);
    };

    try {
      // Click Save on /settings while backend returns real HTTP 500
      await cdp.click('[data-testid="settings-save-btn"]', 1000);
      const err500SettingsDom = await cdp.eval(`({
        errorBanner: document.querySelector('[data-testid="settings-error-banner"]')?.innerText || '',
        btnText: document.querySelector('[data-testid="settings-save-btn"]')?.innerText || ''
      })`);
      assert.match(err500SettingsDom.errorBanner, /Internal Server Error|500|Không thể lưu/i);
      assert.doesNotMatch(err500SettingsDom.btnText, /Đã lưu cấu hình thành công/i);

      // Navigate to /directory while GET /api/employees returns real HTTP 500 -> verify error banner & 0 fabricated rows
      await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/directory`, 1800);
      const err500DirectoryDom = await cdp.eval(`({
        errorBanner: document.querySelector('[data-testid="directory-error-banner"]')?.innerText || '',
        rowCount: document.querySelectorAll('[data-testid="directory-row"]').length
      })`);
      assert.match(err500DirectoryDom.errorBanner, /Internal Server Error|500|Lỗi khi tải/i);
      assert.equal(err500DirectoryDom.rowCount, 0, 'Directory UI must render 0 rows (no fabricated employees) when API returns 500');
      console.log(
        `[ASSERT 3a/3b PASS] UI 403/500 Error Handling: 403/500 Settings Banner="${err500SettingsDom.errorBanner}", 500 Directory Banner="${err500DirectoryDom.errorBanner}", rendered fallback rows=${err500DirectoryDom.rowCount}`
      );
    } finally {
      simulateDb500 = false;
      db.query = origQuery;
      db.withTransaction = origWithTx;
    }

    // 3c. R17 UI E2E: Initial GET /api/settings fails (500) -> Backend recovers -> Save blocked (0 PUTs, DB untouched) -> Retry loads real server baseline -> Edit 1 field & Save succeeds -> Reload failure also blocks Save
    await settingsService.updateSettings(
      { employeeId: null, role: 'HR_DIRECTOR' },
      {
        personal_income_tax_deduction: 14200000,
        dependent_deduction: 5600000,
        max_ot_per_month: 34,
        policy_effective_from: '2026-06',
      },
      null
    );

    let simulateSettingsGet500 = true;
    let settingsPutCallCount = 0;
    db.query = async (sql, params) => {
      if (simulateSettingsGet500 && /FROM system_settings/i.test(String(sql))) {
        throw new Error('SIMULATED_SETTINGS_GET_500');
      }
      return origQuery(sql, params);
    };
    db.withTransaction = async (fn) => {
      settingsPutCallCount++;
      return origWithTx(fn);
    };

    try {
      // Open /settings while GET /api/settings returns 500
      await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/settings`, 2000);
      const r17FailedLoadState = await cdp.eval(`({
        errorBanner: document.querySelector('[data-testid="settings-error-banner"]')?.innerText || '',
        hasRetryBtn: Boolean(document.querySelector('[data-testid="settings-retry-btn"]')),
        saveDisabled: Boolean(document.querySelector('[data-testid="settings-save-btn"]')?.disabled),
        maxOtValue: document.querySelector('[data-testid="input-max-ot-per-month"]')?.value ?? '',
        maxOtDisabled: Boolean(document.querySelector('[data-testid="input-max-ot-per-month"]')?.disabled),
      })`);
      assert.ok(r17FailedLoadState.errorBanner.length > 0, 'R17: GET /api/settings 500 must render error banner');
      assert.equal(r17FailedLoadState.hasRetryBtn, true, 'R17: Must render retry button when GET /api/settings fails');
      assert.equal(r17FailedLoadState.saveDisabled, true, 'R17: Save button must be disabled when baseline has not loaded');
      assert.equal(r17FailedLoadState.maxOtDisabled, true, 'R17: Inputs must be disabled when baseline has not loaded');
      assert.equal(r17FailedLoadState.maxOtValue, '', 'R17: Input must NOT initialize with sample default 40 when GET failed');

      // Backend recovers (GET /api/settings will now succeed), but user has NOT clicked Retry yet!
      simulateSettingsGet500 = false;
      settingsPutCallCount = 0;

      // Attempt forced DOM click on Save button before Retry -> must remain disabled and send 0 PUT requests!
      const saveStillDisabledBeforeRetry = await cdp.eval(`(() => {
        const btn = document.querySelector('[data-testid="settings-save-btn"]');
        const wasDisabled = Boolean(btn?.disabled);
        if (btn) btn.click();
        return wasDisabled;
      })()`);
      await new Promise((r) => setTimeout(r, 600));
      const putCallsBeforeRetry = settingsPutCallCount;
      assert.equal(saveStillDisabledBeforeRetry, true, 'R17: Save button must stay disabled after backend recovery until Retry succeeds');
      assert.equal(putCallsBeforeRetry, 0, 'R17: 0 PUT transactions may execute when Save is clicked before baseline load');

      const dbBeforeRetry = await settingsService.getSettings();
      assert.equal(Number(dbBeforeRetry.personal_income_tax_deduction), 14200000, 'R17: DB pit_deduction must remain 14200000 (not overwritten by 11000000)');
      assert.equal(Number(dbBeforeRetry.max_ot_per_month), 34, 'R17: DB max_ot_per_month must remain 34');

      // Click Retry button (`Thử tải lại dữ liệu`) -> loads real server baseline
      await cdp.click('[data-testid="settings-retry-btn"]', 1200);
      const r17AfterRetryState = await cdp.eval(`({
        hasErrorBanner: Boolean(document.querySelector('[data-testid="settings-error-banner"]')),
        saveDisabled: Boolean(document.querySelector('[data-testid="settings-save-btn"]')?.disabled),
        maxOtValue: document.querySelector('[data-testid="input-max-ot-per-month"]')?.value ?? '',
      })`);
      assert.equal(r17AfterRetryState.hasErrorBanner, false, 'R17: Error banner must clear after Retry succeeds');
      assert.equal(r17AfterRetryState.saveDisabled, false, 'R17: Save button must be enabled after Retry loads baseline');
      assert.equal(r17AfterRetryState.maxOtValue, '34', 'R17: Retry must populate actual server value 34');

      // Edit 1 field (max_ot_per_month = 32) and click Save -> must succeed and preserve all unedited fields
      await cdp.fillInput('[data-testid="input-max-ot-per-month"]', '32');
      await cdp.click('[data-testid="settings-save-btn"]', 1200);
      const dbAfterR17Save = await settingsService.getSettings();
      assert.equal(Number(dbAfterR17Save.max_ot_per_month), 32, 'R17: Edited field max_ot_per_month must update to 32');
      assert.equal(Number(dbAfterR17Save.personal_income_tax_deduction), 14200000, 'R17: Unedited field pit_deduction must remain 14200000');

      // Now test reload failure after baseline was loaded: click `Tải lại` while GET fails -> must clear baseline and disable Save
      simulateSettingsGet500 = true;
      await cdp.click('[data-testid="settings-reload-btn"]', 1000);
      const r17AfterFailedReload = await cdp.eval(`({
        hasErrorBanner: Boolean(document.querySelector('[data-testid="settings-error-banner"]')),
        saveDisabled: Boolean(document.querySelector('[data-testid="settings-save-btn"]')?.disabled),
      })`);
      assert.equal(r17AfterFailedReload.hasErrorBanner, true, 'R17: Failed reload must display error banner');
      assert.equal(r17AfterFailedReload.saveDisabled, true, 'R17: Failed reload must disable Save button to prevent stale overwrite');

      // Restore GET and click Retry
      simulateSettingsGet500 = false;
      await cdp.click('[data-testid="settings-retry-btn"]', 1000);
      console.log(
        `[ASSERT 3c (R17) PASS] Settings Load Failure Guard & Retry: failedLoadDisabled=true, putCallsBeforeRetry=${putCallsBeforeRetry}, retryLoadedMaxOt=${r17AfterRetryState.maxOtValue}, savedMaxOt=${dbAfterR17Save.max_ot_per_month}, preservedPit=${dbAfterR17Save.personal_income_tax_deduction}, failedReloadBlockedSave=${r17AfterFailedReload.saveDisabled}`
      );
    } finally {
      simulateSettingsGet500 = false;
      db.query = origQuery;
      db.withTransaction = origWithTx;
      await db.query("DELETE FROM system_policy_versions WHERE effective_from = '2026-06'").catch(() => {});
      await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null);
    }

    // =========================================================================
    // SCENARIO 4: UI Pagination Clicks on /directory Table with >50 Records
    // =========================================================================
    const currentCount = (await db.query('SELECT COUNT(*)::int AS n FROM employees')).rows[0].n;
    const needed = Math.max(0, 55 - currentCount);
    for (let i = 0; i < needed; i++) {
      await createTestEmployee({ departmentId: 'DEPT-IT', status: 'DANG_LAM_VIEC' });
    }
    const totalEmployeesInDb = (await db.query('SELECT COUNT(*)::int AS n FROM employees')).rows[0].n;
    assert.ok(totalEmployeesInDb > 50, `Expected >50 employees in test DB, got ${totalEmployeesInDb}`);

    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/directory`, 2200);
    await cdp.waitForSelector('[data-testid="directory-row"]');

    const seenIdsByPage = [];
    const expectedTotalPages = Math.ceil(totalEmployeesInDb / 20);

    for (let p = 1; p <= expectedTotalPages; p++) {
      const pageState = await cdp.eval(`({
        infoText: document.querySelector('[data-testid="directory-pagination-info"]')?.innerText || '',
        empIds: Array.from(document.querySelectorAll('[data-testid="directory-row"]')).map(r => r.getAttribute('data-emp-id')),
        prevDisabled: Boolean(document.querySelector('[data-testid="directory-prev-page"]')?.disabled),
        nextDisabled: Boolean(document.querySelector('[data-testid="directory-next-page"]')?.disabled)
      })`);
      assert.match(pageState.infoText, new RegExp(`Trang ${p} / ${expectedTotalPages}`));
      if (p < expectedTotalPages) {
        assert.equal(pageState.empIds.length, 20, `Page ${p} must render 20 <tr> rows in DOM`);
        assert.equal(pageState.nextDisabled, false);
      } else {
        assert.equal(pageState.empIds.length, totalEmployeesInDb - (expectedTotalPages - 1) * 20);
        assert.equal(pageState.nextDisabled, true);
      }
      seenIdsByPage.push(pageState.empIds);

      if (p < expectedTotalPages) {
        await cdp.click('[data-testid="directory-next-page"]', 900);
      }
    }

    const flatIds = seenIdsByPage.flat();
    const uniqueIds = new Set(flatIds);
    assert.equal(flatIds.length, totalEmployeesInDb, 'Sum of rendered DOM rows across pages must equal DB total');
    assert.equal(uniqueIds.size, totalEmployeesInDb, 'Rendered DOM rows across pages must have 0 duplicate IDs');
    console.log(
      `[ASSERT 4 PASS] UI Pagination Clicks (>50 records): DB total=${totalEmployeesInDb}, pages=${expectedTotalPages}, rows per page=[${seenIdsByPage.map((a) => a.length).join(', ')}], unique rendered DOM rows=${uniqueIds.size}`
    );

    // =========================================================================
    // SCENARIO 5 (R18 + R19): Multi-Employee, Multi-Period Payroll Stale Guard, Lock, and Strict CSV Reconciliation
    // =========================================================================
    const paidEmp1 = await createRoleAccount({
      role: 'EMPLOYEE',
      departmentId: 'DEPT-IT',
      fullName: 'Phạm Thực Lĩnh CSV 1',
      baseSalary: 22000000,
      bankAccount: '0071001111111',
      bankName: 'Vietcombank',
    });
    const paidEmp2 = await createRoleAccount({
      role: 'EMPLOYEE',
      departmentId: 'DEPT-IT',
      fullName: 'Lê Thực Lĩnh CSV 2',
      baseSalary: 33000000,
      bankAccount: '1903002222222',
      bankName: 'Techcombank',
    });
    const paidEmp3 = await createRoleAccount({
      role: 'EMPLOYEE',
      departmentId: 'DEPT-SALES',
      fullName: 'Hoàng Thực Lĩnh CSV 3',
      baseSalary: 16500000,
      bankAccount: '8888003333333',
      bankName: 'MB Bank',
    });
    const noBankEmp = await createRoleAccount({
      role: 'EMPLOYEE',
      departmentId: 'DEPT-HR',
      fullName: 'Đỗ Thiếu Ngân Hàng CSV',
      baseSalary: 18000000,
      bankAccount: null,
      bankName: null,
    });

    // Period 2028-09 attendance (distinct workdays & OT for each employee)
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-09-04'::date + g), 'DUNG_GIO', CASE WHEN g = 0 THEN 4 ELSE 0 END FROM generate_series(0, 21) g`,
      [paidEmp1.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-09-04'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 19) g`,
      [paidEmp2.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-09-04'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
      [paidEmp3.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-09-04'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
      [noBankEmp.emp.id]
    );

    // Period 2028-10 attendance (distinct from 2028-09!)
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-10-02'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 20) g`,
      [paidEmp1.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-10-02'::date + g), 'DUNG_GIO', CASE WHEN g = 0 THEN 2 ELSE 0 END FROM generate_series(0, 20) g`,
      [paidEmp2.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-10-02'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 18) g`,
      [paidEmp3.emp.id]
    );
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-10-02'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
      [noBankEmp.emp.id]
    );

    const payrollServiceBackend = require('../src/modules/payroll/service');
    const hrActor = { userId: hrAcc.user.id, employeeId: hrAcc.emp.id, role: 'HR_DIRECTOR' };

    // Calculate and lock 2028-09 first
    await payrollServiceBackend.calculate(hrActor, '2028-09', null);
    const period09Row = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-09'")).rows[0];
    await payrollServiceBackend.lock(hrActor, period09Row.id, {
      acknowledgeAnomalies: true,
      note: 'Chốt kỳ 2028-09 đối chiếu đa kỳ R19',
    });

    // Calculate 2028-10, apply HR manual adjustment (bonus = 1,500,000) to paidEmp1, then add 1 more attendance day so 2028-10 becomes STALE (R18)
    await payrollServiceBackend.calculate(hrActor, '2028-10', null);
    const period10Row = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-10'")).rows[0];
    const slip10Emp1Before = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period10Row.id, paidEmp1.emp.id])
    ).rows[0];
    await payrollServiceBackend.updatePayslip(
      hrActor,
      slip10Emp1Before.id,
      { bonus: 1500000, note: 'Thưởng E2E R18 bảo toàn khi tính lại' },
      null
    );

    // Mutate attendance source AFTER calculate() -> makes 2028-10 PAYROLL_STALE
    await db.query(
      "INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours) VALUES ($1, '2028-10-25', 'DUNG_GIO', 0)",
      [paidEmp1.emp.id]
    );

    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2400);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 10/2028');
    await new Promise((r) => setTimeout(r, 1000));

    // Open PayrollLockModal while 2028-10 is STALE -> verify R18 stale banner & disabled submit button
    await cdp.click('[data-testid="open-payroll-lock-modal-btn"]', 1200);
    await cdp.waitForSelector('[data-testid="payroll-lock-modal"]');
    const staleModalState = await cdp.eval(`({
      staleBannerText: document.querySelector('[data-testid="payroll-lock-stale-banner"]')?.innerText || '',
      submitDisabledBeforeCheck: Boolean(document.querySelector('[data-testid="payroll-lock-submit-btn"]')?.disabled),
    })`);
    assert.match(staleModalState.staleBannerText, /PAYROLL_STALE/i, 'R18: PayrollLockModal must display PAYROLL_STALE banner when source changed');
    assert.equal(staleModalState.submitDisabledBeforeCheck, true, 'R18: Submit button must be disabled when PAYROLL_STALE');

    // Even if user checks acknowledge-anomalies-checkbox, submit button MUST remain disabled while PAYROLL_STALE!
    await cdp.click('[data-testid="acknowledge-anomalies-checkbox"]', 300);
    const submitDisabledAfterCheckWhenStale = await cdp.eval(
      `Boolean(document.querySelector('[data-testid="payroll-lock-submit-btn"]')?.disabled)`
    );
    assert.equal(
      submitDisabledAfterCheckWhenStale,
      true,
      'R18: Checking acknowledgeAnomalies MUST NOT enable locking when PAYROLL_STALE'
    );

    // Now recalculate 2028-10 -> clears stale state AND preserves HR manual bonus (1,500,000)!
    await payrollServiceBackend.calculate(hrActor, '2028-10', null);
    const slip10Emp1AfterRecalc = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period10Row.id, paidEmp1.emp.id])
    ).rows[0];
    assert.equal(Number(slip10Emp1AfterRecalc.actual_work_days), 22, 'R18: Recalculation must pick up new attendance day (21 -> 22)');
    assert.equal(Number(slip10Emp1AfterRecalc.bonus), 1500000, 'R18: Recalculation must preserve HR manual bonus 1,500,000');

    // Reload /payroll for 2028-10 and open PayrollLockModal again
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2400);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 10/2028');
    await new Promise((r) => setTimeout(r, 1000));

    await cdp.click('[data-testid="open-payroll-lock-modal-btn"]', 1200);
    await cdp.waitForSelector('[data-testid="payroll-lock-modal"]');

    // Verify modal displays real anomalies, has no stale banner now, has no password input, and checkbox defaults to false
    const modalInitialState = await cdp.eval(`({
      hasStaleBanner: Boolean(document.querySelector('[data-testid="payroll-lock-stale-banner"]')),
      anomalyCount: document.querySelectorAll('[data-testid="payroll-lock-anomaly-item"]').length,
      anomalyListText: document.querySelector('[data-testid="payroll-lock-anomaly-list"]')?.innerText || '',
      checkboxChecked: document.querySelector('[data-testid="acknowledge-anomalies-checkbox"]')?.checked,
      hasPasswordInput: Boolean(document.querySelector('[data-testid="payroll-lock-modal"] input[type="password"]'))
    })`);
    assert.equal(modalInitialState.hasStaleBanner, false, 'R18: Stale banner must clear after recalculation');
    assert.ok(modalInitialState.anomalyCount > 0, 'PayrollLockModal must render actual NO_ATTENDANCE anomalies in DOM');
    assert.match(modalInitialState.anomalyListText, /NO_ATTENDANCE/, 'PayrollLockModal DOM must display NO_ATTENDANCE anomaly type');
    assert.match(modalInitialState.anomalyListText, /Không có dữ liệu chấm công trong kỳ/, 'PayrollLockModal DOM must display anomaly message');
    assert.equal(modalInitialState.checkboxChecked, false, 'acknowledge-anomalies-checkbox must default to false');
    assert.equal(modalInitialState.hasPasswordInput, false, 'PayrollLockModal must not contain any fake password input');

    // Click Lock WITHOUT checking the acknowledgement box -> must fail with 409 error banner in modal
    await cdp.click('[data-testid="payroll-lock-submit-btn"]', 1000);
    const lockBlockedDomError = await cdp.eval(`document.querySelector('[data-testid="payroll-lock-error"]')?.innerText || ''`);
    assert.match(lockBlockedDomError, /vi phạm|bất thường|xác nhận/i, 'Lock without acknowledgement must display error in modal');

    const periodBeforeAck = (await db.query("SELECT status FROM payroll_periods WHERE period = '2028-10'")).rows[0];
    assert.equal(periodBeforeAck.status, 'DU_THAO');

    // Now check the acknowledgement checkbox in DOM, enter audit note, and click Lock
    await cdp.click('[data-testid="acknowledge-anomalies-checkbox"]', 300);
    await cdp.fillInput('[data-testid="payroll-lock-note-input"]', 'Xác nhận khóa sổ E2E qua UI');
    await cdp.click('[data-testid="payroll-lock-submit-btn"]', 2000);

    const dbPeriodAfterLock = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-10'")).rows[0];
    assert.equal(dbPeriodAfterLock.status, 'DA_CHOT', 'Period 2028-10 must be DA_CHOT after UI acknowledgement & lock');

    // Helper to query full DB payslips with employee metadata for a period
    const queryDbPayslipsForReconciliation = async (periodId) => {
      const { rows } = await db.query(
        `SELECT ps.*, e.full_name, e.job_title
           FROM payslips ps
           JOIN employees e ON e.id = ps.employee_id
          WHERE ps.period_id = $1
          ORDER BY ps.net_salary DESC, ps.employee_id ASC`,
        [periodId]
      );
      return rows;
    };

    // 5a. R19 Reconciliation for Period 2028-10: Download both CSVs via UI and reconcile every row/column/sum against DB
    await cdp.click('[data-testid="export-payroll-csv-btn"]', 600);
    const reportCsv10 = await waitForDownloadedCsv(downloadDir, 'Bao_Cao_Tong_Hop_Quy_Luong_Tháng_10_2028');

    await cdp.click('[data-testid="open-bank-transfer-modal-btn"]', 1000);
    await cdp.click('[data-testid="bank-transfer-export-csv-btn"]', 600);
    const bankCsv10 = await waitForDownloadedCsv(downloadDir, 'Lenh_Chi_Luong_Vietcombank_Th_ng_10_2028');

    const dbSlips10 = await queryDbPayslipsForReconciliation(dbPeriodAfterLock.id);
    const recReport10 = reconcilePayrollReportCsv(reportCsv10.content, dbSlips10);
    const recBank10 = reconcileBankTransferCsv(bankCsv10.content, dbSlips10);

    assert.equal(recReport10.rowCount, dbSlips10.length, '2028-10 report CSV must contain all DB payslips');
    assert.equal(recBank10.payableRowCount, 3, '2028-10 bank transfer CSV must contain exactly the 3 payable employees with bank accounts and net > 0');
    assert.ok(recBank10.excludedRowCount >= 50, '2028-10 bank transfer CSV must exclude 0-net and missing-bank employees');

    // 5b. R19 Reconciliation for Period 2028-09: Switch period selector in UI and download 2028-09 CSVs
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2200);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 09/2028');
    await new Promise((r) => setTimeout(r, 1200));

    await cdp.click('[data-testid="export-payroll-csv-btn"]', 600);
    const reportCsv09 = await waitForDownloadedCsv(downloadDir, 'Bao_Cao_Tong_Hop_Quy_Luong_Tháng_09_2028');

    await cdp.click('[data-testid="open-bank-transfer-modal-btn"]', 1000);
    await cdp.click('[data-testid="bank-transfer-export-csv-btn"]', 600);
    const bankCsv09 = await waitForDownloadedCsv(downloadDir, 'Lenh_Chi_Luong_Vietcombank_Th_ng_09_2028');

    const dbSlips09 = await queryDbPayslipsForReconciliation(period09Row.id);
    const recReport09 = reconcilePayrollReportCsv(reportCsv09.content, dbSlips09);
    const recBank09 = reconcileBankTransferCsv(bankCsv09.content, dbSlips09);

    assert.equal(recReport09.rowCount, dbSlips09.length, '2028-09 report CSV must contain all DB payslips');
    assert.equal(recBank09.payableRowCount, 3, '2028-09 bank transfer CSV must contain the 3 payable employees');
    assert.notEqual(recReport09.sums.netSalary, recReport10.sums.netSalary, '2028-09 and 2028-10 must have distinct total net salaries');

    // 5c. R19 Negative Tests on Downloaded CSVs (MUST FAIL when amounts are swapped, row is dropped, or period mismatches)
    // Negative 1: Cross-period reconciliation (2028-10 CSV vs 2028-09 DB) must fail
    assert.throws(
      () => reconcilePayrollReportCsv(reportCsv10.content, dbSlips09),
      /mismatch/i,
      'R19 Negative: Reconciling 2028-10 CSV against 2028-09 DB payslips must fail'
    );

    // Negative 2: Swap net_salary between paidEmp1 and paidEmp2 in downloaded 2028-10 CSV (preserving total column sum!)
    const slip1NetStr = String(Number(dbSlips10.find((s) => s.employee_id === paidEmp1.emp.id).net_salary));
    const slip2NetStr = String(Number(dbSlips10.find((s) => s.employee_id === paidEmp2.emp.id).net_salary));
    assert.notEqual(slip1NetStr, slip2NetStr, 'paidEmp1 and paidEmp2 must have distinct net salaries');

    const swappedBankCsv10 = bankCsv10.content
      .replace(slip1NetStr, '__SWAP_TMP__')
      .replace(slip2NetStr, slip1NetStr)
      .replace('__SWAP_TMP__', slip2NetStr);
    assert.throws(
      () => reconcileBankTransferCsv(swappedBankCsv10, dbSlips10),
      /Bank transfer net amount mismatch/,
      'R19 Negative: Swapping net amounts between 2 employees in Bank CSV must fail even when total sum is unchanged'
    );

    // Negative 3: Drop paidEmp3 row from downloaded 2028-10 Report CSV
    const droppedRowReportCsv10 = reportCsv10.content
      .split(/\r?\n/)
      .filter((line) => !line.includes(paidEmp3.emp.id))
      .join('\n');
    assert.throws(
      () => reconcilePayrollReportCsv(droppedRowReportCsv10, dbSlips10),
      /Payroll report CSV row count/,
      'R19 Negative: Dropping 1 employee row from Payroll Report CSV must fail'
    );

    console.log(
      `[ASSERT 5 (R18+R19) PASS] Multi-Period Stale Guard & Full CSV Reconciliation: R18StaleBlocked=true, R18BonusPreserved=${Number(slip10Emp1AfterRecalc.bonus)}, 2028-10(reportRows=${recReport10.rowCount}, bankPayable=${recBank10.payableRowCount}, bankExcluded=${recBank10.excludedRowCount}, netSum=${recReport10.sums.netSalary}), 2028-09(reportRows=${recReport09.rowCount}, bankPayable=${recBank09.payableRowCount}, netSum=${recReport09.sums.netSalary}), NegativeTests(crossPeriod+swappedAmounts+droppedRow)=3/3 FAILED_AS_EXPECTED`
    );

    // =========================================================================
    // SCENARIO 6 (R20 + R22): Uncreated Period / Failed GET Guard & 505+ Multi-Page Export
    // =========================================================================
    // 6a. R20: Select uncreated period Tháng 11/2028 (2028-11) in UI -> must NOT fallback to apiPeriods[0]
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2200);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 11/2028');
    await new Promise((r) => setTimeout(r, 800));

    const r20UncreatedState = await cdp.eval(`({
      uncreatedBanner: document.querySelector('[data-testid="payroll-uncreated-period-banner"]')?.innerText || '',
      hasCalculateBtn: Boolean(document.querySelector('[data-testid="calculate-payroll-btn"]')),
      totalNetText: document.querySelector('[data-testid="payroll-total-net-value"]')?.innerText || '',
      statusBadge: document.querySelector('[data-testid="payroll-period-status-badge"]')?.innerText || '',
      lockDisabled: Boolean(document.querySelector('[data-testid="open-payroll-lock-modal-btn"]')?.disabled),
      bankDisabled: Boolean(document.querySelector('[data-testid="open-bank-transfer-modal-btn"]')?.disabled),
      exportDisabled: Boolean(document.querySelector('[data-testid="export-payroll-csv-btn"]')?.disabled),
      anomaliesDisabled: Boolean(document.querySelector('[data-testid="open-anomalies-modal-btn"]')?.disabled),
    })`);
    assert.match(r20UncreatedState.uncreatedBanner, /2028-11/, 'R20: Uncreated period banner must mention 2028-11');
    assert.equal(r20UncreatedState.hasCalculateBtn, true, 'R20: Uncreated period banner must render calculate button');
    assert.equal(r20UncreatedState.totalNetText.trim(), '0 đ', 'R20: Uncreated period must show 0 đ totalNet (never Period A totalNet)');
    assert.match(r20UncreatedState.statusBadge, /Chưa khởi tạo kỳ lương/i);
    assert.equal(r20UncreatedState.lockDisabled, true, 'R20: Lock button must be disabled for uncreated period');
    assert.equal(r20UncreatedState.bankDisabled, true, 'R20: Bank Transfer button must be disabled for uncreated period');
    assert.equal(r20UncreatedState.exportDisabled, true, 'R20: CSV Export button must be disabled for uncreated period');
    assert.equal(r20UncreatedState.anomaliesDisabled, true, 'R20: Anomalies button must be disabled for uncreated period');

    // Force DOM click on Lock & Bank Transfer buttons while on uncreated 2028-11 -> must NOT open any modal with 2028-10 ID!
    await cdp.eval(`(() => {
      document.querySelector('[data-testid="open-payroll-lock-modal-btn"]')?.click();
      document.querySelector('[data-testid="open-bank-transfer-modal-btn"]')?.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    const modalOpenedOnUncreated = await cdp.eval(`Boolean(document.querySelector('[data-testid="payroll-lock-modal"]'))`);
    assert.equal(modalOpenedOnUncreated, false, 'R20: Clicking disabled lock button on uncreated period must never open modal');

    // 6b. R20: Switch to existing period Tháng 10/2028 while GET /api/payroll/payslips fails with 500 -> must block actions & clear stale data
    const origDbQueryR20 = db.query.bind(db);
    let failPayslipsGet = true;
    db.query = async (sql, params) => {
      if (failPayslipsGet && /FROM payslips ps/i.test(String(sql)) && /LIMIT/i.test(String(sql))) {
        throw new Error('SIMULATED_PAYSLIPS_GET_500');
      }
      return origDbQueryR20(sql, params);
    };
    try {
      await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 10/2028');
      await new Promise((r) => setTimeout(r, 1000));
      const r20ErrorState = await cdp.eval(`({
        errorBanner: document.querySelector('[data-testid="payroll-period-error-banner"]')?.innerText || '',
        hasRetryBtn: Boolean(document.querySelector('[data-testid="payroll-period-retry-btn"]')),
        totalNetText: document.querySelector('[data-testid="payroll-total-net-value"]')?.innerText || '',
        lockDisabled: Boolean(document.querySelector('[data-testid="open-payroll-lock-modal-btn"]')?.disabled),
        bankDisabled: Boolean(document.querySelector('[data-testid="open-bank-transfer-modal-btn"]')?.disabled),
        exportDisabled: Boolean(document.querySelector('[data-testid="export-payroll-csv-btn"]')?.disabled),
      })`);
      assert.ok(r20ErrorState.errorBanner.length > 0, 'R20: Failed GET on period switch must show error banner');
      assert.equal(r20ErrorState.hasRetryBtn, true, 'R20: Failed GET on period switch must show retry button');
      assert.equal(r20ErrorState.totalNetText.trim(), '0 đ', 'R20: Failed GET must reset totalNet to 0 đ');
      assert.equal(r20ErrorState.lockDisabled, true);
      assert.equal(r20ErrorState.bankDisabled, true);
      assert.equal(r20ErrorState.exportDisabled, true);
    } finally {
      failPayslipsGet = false;
      db.query = origDbQueryR20;
    }

    // Click Retry -> loads Tháng 10/2028 cleanly
    await cdp.click('[data-testid="payroll-period-retry-btn"]', 1200);
    const r20AfterRetryExportDisabled = await cdp.eval(
      `Boolean(document.querySelector('[data-testid="export-payroll-csv-btn"]')?.disabled)`
    );
    assert.equal(r20AfterRetryExportDisabled, false, 'R20: Retry must restore period readiness');

    // 6b-slow. R20: Slow in-flight response when switching from Tháng 10/2028 to Tháng 09/2028 -> buttons disabled & totalNet=0 while loading
    let delayPayslipsMs = 1000;
    db.query = async (sql, params) => {
      if (delayPayslipsMs > 0 && /FROM payslips ps/i.test(String(sql)) && /LIMIT/i.test(String(sql))) {
        await new Promise((r) => setTimeout(r, delayPayslipsMs));
      }
      return origDbQueryR20(sql, params);
    };
    try {
      await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 09/2028');
      await new Promise((r) => setTimeout(r, 250)); // inspect while request is still in-flight!
      const r20SlowInFlightState = await cdp.eval(`({
        loadingBanner: document.querySelector('[data-testid="payroll-period-loading-banner"]')?.innerText || '',
        totalNetText: document.querySelector('[data-testid="payroll-total-net-value"]')?.innerText || '',
        lockDisabled: Boolean(document.querySelector('[data-testid="open-payroll-lock-modal-btn"]')?.disabled),
        bankDisabled: Boolean(document.querySelector('[data-testid="open-bank-transfer-modal-btn"]')?.disabled),
        exportDisabled: Boolean(document.querySelector('[data-testid="export-payroll-csv-btn"]')?.disabled),
      })`);
      assert.ok(r20SlowInFlightState.loadingBanner.length > 0, 'R20: Slow in-flight period switch must render loading banner');
      assert.equal(r20SlowInFlightState.totalNetText.trim(), '0 đ', 'R20: Slow in-flight period switch must not show previous period totalNet');
      assert.equal(r20SlowInFlightState.lockDisabled, true, 'R20: Lock button must be disabled while slow period response is in-flight');
      assert.equal(r20SlowInFlightState.bankDisabled, true, 'R20: Bank Transfer button must be disabled while slow period response is in-flight');
      assert.equal(r20SlowInFlightState.exportDisabled, true, 'R20: Export button must be disabled while slow period response is in-flight');
      await new Promise((r) => setTimeout(r, 1200)); // wait for slow response to finish
    } finally {
      delayPayslipsMs = 0;
      db.query = origDbQueryR20;
    }

    // 6c. R22: Seed additional active employees so total active employees >= 505 with real attendance in 2028-11, then initialize & export 2028-11 via UI
    const activeCountBeforeR22 = (
      await db.query("SELECT COUNT(*)::int AS n FROM employees WHERE status = 'DANG_LAM_VIEC'")
    ).rows[0].n;
    const extraNeededFor505 = Math.max(0, 505 - activeCountBeforeR22);
    if (extraNeededFor505 > 0) {
      const valuesSql = [];
      const params = [];
      for (let i = 1; i <= extraNeededFor505; i++) {
        const id = `NV-TR22E-${String(i).padStart(4, '0')}`;
        const offset = params.length;
        params.push(
          id,
          `Nhân sự E2E R22 ${String(i).padStart(4, '0')}`,
          `${id.toLowerCase()}@e2e.test`,
          16000000 + (i % 8) * 500000,
          `007199${String(i).padStart(6, '0')}`,
          'Vietcombank'
        );
        valuesSql.push(
          `($${offset + 1}, $${offset + 2}, 'DEPT-IT', NULL, 'Kỹ sư R22', $${offset + 3}, '2023-01-01'::date, $${offset + 4}, 'DANG_LAM_VIEC', $${offset + 5}, $${offset + 6})`
        );
      }
      await db.query(
        `INSERT INTO employees (id, full_name, department_id, position_id, job_title, work_email, joined_date, base_salary, status, bank_account, bank_name)
         VALUES ${valuesSql.join(', ')}`,
        params
      );
    }

    // Add 15 attendance days in 2028-11 for all active employees so 500+ payslips have positive net_salary > 0
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT e.id, ('2028-11-01'::date + g), 'DUNG_GIO', CASE WHEN g = 0 THEN 1 ELSE 0 END
         FROM employees e
         CROSS JOIN generate_series(0, 14) g
        WHERE e.status = 'DANG_LAM_VIEC'`
    );

    // Select uncreated Tháng 11/2028 and click `Khởi tạo & Tính bảng lương kỳ 2028-11` button in UI
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 11/2028');
    await new Promise((r) => setTimeout(r, 800));
    await cdp.click('[data-testid="calculate-payroll-btn"]', 3200);

    // Export Payroll Report CSV and Bank Transfer CSV for Tháng 11/2028 (which spans 2 pages: 500 + 5+ rows) via UI
    await cdp.click('[data-testid="export-payroll-csv-btn"]', 1000);
    const reportCsv11 = await waitForDownloadedCsv(downloadDir, 'Bao_Cao_Tong_Hop_Quy_Luong_Tháng_11_2028', 12000);

    await cdp.click('[data-testid="open-bank-transfer-modal-btn"]', 1200);
    await cdp.click('[data-testid="bank-transfer-export-csv-btn"]', 1000);
    const bankCsv11 = await waitForDownloadedCsv(downloadDir, 'Lenh_Chi_Luong_Vietcombank_Th_ng_11_2028', 12000);

    const period11Row = (await db.query("SELECT * FROM payroll_periods WHERE period = '2028-11'")).rows[0];
    const dbSlips11 = await queryDbPayslipsForReconciliation(period11Row.id);
    assert.ok(dbSlips11.length >= 505, `R22: Expected >= 505 DB payslips in 2028-11, got ${dbSlips11.length}`);

    const recReport11 = reconcilePayrollReportCsv(reportCsv11.content, dbSlips11);
    const recBank11 = reconcileBankTransferCsv(bankCsv11.content, dbSlips11);
    assert.equal(recReport11.rowCount, dbSlips11.length, 'R22: UI CSV export must include all 505+ rows across multiple pages without truncating at 500');
    assert.ok(recReport11.sums.netSalary > 0, 'R22: 505+ multi-page export must have positive total net salary');
    assert.ok(recBank11.payableRowCount >= 450, `R22: Bank transfer CSV must include all payable rows across pages, got ${recBank11.payableRowCount}`);

    console.log(
      `[ASSERT 6 (R20+R22) PASS] Uncreated/Error/Slow Period Guard & 505+ Multi-Page UI Export: uncreatedTotalNet="${r20UncreatedState.totalNetText.trim()}", slowInFlightDisabled=true, buttonsDisabledOnUncreated=true, modalOpenedOnUncreated=${modalOpenedOnUncreated}, 2028-11MultiPageExportRows=${recReport11.rowCount} (DB=${dbSlips11.length}, bankPayable=${recBank11.payableRowCount}, netSum=${recReport11.sums.netSalary})`
    );

    // =========================================================================
    // SCENARIO 7 (R24 + R25 + R26): Honest Recalculate UI (R25), Conflict Modal E2E (R24), & Multi-Page Snapshot/Duplicate Guard (R26)
    // =========================================================================
    // 7a. R25: Verify honest recalculate button & absence of fake CEO approval buttons/labels on Tháng 11/2028 (DU_THAO)
    const r25DomState = await cdp.eval(`({
      hasRecalculateBtn: Boolean(document.querySelector('[data-testid="recalculate-payroll-btn"]')),
      recalculateBtnText: document.querySelector('[data-testid="recalculate-payroll-btn"]')?.innerText || '',
      hasFakeCeoApproveBtn: Boolean(document.querySelector('[data-testid="ceo-approve-payroll-btn"]')),
      statusBadgeText: document.querySelector('[data-testid="payroll-period-status-badge"]')?.innerText || '',
      bodyHasFakeApprovalText: /Phê duyệt chi trả toàn công ty|CEO Đã Phê Duyệt Chi Trả|Đã phê duyệt chi trả/i.test(document.body.innerText),
    })`);
    assert.equal(r25DomState.hasRecalculateBtn, true, 'R25: Draft period must render [data-testid="recalculate-payroll-btn"]');
    assert.match(r25DomState.recalculateBtnText, /Tính lại bảng lương/i, 'R25: Button label must honestly state payroll recalculation');
    assert.equal(r25DomState.hasFakeCeoApproveBtn, false, 'R25: Must not render fake ceo-approve-payroll-btn');
    assert.equal(r25DomState.bodyHasFakeApprovalText, false, 'R25: Must not display fake approval labels');
    assert.match(r25DomState.statusBadgeText, /Đang xử lý dự thảo/i, 'R25: Status badge must reflect DU_THAO honestly');

    // 7b. R24: Apply manual HR adjustments on paidEmp1 in 2028-11, mutate attendance & base_salary, then trigger conflict modal in UI
    const slip11Emp1 = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [period11Row.id, paidEmp1.emp.id])
    ).rows[0];
    await payrollServiceBackend.updatePayslip(
      hrActor,
      slip11Emp1.id,
      {
        actualWorkDays: 20,
        baseSalary: 35000000,
        bonus: 1800000,
        note: 'HR E2E R24 manual adjustment on actualWorkDays, baseSalary, bonus',
      },
      null
    );

    // Mutate underlying attendance (15 -> 16 days) and employees.base_salary (22M -> 26M) for paidEmp1
    await db.query(
      "INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours) VALUES ($1, '2028-11-20', 'DUNG_GIO', 0)",
      [paidEmp1.emp.id]
    );
    await db.query('UPDATE employees SET base_salary = 26000000 WHERE id = $1', [paidEmp1.emp.id]);

    // Click `Tính lại bảng lương (Dự thảo)` in UI -> must catch 409 ADJUSTMENT_SOURCE_CONFLICT and open modal
    await cdp.click('[data-testid="recalculate-payroll-btn"]', 1800);
    await cdp.waitForSelector('[data-testid="adjustment-conflict-modal"]');

    const r24InitialModal = await cdp.eval(`({
      rowCount: document.querySelectorAll('[data-testid="conflict-item-row"]').length,
      modalText: document.querySelector('[data-testid="adjustment-conflict-modal"]')?.innerText || '',
      prevDays: document.querySelector('[data-testid="conflict-prev-source-${paidEmp1.emp.id}-actualWorkDays"]')?.innerText || '',
      currDays: document.querySelector('[data-testid="conflict-curr-source-${paidEmp1.emp.id}-actualWorkDays"]')?.innerText || '',
      manualDays: document.querySelector('[data-testid="conflict-manual-val-${paidEmp1.emp.id}-actualWorkDays"]')?.innerText || '',
      prevBase: document.querySelector('[data-testid="conflict-prev-source-${paidEmp1.emp.id}-baseSalary"]')?.innerText || '',
      currBase: document.querySelector('[data-testid="conflict-curr-source-${paidEmp1.emp.id}-baseSalary"]')?.innerText || '',
      manualBase: document.querySelector('[data-testid="conflict-manual-val-${paidEmp1.emp.id}-baseSalary"]')?.innerText || '',
    })`);
    assert.equal(r24InitialModal.rowCount, 2, 'R24: Modal must render 2 conflict rows (actualWorkDays & baseSalary)');
    assert.match(r24InitialModal.modalText, /Đã chọn:\s*0\/2\s*xung đột/i, 'R24: Modal must have 0/2 selected by default');
    assert.equal(r24InitialModal.prevDays.trim(), '15 ngày');
    assert.equal(r24InitialModal.currDays.trim(), '16 ngày');
    assert.equal(r24InitialModal.manualDays.trim(), '20 ngày');
    assert.match(r24InitialModal.prevBase, /22\.000\.000/);
    assert.match(r24InitialModal.currBase, /26\.000\.000/);
    assert.match(r24InitialModal.manualBase, /35\.000\.000/);

    // 1) Click Submit without selecting choices -> must block with error in modal
    await cdp.click('[data-testid="conflict-submit-btn"]', 500);
    const r24UnselectedError = await cdp.eval(
      `document.querySelector('[data-testid="conflict-modal-error"]')?.innerText || ''`
    );
    assert.match(r24UnselectedError, /Vui lòng chọn phương án xử lý/i, 'R24: Submit without choices must show validation error');

    // 2) Click Cancel -> closes modal without modifying DB payslip
    await cdp.click('[data-testid="conflict-cancel-btn"]', 500);
    const modalOpenAfterCancel = await cdp.eval(
      `Boolean(document.querySelector('[data-testid="adjustment-conflict-modal"]'))`
    );
    assert.equal(modalOpenAfterCancel, false, 'R24: Cancel button must close conflict modal');
    const slipAfterCancel = (
      await db.query('SELECT actual_work_days, base_salary, bonus FROM payslips WHERE id = $1', [slip11Emp1.id])
    ).rows[0];
    assert.equal(Number(slipAfterCancel.actual_work_days), 20, 'R24: Cancel must leave manual actual_work_days=20 untouched');
    assert.equal(Number(slipAfterCancel.base_salary), 35000000, 'R24: Cancel must leave manual base_salary=35M untouched');

    // 3) Reopen modal, select KEEP_MANUAL for actualWorkDays and USE_SOURCE for baseSalary, then mutate attendance AGAIN (16 -> 17) while modal is open
    await cdp.click('[data-testid="recalculate-payroll-btn"]', 1800);
    await cdp.waitForSelector('[data-testid="adjustment-conflict-modal"]');
    await cdp.click(`[data-testid="conflict-keep-manual-${paidEmp1.emp.id}-actualWorkDays"]`, 300);
    await cdp.click(`[data-testid="conflict-use-source-${paidEmp1.emp.id}-baseSalary"]`, 300);

    await db.query(
      "INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours) VALUES ($1, '2028-11-21', 'DUNG_GIO', 0)",
      [paidEmp1.emp.id]
    );

    // Click Submit -> backend rejects stale expectedCurrentSourceValue (16 !== 17), modal stays open with stale notice & updated 17 ngày
    await cdp.click('[data-testid="conflict-submit-btn"]', 1800);
    const r24AfterMidModalChange = await cdp.eval(`({
      modalStillOpen: Boolean(document.querySelector('[data-testid="adjustment-conflict-modal"]')),
      staleNotice: document.querySelector('[data-testid="conflict-stale-notice"]')?.innerText || '',
      currDaysAfterUpdate: document.querySelector('[data-testid="conflict-curr-source-${paidEmp1.emp.id}-actualWorkDays"]')?.innerText || '',
      modalText: document.querySelector('[data-testid="adjustment-conflict-modal"]')?.innerText || '',
    })`);
    assert.equal(r24AfterMidModalChange.modalStillOpen, true, 'R24: Modal must stay open when source changed while modal was open');
    assert.match(r24AfterMidModalChange.staleNotice, /thay đổi thêm trong lúc bạn đang đối soát/i);
    assert.equal(r24AfterMidModalChange.currDaysAfterUpdate.trim(), '17 ngày', 'R24: Modal must update currentSourceValue to 17 ngày');
    assert.match(r24AfterMidModalChange.modalText, /Đã chọn:\s*1\/2\s*xung đột/i, 'R24: Stale actualWorkDays decision must be invalidated while unchanged baseSalary stays selected');

    // 4) Re-select KEEP_MANUAL for actualWorkDays, simulate HTTP 500 on calculate -> error shown in modal, no false success
    await cdp.click(`[data-testid="conflict-keep-manual-${paidEmp1.emp.id}-actualWorkDays"]`, 300);
    const origCalcR24 = payrollServiceBackend.calculate.bind(payrollServiceBackend);
    payrollServiceBackend.calculate = async () => {
      throw new Error('SIMULATED_CALCULATE_500_ON_CONFLICT_SUBMIT');
    };
    try {
      await cdp.click('[data-testid="conflict-submit-btn"]', 1200);
      const r24Error500State = await cdp.eval(`({
        modalStillOpen: Boolean(document.querySelector('[data-testid="adjustment-conflict-modal"]')),
        errorText: document.querySelector('[data-testid="conflict-modal-error"]')?.innerText || '',
        hasSuccessBanner: Boolean(document.querySelector('[data-testid="payroll-reconcile-success-banner"]')),
      })`);
      assert.equal(r24Error500State.modalStillOpen, true, 'R24: Modal must stay open on 500 error');
      assert.ok(r24Error500State.errorText.length > 0, 'R24: Modal must display error message on 500 failure');
      assert.equal(r24Error500State.hasSuccessBanner, false, 'R24: Must never show false success banner on 500 failure');
    } finally {
      payrollServiceBackend.calculate = origCalcR24;
    }

    // 5) Submit valid resolutions -> modal closes, success banner appears, DB & audit_logs updated, reload persists
    await cdp.click('[data-testid="conflict-submit-btn"]', 3200);
    const r24AfterSuccess = await cdp.eval(`({
      modalOpen: Boolean(document.querySelector('[data-testid="adjustment-conflict-modal"]')),
      successBanner: document.querySelector('[data-testid="payroll-reconcile-success-banner"]')?.innerText || '',
    })`);
    assert.equal(r24AfterSuccess.modalOpen, false, 'R24: Conflict modal must close after successful reconciliation');
    assert.match(r24AfterSuccess.successBanner, /Đã đối soát xung đột điều chỉnh thủ công/i);

    // Reload /payroll and select Tháng 11/2028 to verify persisted state
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2200);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 11/2028');
    await new Promise((r) => setTimeout(r, 1500));

    const slipAfterR24Reconcile = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [
        period11Row.id,
        paidEmp1.emp.id,
      ])
    ).rows[0];
    assert.equal(Number(slipAfterR24Reconcile.actual_work_days), 20, 'R24: KEEP_MANUAL must persist actual_work_days=20');
    assert.equal(Number(slipAfterR24Reconcile.base_salary), 26000000, 'R24: USE_SOURCE must persist new base_salary=26M');
    assert.equal(Number(slipAfterR24Reconcile.bonus), 1800000, 'R24: Non-conflicting manual bonus=1.8M must be preserved');

    const r24AuditRow = (
      await db.query(
        "SELECT new_values FROM audit_logs WHERE action = 'CALCULATE_PAYROLL' AND new_values->>'period' = '2028-11' ORDER BY created_at DESC LIMIT 1"
      )
    ).rows[0];
    assert.equal(
      Array.isArray(r24AuditRow?.new_values?.reconciled_conflicts) && r24AuditRow.new_values.reconciled_conflicts.length,
      2,
      'R24: audit_logs must record reconciled_conflicts for both resolved fields'
    );

    // 7c. R26: Multi-page loader duplicate employee_id & mid-export monetary mutation guards in UI
    // Negative 1: Inject duplicate employee_id on page 2 (OFFSET 500) during UI CSV export -> must block download & show error banner
    const origListPayslips = payrollServiceBackend.listPayslips.bind(payrollServiceBackend);
    payrollServiceBackend.listPayslips = async (actor, query, scope) => {
      const res = await origListPayslips(actor, query, scope);
      if (Number(query?.page) === 2 && res.data.length > 0) {
        const clonedRows = res.data.map((r, idx) =>
          idx === 0 ? { ...r, employee_id: paidEmp1.emp.id } : r
        );
        return { ...res, data: clonedRows };
      }
      return res;
    };
    try {
      const csvFilesBeforeDup = fs.readdirSync(downloadDir).length;
      await cdp.click('[data-testid="export-payroll-csv-btn"]', 1200);
      const dupExportError = await cdp.eval(
        `document.querySelector('[data-testid="payroll-export-error-banner"]')?.innerText || ''`
      );
      const csvFilesAfterDup = fs.readdirSync(downloadDir).length;
      assert.match(dupExportError, /trùng lặp nhân viên|trùng nhân viên/i, 'R26: UI must display duplicate employee error banner when page 2 has duplicate employee_id');
      assert.equal(csvFilesAfterDup, csvFilesBeforeDup, 'R26: UI must NOT download CSV when duplicate employee_id is detected across pages');
    } finally {
      payrollServiceBackend.listPayslips = origListPayslips;
    }

    // Negative 2: Mutate monetary amount (bonus/net_salary) in DB AFTER UI loaded Tháng 11/2028 while keeping row count (505+) identical -> export must fail snapshot/totalNet check
    await db.query(
      'UPDATE payslips SET bonus = bonus + 777000, net_salary = net_salary + 777000 WHERE period_id = $1 AND employee_id = $2',
      [period11Row.id, paidEmp2.emp.id]
    );
    try {
      const csvFilesBeforeSnapMismatch = fs.readdirSync(downloadDir).length;
      await cdp.click('[data-testid="export-payroll-csv-btn"]', 1200);
      const snapMismatchError = await cdp.eval(
        `document.querySelector('[data-testid="payroll-export-error-banner"]')?.innerText || ''`
      );
      const csvFilesAfterSnapMismatch = fs.readdirSync(downloadDir).length;
      assert.match(
        snapMismatchError,
        /thay đổi|tổng thực lĩnh|snapshot/i,
        'R26: UI must display snapshot/totalNet mismatch error when monetary values changed without changing row count'
      );
      assert.equal(
        csvFilesAfterSnapMismatch,
        csvFilesBeforeSnapMismatch,
        'R26: UI must NOT download CSV when snapshot changed after page load'
      );
    } finally {
      await db.query(
        'UPDATE payslips SET bonus = bonus - 777000, net_salary = net_salary - 777000 WHERE period_id = $1 AND employee_id = $2',
        [period11Row.id, paidEmp2.emp.id]
      );
    }

    console.log(
      `[ASSERT 7 (R24+R25+R26) PASS] R25HonestRecalcBtn=true, R24Modal(unselectedBlocked=true, cancelSafe=true, midModalStaleDetected=true, error500Safe=true, persistedDays=${slipAfterR24Reconcile.actual_work_days}, persistedBase=${slipAfterR24Reconcile.base_salary}, preservedBonus=${slipAfterR24Reconcile.bonus}, auditConflicts=${r24AuditRow.new_values.reconciled_conflicts.length}), R26ExportGuards(duplicateBlocked=true, snapshotMonetaryChangeBlocked=true)`
    );

    // =========================================================================
    // SCENARIO 8: R27 + R28 + R30 UI-Driven Verification
    // - R27: Net-neutral amount swap between two employees AND employee full_name change after UI load
    //        must both be caught by snapshotToken during multi-page CSV export.
    // - R28: /tasks API 500 error banner + retry recovery, and zero 1200h / 20-member sample fallbacks on empty state.
    // - R30: LINE_MANAGER on /payroll makes 0 calls to /api/payroll/periods; ADMIN on /payroll sees payroll-role-restricted.
    // =========================================================================
    // 8a. R27: Net-neutral swap (+500k on paidEmp1, -500k on paidEmp2 so totalNet stays identical)
    await db.query(
      'UPDATE payslips SET bonus = bonus + 500000, net_salary = net_salary + 500000 WHERE period_id = $1 AND employee_id = $2',
      [period11Row.id, paidEmp1.emp.id]
    );
    await db.query(
      'UPDATE payslips SET bonus = bonus - 500000, net_salary = net_salary - 500000 WHERE period_id = $1 AND employee_id = $2',
      [period11Row.id, paidEmp2.emp.id]
    );
    try {
      const csvBeforeSwap = fs.readdirSync(downloadDir).length;
      await cdp.click('[data-testid="export-payroll-csv-btn"]', 1200);
      const swapErr = await cdp.eval(
        `document.querySelector('[data-testid="payroll-export-error-banner"]')?.innerText || ''`
      );
      const csvAfterSwap = fs.readdirSync(downloadDir).length;
      assert.match(
        swapErr,
        /thay đổi|snapshot/i,
        'R27: Net-neutral salary swap between employees must be detected by snapshotToken during CSV export'
      );
      assert.equal(csvAfterSwap, csvBeforeSwap, 'R27: CSV must NOT download on net-neutral swap');
    } finally {
      await db.query(
        'UPDATE payslips SET bonus = bonus - 500000, net_salary = net_salary - 500000 WHERE period_id = $1 AND employee_id = $2',
        [period11Row.id, paidEmp1.emp.id]
      );
      await db.query(
        'UPDATE payslips SET bonus = bonus + 500000, net_salary = net_salary + 500000 WHERE period_id = $1 AND employee_id = $2',
        [period11Row.id, paidEmp2.emp.id]
      );
    }

    // 8b. R28: Navigate to /tasks -> test 500 error banner + retry, then test empty projects state (0h / 0h, never 1200h)
    const projectsServiceBackend = require('../src/modules/projects/service');
    const origListProjects = projectsServiceBackend.list.bind(projectsServiceBackend);
    let shouldFailProjects = true;
    projectsServiceBackend.list = async (...args) => {
      if (shouldFailProjects) {
        const err = new Error('Simulated DB outage on GET /api/projects (R28 E2E)');
        err.status = 500;
        throw err;
      }
      return origListProjects(...args);
    };
    try {
      await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/tasks`, 1800);
      await cdp.waitForSelector('[data-testid="projects-load-error-banner"]');
      const tasksErrBanner = await cdp.eval(
        `document.querySelector('[data-testid="projects-load-error-banner"]')?.innerText || ''`
      );
      assert.match(tasksErrBanner, /Lỗi tải dữ liệu dự án|Simulated DB outage|Internal Server Error/i);

      // Recover backend and click Retry -> loads real projects
      shouldFailProjects = false;
      await cdp.click('[data-testid="projects-retry-btn"]', 1600);
      const errBannerAfterRetry = await cdp.eval(
        `Boolean(document.querySelector('[data-testid="projects-load-error-banner"]'))`
      );
      assert.equal(errBannerAfterRetry, false, 'R28: Error banner must clear after retry succeeds');
    } finally {
      projectsServiceBackend.list = origListProjects;
    }

    // Test empty projects & empty members on /tasks (HR_DIRECTOR view): must show 0/0 nhân sự (0.0%), never 0/20 or 90.0%
    const empServiceBackend = require('../src/modules/employees/service');
    const origListEmployees = empServiceBackend.list.bind(empServiceBackend);
    projectsServiceBackend.list = async () => [];
    empServiceBackend.list = async () => ({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
    });
    try {
      await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/tasks`, 1800);
      const tasksPageText = await cdp.eval('document.body.innerText');
      assert.match(tasksPageText, /0\/0 nhân sự tham gia/i, 'R28: Empty members must display 0/0 nhân sự tham gia, never 0/20');
      assert.equal(tasksPageText.includes('0/20 nhân sự'), false, 'R28: Must never display hardcoded 20 team count');
    } finally {
      projectsServiceBackend.list = origListProjects;
      empServiceBackend.list = origListEmployees;
    }

    // 8c. R30: Login as LINE_MANAGER -> visit /payroll -> verify 0 calls to /api/payroll/periods
    const mgrR30Acc = await createRoleAccount({
      role: 'LINE_MANAGER',
      departmentId: 'DEPT-SALES',
      fullName: 'Trưởng Phòng Kinh Doanh R30',
    });
    await loginViaUi(cdp, mgrR30Acc.user.email, mgrR30Acc.password);
    let periodsCalledByLineManager = 0;
    const origListPeriods = payrollServiceBackend.listPeriods.bind(payrollServiceBackend);
    payrollServiceBackend.listPeriods = async (...args) => {
      periodsCalledByLineManager += 1;
      return origListPeriods(...args);
    };
    try {
      await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 1800);
      assert.equal(
        periodsCalledByLineManager,
        0,
        'R30: LINE_MANAGER visiting /payroll must NOT call /api/payroll/periods'
      );
    } finally {
      payrollServiceBackend.listPeriods = origListPeriods;
    }

    // 8d. R30: Login as ADMIN -> visit /payroll -> verify [data-testid="payroll-role-restricted"] is shown
    const adminUser = await createTestUser({ role: 'ADMIN', employeeId: null, password: 'Password@123' });
    await loginViaUi(cdp, adminUser.email, 'Password@123');
    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 1800);
    await cdp.waitForSelector('[data-testid="payroll-role-restricted"]');
    const adminRestrictedText = await cdp.eval(
      `document.querySelector('[data-testid="payroll-role-restricted"]')?.innerText || ''`
    );
    assert.match(adminRestrictedText, /không thuộc phạm vi nghiệp vụ Bảng lương/i);

    console.log(
      '[ASSERT 8 (R27+R28+R30) PASS] R27NetNeutralSwapBlocked=true, R28TasksErrorRetryAndZeroFallback=true, R30LineManagerZeroPeriodsCalls=true, R30AdminRestrictedGuard=true'
    );

    console.log('=== [ALL R14-R30 UI-DRIVEN E2E ASSERTIONS PASSED] ===');
  } finally {
    await assertSafeTestDatabase(db, { context: 'e2e-browser-verify.finally' });
    await db.query("DELETE FROM attendance_logs WHERE work_date >= '2028-01-01' AND work_date < '2029-01-01'").catch(() => {});
    await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%' OR effective_from = '2026-06'").catch(() => {});
    await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null).catch(() => {});
    await db.query("DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_PAYSLIP', 'UPDATE_SETTINGS')").catch(() => {});
    await db.query("DELETE FROM payslips WHERE period_id IN (SELECT id FROM payroll_periods WHERE period LIKE '2028-%')").catch(() => {});
    await db.query("DELETE FROM payroll_periods WHERE period LIKE '2028-%'").catch(() => {});
    await deleteTestLeaves().catch(() => {});
    await deleteTestUsers().catch(() => {});
    await deleteTestEmployees().catch(() => {});
    cdp.close();
    try { chromeProc.kill(); } catch {}
    if (viteProc) {
      try { viteProc.kill(); } catch {}
    }
    try { fs.rmSync(downloadDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => backendServer.close(resolve));
    await db.pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[R14-R19 UI-DRIVEN E2E VERIFICATION FAILED]', err);
  process.exit(1);
});
