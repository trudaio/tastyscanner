# IBKR CP Gateway — GCE Deployment Guide

## Overview

This directory contains the Docker setup for running the Interactive Brokers Client Portal (CP) Gateway on Google Compute Engine (GCE). The gateway runs headless on port 5000 and is proxied via a Firebase Function (`ibkrProxy`) that enforces Firebase Auth.

## Prerequisites

- A GCE VM (e2-micro or larger) with Docker installed
- An IBKR account with Client Portal API enabled
- The CP Gateway zip downloaded from IBKR

## Step 1 — Download CP Gateway

On your GCE VM:

```bash
# Download the latest stable CP Gateway from IBKR
wget -O clientportal.gw.zip https://download2.interactivebrokers.com/portal/clientportal.gw.zip
unzip clientportal.gw.zip -d /root/ibkr
```

After extraction you should have:
```
/root/ibkr/bin/run.sh
/root/ibkr/root/
```

## Step 2 — Build the Docker Image

```bash
cd infra/ibkr-gateway
docker build -t ibkr-gateway .
```

## Step 3 — Run the Container

```bash
docker run -d \
  --name ibkr-gateway \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /root/ibkr:/root/ibkr \
  ibkr-gateway
```

The gateway listens on `http://<GCE-EXTERNAL-IP>:5000`.

## Step 4 — Authenticate via Browser

On first run, visit `http://<GCE-EXTERNAL-IP>:5000` in a browser and log in with your IBKR credentials. The session will persist in `/root/ibkr/root/`.

## Step 5 — Configure Firebase Function

Set the gateway URL in Firebase Functions config:

```bash
firebase functions:config:set ibkr.gateway_url="http://<GCE-EXTERNAL-IP>:5000"
```

Or set the `IBKR_GATEWAY_URL` environment variable in the Firebase console for the `ibkrProxy` function.

## Step 6 — Firewall Rules

Open port 5000 only to Firebase Functions' outbound IP range (or restrict by service account). Do **not** expose port 5000 to the public internet.

## Keep-Alive

The `ibkrKeepAlive` Cloud Scheduler function pings the gateway every 5 minutes to prevent session timeout. No additional setup required once the function is deployed.

## Troubleshooting

- **Gateway not responding**: Check `docker logs ibkr-gateway` — IBKR sessions expire after ~24h of inactivity; re-authenticate via browser.
- **Port 5000 not reachable**: Verify GCE firewall rules allow TCP 5000 from Firebase Functions.
- **Session expired**: Re-authenticate at `http://<GCE-EXTERNAL-IP>:5000/sso/Login`.
