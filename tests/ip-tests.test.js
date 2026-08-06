import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpTest } from '../assets/ip-tests.js';
test('normalizes a valid IPv4 response', async () => { const fetchImpl = async () => ({ ok: true, json: async () => ({ ip: '203.0.113.10' }) }); assert.deepEqual(await runIpTest({ family: 4, endpoint: 'https://example.test/v4', timeoutMs: 100, fetchImpl }), { status: 'complete', address: '203.0.113.10', family: 4, error: null }); });
test('rejects an address from the wrong family', async () => { const fetchImpl = async () => ({ ok: true, json: async () => ({ ip: '2001:db8::10' }) }); const result = await runIpTest({ family: 4, endpoint: 'https://example.test/v4', timeoutMs: 100, fetchImpl }); assert.equal(result.status, 'error'); assert.equal(result.address, null); });
test('reports an unreachable family as unavailable', async () => { const fetchImpl = async () => { throw new TypeError('Failed to fetch'); }; const result = await runIpTest({ family: 6, endpoint: 'https://example.test/v6', timeoutMs: 100, fetchImpl }); assert.equal(result.status, 'unavailable'); assert.equal(result.address, null); });
