const https = require('https');
const hash = require('object-hash');

const { addToMemory, existsInMemory, removeFromMemory } = require('./helpers/memory');

const stacks = require('./stacks/app');

let promises = [];

console.log(`${stacks.length} STACKS TO CHECK:`);

const checkHealth = ({ stackId, hostname, authorization, timeoutSecs }) => {
  const endpoint = `https://${hostname}/data`;
  return new Promise((resolve, reject) => {
    // console.log(` – Checking '${stackId}'...`);
    const request = https.request(
      {
        method: 'POST',
        hostname,
        path: '/data',
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
  const request = https.request({
    method: 'POST',
    hostname: 'hooks.slack.com',
    path: '/services/WEBHOOK',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = {
    icon_emoji: 'warning',
    username: `App ( ${stackId.toUpperCase()} ) Failure`,
    text: ':no_bell: _muted for next 30m_',
    attachments: [
      {
        text: `Endpoint: ${endpoint}`,
        color: '#ad0000',
      },
      {
        text: `Status Code: *${statusCode}*`,
        color: '#d89000',
      },
    ],
  };
  const dataHash = hash(data, { algorithm: 'sha512' });
  if (!existsInMemory(dataHash)) {
    console.log(`Alerting for '${stackId}', ${statusCode}, ${endpoint}`);
    // request.write(JSON.stringify(data));
    addToMemory(dataHash, null);
    setTimeout(
      () => {
        removeFromMemory(dataHash);
      },
      30 * 60 * 1000, // 30 minutes
    );
  } else {
    console.log(`Skipping alert for '${stackId}', ${statusCode}, ${endpoint}`);
  }
  request.end();
};

const executePromises = () => {
  promises = stacks.map((stack) =>
    checkHealth(stack).catch((err) => {
      sendSlackAlert(err);
    }),
  );

  Promise.all(promises).then((responses) => {
    // console.log('Responses:', responses);
    const failures = responses.filter(
      (data) => typeof data === 'undefined' || data.statusCode !== 200,
    );

    if (failures.length === 0) {
      console.log('All Stacks are healthy.');
    } else {
      // console.log('Failures:', failures);
      failures.filter((data) => typeof data !== 'undefined').forEach(sendSlackAlert);
    }
  });
};

executePromises();
setInterval(
  () => {
    executePromises();
  },
  60 * 1000, // 1 minute
);
