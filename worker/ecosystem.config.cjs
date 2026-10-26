// pm2 process definition for the BananaMaps indexing worker.
//   pm2 start ecosystem.config.cjs
// Logs: pm2 logs bananamaps-worker   (JSON lines; pipe through `jq` or set LOG_FORMAT=pretty)
module.exports = {
  apps: [
    {
      name: 'bananamaps-worker',
      cwd: __dirname,
      script: 'dist/worker/src/index.js',
      args: 'run',
      interpreter: 'node',
      node_args: '--max-old-space-size=768',
      instances: 1,            // exactly one: the registry lease protects against duplicates, but one is the design
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,     // crash-loop damper
      exp_backoff_restart_delay: 1000,
      kill_timeout: 100000,    // SIGTERM → graceful stop waits up to 90 s for in-flight syncs
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        // Everything else (keys, budgets, intervals) comes from worker/.env — see .env.example.
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      log_date_format: '',
      time: false,
    },
  ],
};
