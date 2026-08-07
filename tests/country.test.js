import test from 'node:test';
import assert from 'node:assert/strict';
import { countryCodeToFlag, countryCodeToFlagUrl } from '../assets/country.js';

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

test('builds a reliable flag image URL', () => {
  assert.equal(countryCodeToFlagUrl('DE'), 'https://flagcdn.com/24x18/de.png');
  assert.equal(countryCodeToFlagUrl('de'), 'https://flagcdn.com/24x18/de.png');
});

test('returns no flag image URL for missing or invalid country code', () => {
  assert.equal(countryCodeToFlagUrl('D'), '');
  assert.equal(countryCodeToFlagUrl(null), '');
});
