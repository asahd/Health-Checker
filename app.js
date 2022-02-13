const https = require('https');
const hash = require('object-hash');

const {
  addToMemory,
  existsInMemory,
  getFromMemory,
  removeFromMemory,
} = require('./helpers/memory');
const { sendPagerDutyAlert } = require('./helpers/sendPagerDutyAlert');

const stacks = require('./stacks/app');

const slackAPIPath =
  process.env.NODE_ENV === 'production'
    ? '/services/ORG/CHANNEL/KEY' // #alerts-app
    : '/services/ORG/CHANNEL/KEY'; // #alerts-testing

const pagerdutyEventsAPIIntergrationKey =
  process.env.NODE_ENV === 'production'
    ? 'PRODKEY' // https://example.pagerduty.com/service-directory/PROD/activity
    : 'TESTKEY'; // https://example.pagerduty.com/service-directory/TEST/activity

const untrustedResponses = ['ECONNRESET'];
const untrustedResponseAlertThreshold = 2;
const currentThresholds = new Set();
let lastThresholds = new Set();
let promises = [];

console.log(`Running in '${process.env.NODE_ENV}' mode.`);
console.log(`${stacks.length} STACKS TO CHECK...`);

const checkHealth = ({ stackId, baseURL, authorization, timeoutSecs }) => {
  const healthcheckURL = new URL(`https://${baseURL}/data`);
  const endpoint = healthcheckURL.href;
  return new Promise((resolve, reject) => {
    // console.log(` – Checking '${stackId}'...`);
    const request = https.request(
      {
        method: 'POST',
        hostname: healthcheckURL.hostname,
        path: healthcheckURL.pathname,
        port: 443,
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        resolve({
          stackId,
          statusCode: res.statusCode,
          endpoint,
        });
      },
    );
    request.on('socket', (socket) => {
      socket.setTimeout(timeoutSecs * 1000);
      socket.on('timeout', () => request.destroy());
    });
    request.on('error', (err) => reject({ stackId, statusCode: err, endpoint }));
    request.write(JSON.stringify([]));
    request.end();
  });
};

const sendSlackAlert = ({ stackId, statusCode, endpoint }) => {
  const isUntrustedResponse =
    typeof statusCode === 'object'
      ? untrustedResponses.includes(statusCode.code)
      : untrustedResponses.includes(statusCode);
  // console.log(statusCode, typeof statusCode, isUntrustedResponse);

  const request = https.request({
    method: 'POST',
    hostname: 'hooks.slack.com',
    path: slackAPIPath,
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const alertData = {
    icon_emoji: 'warning',
    username: `App ( ${stackId.toUpperCase()} ) Failure`,
    text: '_muted for next 30m_',
    attachments: [
      {
        text: `Endpoint: ${endpoint}`,
        color: '#ad0000',
      },
      {
        text: `Response: *${statusCode}*`,
        color: '#d89000',
      },
    ],
  };
  const alertDataHash = hash(alertData, { algorithm: 'sha512' });
  if (!existsInMemory(alertDataHash)) {
    if (isUntrustedResponse) {
      if (typeof getFromMemory(`${alertDataHash}-threshold`) === 'undefined') {
        addToMemory(`${alertDataHash}-threshold`, 1);
        currentThresholds.add(`${alertDataHash}-threshold`);
      } else {
        addToMemory(`${alertDataHash}-threshold`, getFromMemory(`${alertDataHash}-threshold`) + 1);
        currentThresholds.add(`${alertDataHash}-threshold`);
      }

      if (getFromMemory(`${alertDataHash}-threshold`) >= untrustedResponseAlertThreshold) {
        console.log(
          `Threshold of ${untrustedResponseAlertThreshold} met. Alerting for '${stackId}', ${statusCode}, ${endpoint}`,
        );
        request.write(JSON.stringify(alertData));
        sendPagerDutyAlert(pagerdutyEventsAPIIntergrationKey, { stackId, statusCode, endpoint });
        addToMemory(alertDataHash, null);
        setTimeout(
          () => {
            removeFromMemory(alertDataHash);
          },
          30 * 60 * 1000, // 30 minutes
        );
        removeFromMemory(`${alertDataHash}-threshold`);
        currentThresholds.delete(`${alertDataHash}-threshold`);
      } else {
        console.log(
          `Threshold of ${untrustedResponseAlertThreshold} NOT met (${getFromMemory(
            `${alertDataHash}-threshold`,
          )}). Skipping alert for '${stackId}', ${statusCode}, ${endpoint}`,
        );
      }
    } else {
      console.log(`Alerting for '${stackId}', ${statusCode}, ${endpoint}`);
      request.write(JSON.stringify(alertData));
      sendPagerDutyAlert(pagerdutyEventsAPIIntergrationKey, { stackId, statusCode, endpoint });
      addToMemory(alertDataHash, null);
      setTimeout(
        () => {
          removeFromMemory(alertDataHash);
        },
        30 * 60 * 1000, // 30 minutes
      );
    }
  } else {
    console.log(`Skipping alert for '${stackId}', ${statusCode}, ${endpoint}`);
  }
  request.end();
};

const executePromises = () => {
  lastThresholds = new Set(currentThresholds);
  currentThresholds.clear();

  promises = stacks.map((stack) =>
    checkHealth(stack).catch((err) => {
      sendSlackAlert(err);
    }),
  );

  Promise.all(promises).then((responses) => {
    // console.log('Responses:', responses);
    const allFailures = responses.filter((data) => typeof data === 'undefined');
    const uncaughtFailures = responses.filter(
      (data) => typeof data !== 'undefined' && data.statusCode !== 200,
    );

    if (uncaughtFailures.length === 0) {
      if (allFailures.length === 0) {
        console.log('All Stacks are healthy.');
      } else {
        console.log('All other Stacks are healthy.');
      }
    } else {
      // console.log('Failures:', uncaughtFailures);
      uncaughtFailures.forEach(sendSlackAlert);
      console.log('All other Stacks are healthy.');
    }

    lastThresholds.forEach((t) => {
      if (!currentThresholds.has(t)) removeFromMemory(t);
    });
  });
};

executePromises();
setInterval(
  () => {
    executePromises();
  },
  60 * 1000, // 1 minute
);
