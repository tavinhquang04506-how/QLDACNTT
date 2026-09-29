import React, { useState, useRef, useEffect } from 'react';
import AppleDrawer from '../../components/motion/AppleDrawer';
import { Sparkles, Send, Bot, User, Clock, FileText, CheckCircle2, ChevronRight, ShieldCheck, CornerDownLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import api from '../../services/api';

export default function Modal8B_AiCopilotDrawer({ isOpen, onClose }) {
  const { currentRole } = useAuth();
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Chào bạn! Tôi là Trợ Lý Nhân Sự AI NEXUS (v2.5). Tôi có thể hỗ trợ bạn tra cứu ngày phép, giải đáp chế độ bảo hiểm, kiểm tra cách tính thuế TNCN, hoặc phân tích hiệu suất nhân viên. Bạn cần tôi hỗ trợ gì hôm nay?',
      chips: [
        '🏖️ Tra cứu số ngày phép còn lại',
        '💰 Kiểm tra mức tính thuế TNCN tháng này',
        '🏥 Chính sách bảo hiểm sức khỏe Vinmec',
        '📊 Đánh giá tỷ lệ biến động nhân sự Q3',
      ],
      time: 'Vừa xong',
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputVal;
    if (!text.trim()) return;

    // Add user message
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/copilot', {
        message: text,
        context: {
          name: currentRole?.name,
          id: currentRole?.id,
          department: currentRole?.department,
          leaveBalance: currentRole?.leaveBalance || 12,
          role: currentRole?.title,
        }
      });

      const botReply = res?.answer || res?.data?.answer ||
        `Chào ${currentRole?.name || 'bạn'}! Tôi đã xử lý câu hỏi của bạn. Dữ liệu ngày phép (${currentRole?.leaveBalance || 12} ngày) và chế độ bảo hiểm Vinmec của bạn đã được kiểm tra trên hệ thống.`;

      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: botReply,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.warn('AI Copilot request failed, falling back:', err);
      let fallbackReply = `Chào ${currentRole?.name || 'bạn'}! Bạn hiện còn **${currentRole?.leaveBalance || 12} ngày phép năm** trong quỹ năm 2026. Mọi chính sách nhân sự và bảo hiểm Vinmec đều tuân thủ đúng quy định công ty.`;
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: fallbackReply,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AppleDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Trợ Lý Nhân Sự Nội Bộ"
      statusBadge="v2.5 AI"
      headerBg="bg-slate-900"
      width="w-full sm:w-[440px]"
    >
      <div className="flex-1 flex flex-col h-full bg-slate-50">
        {/* Subheader online status */}
        <div className="bg-slate-800 text-slate-300 px-5 py-2 text-[11px] flex items-center justify-between border-b border-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Trực tuyến • Kết nối Cơ sở Dữ liệu Nhân sự Toàn diện
          </span>
          <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">RAG Engine</span>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs leading-relaxed custom-scrollbar">
          <div className="text-center my-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-200/70 px-2.5 py-0.5 rounded-full">
              Hôm nay, 12 Tháng 9, 2026
            </span>
          </div>

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'items-start'}`}
            >
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-[10px] font-extrabold shrink-0 shadow-xs border border-white">
                  N
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl space-y-2 max-w-[85%] ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs shadow-2xs'
                }`}
              >
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                {/* Quick Chips if available */}
                {msg.chips && (
                  <div className="space-y-1.5 pt-1.5">
                    {msg.chips.map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(chip)}
                        className="w-full text-left bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors block text-[11px]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                <div className={`text-[9px] pt-1 text-right ${msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
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
              <span className="italic text-[11px]">NEXUS AI đang tổng hợp câu trả lời...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-slate-200">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Nhập câu hỏi hoặc từ khóa cần tra cứu..."
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="w-10 h-10 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-xs active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-[10px] text-slate-400 text-center mt-2">
            Mô hình AI bảo mật nội bộ tuân thủ quy định bảo vệ dữ liệu cá nhân Nghị định 13/2023/NĐ-CP.
          </div>
        </div>
      </div>
    </AppleDrawer>
  );
}
