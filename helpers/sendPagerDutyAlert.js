const { postJson } = require('./postJson');

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

const buildPagerDutyPayload = (integrationKey, { stackId, error, endpoint }) => ({
  payload: {
    summary: `${stackId} - ${error} on ${endpoint}`,
    severity: 'critical',
    source: endpoint,
  },
  routing_key: integrationKey,
  dedup_key: stackId,
  event_action: 'trigger',
  client: 'Health Checker',
});

const sendPagerDutyAlert = (integrationKey, failure) =>
  postJson(PAGERDUTY_EVENTS_URL, buildPagerDutyPayload(integrationKey, failure), {
    label: 'PagerDuty alert',
  });

module.exports = { buildPagerDutyPayload, sendPagerDutyAlert };
