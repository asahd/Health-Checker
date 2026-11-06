const fs = require('node:fs');
const path = require('node:path');

const envFile = path.resolve(__dirname, process.env.ENV_FILE || '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { CHANNELS, evaluateCheck, markAlerted, markRecovered } = require('./helpers/alertState');
const { checkHealth } = require('./helpers/checkHealth');
const { loadSettings, validateStacks, validateSecrets } = require('./helpers/config');
const { formatDuration, plural } = require('./helpers/format');
const { sendPagerDutyAlert } = require('./helpers/sendPagerDutyAlert');
const { sendSlackAlert, sendSlackRecovery } = require('./helpers/sendSlackAlert');

const exitWithErrors = (errors) => {
  console.error(
    `The app cannot start because of these configuration problems:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
  );
  process.exit(1);
};

const { settings, errors: settingsErrors } = loadSettings(process.env);

let stacks;
try {
  stacks = require(path.resolve(__dirname, settings.stacksFile));
} catch (err) {
  exitWithErrors([
    ...settingsErrors,
    `Could not load the stacks file ${settings.stacksFile}: ${err.message}`,
  ]);
}

const stackErrors = validateStacks(stacks);
const configErrors = [
  ...settingsErrors,
  ...stackErrors,
  ...(stackErrors.length === 0 ? validateSecrets(stacks, process.env) : []),
];
if (configErrors.length > 0) exitWithErrors(configErrors);

const CHANNEL_NAMES = { slack: 'Slack', pagerDuty: 'PagerDuty' };
const cooldownMs = settings.alertCooldownMins * 60 * 1000;

const senders = {
  slack: (failure) => sendSlackAlert(settings.slackWebhookUrl, failure, settings.alertCooldownMins),
  pagerDuty: (failure) => sendPagerDutyAlert(settings.pagerDutyIntegrationKey, failure),
};

const stackStates = new Map();

const describeDecision = (channel, decision, state, now) => {
  const name = CHANNEL_NAMES[channel];
  if (decision === 'below-threshold') {
    return `${name}: waiting for ${plural(settings.alertAfterFailures[channel], 'failure')} in a row`;
  }
  if (decision === 'muted') {
    const remainingMins = Math.ceil((state.lastAlertedAt[channel] + cooldownMs - now) / 60000);
    return `${name}: muted for ${plural(remainingMins, 'more minute')}`;
  }
  return `${name}: sending alert`;
};

const handleRecovery = async (result, { state, decisions, event, failingForMs }) => {
  if (event === 'recovering') {
    console.log(
      `[${result.stackId}] Check passed. The stack needs ${plural(settings.recoveredAfterPasses, 'passing check')} in a row to count as recovered, and has ${state.consecutivePasses} so far.`,
    );
    return;
  }
  if (event !== 'recovered') return;

  console.log(
    `[${result.stackId}] Recovered after ${plural(settings.recoveredAfterPasses, 'passing check')} in a row. It was failing for about ${formatDuration(failingForMs)}.`,
  );
  if (decisions.slack !== 'recover') return;

  console.log(`[${result.stackId}] Sending the Slack recovery message.`);
  const delivered = await sendSlackRecovery(settings.slackWebhookUrl, result, failingForMs);
  if (delivered) {
    stackStates.set(result.stackId, markRecovered());
  } else {
    console.error(
      `[${result.stackId}] The Slack recovery message was not delivered. It will be sent again in the next round if the stack is still passing.`,
    );
  }
};

const handleResult = async (stack, result, now) => {
  const evaluated = evaluateCheck(stackStates.get(result.stackId), result, now, settings);
  const { state, decisions } = evaluated;
  stackStates.set(result.stackId, state);

  if (result.ok) {
    if (stack.slowSecs !== undefined && result.durationMs > stack.slowSecs * 1000) {
      console.warn(
        `[${result.stackId}] Slow response: took ${result.durationMs}ms, which is more than the slowSecs limit of ${plural(stack.slowSecs, 'second')}.`,
      );
    }
    await handleRecovery(result, evaluated);
    return;
  }

  const channelNotes = CHANNELS.map((channel) =>
    describeDecision(channel, decisions[channel], state, now),
  );
  console.error(
    `[${result.stackId}] Check failed (${plural(state.consecutiveFailures, 'failure')} in a row): ${result.error} at ${result.endpoint}. ${channelNotes.join('. ')}.`,
  );

  const channelsToSend = CHANNELS.filter((channel) => decisions[channel] === 'send');
  await Promise.all(
    channelsToSend.map(async (channel) => {
      const delivered = await senders[channel](result);
      if (delivered) {
        stackStates.set(result.stackId, markAlerted(stackStates.get(result.stackId), channel, now));
      } else {
        console.error(
          `[${result.stackId}] The ${CHANNEL_NAMES[channel]} alert was not delivered. It will be sent again in the next round if the stack is still failing.`,
        );
      }
    }),
  );
};

const logSummary = (results) => {
  const failing = results.filter((result) => !result.ok).map((result) => result.stackId);
  const healthy = results
    .filter((result) => result.ok)
    .map((result) => `${result.stackId} ${result.durationMs}ms`);

  if (failing.length === 0) {
    console.log(`All stacks are healthy. Response times: ${healthy.join(', ')}.`);
  } else {
    const healthyNote =
      healthy.length > 0 ? ` Healthy stacks and their response times: ${healthy.join(', ')}.` : '';
    console.log(
      `${failing.length} of ${results.length} stacks are failing: ${failing.join(', ')}.${healthyNote}`,
    );
  }
};

let roundInProgress = false;

const runRound = async () => {
  if (roundInProgress) {
    console.warn('The previous round of checks is still running, so this round is skipped.');
    return;
  }
  roundInProgress = true;
  try {
    const results = await Promise.all(stacks.map((stack) => checkHealth(stack, process.env)));
    const now = Date.now();
    logSummary(results);
    await Promise.all(stacks.map((stack, index) => handleResult(stack, results[index], now)));
  } finally {
    roundInProgress = false;
  }
};

const startRound = () => {
  runRound().catch((err) =>
    console.error('A round of checks failed with an unexpected error:', err),
  );
};

const { slack, pagerDuty } = settings.alertAfterFailures;
console.log(
  `Checking ${plural(stacks.length, 'stack')} from ${settings.stacksFile} every ${plural(settings.checkIntervalSecs, 'second')}. ` +
    `Slack is alerted after ${plural(slack, 'failed check')} in a row, and PagerDuty after ${plural(pagerDuty, 'failed check')} in a row. ` +
    `After an alert, that channel is muted for the stack for ${plural(settings.alertCooldownMins, 'minute')}, or until the stack recovers. ` +
    `A stack counts as recovered after ${plural(settings.recoveredAfterPasses, 'passing check')} in a row.`,
);

startRound();
setInterval(startRound, settings.checkIntervalSecs * 1000);
