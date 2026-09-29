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
  out = out.replace(/AQ\.[0-9A-Za-z\-_]{15,}/g, '[REDACTED_KEY]');
  return out;
}

function parseRetryAfterMs(response, defaultDelayMs = 150) {
  try {
    const rawHeader =
      typeof response?.headers?.get === 'function'
        ? response.headers.get('retry-after') || response.headers.get('Retry-After')
        : response?.headers?.['retry-after'] || response?.headers?.['Retry-After'];
    if (!rawHeader) return defaultDelayMs;
    const trimmed = String(rawHeader).trim();
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1000);
    }
    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
  } catch (_e) {
    // Ignore header parse errors
  }
  return defaultDelayMs;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTokenUsage(data) {
  const usage = data?.usageMetadata;
  if (!usage || typeof usage !== 'object') return null;
  return {
    promptTokens: Number(usage.promptTokenCount || 0),
    completionTokens: Number(usage.candidatesTokenCount || 0),
    totalTokens: Number(usage.totalTokenCount || 0),
  };
}

/**
 * Low-level Gemini REST API client using x-goog-api-key header (never URL query parameter).
 * Supports bounded retry (maxRetries, default 1) for transient 429/502/503/504 errors
 * while strictly respecting Retry-After and overall timeoutMs budget. Never retries 401/403/404.
 */
async function callGeminiGenerateContent({
  apiKey,
  model = 'gemini-2.5-flash',
  systemInstruction,
  contents,
  tools,
  maxOutputTokens = 1200,
  timeoutMs = 20000,
  maxRetries = 1,
  retryDelayMs = 100,
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

  const allowedRetries = Math.min(2, Math.max(0, Number(maxRetries ?? 1)));
  const deadline = Date.now() + Number(timeoutMs || 20000);
  let providerCalls = 0;
  let retriesUsed = 0;

  for (let attempt = 0; attempt <= allowedRetries; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      const timeoutErr = new AppError(
        504,
        'AI_TIMEOUT',
        `Yêu cầu tới Gemini vượt quá thời gian chờ (${timeoutMs}ms). Vui lòng thử lại.`
      );
      timeoutErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
      throw timeoutErr;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    providerCalls += 1;

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

        // Non-retryable authentication / permission / model errors
        if (response.status === 401 || response.status === 403) {
          const authErr = new AppError(
            502,
            'AI_PROVIDER_AUTH_ERROR',
            'Khóa kết nối Gemini API không hợp lệ hoặc bị từ chối quyền truy cập. Vui lòng kiểm tra GEMINI_API_KEY trên máy chủ.'
          );
          authErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
          throw authErr;
        }
        if (response.status === 404) {
          const notFoundErr = new AppError(
            502,
            'AI_MODEL_NOT_FOUND',
            `Model Gemini "${trimmedModel}" không tồn tại hoặc không hỗ trợ generateContent. Vui lòng kiểm tra cấu hình GEMINI_MODEL.`
          );
          notFoundErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
          throw notFoundErr;
        }

        // Transient status codes eligible for bounded retry if within deadline
        const isTransient = [429, 500, 502, 503, 504].includes(response.status);
        if (isTransient && attempt < allowedRetries) {
          const waitMs = parseRetryAfterMs(response, retryDelayMs);
          const timeLeftAfterCall = deadline - Date.now();
          if (waitMs >= 0 && waitMs + 20 < timeLeftAfterCall) {
            retriesUsed += 1;
            clearTimeout(timer);
            if (waitMs > 0) {
              await sleepMs(waitMs);
            }
            continue;
          }
        }

        if (response.status === 429) {
          const rateErr = new AppError(
            429,
            'AI_RATE_LIMITED',
            'Hệ thống AI đang vượt giới hạn tần suất gọi (Quota/Rate Limit). Vui lòng thử lại sau ít phút.'
          );
          rateErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
          throw rateErr;
        }

        const provErr = new AppError(
          502,
          'AI_PROVIDER_ERROR',
          `Nhà cung cấp Gemini phản hồi lỗi (${response.status}): ${safeDetail.slice(0, 160)}`
        );
        provErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
        throw provErr;
      }

      const data = await response.json();
      const tokenUsage = extractTokenUsage(data);
      if (data && typeof data === 'object') {
        Object.defineProperty(data, '_providerStats', {
          value: { providerCalls, retriesUsed, tokenUsage },
          enumerable: false,
          configurable: true,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
        const abortErr = new AppError(
          504,
          'AI_TIMEOUT',
          `Yêu cầu tới Gemini vượt quá thời gian chờ (${timeoutMs}ms). Vui lòng thử lại.`
        );
        abortErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
        throw abortErr;
      }
      const netErr = new AppError(
        502,
        'AI_PROVIDER_ERROR',
        redactErrorText(err?.message || 'Lỗi kết nối tới dịch vụ Gemini.', apiKey)
      );
      netErr.providerStats = { providerCalls, retriesUsed, tokenUsage: null };
      throw netErr;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  isRetiredGeminiModel,
  redactErrorText,
  parseRetryAfterMs,
  extractTokenUsage,
  callGeminiGenerateContent,
};
