const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { formatDuration, plural } = require('../helpers/format');

describe('formatDuration', () => {
  it('writes durations in words', () => {
    assert.equal(formatDuration(20 * 1000), '1 minute');
    assert.equal(formatDuration(45 * 60 * 1000), '45 minutes');
    assert.equal(formatDuration(60 * 60 * 1000), '1 hour');
    assert.equal(formatDuration(125 * 60 * 1000), '2 hours 5 minutes');
  });
});

describe('plural', () => {
  it('adds "s" to a word unless the count is 1', () => {
    assert.equal(plural(1, 'second'), '1 second');
    assert.equal(plural(0.5, 'second'), '0.5 seconds');
    assert.equal(plural(3, 'passing check'), '3 passing checks');
  });
});
