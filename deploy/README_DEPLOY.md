# Luna v10 Deploy Notes

1. Copy project to server (e.g. /opt/luna-v10)
2. Copy .env.example to .env and fill out keys.
3. Run:
   npm install
   node index.js

For PM2:
   pm2 start ecosystem.config.cjs
   pm2 save

For systemd:
   - Copy deploy/luna.service to /etc/systemd/system/luna.service
   - Edit WorkingDirectory and ExecStart if needed
   - sudo systemctl daemon-reload
   - sudo systemctl enable luna
   - sudo systemctl start luna
