const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { loadSettings, validateStacks, validateSecrets } = require('../helpers/config');
const exampleStacks = require('../stacks/app');

const validStack = {
  stackId: 'one',
  baseURL: 'one.example.org',
  method: 'GET',
  path: '/health',
  timeoutSecs: 2,
};
const errorsFor = (overrides) => validateStacks([{ ...validStack, ...overrides }]);
const requiredEnv = {
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/A/B/C',
  PAGERDUTY_INTEGRATION_KEY: 'key',
};

describe('validateStacks', () => {
  it('accepts the example stacks file', () => {
    assert.deepEqual(validateStacks(exampleStacks), []);
  });

  it('accepts a minimal stack', () => {
    assert.deepEqual(validateStacks([validStack]), []);
  });

  it('rejects an empty or missing list', () => {
    assert.equal(validateStacks([]).length, 1);
    assert.equal(validateStacks(undefined).length, 1);
  });

  it('rejects duplicate stack IDs', () => {
    const errors = validateStacks([validStack, { ...validStack, baseURL: 'two.example.org' }]);
    assert.match(errors.join('\n'), /"one" is used more than once/);
  });

  it('rejects a baseURL that includes a scheme or path', () => {
    assert.match(errorsFor({ baseURL: 'https://one.example.org' }).join(), /only a hostname/);
    assert.match(errorsFor({ baseURL: 'one.example.org/data' }).join(), /only a hostname/);
  });

  it('accepts a baseURL with a port, including the default HTTPS port', () => {
    assert.deepEqual(errorsFor({ baseURL: 'one.example.org:8443' }), []);
    assert.deepEqual(errorsFor({ baseURL: 'one.example.org:443' }), []);
  });

  it('rejects a baseURL with credentials or spaces', () => {
    assert.match(errorsFor({ baseURL: 'user@one.example.org' }).join(), /only a hostname/);
    assert.match(errorsFor({ baseURL: 'one example.org' }).join(), /only a hostname/);
  });

  it('explains where credentials go when the old authorization field is used', () => {
    assert.match(errorsFor({ authorization: 'abc' }).join(), /authorizationEnv/);
  });

  it('rejects unknown fields', () => {
    assert.match(errorsFor({ timeout: 2 }).join(), /unknown field "timeout"/);
  });

  it('rejects a body with GET', () => {
    assert.match(errorsFor({ body: [] }).join(), /body cannot be sent with GET/);
    assert.deepEqual(errorsFor({ method: 'POST', body: [] }), []);
  });

  it('checks numbers and status codes', () => {
    assert.match(errorsFor({ timeoutSecs: 0 }).join(), /timeoutSecs/);
    assert.match(errorsFor({ slowSecs: 3 }).join(), /less than timeoutSecs/);
    assert.match(errorsFor({ expectedStatus: 700 }).join(), /expectedStatus/);
  });

  it('requires method and path, so an old stack entry cannot silently change to GET /', () => {
    const errors = errorsFor({ method: undefined, path: undefined }).join('\n');
    assert.match(errors, /path must be/);
    assert.match(errors, /method must be/);
  });

  it('rejects a bad path, method or environment variable name', () => {
    assert.match(errorsFor({ path: 'data' }).join(), /path/);
    assert.match(errorsFor({ method: 'post' }).join(), /method/);
    assert.match(errorsFor({ authorizationEnv: 'stack-one' }).join(), /authorizationEnv/);
  });
});

describe('validateSecrets', () => {
  it('reports credentials that are referenced but not set', () => {
    const stacks = [{ ...validStack, authorizationEnv: 'ONE_AUTH' }];
    assert.equal(validateSecrets(stacks, {}).length, 1);
    assert.deepEqual(validateSecrets(stacks, { ONE_AUTH: 'abc' }), []);
  });

  it('needs no credentials for a stack without authorizationEnv', () => {
    assert.deepEqual(validateSecrets([validStack], {}), []);
  });
});

describe('loadSettings', () => {
  it('uses defaults for optional settings', () => {
    const { settings, errors } = loadSettings(requiredEnv);
    assert.deepEqual(errors, []);
    assert.equal(settings.stacksFile, 'stacks/app.js');
    assert.equal(settings.checkIntervalSecs, 60);
    assert.equal(settings.alertCooldownMins, 30);
    assert.deepEqual(settings.alertAfterFailures, { slack: 2, pagerDuty: 2 });
    assert.equal(settings.recoveredAfterPasses, 3);
  });

  it('reads optional settings', () => {
    const { settings } = loadSettings({
      ...requiredEnv,
      SLACK_ALERT_AFTER_FAILURES: '1',
      PAGERDUTY_ALERT_AFTER_FAILURES: '3',
      RECOVERED_AFTER_PASSES: '1',
    });
    assert.deepEqual(settings.alertAfterFailures, { slack: 1, pagerDuty: 3 });
    assert.equal(settings.recoveredAfterPasses, 1);
  });

  it('reports missing and invalid settings', () => {
    const { errors } = loadSettings({ SLACK_WEBHOOK_URL: 'not a url', CHECK_INTERVAL_SECS: 'x' });
    assert.equal(errors.length, 3);
  });

  it('rejects a non-whole number of failures', () => {
    const { errors } = loadSettings({ ...requiredEnv, SLACK_ALERT_AFTER_FAILURES: '1.5' });
    assert.match(errors.join(), /SLACK_ALERT_AFTER_FAILURES must be a positive whole number/);
  });
});
