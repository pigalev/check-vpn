import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeCandidate,
  getCandidateGroup,
  parseIceCandidate,
  runWebRtcTest
} from '../assets/webrtc-test.js';

test('parses a server-reflexive public candidate', () => {
  assert.deepEqual(
    parseIceCandidate('candidate:1 1 udp 2122260223 8.8.8.8 54400 typ srflx raddr 192.168.1.5 rport 54400'),
    {
      address: '8.8.8.8', port: 54400, family: 4, protocol: 'udp', type: 'srflx', classification: 'public',
      ipDetails: { family: 4, scope: 'global', public: true, transition: null, label: 'Public IPv4' }
    }
  );
});

test('parses an mDNS host candidate', () => {
  const result = parseIceCandidate('candidate:2 1 udp 2122194687 host-123.local 53544 typ host');
  assert.equal(result.classification, 'mdns');
  assert.equal(result.family, null);
  assert.equal(result.ipDetails.public, false);
});

test('returns null for malformed candidates', () => {
  assert.equal(parseIceCandidate('not-a-candidate'), null);
});

test('groups public srflx candidates as public addresses', () => {
  const candidate = parseIceCandidate('candidate:1 1 udp 1 8.8.8.8 5000 typ srflx');
  assert.equal(getCandidateGroup(candidate), 'public');
  assert.deepEqual(describeCandidate(candidate), {
    group: 'public',
    heading: 'Public address',
    meta: 'srflx · IPv4 · UDP · Public',
    note: 'Address discovered through STUN.'
  });
});

test('explains mDNS host candidates as hidden local addresses', () => {
  const candidate = parseIceCandidate('candidate:2 1 udp 1 host-123.local 5001 typ host');
  const description = describeCandidate(candidate);
  assert.equal(getCandidateGroup(candidate), 'local');
  assert.equal(description.heading, 'Local interface');
  assert.equal(description.note, 'Local address hidden by browser (mDNS).');
});

test('groups private host candidates as local interfaces', () => {
  const candidate = parseIceCandidate('candidate:3 1 udp 1 192.168.1.20 5002 typ host');
  assert.equal(getCandidateGroup(candidate), 'local');
  assert.match(describeCandidate(candidate).meta, /Private/);
});

test('groups CGNAT host candidates as local/shared rather than public', () => {
  const candidate = parseIceCandidate('candidate:4 1 udp 1 100.64.10.20 5003 typ host');
  assert.equal(candidate.classification, 'cgnat');
  assert.equal(candidate.ipDetails.public, false);
  assert.equal(getCandidateGroup(candidate), 'local');
  assert.match(describeCandidate(candidate).meta, /CGNAT/);
});

test('collects and deduplicates candidates', async () => {
  class FakePeerConnection {
    static closed = false;
    constructor() { this.onicecandidate = null; }
    createDataChannel() {}
    async createOffer() { return { type: 'offer', sdp: 'fake' }; }
    async setLocalDescription() {
      queueMicrotask(() => {
        const candidate = { candidate: 'candidate:1 1 udp 1 8.8.8.8 5000 typ srflx' };
        this.onicecandidate?.({ candidate });
        this.onicecandidate?.({ candidate });
        this.onicecandidate?.({ candidate: null });
      });
    }
    close() { FakePeerConnection.closed = true; }
  }

  const result = await runWebRtcTest({
    stunUrls: ['stun:example.test:3478'],
    timeoutMs: 100,
    RTCPeerConnectionImpl: FakePeerConnection
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.publicAddresses, ['8.8.8.8']);
  assert.equal(result.candidates.length, 1);
  assert.equal(FakePeerConnection.closed, true);
});
