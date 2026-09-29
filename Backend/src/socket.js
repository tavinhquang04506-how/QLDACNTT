// ============================================
// socket.js — NEXUS HR Real-time WebSocket Server
// ============================================
const { WebSocketServer, WebSocket } = require('ws');

let wss = null;
const clients = new Map(); // ws => { userId, squadId, userName, avatar }

// Store in-memory chat messages per squad (so new joiners see history)
const squadChatHistory = new Map();

function initSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    clients.set(ws, {
      userId: null,
      squadId: null,
      userName: 'Khách',
      connectedAt: new Date().toISOString(),
    });

    // Gửi tín hiệu chào mừng
    ws.send(JSON.stringify({
      type: 'connection-established',
      message: 'Kết nối WebSocket NEXUS HR thành công',
      timestamp: new Date().toISOString(),
    }));

    ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const clientInfo = clients.get(ws) || {};

        switch (payload.type) {
          case 'join-squad': {
            const { squadId, userId, userName, avatar } = payload;
            clients.set(ws, { ...clientInfo, squadId, userId, userName, avatar });

            // Trả về lịch sử chat của squad này
            const history = squadChatHistory.get(squadId) || [];
            ws.send(JSON.stringify({
              type: 'squad-history',
              squadId,
              messages: history,
            }));
            break;
          }

          case 'squad-message': {
            const { squadId, text, senderId, senderName, senderAvatar, role } = payload;
            if (!squadId || !text) break;

            const msgObj = {
              id: 'MSG-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              squadId,
              text,
              senderId: senderId || clientInfo.userId || 'NV-0001',
              senderName: senderName || clientInfo.userName || 'Thành viên',
              senderAvatar: senderAvatar || clientInfo.avatar,
              role: role || 'Thành viên Squad',
              timestamp: new Date().toISOString(),
            };

            // Lưu vào history (tối đa 50 tin nhắn gần nhất)
            if (!squadChatHistory.has(squadId)) {
              squadChatHistory.set(squadId, []);
            }
            const list = squadChatHistory.get(squadId);
            list.push(msgObj);
            if (list.length > 50) list.shift();

            // Broadcast tới tất cả client cùng squadId
            broadcastSquadMessage(squadId, msgObj);
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
    }
  });

  for (const [ws, info] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      if (!targetUserId || info.userId === targetUserId) {
        ws.send(data);
      }
    }
  }
}

function getConnectedClientsCount() {
  return clients.size;
}

function getSquadChatHistory(squadId) {
  return squadChatHistory.get(squadId) || [];
}

module.exports = {
  initSocket,
  broadcastSquadMessage,
  broadcastNotification,
  getConnectedClientsCount,
  getSquadChatHistory,
};
