# Deployment Guide

`ndfy` is designed to be hosted as a single Node.js process behind a reverse proxy (e.g., Caddy or Nginx) with zero external infrastructure dependencies.

---

## 1. Systemd Service Configuration

Create `/etc/systemd/system/ndfy.service`:

```ini
[Unit]
Description=ndfy notification server
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/ndfy
ExecStart=/usr/bin/node /opt/ndfy/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=PUBLIC_BASE_URL=https://notify.example.com
Environment=DATABASE_PATH=/var/lib/ndfy/data.db
Environment=UPSTREAM_ENABLED=true
Environment=UPSTREAM_BASE_URL=https://ntfy.sh

[Install]
WantedBy=multi-user.target
```

---

## 2. Reverse Proxy Setup

### Caddy
Caddy automatically handles TLS certificates, SSE, and WebSocket proxying without extra configuration:

```caddy
notify.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

---

### Nginx
When using Nginx, configure chunked transfer and buffer disabling for SSE and WebSocket support:

```nginx
server {
    server_name notify.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE and Streaming support (disable proxy buffering)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

---

## 3. Mobile Push Wake-Up Configuration

To enable the official ntfy Android/iOS applications to receive push notifications via the upstream ntfy.sh relay:

1. Configure `PUBLIC_BASE_URL` to point to your public domain (e.g. `https://notify.example.com`).
2. Set `UPSTREAM_ENABLED=true`.
3. In the official ntfy mobile app, add a subscription with URL `https://notify.example.com/your-topic`.
4. When a message is sent to `https://notify.example.com/your-topic`, `ndfy` will compute `SHA-256("https://notify.example.com/your-topic")` and send an empty poll request to `https://ntfy.sh/<hash>` with header `X-Poll-ID: <id>`, waking up your mobile app to fetch the actual payload from your server.
