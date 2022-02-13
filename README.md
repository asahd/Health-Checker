# Basic Health Checker

Pings `X` Application Stacks, sends Slack/PagerDuty alerts on error with cooldown.

Additionally applications can easily be supported by duplicating and customizing the following files:

- scripts/validateApp.sh
- stacks/app.js
- app.js
- all.json
