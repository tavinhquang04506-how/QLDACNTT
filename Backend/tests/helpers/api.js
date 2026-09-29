const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

const ACCOUNTS = {
  CEO: { email: 'ceo@fwbnexus.vn', password: 'Ceo@123456' },
  HR_DIRECTOR: { email: 'hrd@fwbnexus.vn', password: 'Hrd@123456' },
  LINE_MANAGER: { email: 'lead@fwbnexus.vn', password: 'Lead@12345' },
  EMPLOYEE: { email: 'employee@fwbnexus.vn', password: 'Emp@123456' },
};

const tokens = {};

async function tokenFor(role) {
  if (!tokens[role]) {
    const res = await request(app).post('/api/auth/login').send(ACCOUNTS[role]);
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Test login failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    tokens[role] = res.body.token;
  }
  return tokens[role];
}

/** Decoded JWT payload for a seeded role: { userId, employeeId, roleCode, email, ... } */
async function claimsFor(role) {
  const token = await tokenFor(role);
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/**
 * call(role, 'get', '/api/employees')            -> authenticated as `role`
 * call(null, 'post', '/api/auth/login', {...})   -> anonymous
 */
async function call(role, method, url, body) {
  let req = request(app)[method](url);
  if (role) req = req.set('Authorization', `Bearer ${await tokenFor(role)}`);
  return body === undefined ? req : req.send(body);
}

/** Log in a throwaway user (see helpers/users.js) and return its tokens. */
async function loginUser(u) {
  const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
  if (res.status !== 200) throw new Error(`loginUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Same as call() but authenticated with an explicit access token. */
function callWith(token, method, url, body) {
  const req = request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
}

const closeDb = () => db.pool.end();

module.exports = { ACCOUNTS, tokenFor, claimsFor, call, callWith, loginUser, closeDb };
