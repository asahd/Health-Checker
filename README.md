# Basic Health Checker

Checks a list of application stacks every minute and sends Slack and PagerDuty alerts when a stack fails several checks in a row. After a channel sends an alert for a stack, that channel is muted for the stack for a cooldown period, or until the stack recovers.

A stack counts as recovered after it passes 3 checks in a row (`RECOVERED_AFTER_PASSES`). If it fails again before that, it is treated as the same outage and stays muted. When a stack that alerted Slack recovers, a recovery message is posted to Slack with how long the stack was failing. PagerDuty incidents are not resolved automatically.

Requires Node.js 24 or newer.

## Setup

1. `npm ci`
2. Copy `.env.example` to `.env` and fill in the Slack webhook, the PagerDuty integration key and the credentials for any stacks that need them.
3. Run locally with `npm run dev`, or on a server with `pm2 start ecosystem.config.js`.

The app checks its configuration when it starts and exits with a list of problems if anything is missing or wrong.

## Settings in `.env`

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `SLACK_WEBHOOK_URL` | yes |  | Slack incoming webhook URL |
| `PAGERDUTY_INTEGRATION_KEY` | yes |  | PagerDuty Events API v2 integration key |
| `STACKS_FILE` | no | `stacks/app.js` | Stacks file to check |
| `CHECK_INTERVAL_SECS` | no | `60` | Seconds between rounds of checks |
| `ALERT_COOLDOWN_MINS` | no | `30` | Minutes a channel stays muted for a stack after sending an alert, unless the stack recovers first |
| `SLACK_ALERT_AFTER_FAILURES` | no | `2` | Failed checks in a row before Slack is alerted |
| `PAGERDUTY_ALERT_AFTER_FAILURES` | no | `2` | Failed checks in a row before PagerDuty is alerted |
| `RECOVERED_AFTER_PASSES` | no | `3` | Passing checks in a row before a failing stack counts as recovered |
| (named by `authorizationEnv`) | no |  | Basic authentication credentials for the stack that names this variable in `authorizationEnv` |

## Stack settings

Each entry in the stacks file can have these fields:

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `stackId` | yes |  | Unique name used in logs and alerts |
| `baseURL` | yes |  | Only the hostname, optionally followed by `:port`. Always checked over HTTPS |
| `path` | yes |  | Path to request, for example `/data` |
| `method` | yes |  | HTTP method, for example `GET` or `POST` |
| `body` | no |  | Value sent as a JSON body. Not allowed with `GET` or `HEAD` |
| `authorizationEnv` | no |  | Name of the `.env` variable that holds the Basic authentication credentials |
| `timeoutSecs` | yes |  | Time limit in seconds for the whole request, including reading the body |
| `slowSecs` | no |  | Logs a warning when a healthy response takes longer than this many seconds |
| `expectedStatus` | no | any `2xx` | Exact status code that counts as healthy. Redirects are not followed |
| `expectedBodyIncludes` | no |  | Text the response body must contain |

`npm run validate` checks every file in `stacks/`.

## Checking another application

1. Create a new stacks file, for example `stacks/other.js`.
2. Create `.env.other` with that application's Slack webhook, PagerDuty key, any stack credentials and `STACKS_FILE=stacks/other.js`.
3. In `ecosystem.config.js`, copy the app block and give it a new name, new log file names and `ENV_FILE: '.env.other'`.

## Development

- `npm test` runs ESLint, the Prettier check, stacks validation and the unit tests.
