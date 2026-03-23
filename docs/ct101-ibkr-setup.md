# CT101 — IBKR Client Portal Gateway Setup

IBKR does not offer OAuth for retail accounts. Authentication goes through the
**Client Portal Gateway** (a Java app), which we run as a Docker container on
CT101 (Tailscale IP: `100.71.13.81`).

## Prerequisites

- Docker + Docker Compose installed on CT101
- IBKR username and password
- CT101 accessible at `100.71.13.81` via Tailscale

---

## 1. Pull the Image

```bash
docker pull ghcr.io/gnzsnz/ib-gateway:latest
```

---

## 2. Create the Environment File

Store credentials in `/opt/ibkr/.env` on CT101 (never commit to repo):

```bash
mkdir -p /opt/ibkr
cat > /opt/ibkr/.env <<EOF
IBKR_USERNAME=your_ibkr_username
IBKR_PASSWORD=your_ibkr_password
TRADING_MODE=paper   # or 'live' for live trading
EOF
chmod 600 /opt/ibkr/.env
```

---

## 3. Docker Compose

Save as `/opt/ibkr/docker-compose.yml`:

```yaml
version: '3.8'
services:
  ib-gateway:
    image: ghcr.io/gnzsnz/ib-gateway:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "5000:5000"   # CP Gateway REST API
      - "4002:4002"   # TWS API (future use)
    volumes:
      - ./jts:/root/jts         # JTS settings persistence
      - ./ibkr_logs:/opt/ibkr/logs
    environment:
      - IBKR_USERNAME=${IBKR_USERNAME}
      - IBKR_PASSWORD=${IBKR_PASSWORD}
      - TRADING_MODE=${TRADING_MODE}
      - GATEWAY_OR_TWS=gateway
      - JAVA_HEAP_SIZE=1024
```

Start it:

```bash
cd /opt/ibkr
docker compose up -d
```

---

## 4. Systemd Service

Create `/etc/systemd/system/ibkr-gateway.service` to auto-start on boot:

```ini
[Unit]
Description=IBKR Client Portal Gateway
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ibkr
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable ibkr-gateway
systemctl start ibkr-gateway
```

---

## 5. Verify the Gateway is Running

```bash
# Check container
docker ps | grep ib-gateway

# Check auth status (should return { "authenticated": false } until you log in)
curl http://localhost:5000/v1/api/iserver/auth/status

# From another machine via Tailscale
curl http://100.71.13.81:5000/v1/api/iserver/auth/status
```

Expected response before login:
```json
{"authenticated":false}
```

---

## 6. Initial Authentication

The CP Gateway requires a one-time manual login via its web UI:

1. Open a browser and navigate to: `https://100.71.13.81:5000` (accept self-signed cert)
2. Log in with your IBKR credentials
3. The session is kept alive automatically while the container is running

Check auth status after login:
```bash
curl http://100.71.13.81:5000/v1/api/iserver/auth/status
# Expected: {"authenticated":true,...}
```

---

## 7. Firebase Function Proxy

The TastyScanner Firebase Function at `functions/src/index.ts` exposes these
endpoints (all require a Firebase ID token):

| Endpoint | Proxies to CP Gateway |
|---|---|
| `GET /api/ibkr/auth-status` | `/iserver/auth/status` |
| `GET /api/ibkr/accounts` | `/portfolio/accounts` |
| `GET /api/ibkr/positions/:accountId` | `/portfolio/{accountId}/positions` |
| `GET /api/ibkr/balances/:accountId` | `/portfolio/{accountId}/summary` |
| `GET /api/ibkr/pnl` | `/iserver/account/pnl/partitioned` |
| `POST /api/ibkr/orders/:accountId` | `/iserver/account/{acct}/orders` |
| `DELETE /api/ibkr/orders/:orderId?accountId=X` | `/iserver/account/{acct}/order/{orderId}` |

---

## Notes

- **Session expiry**: IBKR sessions expire after ~24h of inactivity. The container
  keeps the session alive via `/tickle` ping. If the session expires, repeat Step 6.
- **Paper vs Live**: Set `TRADING_MODE=paper` for testing. Change to `live` only
  when ready for real trading.
- **Firewall**: CT101 port 5000 is only accessible via Tailscale (`100.71.x.x` range).
  Do NOT expose it to the public internet.
- **Phase 2**: Greeks/quotes streaming will use IBKR WebSocket
  (`/iserver/marketdata/snapshot`) — not implemented in Phase 1.
