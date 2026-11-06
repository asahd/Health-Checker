const { plural } = require('./format');

const describeError = (err, timeoutSecs) => {
  if (err && err.name === 'TimeoutError') {
    return timeoutSecs === undefined
      ? 'Timed out'
      : `Timed out after ${plural(timeoutSecs, 'second')}`;
  }

  const cause = (err && err.cause) ?? err;
  if (!cause) return 'Unknown error';

  const innerMessages = Array.isArray(cause.errors)
    ? cause.errors.map((inner) => inner.message).filter(Boolean)
    : [];
  const message = cause.message || innerMessages.join('; ') || String(cause);
  const code = cause.code ?? (cause.errors && cause.errors[0] && cause.errors[0].code);

  return code && !message.includes(code) ? `${code}: ${message}` : message;
};

module.exports = { describeError };
