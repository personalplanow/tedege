'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/security');

test('hash y verificacion de contraseña demo usan PBKDF2', () => {
  const { hash, salt, iterations } = hashPassword('Demo@1234');
  const user = { passwordHash: hash, passwordSalt: salt, passwordIterations: iterations };
  assert.equal(verifyPassword('Demo@1234', user), true);
  assert.equal(verifyPassword('Otra@1234', user), false);
});
