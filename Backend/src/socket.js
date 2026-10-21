// ============================================
// socket.js — NEXUS HR Real-time WebSocket Server (F08)
// ============================================
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const squadsService = require('./modules/squads/service');

let wss = null;
const clients = new Map(); // ws => { user, userId, accountId, squadId, userName, avatar, jobTitle, msgTimestamps, connectedAt }

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_MESSAGES = 20;

function extractTokenFromUpgradeReq(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const qToken = url.searchParams.get('token');
    if (qToken) return qToken.trim();
  } catch {
    // ignore malformed URL
  }
  const proto = req.headers?.['sec-websocket-protocol'];
  if (typeof proto === 'string' && proto.toLowerCase().startsWith('bearer,')) {
    return proto.slice(7).trim();
  }
  return null;
}

async function verifySocketActor(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  if (!decoded?.userId) return null;

  const { rows } = await db.query(
    `SELECT u.id, u.employee_id, u.role_code, u.email, u.is_active,
            e.full_name, e.avatar_url, e.job_title
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.id = $1`,
    [decoded.userId]
  );
  const u = rows[0];
  if (!u || !u.is_active) return null;

  return {
    userId: u.id,
    employeeId: u.employee_id,
    roleCode: u.role_code,
    email: u.email,
    fullName: u.full_name || u.email,
    avatarUrl: u.avatar_url || null,
    jobTitle: u.job_title || u.role_code,
  };
}

function formatSquadMessage(row) {
  return {
    id: row.id,
    squadId: row.squad_id,
    squad_id: row.squad_id,
    text: row.content,
    content: row.content,
    senderId: row.sender_id,
    sender_id: row.sender_id,
    senderName: row.sender_name || 'Thành viên',
    sender_name: row.sender_name || 'Thành viên',
    senderAvatar: row.sender_avatar || null,
    sender_avatar: row.sender_avatar || null,
    is_system_notice: Boolean(row.is_system_notice),
    timestamp: row.created_at,
    created_at: row.created_at,
  };
}

