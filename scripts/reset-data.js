'use strict';

const { JsonStore } = require('../src/store');

const store = new JsonStore();
store.init({ reset: true });
console.log('Datos demo restaurados para ASAP design by Jeisson Steven Herrera Baquero.');
