const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { evaluateCheck, markAlerted, markRecovered } = require('../helpers/alertState');

const MINUTE = 60 * 1000;
const settings = {
  alertCooldownMins: 30,
  alertAfterFailures: { slack: 2, pagerDuty: 3 },
  recoveredAfterPasses: 3,
};
const fail = (error = 'HTTP 503') => ({ ok: false, error });
const ok = { ok: true };

const run = (results, { settings: runSettings = settings, undelivered = [] } = {}) => {
  let state;
  return results.map((result, index) => {
    const now = index * MINUTE;
    const evaluated = evaluateCheck(state, result, now, runSettings);
    ({ state } = evaluated);
    if (!undelivered.includes(index)) {
      Object.entries(evaluated.decisions).forEach(([channel, decision]) => {
        if (decision === 'send') state = markAlerted(state, channel, now);
        if (decision === 'recover') state = markRecovered();
      });
    }
    return { ...evaluated, state };
  });
};

describe('evaluateCheck: alerting', () => {
  it('does not alert on a single failure', () => {
    const [first] = run([fail()]);
    assert.deepEqual(first.decisions, { slack: 'below-threshold', pagerDuty: 'below-threshold' });
  });

  it('applies each channel threshold separately', () => {
    const [, second, third] = run([fail(), fail(), fail()]);
    assert.deepEqual(second.decisions, { slack: 'send', pagerDuty: 'below-threshold' });
    assert.deepEqual(third.decisions, { slack: 'muted', pagerDuty: 'send' });
  });

  it('applies the threshold to every kind of failure', () => {
    const [first, second] = run([fail('ETIMEDOUT'), fail('EAI_AGAIN: getaddrinfo')]);
    assert.equal(first.decisions.slack, 'below-threshold');
    assert.equal(second.decisions.slack, 'send');
  });

  it('mutes a stack whatever the error is, until the cooldown ends', () => {
    const results = run([
      fail('HTTP 502'),
      fail('HTTP 503'),
      fail('connect ECONNREFUSED 10.0.0.1:443'),
      fail('connect ECONNREFUSED 10.0.0.2:443'),
    ]);
    assert.equal(results[1].decisions.slack, 'send');
    assert.equal(results[2].decisions.slack, 'muted');
    assert.equal(results[3].decisions.slack, 'muted');
  });

  it('alerts again once the cooldown has passed', () => {
    const results = run(Array.from({ length: 33 }, () => fail()));
    const slackSends = results
      .map((result, minute) => (result.decisions.slack === 'send' ? minute : null))
      .filter((minute) => minute !== null);
    assert.deepEqual(slackSends, [1, 31]);
  });

  it('resets the failure count after a passing check', () => {
    const results = run([fail(), ok, fail()]);
    assert.equal(results[1].state.consecutiveFailures, 0);
    assert.equal(results[2].decisions.slack, 'below-threshold');
  });

  it('sends the alert again in the next round when delivery failed', () => {
    const results = run([fail(), fail(), fail()], { undelivered: [1] });
    assert.equal(results[1].decisions.slack, 'send');
    assert.equal(results[2].decisions.slack, 'send');
  });

  it('returns no decisions or event for a healthy stack', () => {
    const [first] = run([ok]);
    assert.deepEqual(first.decisions, {});
    assert.equal(first.event, undefined);
  });
});

describe('evaluateCheck: recovery', () => {
  it('records when the outage started, and keeps that time if the stack fails again before recovering', () => {
    const results = run([ok, fail(), fail(), ok, fail()]);
    assert.equal(results[1].state.failingSince, MINUTE);
    assert.equal(results[4].state.failingSince, MINUTE);
  });

  it('needs 3 passing checks in a row to recover', () => {
    const results = run([fail(), fail(), ok, ok, ok]);
    assert.equal(results[2].event, 'recovering');
    assert.equal(results[3].event, 'recovering');
    assert.deepEqual(results[3].decisions, {});
    assert.equal(results[4].event, 'recovered');
    assert.deepEqual(results[4].decisions, { slack: 'recover' });
  });

  it('keeps the mute when the stack fails again before passing 3 checks in a row', () => {
    const results = run([fail(), fail(), ok, ok, fail(), fail(), ok, fail(), fail()]);
    assert.equal(results[1].decisions.slack, 'send');
    assert.equal(results[5].decisions.slack, 'muted');
    assert.equal(results[8].decisions.slack, 'muted');
    assert.equal(
      results.filter((result) => result.event === 'recovered').length,
      0,
      'the stack should not have recovered',
    );
  });

  it('ends the mute when the stack recovers, so the next outage sends an alert', () => {
    const results = run([fail(), fail(), ok, ok, ok, fail(), fail()]);
    assert.deepEqual(results[4].state.lastAlertedAt, {});
    assert.equal(results[4].state.failingSince, undefined);
    assert.equal(results[5].decisions.slack, 'below-threshold');
    assert.equal(results[6].decisions.slack, 'send');
  });

  it('measures the outage from the first failed check to the first of the passing checks that end it', () => {
    const results = run([fail(), fail(), fail(), ok, fail(), ok, ok, ok]);
    assert.equal(results[7].event, 'recovered');
    assert.equal(results[7].failingForMs, 5 * MINUTE);
  });

  it('does not send a recovery message when Slack never alerted', () => {
    const results = run([fail(), ok, ok, ok]);
    assert.equal(results[3].event, 'recovered');
    assert.deepEqual(results[3].decisions, {});
    assert.equal(results[3].state.failingSince, undefined);
  });

  it('ends the PagerDuty mute on recovery without a recovery message', () => {
    const pagerDutyFirst = { ...settings, alertAfterFailures: { slack: 5, pagerDuty: 2 } };
    const results = run([fail(), fail(), ok, ok, ok, fail(), fail()], {
      settings: pagerDutyFirst,
    });
    assert.equal(results[1].decisions.pagerDuty, 'send');
    assert.deepEqual(results[4].decisions, {});
    assert.equal(results[4].event, 'recovered');
    assert.equal(results[6].decisions.pagerDuty, 'send');
  });

  it('sends the recovery message again in the next round when delivery failed', () => {
    const results = run([fail(), fail(), ok, ok, ok, ok, ok], { undelivered: [4] });
    assert.deepEqual(results[4].decisions, { slack: 'recover' });
    assert.deepEqual(results[5].decisions, { slack: 'recover' });
    assert.equal(results[5].failingForMs, 2 * MINUTE);
    assert.deepEqual(results[6].decisions, {});
    assert.equal(results[6].event, undefined);
  });

  it('keeps the outage and mutes if the stack fails before the recovery message is delivered', () => {
    const results = run([fail(), fail(), ok, ok, ok, fail(), fail()], { undelivered: [4] });
    assert.equal(results[5].state.failingSince, 0);
    assert.equal(results[6].decisions.slack, 'muted');
  });

  it('recovers on the first pass when recoveredAfterPasses is 1', () => {
    const results = run([fail(), fail(), ok], {
      settings: { ...settings, recoveredAfterPasses: 1 },
    });
    assert.equal(results[2].event, 'recovered');
    assert.deepEqual(results[2].decisions, { slack: 'recover' });
  });
});
