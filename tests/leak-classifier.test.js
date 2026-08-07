import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLeakAddress, confirmationForExposure } from '../assets/leak-classifier.js';

const profile = {
  knownReal: { 4: ['95.25.1.2'], 6: ['2a00:1450:4001::1'] },
  knownVpn: { 4: ['77.110.1.1'], 6: ['2606:4700:4700::1111'] }
};

test('one exact known-real IPv4 or IPv6 is classified as known real', () => {
  assert.equal(classifyLeakAddress('95.25.1.2', profile).relation, 'known-real');
  assert.equal(classifyLeakAddress('2a00:1450:4001::1', profile).relation, 'known-real');
});

test('captured VPN addresses are known VPN', () => {
  assert.equal(classifyLeakAddress('77.110.1.1', profile).relation, 'known-vpn');
  assert.equal(classifyLeakAddress('2606:4700:4700::1111', profile).relation, 'known-vpn');
});

test('vpn rotation is unknown public, never known real without exact match', () => {
  assert.equal(classifyLeakAddress('77.110.1.99', profile).relation, 'unknown-public');
});

test('private CGNAT ULA link-local and mDNS-like values are non-public', () => {
  assert.equal(classifyLeakAddress('192.168.1.10', profile).relation, 'non-public');
  assert.equal(classifyLeakAddress('100.64.1.2', profile).relation, 'non-public');
  assert.equal(classifyLeakAddress('fd00::1', profile).relation, 'non-public');
  assert.equal(classifyLeakAddress('fe80::1', profile).relation, 'non-public');
  assert.equal(classifyLeakAddress('host.local', profile).relation, 'non-public');
});

test('known real is conclusive from one observation', () => {
  assert.equal(confirmationForExposure({ relation: 'known-real', observationCount: 1, transportClasses: ['http'] }), 'known-real');
});

test('unknown needs repetition or independent transport confirmation', () => {
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 1, transportClasses: ['http'] }), 'unconfirmed-unknown');
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 2, transportClasses: ['http'] }), 'confirmed-unknown');
  assert.equal(confirmationForExposure({ relation: 'unknown-public', observationCount: 2, transportClasses: ['http', 'stun'] }), 'confirmed-unknown');
});
