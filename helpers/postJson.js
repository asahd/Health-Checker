const { describeError } = require('./describeError');

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const postJson = async (url, payload, { label, timeoutSecs = 10, retryDelayMs = 5000 } = {}) => {
  const attempts = 2;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutSecs * 1000),
      });
      const text = await response.text();
      if (response.ok) return true;
      console.error(
        `${label} was rejected on attempt ${attempt} of ${attempts}: HTTP ${response.status} ${text.slice(0, 200)}`,
      );
    } catch (err) {
      console.error(
        `${label} could not be sent on attempt ${attempt} of ${attempts}: ${describeError(err, timeoutSecs)}`,
      );
    }

    if (attempt < attempts) await sleep(retryDelayMs);
  }

  return false;
};

module.exports = { postJson };
