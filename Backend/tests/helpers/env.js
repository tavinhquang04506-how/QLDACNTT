// Preloaded with `node --require` before every test file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret';
process.env.PUNCH_MIN_GAP_SECONDS = process.env.PUNCH_MIN_GAP_SECONDS || '0';
