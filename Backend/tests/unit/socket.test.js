const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const { initSocket, getConnectedClientsCount, broadcastNotification } = require('../../src/socket');

test('WebSocket Server Unit Test Suite', async (t) => {
  let server;
  let port;

  await t.test('setup HTTP and WebSocket server', async () => {
    server = http.createServer((req, res) => res.end('OK'));
    initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
    assert.ok(port > 0);
  });

  await t.test('client connects and receives welcome or joins squad', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    assert.ok(getConnectedClientsCount() >= 1);

    // Join squad
    const joinMsg = JSON.stringify({
      type: 'join-squad',
      squadId: 'SQ-01',
      userId: 'NV-0001',
      userName: 'Lê Vũ Ngọc Duy'
    });
    ws.send(joinMsg);

    await new Promise(r => setTimeout(r, 50));
    ws.close();
  });

  await t.test('broadcastNotification should send message without crashing', async () => {
    assert.doesNotThrow(() => {
      broadcastNotification({
        title: 'Thông báo thử nghiệm',
        body: 'Hệ thống đã kết nối WebSocket',
        type: 'SYSTEM'
      });
    });
  });

  await t.test('teardown server', async () => {
    await new Promise((resolve) => server.close(resolve));
  });
});
