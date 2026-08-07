import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuidedAppRuntime } from '../assets/guided-app-runtime.js';

function element() {
  const listeners = new Map();
  return {
    textContent: '', className: '', disabled: false, hidden: false,
    children: [],
    addEventListener(type, handler) { listeners.set(type, handler); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    append(...nodes) { this.children.push(...nodes); },
    setAttribute() {},
    listeners
  };
}

function fakeDocument() {
  const ids = [
    'guided-step','guided-instructions','guided-real','guided-vpn','guided-primary','guided-secondary',
    'guided-clear','guided-result','guided-exposures','guided-paths','guided-coverage',
    'media-webrtc-button','media-webrtc-status','media-webrtc-result'
  ];
  const nodes = new Map(ids.map((id) => [`#${id}`, element()]));
  return {
    querySelector(selector) { return nodes.get(selector) ?? null; },
    createElement() { return element(); },
    nodes
  };
}

function memoryStorage(initialProfile = null) {
  const values = new Map();
  if (initialProfile) values.set('check-vpn:guided-leak:v1', JSON.stringify(initialProfile));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('clear removes stale guided stress exposures from the report', async () => {
  const doc = fakeDocument();
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  try {
    const staleStressState = {
      status: 'complete',
      result: 'leak',
      exposures: [{
        key: '4|8.8.8.8', address: '8.8.8.8', family: 4,
        relation: 'unknown-public', confirmationLevel: 'confirmed-unknown',
        observationCount: 2, channels: ['http-provider'], transportClasses: ['http'],
        sources: ['Provider X'], providerGroups: ['x'], perChannelCounts: { 'http-provider': 2 },
        firstDetector: 'Provider X', approxExposureMs: 1000
      }],
      coverage: { sufficient: true, attemptedFastSamples: 10, largestGapMs: 2000 },
      reconnectBurst: null
    };
    const profile = {
      schemaVersion: 1,
      step: 'stress',
      knownReal: { 4: ['95.25.1.2'], 6: [] },
      knownVpn: { 4: ['77.110.1.1'], 6: [] },
      capturedAt: { real: 1, vpn: 2 },
      explicitContinue: { 4: false, 6: false }
    };

    const runtime = createGuidedAppRuntime({
      storage: memoryStorage(profile),
      networkConfig: { ipProviders: { 4: [], 6: [] }, stunDestinations: [] },
      document: doc,
      navigator: {},
      runWebRtcTest: async () => ({ status: 'complete', candidates: [] }),
      runHttpInspection: async () => ({ status: 'unavailable' }),
      runTlsFingerprint: async () => ({ status: 'unavailable' }),
      startStress: async () => staleStressState,
      getStressState: () => staleStressState
    });

    await doc.nodes.get('#guided-primary').listeners.get('click')();
    assert.equal(runtime.getReport().exposures.length, 1);

    runtime.clear();
    assert.deepEqual(runtime.getReport().exposures, []);
  } finally {
    globalThis.document = previousDocument;
  }
});
