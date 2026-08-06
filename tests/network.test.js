import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress, getIpFamily } from '../assets/network.js';
test('detects IPv4 and IPv6 families', () => { assert.equal(getIpFamily('203.0.113.10'), 4); assert.equal(getIpFamily('2001:db8::10'), 6); assert.equal(getIpFamily('device.local'), null); });
test('classifies non-public candidates', () => { assert.equal(classifyAddress('127.0.0.1'), 'loopback'); assert.equal(classifyAddress('192.168.1.20'), 'private'); assert.equal(classifyAddress('169.254.5.1'), 'link-local'); assert.equal(classifyAddress('fe80::1'), 'link-local'); assert.equal(classifyAddress('host-123.local'), 'mdns'); });
test('classifies valid public addresses', () => { assert.equal(classifyAddress('8.8.8.8'), 'public'); assert.equal(classifyAddress('2606:4700:4700::1111'), 'public'); });
