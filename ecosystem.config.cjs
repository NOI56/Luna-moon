module.exports = {
  apps: [
    {
      name: "luna-v10",
      script: "index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M"
    }
  ]
};
