#!/usr/bin/env node
/**
 * Reproducible End-to-End Browser DOM/UI & Cross-Layer Verification Script (R08 / R14 / F27)
 * Runs against isolated `nexus_hrms_test` database, spawns backend (:8000) + frontend (:3000),
 * drives Headless Chrome via Chrome DevTools Protocol (CDP) using real DOM/UI interactions:
 *   1. Settings UI form fill -> click Save button -> browser reload -> verify DOM input values + DB/API
 *   2. Real UI Login & DOM content verification for 2 EMPLOYEEs (same role) + 2 LINE_MANAGERs (different departments)
 *   3. UI-initiated HTTP 403 & HTTP 500 error handling -> verify DOM error banner, no false success, no fabricated fallback numbers
 *   4. UI Pagination button clicks ('Sau' / 'Trước') on /employees table with >50 records -> verify rendered <tr> rows across all pages
 *   5. UI Payroll period selection, UI Lock Modal (anomaly display, default acknowledgeAnomalies=false blocks with 409, explicit checkbox locks + audits), and real CSV file downloads from disk reconciled against API & DB
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

async function createRoleAccount({ role, departmentId = 'DEPT-IT', fullName, baseSalary = 20000000 }) {
  const emp = await createTestEmployee({ departmentId, status: 'DANG_LAM_VIEC' });
  if (fullName || baseSalary) {
    await db.query(
      'UPDATE employees SET full_name = COALESCE($2, full_name), base_salary = COALESCE($3, base_salary), joined_date = \'2020-01-01\', bank_account = \'0071001234567\', bank_name = \'Vietcombank\' WHERE id = $1',
      [emp.id, fullName || null, baseSalary || null]
    );
    emp.full_name = fullName || emp.full_name;
  }
  const user = await createTestUser({ role, employeeId: emp.id, password: 'Password@123' });
  return { emp, user, password: 'Password@123' };
}

/**
 * Perform authentic UI login via the /login page form inputs and submit button.
 */
