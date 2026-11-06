const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const STACK_KEYS = [
  'stackId',
  'baseURL',
  'path',
  'method',
  'body',
  'authorizationEnv',
  'timeoutSecs',
  'slowSecs',
  'expectedStatus',
  'expectedBodyIncludes',
];

const isPositiveNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const isHostWithOptionalPort = (value) => {
  if (/[/?#@\s]/.test(value)) return false;
  try {
    return new URL(`https://${value}`).hostname !== '';
  } catch {
    return false;
  }
};

const readPositiveNumber = (env, name, fallback, errors, { integer = false } = {}) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!isPositiveNumber(value) || (integer && !Number.isInteger(value))) {
    errors.push(`${name} must be a positive ${integer ? 'whole ' : ''}number, but it is "${raw}".`);
    return fallback;
  }
  return value;
};

const loadSettings = (env) => {
  const errors = [];
  const settings = {
    slackWebhookUrl: env.SLACK_WEBHOOK_URL,
    pagerDutyIntegrationKey: env.PAGERDUTY_INTEGRATION_KEY,
    stacksFile: env.STACKS_FILE || 'stacks/app.js',
    checkIntervalSecs: readPositiveNumber(env, 'CHECK_INTERVAL_SECS', 60, errors),
    alertCooldownMins: readPositiveNumber(env, 'ALERT_COOLDOWN_MINS', 30, errors),
    alertAfterFailures: {
      slack: readPositiveNumber(env, 'SLACK_ALERT_AFTER_FAILURES', 2, errors, { integer: true }),
      pagerDuty: readPositiveNumber(env, 'PAGERDUTY_ALERT_AFTER_FAILURES', 2, errors, {
        integer: true,
      }),
    },
    recoveredAfterPasses: readPositiveNumber(env, 'RECOVERED_AFTER_PASSES', 3, errors, {
      integer: true,
    }),
  };

  if (!settings.slackWebhookUrl) {
    errors.push('SLACK_WEBHOOK_URL is not set.');
  } else if (!isHttpUrl(settings.slackWebhookUrl)) {
    errors.push('SLACK_WEBHOOK_URL must be a full URL, for example https://hooks.slack.com/...');
  }
  if (!settings.pagerDutyIntegrationKey) {
    errors.push('PAGERDUTY_INTEGRATION_KEY is not set.');
  }

  return { settings, errors };
};

const validateStack = (stack, index) => {
  const errors = [];
  const label =
    stack && typeof stack.stackId === 'string' && stack.stackId
      ? `stack ${index + 1} (${stack.stackId})`
      : `stack ${index + 1}`;
  const add = (message) => errors.push(`${label}: ${message}`);

  if (!stack || typeof stack !== 'object' || Array.isArray(stack)) {
    add('must be an object.');
    return errors;
  }

  Object.keys(stack).forEach((key) => {
    if (key === 'authorization') {
      add(
        'credentials can no longer be stored in the stacks file. Move the value to a variable in .env and set authorizationEnv to that variable name.',
      );
    } else if (!STACK_KEYS.includes(key)) {
      add(`unknown field "${key}". Allowed fields: ${STACK_KEYS.join(', ')}.`);
    }
  });

  if (typeof stack.stackId !== 'string' || !stack.stackId) {
    add('stackId must be a non-empty string.');
  }

  if (typeof stack.baseURL !== 'string' || !stack.baseURL) {
    add('baseURL must be a non-empty string, for example "stack-one.example.org".');
  } else if (!isHostWithOptionalPort(stack.baseURL)) {
    add(
      `baseURL must be only a hostname, optionally followed by :port, but it is "${stack.baseURL}". Put the path in the "path" field.`,
    );
  }

  if (typeof stack.path !== 'string' || !stack.path.startsWith('/')) {
    add('path must be a string starting with "/", for example "/data".');
  }

  const { method } = stack;
  if (!METHODS.includes(method)) {
    add(`method must be one of ${METHODS.join(', ')}.`);
  }

  if (stack.body !== undefined) {
    if (['GET', 'HEAD'].includes(method)) {
      add(
        `a body cannot be sent with ${method}. Change method to one that allows a body, such as POST, or remove body.`,
      );
    }
    if (JSON.stringify(stack.body) === undefined) {
      add('body must be a value that can be sent as JSON.');
    }
  }

  if (
    stack.authorizationEnv !== undefined &&
    (typeof stack.authorizationEnv !== 'string' ||
      !/^[A-Z_][A-Z0-9_]*$/.test(stack.authorizationEnv))
  ) {
    add(
      'authorizationEnv must be an environment variable name, for example "STACK_ONE_AUTHORIZATION".',
    );
  }

  if (!isPositiveNumber(stack.timeoutSecs)) {
    add('timeoutSecs must be a positive number.');
  }

  if (stack.slowSecs !== undefined) {
    if (!isPositiveNumber(stack.slowSecs)) {
      add('slowSecs must be a positive number.');
    } else if (isPositiveNumber(stack.timeoutSecs) && stack.slowSecs >= stack.timeoutSecs) {
      add('slowSecs must be less than timeoutSecs.');
    }
  }

  if (
    stack.expectedStatus !== undefined &&
    !(
      Number.isInteger(stack.expectedStatus) &&
      stack.expectedStatus >= 100 &&
      stack.expectedStatus <= 599
    )
  ) {
    add('expectedStatus must be an HTTP status code between 100 and 599.');
  }

  if (stack.expectedBodyIncludes !== undefined) {
    if (typeof stack.expectedBodyIncludes !== 'string' || !stack.expectedBodyIncludes) {
      add('expectedBodyIncludes must be a non-empty string.');
    } else if (method === 'HEAD') {
      add('expectedBodyIncludes cannot be used with HEAD, because HEAD responses have no body.');
    }
  }

  return errors;
};

const validateStacks = (stacks) => {
  if (!Array.isArray(stacks) || stacks.length === 0) {
    return ['The stacks file must export a list with at least one stack.'];
  }

  const errors = stacks.flatMap(validateStack);

  const seen = new Set();
  stacks.forEach((stack) => {
    const id = stack && stack.stackId;
    if (typeof id !== 'string' || !id) return;
    if (seen.has(id)) errors.push(`stackId "${id}" is used more than once.`);
    seen.add(id);
  });

  return errors;
};

const validateSecrets = (stacks, env) =>
  stacks
    .filter((stack) => stack.authorizationEnv && !env[stack.authorizationEnv])
    .map(
      (stack) =>
        `stack "${stack.stackId}" uses authorizationEnv ${stack.authorizationEnv}, but that variable is not set.`,
    );

module.exports = { loadSettings, validateStacks, validateSecrets };
