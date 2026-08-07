import test from 'node:test';
import assert from 'node:assert/strict';
import { countryCodeToFlag } from '../assets/country.js';

test('converts uppercase country code to flag', () => {
  assert.equal(countryCodeToFlag('DE'), '🇩🇪');
});

test('normalizes lowercase country code', () => {
  assert.equal(countryCodeToFlag('us'), '🇺🇸');
});

test('returns empty string for missing country code', () => {
  assert.equal(countryCodeToFlag(null), '');
  assert.equal(countryCodeToFlag(''), '');
});

test('returns empty string for invalid country code', () => {
  assert.equal(countryCodeToFlag('DEU'), '');
  assert.equal(countryCodeToFlag('1A'), '');
});
