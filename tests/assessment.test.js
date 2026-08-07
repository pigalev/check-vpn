import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResults } from '../assets/assessment.js';

const completeIp = (family, address) => ({ status: 'complete', family, address, agreement: { agree: true }, error: null });

test('reports protected when WebRTC matches HTTP addresses', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'),
    ipv6: { status: 'unavailable', family: 6, address: null, agreement: { agree: true }, error: null },
    webrtc: { status: 'complete', publicAddresses: ['203.0.113.10'], candidates: [], error: null }
  });
  assert.equal(result.status, 'protected');
  assert.equal(result.findings.length, 0);
});

test('reports leak when WebRTC exposes a different public address', () => {
  const result = assessResults({
    ipv4: completeIp(4, '203.0.113.10'),
    ipv6: { status: 'unavailable', family: 6, address: null, agreement: { agree: true }, error: null },
    webrtc: { status: 'complete', publicAddresses: ['198.51.100.25'], candidates: [], error: null }
  });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'webrtc-public-mismatch'), true);
});

test('review findings outrank protected but not leak', () => {
  const result = assessResults({
    ipv4: { ...completeIp(4, '203.0.113.10'), agreement: { agree: false } },
    ipv6: { status: 'unavailable', family: 6, address: null, agreement: { agree: true }, error: null },
    webrtc: { status: 'complete', publicAddresses: ['203.0.113.10'], candidates: [], error: null }
  });
  assert.equal(result.status, 'review');
});

test('qualifies incomplete results', () => {
  const result = assessResults({
    ipv4: { status: 'unavailable', family: 4, address: null, error: null },
    ipv6: { status: 'unavailable', family: 6, address: null, error: null },
    webrtc: { status: 'unavailable', publicAddresses: [], candidates: [], error: null }
  });
  assert.equal(result.status, 'incomplete');
});

test('guided known-real finding forces top-level leak', () => {
  const result = assessResults({
    ipv4: completeIp(4, '77.110.1.1'),
    ipv6: { status: 'unavailable', family: 6, address: null, agreement: { agree: true }, error: null },
    webrtc: { status: 'complete', publicAddresses: ['77.110.1.1'], candidates: [], error: null },
    guidedFindings: [{ id: 'guided-real-ip', severity: 'leak', category: 'guided', summary: 'Known real IP exposed', details: '95.25.1.2', sources: ['guided-test'] }]
  });
  assert.equal(result.status, 'leak');
  assert.equal(result.findings.some((finding) => finding.id === 'guided-real-ip'), true);
});
