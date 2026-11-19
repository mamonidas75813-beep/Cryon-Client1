import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPartners } from '../modules/partners/partner-config.js';
const first = { id: 'first', name: 'First Server', address: 'play.example.com' };
const second = { id: 'second', name: 'Second Server', address: 'second.example.com', logo: 'second.png' };
test('loads multiple partners and allows missing icons and empty list', () => {
  const partners = loadPartners([first, second], '/assets');
  assert.equal(partners.length, 2);
  assert.equal(partners[1].logo, 'second.png');
  assert.equal(partners[0].iconPath, null);
  assert.deepEqual(loadPartners([], '/assets'), []);
});
test('rejects duplicate partners and unsafe image names', () => {
  assert.throws(() => loadPartners([first, first], '/assets'));
  assert.throws(() => loadPartners([{...first, logo: '../bad.png'}], '/assets'));
});