async function loginViaUi(cdp, email, password) {
  await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/login`, 1000);
  await cdp.eval(`(() => { localStorage.clear(); sessionStorage.clear(); return true; })()`);
  await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/login`, 1200);

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
  console.log('=== [R14 UI-DRIVEN E2E VERIFICATION START] ===');
  console.log(`TIMESTAMP=${new Date().toISOString()}`);
  console.log(`DB_NAME=${process.env.DB_NAME}`);

  const downloadDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `nexus-e2e-downloads-${Date.now()}`);
  fs.mkdirSync(downloadDir, { recursive: true });

  // 1. Start Backend HTTP + WS server on BACKEND_PORT
  const backendServer = http.createServer(app);
  initSocket(backendServer);
  await new Promise((resolve) => backendServer.listen(BACKEND_PORT, '127.0.0.1', resolve));
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
    // SCENARIO 3: UI-Triggered HTTP 403 & HTTP 500 -> Verify DOM Error Banner & No False Success / Fallback
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
        `[ASSERT 3 PASS] UI 403/500 Error Handling: 403/500 Settings Banner="${err500SettingsDom.errorBanner}", 500 Directory Banner="${err500DirectoryDom.errorBanner}", rendered fallback rows=${err500DirectoryDom.rowCount}`
      );
    } finally {
      simulateDb500 = false;
      db.query = origQuery;
      db.withTransaction = origWithTx;
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
    // SCENARIO 5: UI Payroll Period Selection, UI Lock Modal (409 -> Check -> Lock), and Real CSV Download
    // =========================================================================
    const paidEmp = await createRoleAccount({
      role: 'EMPLOYEE',
      departmentId: 'DEPT-IT',
      fullName: 'Phạm Thực Lĩnh CSV E2E',
      baseSalary: 22000000,
    });
    await db.query(
      `INSERT INTO attendance_logs (employee_id, work_date, status, ot_hours)
       SELECT $1, ('2028-10-02'::date + g), 'DUNG_GIO', 0 FROM generate_series(0, 21) g`,
      [paidEmp.emp.id]
    );

    // Calculate draft payroll for 2028-10 so it appears in the UI selector (other employees have 0 attendance -> NO_ATTENDANCE anomaly!)
    const payrollServiceBackend = require('../src/modules/payroll/service');
    await payrollServiceBackend.calculate({ userId: hrAcc.user.id, employeeId: hrAcc.emp.id, role: 'HR_DIRECTOR' }, '2028-10', null);

    await cdp.navigate(`http://127.0.0.1:${FRONTEND_PORT}/payroll`, 2400);
    await cdp.waitForSelector('[data-testid="payroll-period-select"]');

    // Select 'Tháng 10/2028' in the UI <select>
    await cdp.fillInput('[data-testid="payroll-period-select"]', 'Tháng 10/2028');
    await new Promise((r) => setTimeout(r, 1000));

    // Open PayrollLockModal by clicking the button in DOM
    await cdp.click('[data-testid="open-payroll-lock-modal-btn"]', 1200);
    await cdp.waitForSelector('[data-testid="payroll-lock-modal"]');

    // Verify modal displays real anomalies, has no password input, and checkbox defaults to false
    const modalInitialState = await cdp.eval(`({
      anomalyCount: document.querySelectorAll('[data-testid="payroll-lock-anomaly-item"]').length,
      anomalyListText: document.querySelector('[data-testid="payroll-lock-anomaly-list"]')?.innerText || '',
      checkboxChecked: document.querySelector('[data-testid="acknowledge-anomalies-checkbox"]')?.checked,
      hasPasswordInput: Boolean(document.querySelector('[data-testid="payroll-lock-modal"] input[type="password"]'))
    })`);
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

    // Click 'Tải Báo Cáo Quỹ Lương (.csv)' button on /payroll and verify downloaded CSV file on disk
    await cdp.click('[data-testid="export-payroll-csv-btn"]', 600);
    const payrollReportCsv = await waitForDownloadedCsv(downloadDir, 'Bao_Cao_Tong_Hop_Quy_Luong_');

    // Also open BankTransferModal on /payroll and click 'Xuất File CSV Lệnh Chi Ngân Hàng'
    await cdp.click('[data-testid="open-bank-transfer-modal-btn"]', 1000);
    await cdp.click('[data-testid="bank-transfer-export-csv-btn"]', 600);
    const bankTransferCsv = await waitForDownloadedCsv(downloadDir, 'Lenh_Chi_Luong_Vietcombank_');

    const dbPaidSlip = (
      await db.query('SELECT * FROM payslips WHERE period_id = $1 AND employee_id = $2', [dbPeriodAfterLock.id, paidEmp.emp.id])
    ).rows[0];
    const dbSlipAgg = (
      await db.query('SELECT COUNT(*)::int AS n, COALESCE(SUM(net_salary), 0) AS net FROM payslips WHERE period_id = $1', [dbPeriodAfterLock.id])
    ).rows[0];

    assert.match(payrollReportCsv.filename, /10_2028/);
    assert.ok(payrollReportCsv.content.includes(paidEmp.emp.id), 'Downloaded payroll report CSV must contain paidEmp ID');
    assert.ok(payrollReportCsv.content.includes('Phạm Thực Lĩnh CSV E2E'), 'Downloaded payroll report CSV must contain paidEmp name');
    assert.ok(
      payrollReportCsv.content.includes(String(Number(dbPaidSlip.net_salary))),
      'Downloaded payroll report CSV must contain exact net_salary from DB'
    );

    assert.match(bankTransferCsv.filename, /10_2028/);
    assert.ok(bankTransferCsv.content.includes(paidEmp.emp.id), 'Downloaded bank transfer CSV must contain paidEmp ID');
    assert.ok(
      bankTransferCsv.content.includes(String(Number(dbPaidSlip.net_salary))),
      'Downloaded bank transfer CSV must contain exact net_salary from DB'
    );

    console.log(
      `[ASSERT 5 PASS] UI Lock & Real CSV Export ('2028-10'): anomaliesRendered=${modalInitialState.anomalyCount}, unacknowledgedBlocked=true, lockedStatus=${dbPeriodAfterLock.status}, reportCsv=${payrollReportCsv.filename}, bankCsv=${bankTransferCsv.filename}, paidEmpNet=${Number(dbPaidSlip.net_salary)}, periodTotalNet=${Number(dbSlipAgg.net)}`
    );

    console.log('=== [ALL 5 R14 UI-DRIVEN E2E ASSERTIONS PASSED] ===');
  } finally {
    await db.query("DELETE FROM system_policy_versions WHERE effective_from LIKE '2028-%'").catch(() => {});
    await settingsService.updateSettings({ employeeId: null, role: 'HR_DIRECTOR' }, originalSettings, null).catch(() => {});
    await db.query("DELETE FROM audit_logs WHERE action IN ('CALCULATE_PAYROLL', 'LOCK_PAYROLL', 'UPDATE_PAYSLIP', 'UPDATE_SETTINGS')").catch(() => {});
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
  console.error('[R14 UI-DRIVEN E2E VERIFICATION FAILED]', err);
  process.exit(1);
});
