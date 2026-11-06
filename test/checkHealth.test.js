const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');

const { checkEndpoint } = require('../helpers/checkHealth');
const { closedPortUrl, startServer } = require('./helpers/localServer');

describe('checkEndpoint', () => {
  let server;

  before(async () => {
    server = await startServer((request, response) => {
      const routes = {
        '/ok': () => response.end('all good'),
        '/no-content': () => response.writeHead(204).end(),
        '/unavailable': () => response.writeHead(503).end(),
        '/redirect': () => response.writeHead(302, { Location: '/ok' }).end(),
        '/hang': () => {},
        '/reset': () => request.socket.destroy(),
      };
      (routes[request.url] ?? routes['/ok'])();
    });
  });

  after(() => server.close());

  const check = (path, options = {}) =>
    checkEndpoint({ url: `${server.url}${path}`, timeoutSecs: 1, ...options });

  it('reports a 2xx response as healthy, with its duration', async () => {
    const result = await check('/ok');
    assert.equal(result.ok, true);
    assert.equal(typeof result.durationMs, 'number');
    assert.equal((await check('/no-content')).ok, true);
  });

  it('reports a non-2xx response as a failure', async () => {
    assert.deepEqual(
      { ...(await check('/unavailable')), durationMs: 0 },
      { ok: false, durationMs: 0, error: 'HTTP 503' },
    );
  });

  it('does not follow redirects', async () => {
    const result = await check('/redirect');
    assert.equal(result.error, 'HTTP 302');
  });

  it('checks for an exact status when expectedStatus is set', async () => {
    const result = await check('/ok', { expectedStatus: 204 });
    assert.equal(result.error, 'HTTP 200 (expected 204)');
  });

  it('checks the body when expectedBodyIncludes is set', async () => {
    assert.equal((await check('/ok', { expectedBodyIncludes: 'good' })).ok, true);
    const result = await check('/ok', { expectedBodyIncludes: 'healthy' });
    assert.equal(result.error, 'HTTP 200, but the body does not include "healthy"');
  });

  it('reports a timeout with the time limit in seconds', async () => {
    const result = await check('/hang', { timeoutSecs: 0.2 });
    assert.equal(result.error, 'Timed out after 0.2 seconds');
  });

  it('reports a closed connection with its error code', async () => {
    const result = await check('/reset');
    assert.equal(result.ok, false);
    assert.match(result.error, /UND_ERR_SOCKET/);
  });

  it('reports a refused connection', async () => {
    const result = await checkEndpoint({ url: `${await closedPortUrl()}/`, timeoutSecs: 1 });
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('sends the method, JSON body and headers', async () => {
    await check('/ok', { method: 'POST', body: [], headers: { Authorization: 'Basic abc' } });
    const request = server.requests.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.body, '[]');
    assert.equal(request.headers['content-type'], 'application/json');
    assert.equal(request.headers.authorization, 'Basic abc');
  });
});
