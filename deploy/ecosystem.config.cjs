module.exports = {
  apps: [
    {
      name: 'myland-api',
      cwd: '/var/www/myland/shared_backend',
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
