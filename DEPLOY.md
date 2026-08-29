# Deploy EduTrack on Oracle Cloud Free Tier

Zero-cost hosting for 200 beta testers. All services on one ARM Ampere instance.

## What You Get (Always Free)

| Resource | Spec | Used For |
|----------|------|----------|
| ARM Ampere VM | 4 OCPU, 24GB RAM | App + MongoDB + Redis + Caddy |
| Block Storage | 20GB | Database persistence |
| Bandwidth | 10TB/month | More than enough |
| HTTPS | Free via Caddy/Let Encrypt | Automatic cert renewal |

## Step 1: Create Oracle Cloud Instance

1. Go to cloud.oracle.com and sign up (free tier, no credit card)
2. Create a VM.Standard.A1.Flex instance:
   - Shape: VM.Standard.A1.Flex (ARM Ampere)
   - OCPU: 4 (max free)
   - RAM: 24 GB (max free)
   - OS: Ubuntu 22.04 or Oracle Linux 9
   - Boot volume: 50GB (free)
3. Open ports in Security List: TCP 22, 80, 443 from 0.0.0.0/0

## Step 2: SSH In and Deploy

    ssh -i your-key.pem ubuntu@YOUR_PUBLIC_IP

Then run these commands:

    git clone https://github.com/Iconvibes/School-management-dashboard.git /opt/edutrack
    cd /opt/edutrack
    export JWT_SECRET=$(openssl rand -base64 48 | tr -d "
")
    export DATA_ENC_KEY=$(openssl rand -base64 32 | tr -d "
")
    printf "JWT_SECRET=%s
DATA_ENC_KEY=%s
NODE_ENV=production
RUN_JOBS=primary
SEED_DEMO_SCHOOL=1
" "$JWT_SECRET" "$DATA_ENC_KEY" > .env
    docker compose -f deploy/docker-compose.oracle.yml up -d --build

First build takes 3-5 minutes. After that:

    docker compose -f deploy/docker-compose.oracle.yml ps

## Step 3: Configure Domain (Optional)

Point a DNS A record to your instance IP, then edit deploy/Caddyfile:

    yourdomain.com {
        reverse_proxy app:3000
        encode gzip
    }

Then restart Caddy:

    docker compose -f deploy/docker-compose.oracle.yml restart caddy

## Step 4: Update the App

    cd /opt/edutrack
    git pull
    docker compose -f deploy/docker-compose.oracle.yml up -d --build

## Useful Commands

    # Watch logs
    docker compose -f deploy/docker-compose.oracle.yml logs -f app

    # Restart app only
    docker compose -f deploy/docker-compose.oracle.yml restart app

    # Stop everything
    docker compose -f deploy/docker-compose.oracle.yml down

    # Backup demo data
    docker compose -f deploy/docker-compose.oracle.yml exec app npm run backup -- --demo

## Cost: $0/month

Everything runs on Oracle Cloud always-free tier. No credit card required.