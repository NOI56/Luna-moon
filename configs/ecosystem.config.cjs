const path = require("path");

module.exports = {
  apps: [
    {
      name: "luna-v10",
      script: "../index.js",
      cwd: path.join(__dirname, ".."),
      env: {
        NODE_ENV: "production"
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M"
    }
  ]
};