function initSocket(server) {
  wss = new WebSocketServer({
    server,
    maxPayload: 64 * 1024,
    verifyClient: (info, cb) => {
      const token = extractTokenFromUpgradeReq(info.req);
      verifySocketActor(token)
        .then((actor) => {
          if (!actor) {
            cb(false, 401, 'Unauthorized');
            return;
          }
          info.req.wsActor = actor;
          cb(true);
        })
        .catch(() => {
          cb(false, 500, 'Internal Server Error');
        });
    },
  });

  wss.on('connection', (ws, req) => {
    const actor = req.wsActor;
    if (!actor) {
      ws.close(4001, 'UNAUTHORIZED');
      return;
    }

    clients.set(ws, {
      user: {
        userId: actor.userId,
        employeeId: actor.employeeId,
        roleCode: actor.roleCode,
        email: actor.email,
        name: actor.fullName,
      },
      accountId: actor.userId,
      userId: actor.employeeId || actor.userId,
      squadId: null,
      userName: actor.fullName,
      avatar: actor.avatarUrl,
      jobTitle: actor.jobTitle,
      msgTimestamps: [],
      connectedAt: new Date().toISOString(),
    });

    ws.send(
      JSON.stringify({
        type: 'connection-established',
        message: 'Kết nối WebSocket NEXUS HR thành công',
        user: {
          userId: actor.userId,
          employeeId: actor.employeeId,
          roleCode: actor.roleCode,
          fullName: actor.fullName,
        },
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('message', async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const clientInfo = clients.get(ws);
        if (!clientInfo?.user) {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', status: 401, message: 'Chưa xác thực' }));
          ws.close(4001, 'UNAUTHORIZED');
          return;
        }

        // Verify account is still active in DB
        const activeCheck = await db.query(
          'SELECT is_active, role_code, employee_id FROM users WHERE id = $1',
          [clientInfo.accountId]
        );
        const liveAccount = activeCheck.rows[0];
        if (!liveAccount || !liveAccount.is_active) {
          ws.send(JSON.stringify({ type: 'error', code: 'ACCOUNT_DISABLED', status: 401, message: 'Tài khoản đã bị vô hiệu hóa' }));
          clients.delete(ws);
          ws.close(4001, 'ACCOUNT_DISABLED');
          return;
        }
        clientInfo.user.roleCode = liveAccount.role_code;
        clientInfo.user.employeeId = liveAccount.employee_id;

        switch (payload.type) {
          case 'join-squad': {
            const squadId = typeof payload.squadId === 'string' ? payload.squadId.trim() : '';
            if (!squadId) {
              ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', status: 400, message: 'Thiếu mã squadId' }));
              break;
            }

            try {
              await squadsService.get(clientInfo.user, squadId);
              const rows = await squadsService.listMessages(clientInfo.user, squadId, { limit: 50 });
              clients.set(ws, { ...clientInfo, squadId });
              ws.send(
                JSON.stringify({
                  type: 'squad-history',
                  squadId,
                  messages: rows.map(formatSquadMessage),
                })
              );
            } catch (err) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  action: 'join-squad',
                  squadId,
                  code: err.code || 'FORBIDDEN',
                  status: err.status || 403,
                  message: err.message || 'Bạn không có quyền truy cập nhóm này',
                })
              );
            }
            break;
          }

          case 'squad-message': {
            const squadId = typeof payload.squadId === 'string' ? payload.squadId.trim() : clientInfo.squadId;
            const rawText = typeof payload.text === 'string' ? payload.text : payload.content;
            const text = typeof rawText === 'string' ? rawText.trim() : '';

            if (!squadId || !text) {
              ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', status: 400, message: 'Thiếu nội dung tin nhắn hoặc mã nhóm' }));
              break;
            }
            if (text.length > MAX_MESSAGE_LENGTH) {
              ws.send(JSON.stringify({ type: 'error', code: 'MESSAGE_TOO_LONG', status: 400, message: `Tin nhắn vượt quá ${MAX_MESSAGE_LENGTH} ký tự` }));
              break;
            }

            const now = Date.now();
            clientInfo.msgTimestamps = (clientInfo.msgTimestamps || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
            if (clientInfo.msgTimestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
              ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', status: 429, message: 'Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau' }));
              break;
            }
            clientInfo.msgTimestamps.push(now);

            try {
              const savedRow = await squadsService.postMessage(clientInfo.user, squadId, { content: text });
              const msgObj = {
                ...formatSquadMessage(savedRow),
                role: clientInfo.jobTitle || 'Thành viên Squad',
                clientMessageId: payload.clientMessageId || null,
              };
              broadcastSquadMessage(squadId, msgObj);
            } catch (err) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  action: 'squad-message',
                  squadId,
                  clientMessageId: payload.clientMessageId || null,
                  code: err.code || 'FORBIDDEN',
                  status: err.status || 403,
                  message: err.message || 'Không thể gửi tin nhắn vào nhóm này',
                })
              );
            }
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.warn('WebSocket message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err.message);
      clients.delete(ws);
    });
  });

  return wss;
}

function broadcastSquadMessage(squadId, msgObj) {
  if (!wss) return;
  const data = JSON.stringify({ type: 'squad-message', message: msgObj });
  for (const [ws, info] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN && info.squadId === squadId) {
      ws.send(data);
    }
  }
}

function broadcastNotification(notification, targetUserId = null) {
  if (!wss) return;
  const data = JSON.stringify({
    type: 'notification',
    notification: {
      ...notification,
      id: notification.id || 'NOTIF-' + Date.now(),
      timestamp: new Date().toISOString(),
    },
  });

  for (const [ws, info] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      if (!targetUserId || info.userId === targetUserId || info.accountId === targetUserId) {
        ws.send(data);
      }
    }
  }
}

function disconnectUserSockets(userIdOrEmployeeId) {
  if (!userIdOrEmployeeId) return 0;
  let closed = 0;
  for (const [ws, info] of clients.entries()) {
    if (info.accountId === userIdOrEmployeeId || info.userId === userIdOrEmployeeId || info.user?.employeeId === userIdOrEmployeeId) {
      clients.delete(ws);
      try {
        ws.close(4001, 'SESSION_REVOKED');
      } catch {}
      closed++;
    }
  }
  return closed;
}

function getConnectedClientsCount() {
  return clients.size;
}

async function getSquadChatHistory(squadId, user) {
  if (!squadId || !user) return [];
  const rows = await squadsService.listMessages(user, squadId, { limit: 50 });
  return rows.map(formatSquadMessage);
}

module.exports = {
  initSocket,
  broadcastSquadMessage,
  broadcastNotification,
  disconnectUserSockets,
  getConnectedClientsCount,
  getSquadChatHistory,
};
