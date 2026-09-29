import React, { useState, useEffect, useRef } from 'react';
import AppleDrawer from '../motion/AppleDrawer';
import Avatar from '../common/Avatar';
import { Send, Users, Sparkles, MessageSquare, Clock, ShieldCheck, ArrowRight, CornerDownLeft } from 'lucide-react';

export default function SquadChatDrawer({ isOpen, onClose, squad, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const squadId = squad?.id || squad?.code || 'SQ-CORE';
  const squadName = squad?.name || squad?.title || 'Đội Ngũ Dự Án Agile (Squad)';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;

    // Connect to backend WebSocket server
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8000/ws`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Join squad channel
      ws.send(JSON.stringify({
        type: 'join-squad',
        squadId,
        userId: currentUser?.id || 'NV-0001',
        userName: currentUser?.name || 'Thành viên',
        avatar: currentUser?.avatar,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'squad-history') {
          if (Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
        } else if (data.type === 'squad-message' && data.message) {
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch (e) {
        console.warn('WS message parse error', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (err) => {
      console.warn('WS connection error', err);
      setIsConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [isOpen, squadId, currentUser]);

  const handleSend = (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const payload = {
      type: 'squad-message',
      squadId,
      text: text.trim(),
      senderId: currentUser?.id || 'NV-0001',
      senderName: currentUser?.name || 'Nhân viên',
      senderAvatar: currentUser?.avatar,
      role: currentUser?.title || 'Thành viên Squad',
    };

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      // Local optimistic fallback
      const localMsg = {
        id: 'MSG-' + Date.now(),
        ...payload,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, localMsg]);
    }

    setInputText('');
  };

  const quickChips = [
    '🚀 Cập nhật tiến độ task Sprint',
    '⚠️ Có blocker cần hỗ trợ gấp',
    '✅ Đã review xong task, sẵn sàng merge',
    '📅 Họp Daily Standup lúc 09:00',
  ];

  return (
    <AppleDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Kênh Chat Đội Nhóm: ${squadName}`}
      statusBadge={isConnected ? 'Realtime WebSocket' : 'Đang kết nối...'}
      headerBg="bg-slate-900"
      width="w-full sm:w-[480px]"
    >
      <div className="flex-1 flex flex-col h-full bg-slate-50">
        {/* Connection Subheader */}
        <div className="bg-slate-800 text-slate-300 px-5 py-2 text-[11px] flex items-center justify-between border-b border-slate-700">
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{isConnected ? 'Kênh giao tiếp thời gian thực kích hoạt' : 'Đang thiết lập kênh...'}</span>
          </span>
          <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">
            {squadId}
          </span>
        </div>

        {/* Messages List Body */}
        <div className="flex-1 p-4 space-y-3.5 overflow-y-auto text-xs leading-relaxed custom-scrollbar">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-600">Chưa có tin nhắn nào trong kênh này</p>
              <p className="text-[11px]">Hãy gửi tin nhắn đầu tiên để cùng đội ngũ bắt đầu thảo luận công việc!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser?.id || msg.senderName === currentUser?.name;
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar
                    src={msg.senderAvatar}
                    name={msg.senderName}
                    id={msg.senderId}
                    size="sm"
                    shape="circle"
                  />
                  <div className={`max-w-[78%] space-y-1 ${isMe ? 'items-end' : ''}`}>
                    <div className={`flex items-center gap-1.5 ${isMe ? 'justify-end' : ''}`}>
                      <span className="font-bold text-[11px] text-slate-800">{msg.senderName}</span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-2xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(chip)}
              className="text-[10px] font-medium bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors shrink-0 cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Gửi tin nhắn tới ${squadName}...`}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim()}
            className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </AppleDrawer>
  );
}
