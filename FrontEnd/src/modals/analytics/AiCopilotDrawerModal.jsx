import React, { useState, useRef, useEffect } from 'react';
import AppleDrawer from '../../components/motion/AppleDrawer';
import { Sparkles, Send, User, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const INITIAL_MESSAGE = {
  id: 'welcome',
  sender: 'bot',
  text: 'Chào bạn! Tôi là Trợ Lý Nhân Sự AI NEXUS (chế độ chỉ đọc - Read-only). Tôi hỗ trợ tra cứu quỹ ngày phép cá nhân, bảng chấm công, phiếu lương đã công bố, quy chế nội bộ đã phê duyệt và số liệu thống kê theo đúng phân quyền tài khoản của bạn.',
  chips: [
    '🏖️ Tra cứu số ngày phép còn lại năm 2026',
    '💰 Giải thích phiếu lương chính thức kỳ gần nhất',
    '📜 Quy chế giờ làm việc và chấm công GPS',
    '📊 Tóm tắt số liệu nhân sự theo phạm vi quyền',
  ],
  time: 'Vừa xong',
};

export default function Modal8B_AiCopilotDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [conversationId, setConversationId] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Clear conversation history whenever authenticated user changes (prevent cross-session leakage)
  useEffect(() => {
    const uid = user?.id || 'anonymous';
    setConversationId(`conv-${uid}-${Date.now()}`);
    setMessages([INITIAL_MESSAGE]);
    setInputVal('');
    setIsTyping(false);
  }, [user?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend) => {
    if (isTyping) return;
    const text = (textToSend ?? inputVal).trim();
    if (!text) return;

    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      time: nowTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputVal('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/copilot', {
        message: text,
        conversationId,
      });

      const payload = res?.data || res;
      if (!payload || payload.success === false || !payload.answer) {
        throw new Error(payload?.message || 'Không nhận được phản hồi hợp lệ từ máy chủ AI.');
      }

      if (payload.conversationId) {
        setConversationId(payload.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: payload.requestId || `b-${Date.now()}`,
          sender: 'bot',
          text: payload.answer,
          mode: payload.mode || 'gemini',
          sources: Array.isArray(payload.sources) ? payload.sources : [],
          dataAsOf: payload.dataAsOf || null,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      const errCode = err?.code || err?.data?.code || 'AI_ERROR';
      const errMessage =
        err?.message ||
        'Không thể kết nối tới dịch vụ Gemini AI tại thời điểm này. Hệ thống không hiển thị số liệu ước tính khi dịch vụ AI lỗi.';

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          isError: true,
          errorCode: errCode,
          retryText: text,
          text: errMessage,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const todayLabel = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <AppleDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Trợ Lý Nhân Sự AI"
      statusBadge="Read-Only"
      headerBg="bg-slate-900"
      width="w-full sm:w-[440px]"
    >
      <div className="flex-1 flex flex-col h-full bg-slate-50">
        {/* Subheader status */}
        <div className="bg-slate-800 text-slate-300 px-5 py-2 text-[11px] flex items-center justify-between border-b border-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Tra cứu theo phân quyền tài khoản ({user?.roleCode || 'GUEST'})
          </span>
          <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
            Grounded Tools
          </span>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs leading-relaxed custom-scrollbar">
          <div className="text-center my-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-200/70 px-2.5 py-0.5 rounded-full">
              {todayLabel}
            </span>
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'items-start'}`}
            >
              {msg.sender === 'bot' && (
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shrink-0 shadow-xs border border-white ${
                    msg.isError ? 'bg-amber-600' : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                  }`}
                >
                  {msg.isError ? <AlertTriangle className="w-3.5 h-3.5" /> : 'N'}
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl space-y-2 max-w-[85%] ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                    : msg.isError
                      ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-xs shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs shadow-2xs'
                }`}
              >
                {msg.isError && (
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                     Không thể xử lý yêu cầu ({msg.errorCode})
                  </div>
                )}

                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                {msg.isError && msg.retryText && (
                  <button
                    type="button"
                    disabled={isTyping}
                    onClick={() => handleSendMessage(msg.retryText)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Thử gửi lại
                  </button>
                )}

                {/* Verified Sources from Backend Tools */}
                {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-blue-600" />
                      Nguồn dữ liệu đối chiếu:
                    </div>
                    {msg.sources.map((src) => (
                      <div
                        key={src.id}
                        className="text-[10px] bg-slate-50 border border-slate-200/80 rounded px-2 py-1 text-slate-600"
                      >
                        <span className="font-medium text-slate-700">{src.title}</span>
                        {src.asOf && (
                          <span className="block text-[9px] text-slate-400">
                            Cập nhật: {new Date(src.asOf).toLocaleString('vi-VN')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Chips if available */}
                {msg.chips && (
                  <div className="space-y-1.5 pt-1.5">
                    {msg.chips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isTyping}
                        onClick={() => handleSendMessage(chip)}
                        className="w-full text-left bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors block text-[11px] disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className={`text-[9px] pt-1 text-right ${
                    msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {msg.time}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-slate-700 text-[10px] font-bold shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              </div>
              <span className="italic text-[11px]">Đang truy vấn công cụ được phân quyền...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Nhập câu hỏi tra cứu ngày phép, bảng công, phiếu lương, quy chế..."
              value={inputVal}
              disabled={isTyping}
              onChange={(e) => setInputVal(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isTyping}
              className="w-10 h-10 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-xs active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-[10px] text-slate-400 text-center mt-2">
            Trợ lý AI xử lý câu hỏi qua dịch vụ Gemini phía máy chủ với các công cụ chỉ đọc (Read-only) theo phân quyền tài khoản.
          </div>
        </div>
      </div>
    </AppleDrawer>
  );
}
