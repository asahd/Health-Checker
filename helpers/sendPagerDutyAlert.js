const https = require('https');

const sendPagerDutyAlert = (
  pagerdutyEventsAPIIntergrationKey,
  { stackId, statusCode, endpoint },
) => {
  // console.log(pagerdutyEventsAPIIntergrationKey, { stackId, statusCode, endpoint });
  const request = https.request({
    method: 'POST',
    hostname: 'events.pagerduty.com',
    path: '/v2/enqueue',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const alertData = {
    payload: {
      summary: `${stackId} - ${statusCode} on ${endpoint}`,
      severity: 'critical',
      source: endpoint,
    },
    routing_key: pagerdutyEventsAPIIntergrationKey,
    event_action: 'trigger',
    client: 'Health Checker',
  };
  request.write(JSON.stringify(alertData));
  request.end();
};

module.exports = { sendPagerDutyAlert };
