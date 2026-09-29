const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { parseTrustProxy } = require('../utils/trustProxy');

const isTest =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.includes('--test') ||
  process.argv.includes('--test');

const list = (value, fallback) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const defaultOrigins = [3000, 3001, 3002, 3003, 3004, 3005, 5173].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

const timezone = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';
if (!/^[A-Za-z0-9_+\-/]+$/.test(timezone)) throw new Error(`Invalid APP_TIMEZONE "${timezone}"`);

const config = {
  timezone,
  // Minimum seconds between the kiosk check-in and check-out scan of the same person (prevents double scans).
  punchMinGapSeconds: parseInt(process.env.PUNCH_MIN_GAP_SECONDS || '60', 10),
  env: process.env.NODE_ENV || 'development',
  isTest,
  port: parseInt(process.env.PORT || '8000', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: isTest ? process.env.DB_NAME_TEST || 'nexus_hrms_test' : process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '30m',
  },
  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '20000', 10),
    maxOutputTokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS || '1200', 10),
    maxToolRounds: parseInt(process.env.AI_MAX_TOOL_ROUNDS || '3', 10),
    maxMessageChars: parseInt(process.env.AI_MAX_MESSAGE_CHARS || '4000', 10),
    requestsPerMinute: parseInt(process.env.AI_REQUESTS_PER_MINUTE || '10', 10),
  },
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  corsOrigins: [
    ...new Set([...list(process.env.CORS_ORIGINS, defaultOrigins), process.env.FRONTEND_URL].filter(Boolean)),
  ],
};

if (isTest && !/^[a-z0-9_]+_test$/.test(config.db.database || '')) {
  throw new Error(`Refusing to run in test mode against database "${config.db.database}": its name must end with _test`);
}

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET is required (set it in Backend/.env)');
}

module.exports = config;
