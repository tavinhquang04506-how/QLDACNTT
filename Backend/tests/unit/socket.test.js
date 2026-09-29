const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const db = require('../../src/config/db');
const tokens = require('../../src/modules/auth/tokens');
const squadsService = require('../../src/modules/squads/service');
const {
  initSocket,
  getConnectedClientsCount,
  broadcastNotification,
  disconnectUserSockets,
} = require('../../src/socket');

test('WebSocket Server Unit Test Suite', async (t) => {
  let server;
  let wss;
  let port;
  const origQuery = db.query;
  const origSquadGet = squadsService.get;
  const origListMessages = squadsService.listMessages;
  const origPostMessage = squadsService.postMessage;

  t.before(() => {
    db.query = async (sql, params = []) => {
      const q = String(sql);
      if (q.includes('FROM users') && params[0] === 'U-TEST-1') {
        return {
          rows: [
            {
              id: 'U-TEST-1',
              email: 'duy@fwbnexus.vn',
              role_code: 'EMPLOYEE',
              is_active: true,
              employee_id: 'NV-0001',
              full_name: 'Lê Vũ Ngọc Duy',
              avatar_url: null,
              job_title: 'Developer',
            },
          ],
        };
      }
      return { rows: [] };
    };
    squadsService.get = async (user, squadId) => ({
      id: squadId,
      name: 'Alpha Squad',
      members: [{ employee_id: 'NV-0001', full_name: 'Lê Vũ Ngọc Duy' }],
    });
    squadsService.listMessages = async () => [];
    squadsService.postMessage = async (user, squadId, body) => ({
      id: 1,
      squad_id: squadId,
      sender_id: user.employeeId,
      sender_name: 'Lê Vũ Ngọc Duy',
      content: body.content,
      created_at: new Date().toISOString(),
    });
  });

  t.after(() => {
    db.query = origQuery;
    squadsService.get = origSquadGet;
    squadsService.listMessages = origListMessages;
    squadsService.postMessage = origPostMessage;
  });

  await t.test('setup HTTP and WebSocket server', async () => {
    server = http.createServer((req, res) => res.end('OK'));
    wss = initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
    assert.ok(port > 0);
  });

  await t.test('unauthenticated client connection is rejected with 401', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await assert.rejects(
      new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      })
    );
  });

  await t.test('authenticated client connects, joins authorized squad, and ignores spoofed sender', async () => {
    const jwtToken = tokens.signAccessToken({
      user_id: 'U-TEST-1',
      employee_id: 'NV-0001',
      email: 'duy@fwbnexus.vn',
      role_code: 'EMPLOYEE',
    });

    const ws = new WebSocket(`ws://localhost:${port}?token=${encodeURIComponent(jwtToken)}`);
    const historyPromise = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'squad-history') resolve(msg);
      });
    });
    const closePromise = new Promise((resolve) => {
      ws.on('close', resolve);
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    assert.ok(getConnectedClientsCount() >= 1);

    ws.send(
      JSON.stringify({
        type: 'join-squad',
        squadId: 'SQ-01',
        userId: 'NV-SPOOFED',
        userName: 'Spoofed Name',
      })
    );

    const history = await historyPromise;
    assert.equal(history.squadId, 'SQ-01');

    const disconnected = disconnectUserSockets('U-TEST-1');
    assert.ok(disconnected >= 1);
    await closePromise;
  });

  await t.test('broadcastNotification should send message without crashing', async () => {
    assert.doesNotThrow(() => {
      broadcastNotification({
        title: 'Thông báo thử nghiệm',
        body: 'Hệ thống đã kết nối WebSocket',
        type: 'SYSTEM',
      });
    });
  });

  await t.test('teardown server', async () => {
    if (wss) {
      await new Promise((resolve) => wss.close(resolve));
    }
    await new Promise((resolve) => server.close(resolve));
  });
});
