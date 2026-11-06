module.exports = {
  apps: [
    {
      name: 'App-HealthCheck',
      script: 'app.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=50 --max-semi-space-size=2',
      max_memory_restart: '150M',
      time: true,
      out_file: 'logs/app-out.log',
      error_file: 'logs/app-error.log',
      env: {
        ENV_FILE: '.env',
      },
    },
  ],
};
