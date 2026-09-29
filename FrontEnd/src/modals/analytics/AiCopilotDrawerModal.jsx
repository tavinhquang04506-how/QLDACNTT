import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppleDrawer from '../../components/motion/AppleDrawer';
import {
  Sparkles,
  Send,
  User,
  FileText,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Info,
  RotateCcw,
  ExternalLink,
  HelpCircle,
  Calculator,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  buildBotMessageFromCopilotPayload,
  buildRoleAwareWelcomeMessage,
  buildUserScopeWatchKey,
} from '../../utils/aiCopilotState';

export default function Modal8B_AiCopilotDrawer({ isOpen, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(() => [buildRoleAwareWelcomeMessage(user)]);
  const [conversationId, setConversationId] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const sessionGenerationRef = useRef(1);

  const scopeWatchKey = buildUserScopeWatchKey(user);

  // R31, R36 & V1: Increment sessionGenerationRef and clear conversation whenever
  // user identity, role, department, or employee binding changes (or on logout).
  useEffect(() => {
    sessionGenerationRef.current += 1;
    const uid = user?.id || user?.userId || 'anonymous';
    setConversationId(`conv-${uid}-${Date.now()}`);
    setMessages([buildRoleAwareWelcomeMessage(user)]);
    setInputVal('');
    setIsTyping(false);
    isNearBottomRef.current = true;
  }, [scopeWatchKey, user?.id, user?.userId]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  const handleContainerScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= 96;
  };

  const scrollToBottom = (force = false) => {
    if (force || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, isTyping]);

  const handleResetConversation = async () => {
    const prevConvId = conversationId;
    sessionGenerationRef.current += 1;
    const uid = user?.id || user?.userId || 'anonymous';
    const nextConvId = `conv-${uid}-${Date.now()}`;
    setConversationId(nextConvId);
    setMessages([buildRoleAwareWelcomeMessage(user)]);
    setInputVal('');
    setIsTyping(false);
    isNearBottomRef.current = true;

    if (prevConvId && user) {
      api.post('/ai/copilot/reset', { conversationId: prevConvId }).catch(() => {});
    }
  };

  const handleSendMessage = async (textToSend) => {
    if (isTyping) return;
    const text = (textToSend ?? inputVal).trim();
    if (!text) return;

    const genAtSend = sessionGenerationRef.current;
    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      time: nowTime,
    };

    isNearBottomRef.current = true;
    setMessages((prev) => [...prev, userMsg]);
    if (textToSend === undefined) setInputVal('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/copilot', {
        message: text,
        conversationId,
        clientGenerationId: String(genAtSend),
      });

      // Discard stale response if user reset conversation, logged out, or changed role/scope while in flight
      if (genAtSend !== sessionGenerationRef.current) {
        return;
      }

      const payload = res?.data || res;
      if (
        payload?.clientGenerationId &&
        String(payload.clientGenerationId) !== String(sessionGenerationRef.current)
      ) {
        return;
      }

      const botMsg = buildBotMessageFromCopilotPayload(payload, text);

      if (payload.conversationId) {
        setConversationId(payload.conversationId);
      }

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      if (genAtSend !== sessionGenerationRef.current) {
        return;
      }

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
          responseType: 'error',
          errorCode: errCode,
          retryText: text,
          text: errMessage,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      if (genAtSend === sessionGenerationRef.current) {
        setIsTyping(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNavigationAction = (action) => {
    if (!action || !action.path) return;
    navigate(action.path);
    if (typeof onClose === 'function') {
      onClose();
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
      width="w-full sm:w-[460px]"
    >
      <div className="flex-1 flex flex-col h-full bg-slate-50" data-testid="ai-copilot-drawer">
        {/* Subheader status & Reset Conversation */}
        <div className="bg-slate-800 text-slate-300 px-4 py-2 text-[11px] flex items-center justify-between gap-2 border-b border-slate-700">
          <span className="flex items-center gap-1.5 truncate" data-testid="ai-copilot-scope-banner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">
              Tra cứu theo phân quyền tài khoản ({user?.roleCode || 'GUEST'})
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 hidden sm:inline">
              Grounded V1
            </span>
            <button
              type="button"
              data-testid="ai-copilot-reset-btn"
              onClick={handleResetConversation}
              title="Làm mới hội thoại"
              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Chat Messages Body */}
        <div
          ref={messagesContainerRef}
          onScroll={handleContainerScroll}
          aria-live="polite"
          className="flex-1 p-3.5 sm:p-4 space-y-4 overflow-y-auto text-xs leading-relaxed custom-scrollbar"
          data-testid="ai-copilot-messages"
        >
          <div className="text-center my-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-200/70 px-2.5 py-0.5 rounded-full">
              {todayLabel}
            </span>
          </div>

          {messages.map((msg) => {
            const isRefused = msg.verificationState === 'REFUSED';
            const isVerified = msg.verificationState === 'VERIFIED';
            const isUnverified = msg.verificationState === 'UNVERIFIED' && msg.id !== 'welcome';
            const detailSections = Array.isArray(msg.answerSections)
              ? msg.answerSections.filter(
                  (sec) =>
                    sec &&
                    ['facts', 'calculation', 'comparison', 'limitations'].includes(sec.type) &&
                    ((Array.isArray(sec.items) && sec.items.length > 0) ||
                      (sec.text && sec.text !== msg.text))
                )
              : [];

            return (
              <div
                key={msg.id}
                data-testid={msg.sender === 'bot' ? 'ai-copilot-msg-bot' : 'ai-copilot-msg-user'}
                data-verification-state={msg.verificationState || (msg.isError ? 'ERROR' : 'WELCOME')}
                data-response-type={msg.responseType || (msg.isError ? 'error' : 'greeting')}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'items-start'}`}
              >
                {msg.sender === 'bot' && (
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shrink-0 shadow-xs border border-white ${
                      msg.isError || isRefused
                        ? 'bg-amber-600'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                    }`}
                  >
                    {msg.isError || isRefused ? <AlertTriangle className="w-3.5 h-3.5" /> : 'N'}
                  </div>
                )}

                <div
                  className={`p-3.5 rounded-2xl space-y-2.5 max-w-[88%] ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                      : msg.isError || isRefused
                        ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-xs shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs shadow-2xs'
                  }`}
                >
                  {msg.isError && (
                    <div
                      data-testid="ai-msg-error-badge"
                      className="text-[10px] font-bold uppercase tracking-wider text-amber-700"
                    >
                      Lỗi kết nối / Không thể xử lý ({msg.errorCode})
                    </div>
                  )}

                  {isRefused && (
                    <div
                      data-testid="ai-msg-refused-badge"
                      className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{msg.statusBadgeText}</span>
                    </div>
                  )}

                  {isVerified && (
                    <div
                      data-testid="ai-msg-verified-badge"
                      className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span>{msg.statusBadgeText}</span>
                    </div>
                  )}

                  {isUnverified && (
                    <div
                      data-testid="ai-msg-unverified-badge"
                      className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"
                    >
                      {msg.responseType === 'clarification' ? (
                        <HelpCircle className="w-3 h-3 shrink-0 text-blue-500" />
                      ) : (
                        <Info className="w-3 h-3 shrink-0 text-slate-400" />
                      )}
                      <span>{msg.statusBadgeText}</span>
                    </div>
                  )}

                  {/* Primary Conclusion / Answer Text */}
                  <p
                    data-testid="ai-msg-text"
                    className="text-xs leading-relaxed whitespace-pre-wrap"
                  >
                    {msg.text}
                  </p>

                  {/* Structured V1 Answer Sections (Facts, Calculation, Comparison, Limitations) */}
                  {detailSections.length > 0 && (
                    <div
                      data-testid="ai-msg-sections"
                      className="space-y-2 pt-1 border-t border-slate-100"
                    >
                      {detailSections.map((sec, sIdx) => (
                        <div
                          key={`${sec.type}-${sIdx}`}
                          data-section-type={sec.type}
                          className={`rounded-xl p-2.5 text-[11px] border ${
                            sec.type === 'comparison'
                              ? 'bg-indigo-50/60 border-indigo-200/80 text-slate-800'
                              : sec.type === 'calculation'
                                ? 'bg-emerald-50/50 border-emerald-200/70 text-slate-800'
                                : sec.type === 'limitations'
                                  ? 'bg-slate-50 border-slate-200/80 text-slate-600'
                                  : 'bg-slate-50/80 border-slate-200/80 text-slate-700'
                          }`}
                        >
                          <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                            {sec.type === 'comparison' && (
                              <ArrowLeftRight className="w-3 h-3 text-indigo-600 shrink-0" />
                            )}
                            {sec.type === 'calculation' && (
                              <Calculator className="w-3 h-3 text-emerald-600 shrink-0" />
                            )}
                            <span>{sec.title}</span>
                          </div>
                          {Array.isArray(sec.items) && sec.items.length > 0 ? (
                            <dl className="space-y-1">
                              {sec.items.map((item, iIdx) => (
                                <div
                                  key={iIdx}
                                  className="flex items-baseline justify-between gap-2 border-b border-slate-200/50 last:border-b-0 pb-0.5 last:pb-0"
                                >
                                  <dt className="text-slate-500">{item.label}</dt>
                                  <dd className="font-semibold text-slate-800 text-right">
                                    {item.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="text-[11px] leading-relaxed whitespace-pre-wrap">
                              {sec.text}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interactive Clarification Choices */}
                  {msg.clarification &&
                    Array.isArray(msg.clarification.choices) &&
                    msg.clarification.choices.length > 0 && (
                      <div
                        data-testid="ai-msg-clarification"
                        className="space-y-1.5 pt-1.5 border-t border-slate-100"
                      >
                        <div className="text-[10px] font-semibold text-blue-700">
                          Chọn nhanh thông tin cần làm rõ:
                        </div>
                        {msg.clarification.choices.map((choice, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            data-testid="ai-clarification-choice"
                            disabled={isTyping}
                            onClick={() => handleSendMessage(choice.query || choice.label)}
                            className="w-full text-left bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-800 font-medium px-3 py-1.5 rounded-xl cursor-pointer transition-colors block text-[11px] disabled:opacity-50"
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}

                  {/* Retry Button on Error or Refusal */}
                  {(msg.isError || isRefused) && msg.retryText && (
                    <button
                      type="button"
                      data-testid="ai-msg-retry-btn"
                      disabled={isTyping}
                      onClick={() => handleSendMessage(msg.retryText)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Thử gửi lại
                    </button>
                  )}

                  {/* Verified Sources from Backend Tools */}
                  {isVerified && Array.isArray(msg.sources) && msg.sources.length > 0 && (
                    <div
                      data-testid="ai-msg-sources"
                      className="pt-2 border-t border-slate-100 space-y-1"
                    >
                      <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-blue-600" />
                        <span>Nguồn dữ liệu đối chiếu ({msg.sources.length}):</span>
                      </div>
                      {msg.sources.map((src) => (
                        <div
                          key={src.id}
                          className="text-[10px] bg-slate-50 border border-slate-200/80 rounded px-2 py-1 text-slate-600"
                        >
                          <span className="font-medium text-slate-700">{src.title}</span>
                          <div className="flex flex-wrap gap-x-2 text-[9px] text-slate-500 mt-0.5">
                            {src.period && <span>Kỳ: {src.period}</span>}
                            {src.version && <span>Phiên bản: v{src.version}</span>}
                            {src.effectiveFrom && <span>Hiệu lực: {src.effectiveFrom}</span>}
                            {src.asOf && (
                              <span className="text-slate-400">
                                Đối chiếu: {new Date(src.asOf).toLocaleString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Allowlisted Role-Scoped Navigation Actions */}
                  {!isRefused &&
                    !msg.isError &&
                    Array.isArray(msg.navigationActions) &&
                    msg.navigationActions.length > 0 && (
                      <div
                        data-testid="ai-msg-nav-actions"
                        className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-100"
                      >
                        {msg.navigationActions.map((navAct) => (
                          <button
                            key={navAct.id || navAct.path}
                            type="button"
                            data-testid="ai-nav-action"
                            onClick={() => handleNavigationAction(navAct)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span>{navAct.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                  {/* Follow-up Suggestions (when not already showing clarification choices) */}
                  {!isRefused &&
                    !msg.isError &&
                    (!msg.clarification || !msg.clarification.choices?.length) &&
                    Array.isArray(msg.followUpSuggestions) &&
                    msg.followUpSuggestions.length > 0 && (
                      <div
                        data-testid="ai-msg-followups"
                        className="space-y-1 pt-1.5 border-t border-slate-100"
                      >
                        <div className="text-[10px] font-semibold text-slate-400">
                          Gợi ý hỏi tiếp:
                        </div>
                        {msg.followUpSuggestions.map((sug, fIdx) => (
                          <button
                            key={fIdx}
                            type="button"
                            data-testid="ai-followup-chip"
                            disabled={isTyping}
                            onClick={() => handleSendMessage(sug)}
                            className="w-full text-left bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 text-slate-600 font-medium px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors block text-[11px] disabled:opacity-50"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}

                  {/* Welcome Quick Chips */}
                  {msg.chips && (
                    <div className="space-y-1.5 pt-1.5">
                      {msg.chips.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          data-testid="ai-welcome-chip"
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
                    className={`text-[9px] pt-0.5 text-right ${
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
            );
          })}

          {isTyping && (
            <div
              data-testid="ai-copilot-typing"
              className="flex items-center gap-2 text-slate-400 text-xs"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              </div>
              <span className="italic text-[11px]">
                Đang xử lý và đối chiếu dữ liệu theo phân quyền...
              </span>
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
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={1}
              data-testid="ai-copilot-input"
              placeholder="Nhập câu hỏi ngày phép, bảng công, phiếu lương, quy chế... (Enter để gửi)"
              value={inputVal}
              disabled={isTyping}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 resize-none max-h-24 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
            <button
              type="submit"
              data-testid="ai-copilot-send-btn"
              disabled={!inputVal.trim() || isTyping}
              className="w-10 h-10 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-xs active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-[10px] text-slate-400 text-center mt-2">
            Trợ lý AI chỉ đọc (Read-only) — số liệu do máy chủ kiểm chứng từ cơ sở dữ liệu theo phân quyền.
          </div>
        </div>
      </div>
    </AppleDrawer>
  );
}
