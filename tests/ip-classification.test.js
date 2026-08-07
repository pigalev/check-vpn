import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIpAddress, isPublicInternetAddress } from '../assets/ip-classification.js';

test('classifies CGNAT as shared non-public space', () => {
  assert.deepEqual(classifyIpAddress('100.64.0.1'), {
    family: 4,
    scope: 'cgnat',
    public: false,
    transition: null,
    label: 'CGNAT/shared'
  });
  assert.equal(isPublicInternetAddress('100.127.255.254'), false);
  assert.equal(isPublicInternetAddress('100.128.0.1'), true);
});

test('keeps normal global IPv4 public', () => {
  const result = classifyIpAddress('8.8.8.8');
  assert.equal(result.family, 4);
  assert.equal(result.scope, 'global');
  assert.equal(result.public, true);
});

test('classifies IPv6 special and transition ranges', () => {
  assert.equal(classifyIpAddress('fd00::1').scope, 'ula');
  assert.equal(classifyIpAddress('fe80::1').scope, 'link-local');
  assert.equal(classifyIpAddress('ff02::1').scope, 'multicast');
  assert.equal(classifyIpAddress('2001:db8::1').scope, 'documentation');
  assert.equal(classifyIpAddress('2002:c000:0204::1').transition, '6to4');
  assert.equal(classifyIpAddress('2001:0000:4136:e378::1').transition, 'teredo');
  assert.equal(classifyIpAddress('::ffff:192.0.2.1').transition, 'ipv4-mapped');
  assert.equal(classifyIpAddress('::').scope, 'unspecified');
  assert.equal(classifyIpAddress('2606:4700:4700::1111').public, true);
});

test('invalid values are never public', () => {
  assert.equal(classifyIpAddress('not-an-ip').scope, 'invalid');
  assert.equal(isPublicInternetAddress('not-an-ip'), false);
});
