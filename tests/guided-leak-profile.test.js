import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyGuidedProfile, createGuidedLeakProfileStore } from '../assets/guided-leak-profile.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values
  };
}

test('profile round-trips only through the provided session storage', () => {
  const storage = memoryStorage();
  const store = createGuidedLeakProfileStore({ storage });
  const profile = createEmptyGuidedProfile();
  profile.knownReal[4] = ['95.25.1.2'];
  store.save(profile);
  assert.deepEqual(store.load().knownReal[4], ['95.25.1.2']);
});

test('unknown schema is discarded safely', () => {
  const storage = memoryStorage();
  storage.setItem('check-vpn:guided-leak:v1', JSON.stringify({ schemaVersion: 999, knownReal: { 4: ['1.1.1.1'] } }));
  const store = createGuidedLeakProfileStore({ storage });
  assert.deepEqual(store.load(), createEmptyGuidedProfile());
});

test('clear removes captured addresses', () => {
  const storage = memoryStorage();
  const store = createGuidedLeakProfileStore({ storage });
  store.update((profile) => ({ ...profile, knownReal: { ...profile.knownReal, 4: ['95.25.1.2'] } }));
  store.clear();
  assert.deepEqual(store.load().knownReal[4], []);
});

test('storage failures fall back safely in memory', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const store = createGuidedLeakProfileStore({ storage });
  const saved = store.update((profile) => ({ ...profile, knownReal: { ...profile.knownReal, 4: ['95.25.1.2'] } }));
  assert.deepEqual(saved.knownReal[4], ['95.25.1.2']);
});
