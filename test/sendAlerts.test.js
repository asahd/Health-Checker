const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it, mock } = require('node:test');

const { postJson } = require('../helpers/postJson');
const { buildPagerDutyPayload } = require('../helpers/sendPagerDutyAlert');
const { buildSlackPayload, buildSlackRecoveryPayload } = require('../helpers/sendSlackAlert');
const { closedPortUrl, startServer } = require('./helpers/localServer');

const failure = {
  stackId: 'stack-one',
  error: 'HTTP 503',
  endpoint: 'https://stack-one.example.org/data',
};
const options = { label: 'Test', retryDelayMs: 0, timeoutSecs: 1 };

describe('postJson', () => {
  let server;
  let statuses;

  beforeEach(async () => {
    statuses = [];
    server = await startServer((request, response) => {
      response.writeHead(statuses.shift() ?? 200).end();
    });
    mock.method(console, 'error', () => {});
  });

  afterEach(async () => {
    mock.restoreAll();
    await server.close();
  });

  it('returns true when the service accepts the payload', async () => {
    assert.equal(await postJson(server.url, { a: 1 }, options), true);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].body, '{"a":1}');
  });

  it('tries once more after a rejected attempt', async () => {
    statuses = [500, 200];
    assert.equal(await postJson(server.url, {}, options), true);
    assert.equal(server.requests.length, 2);
  });

  it('returns false after two rejected attempts and logs both', async () => {
    statuses = [404, 404];
    assert.equal(await postJson(server.url, {}, options), false);
    assert.equal(server.requests.length, 2);
    assert.equal(console.error.mock.callCount(), 2);
  });

  it('returns false without throwing when the service cannot be reached', async () => {
    assert.equal(await postJson(await closedPortUrl(), {}, options), false);
  });
});

describe('alert payloads', () => {
  it('groups PagerDuty triggers for a stack with dedup_key', () => {
    const payload = buildPagerDutyPayload('key', failure);
    assert.equal(payload.dedup_key, 'stack-one');
    assert.equal(payload.routing_key, 'key');
    assert.equal(payload.payload.summary, `stack-one - HTTP 503 on ${failure.endpoint}`);
  });

  it('shows the error and cooldown in Slack', () => {
    const payload = buildSlackPayload(failure, 30);
    assert.equal(payload.text, '_muted for next 30m_');
    assert.equal(payload.attachments[1].text, 'Response: *HTTP 503*');
  });

  it('shows how long the stack was failing in the Slack recovery message', () => {
    const payload = buildSlackRecoveryPayload(
      { stackId: 'stack-one', endpoint: failure.endpoint, durationMs: 120 },
      12 * 60 * 1000,
    );
    assert.equal(payload.username, 'App ( STACK-ONE ) Recovered');
    assert.equal(payload.text, '_was failing for about 12 minutes, alerts are no longer muted_');
    assert.equal(payload.attachments[1].text, 'Response time: *120ms*');
  });
});
