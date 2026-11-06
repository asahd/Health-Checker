const { formatDuration } = require('./format');
const { postJson } = require('./postJson');

const buildSlackPayload = ({ stackId, error, endpoint }, cooldownMins) => ({
  icon_emoji: 'warning',
  username: `App ( ${stackId.toUpperCase()} ) Failure`,
  text: `_muted for next ${cooldownMins}m_`,
  attachments: [
    {
      text: `Endpoint: ${endpoint}`,
      color: '#ad0000',
    },
    {
      text: `Response: *${error}*`,
      color: '#d89000',
    },
  ],
});

const buildSlackRecoveryPayload = ({ stackId, endpoint, durationMs }, failingForMs) => ({
  icon_emoji: 'white_check_mark',
  username: `App ( ${stackId.toUpperCase()} ) Recovered`,
  text: `_was failing for about ${formatDuration(failingForMs)}, alerts are no longer muted_`,
  attachments: [
    {
      text: `Endpoint: ${endpoint}`,
      color: '#2eb886',
    },
    {
      text: `Response time: *${durationMs}ms*`,
      color: '#2eb886',
    },
  ],
});

const sendSlackAlert = (webhookUrl, failure, cooldownMins) =>
  postJson(webhookUrl, buildSlackPayload(failure, cooldownMins), { label: 'Slack alert' });

const sendSlackRecovery = (webhookUrl, result, failingForMs) =>
  postJson(webhookUrl, buildSlackRecoveryPayload(result, failingForMs), {
    label: 'Slack recovery message',
  });

module.exports = {
  buildSlackPayload,
  buildSlackRecoveryPayload,
  sendSlackAlert,
  sendSlackRecovery,
};
