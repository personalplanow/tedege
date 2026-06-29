'use strict';

const crypto = require('crypto');

const ITERATIONS = 120_000;
const KEYLEN = 64;
const DIGEST = 'sha512';

function randomId(prefix = '') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return { salt, hash, algorithm: `pbkdf2-${DIGEST}`, iterations: ITERATIONS };
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  const computed = crypto.pbkdf2Sync(
    password,
    user.passwordSalt,
    user.passwordIterations || ITERATIONS,
    KEYLEN,
    DIGEST
  );
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === computed.length && crypto.timingSafeEqual(stored, computed);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, passwordIterations, seedPassword, ...safe } = user;
  return safe;
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === '');
  if (missing.length) {
    const error = new Error(`Campos requeridos: ${missing.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  randomId,
  hashPassword,
  verifyPassword,
  sanitizeUser,
  requireFields,
};
