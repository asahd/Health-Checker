const { describeError } = require('./describeError');

const checkEndpoint = async ({
  url,
  method = 'GET',
  headers = {},
  body,
  timeoutSecs,
  expectedStatus,
  expectedBodyIncludes,
}) => {
  const started = performance.now();
  const elapsedMs = () => Math.round(performance.now() - started);

  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutSecs * 1000),
    });

    const text = expectedBodyIncludes === undefined ? undefined : await response.text();
    if (text === undefined) await response.body?.cancel();

    const durationMs = elapsedMs();
    const statusOk =
      expectedStatus === undefined ? response.ok : response.status === expectedStatus;

    if (!statusOk) {
      const expected = expectedStatus === undefined ? '' : ` (expected ${expectedStatus})`;
      return { ok: false, durationMs, error: `HTTP ${response.status}${expected}` };
    }
    if (text !== undefined && !text.includes(expectedBodyIncludes)) {
      return {
        ok: false,
        durationMs,
        error: `HTTP ${response.status}, but the body does not include "${expectedBodyIncludes}"`,
      };
    }
    return { ok: true, durationMs };
  } catch (err) {
    return { ok: false, durationMs: elapsedMs(), error: describeError(err, timeoutSecs) };
  }
};

const checkHealth = async (stack, env) => {
  const url = `https://${stack.baseURL}${stack.path}`;
  const headers = stack.authorizationEnv
    ? { Authorization: `Basic ${env[stack.authorizationEnv]}` }
    : {};

  const result = await checkEndpoint({
    url,
    method: stack.method,
    headers,
    body: stack.body,
    timeoutSecs: stack.timeoutSecs,
    expectedStatus: stack.expectedStatus,
    expectedBodyIncludes: stack.expectedBodyIncludes,
  });

  return { stackId: stack.stackId, endpoint: url, ...result };
};

module.exports = { checkEndpoint, checkHealth };
