const CHANNELS = ['slack', 'pagerDuty'];

const initialState = () => ({
  consecutiveFailures: 0,
  consecutivePasses: 0,
  failingSince: undefined,
  recoveringSince: undefined,
  lastAlertedAt: {},
});

const evaluateCheck = (previous, result, now, settings) => {
  const state = previous ?? initialState();

  if (result.ok) {
    if (state.failingSince === undefined) {
      return { state, decisions: {} };
    }

    const passing = {
      ...state,
      consecutiveFailures: 0,
      consecutivePasses: state.consecutivePasses + 1,
      recoveringSince: state.recoveringSince ?? now,
    };

    if (passing.consecutivePasses < settings.recoveredAfterPasses) {
      return { state: passing, decisions: {}, event: 'recovering' };
    }

    const failingForMs = passing.recoveringSince - passing.failingSince;
    if (passing.lastAlertedAt.slack === undefined) {
      return { state: initialState(), decisions: {}, event: 'recovered', failingForMs };
    }
    return { state: passing, decisions: { slack: 'recover' }, event: 'recovered', failingForMs };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  const cooldownMs = settings.alertCooldownMins * 60 * 1000;
  const decisions = {};

  CHANNELS.forEach((channel) => {
    const lastAlertedAt = state.lastAlertedAt[channel];
    if (consecutiveFailures < settings.alertAfterFailures[channel]) {
      decisions[channel] = 'below-threshold';
    } else if (lastAlertedAt !== undefined && now - lastAlertedAt < cooldownMs) {
      decisions[channel] = 'muted';
    } else {
      decisions[channel] = 'send';
    }
  });

  return {
    state: {
      ...state,
      consecutiveFailures,
      consecutivePasses: 0,
      failingSince: state.failingSince ?? now,
      recoveringSince: undefined,
    },
    decisions,
  };
};

const markAlerted = (state, channel, now) => ({
  ...state,
  lastAlertedAt: { ...state.lastAlertedAt, [channel]: now },
});

const markRecovered = () => initialState();

module.exports = { CHANNELS, evaluateCheck, markAlerted, markRecovered };
