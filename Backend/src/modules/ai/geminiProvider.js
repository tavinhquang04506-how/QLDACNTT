const { AppError } = require('../../utils/AppError');

const RETIRED_MODEL_PATTERNS = [
  /^gemini-1\.0\b/i,
  /^gemini-1\.5\b/i,
  /^gemini-pro(-vision)?$/i,
];

function isRetiredGeminiModel(model = '') {
  const m = String(model || '').trim();
  if (!m) return true;
  return RETIRED_MODEL_PATTERNS.some((rx) => rx.test(m));
}

function redactErrorText(text = '', apiKey = '') {
  let out = String(text || '');
  if (apiKey && apiKey.length >= 4) {
    out = out.split(apiKey).join('[REDACTED_KEY]');
  }
  out = out.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_KEY]');
  return out;
}

/**
 * Low-level Gemini REST API client using x-goog-api-key header (never URL query parameter).
 */
async function callGeminiGenerateContent({
  apiKey,
  model = 'gemini-2.5-flash',
  systemInstruction,
  contents,
  tools,
  maxOutputTokens = 1200,
  timeoutMs = 20000,
  fetchImpl = global.fetch,
}) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'Trợ lý AI Gemini chưa được cấu hình khóa kết nối (GEMINI_API_KEY) trên máy chủ.'
    );
  }

  const trimmedModel = String(model || '').trim();
  if (!trimmedModel || isRetiredGeminiModel(trimmedModel)) {
    throw new AppError(
      503,
      'AI_MODEL_RETIRED',
      `Model Gemini "${trimmedModel || 'empty'}" đã ngừng hỗ trợ (retired) hoặc không hợp lệ. Vui lòng cấu hình GEMINI_MODEL sang model hiện hành (ví dụ: gemini-2.5-flash).`
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(trimmedModel)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens,
      temperature: 0.1,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = [{ functionDeclarations: tools }];
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': String(apiKey).trim(),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch (_e) {
        errBody = '';
      }
      const safeDetail = redactErrorText(errBody, apiKey);

      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          502,
          'AI_PROVIDER_AUTH_ERROR',
          'Khóa kết nối Gemini API không hợp lệ hoặc bị từ chối quyền truy cập.'
        );
      }
      if (response.status === 404) {
        throw new AppError(
          502,
          'AI_MODEL_NOT_FOUND',
          `Model Gemini "${trimmedModel}" không tồn tại hoặc không hỗ trợ generateContent.`
        );
      }
      if (response.status === 429) {
        throw new AppError(
          429,
          'AI_RATE_LIMITED',
          'Hệ thống AI đang vượt giới hạn tần suất gọi (Quota/Rate Limit). Vui lòng thử lại sau ít phút.'
        );
      }
      throw new AppError(
        502,
        'AI_PROVIDER_ERROR',
        `Nhà cung cấp Gemini phản hồi lỗi (${response.status}): ${safeDetail.slice(0, 160)}`
      );
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
      throw new AppError(
        504,
        'AI_TIMEOUT',
        `Yêu cầu tới Gemini vượt quá thời gian chờ (${timeoutMs}ms). Vui lòng thử lại.`
      );
    }
    throw new AppError(
      502,
      'AI_PROVIDER_ERROR',
      redactErrorText(err?.message || 'Lỗi kết nối tới dịch vụ Gemini.', apiKey)
    );
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isRetiredGeminiModel,
  redactErrorText,
  callGeminiGenerateContent,
};
