import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteEndsEarly, withoutComment } from './check-frontmatter.mjs';

// The six real defects, verbatim from the vault on 2026-08-13. A guard for a
// bug class earns its place by catching the instances that actually happened.
const REAL = [
  ['metrics', 'Built by one person in three weeks with Claude Code. Two months following its own coaching: average HR 123 bpm'],
  ['name', 'Zoom: Brett Marlin x Jason Goldman re: Brainstorm Session'],
  ['clearance', 'CLEARED PUBLIC — 2026-08-04 (Brett), no scope restriction. Clearance is not sourcing: gaps 1-5 below are still open'],
  ['origin', 'Discord thread "Service Design: how well does the discipline map" (2026-07-31, Brett + Hermes)']
];

const QUOTED_DEFECTS = [
  '""It\'s too late" is a sunk-cost story, not a fact"',
  '"When you say "it\'s too late," what you really mean is "I\'ve invested too much to change.""'
];

// Template lines. THIRTY-SEVEN of these were reported as problems by the first
// version of this check, every one a false positive, because it did not know
// that `#` after whitespace starts a comment. A guard that cries wolf is one
// people learn to run with `|| true`.
const TEMPLATE_LINES = [
  '""                 # when the work happened, e.g. "2026-07"',
  '""                # client name, or "Marliin (internal)"',
  'hiring-manager      # the POV of the PRIMARY take. e.g. hiring-manager | customer',
  'internal        # public | internal | redacted — per consent/clearances.md; only `public` may feed a tool',
  '[]             # domains, e.g. [agent-architecture, systems-design]'
];

function flags(value) {
  const v = withoutComment(value);
  if (!v) return false;
  if (v.startsWith("'") || v.startsWith('[') || v.startsWith('{') || v === '>-' || v.startsWith('|')) return false;
  if (v.startsWith('"')) return quoteEndsEarly(v);
  return /:\s/.test(v);
}

test('it catches every unquoted value that broke a real file', () => {
  for (const [key, value] of REAL) {
    assert.equal(flags(value), true, `${key} should have been caught`);
  }
});

test('it catches a double-quoted value that closes early', () => {
  for (const value of QUOTED_DEFECTS) {
    assert.equal(flags(value), true, `should have been caught: ${value.slice(0, 40)}`);
  }
});

test('the repaired versions pass', () => {
  assert.equal(flags('"Zoom: Brett Marlin x Jason Goldman re: Brainstorm Session"'), false);
  assert.equal(flags('">-"'), false);
  assert.equal(flags('>-'), false);
  assert.equal(flags('"\\"It\'s too late\\" is a sunk-cost story, not a fact"'), false);
  assert.equal(flags("'Discord thread \"Service Design: how well\" (2026)'"), false);
});

test('template comment lines are NOT problems', () => {
  for (const value of TEMPLATE_LINES) {
    assert.equal(flags(value), false, `false positive on: ${value.slice(0, 50)}`);
  }
});

test('a # inside quotes is not a comment', () => {
  // Otherwise the check would truncate a legitimate value and then judge the
  // truncation.
  assert.equal(withoutComment('"a colour: #ff0066"'), '"a colour: #ff0066"');
  assert.equal(withoutComment("'tag #1'"), "'tag #1'");
  assert.equal(withoutComment('plain # trailing note'), 'plain');
  assert.equal(withoutComment('#immediate'), '');
});

test('an escaped quote does not end the string', () => {
  assert.equal(quoteEndsEarly('"he said \\"no\\" firmly"'), false);
  assert.equal(quoteEndsEarly('"he said "no" firmly"'), true);
  assert.equal(quoteEndsEarly('"unterminated'), true);
  assert.equal(quoteEndsEarly('"fine"'), false);
});
