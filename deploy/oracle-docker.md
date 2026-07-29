# Deploy on Oracle Cloud with Docker

This app is a **single Node container**. Trip text and photos live on disk
(`data/`, `public/uploads/`) and are mounted as Docker volumes — **no database
required** for this setup.

## 1. Server prep (Oracle Linux / Ubuntu)

```bash
# Install Docker (Ubuntu example)
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
# … follow Docker’s official install for your distro, or:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out / in

docker --version
docker compose version
```

### Firewall (Oracle Cloud)

In **OCI Console → VCN → Security List**, allow:

| Direction | Port | Source   | Use        |
|-----------|------|----------|------------|
| Ingress   | 22   | your IP  | SSH        |
| Ingress   | 80   | 0.0.0.0/0| HTTP       |
| Ingress   | 443  | 0.0.0.0/0| HTTPS      |
| Ingress   | 3000 | optional | direct app |

Also open the same ports with `firewalld` / `iptables` on the VM if enabled.

### Architecture

Oracle **Ampere A1** free tier is **arm64**. Prefer **build on the server**
(`docker compose build`) so `sharp` matches the CPU. Cross-building from a Mac
Intel laptop needs `docker buildx` with `linux/arm64`.

## 2. Get the code onto the server

```bash
git clone git@github.com:JP1222/Trip.git
cd Trip
```

Or rsync from your laptop (if the repo is private without deploy keys):

```bash
rsync -avz --exclude node_modules --exclude .next --exclude public/uploads \
  ./ user@ORACLE_IP:~/trip/
```

## 3. Environment

```bash
cp .env.example .env
nano .env   # set ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SECRET
chmod 600 .env
```

## 4. Run

```bash
docker compose up -d --build
docker compose logs -f trip
```

Open `http://YOUR_PUBLIC_IP:3000`. Admin: `/admin`.

### Useful commands

```bash
docker compose ps
docker compose restart trip
docker compose down          # stop (volumes kept)
docker compose up -d --build # rebuild after git pull
```

## 5. Copy existing photos from your Mac

Named volumes live under Docker’s data root. Easiest path: **bind mounts**.

Edit `docker-compose.yml` volumes to host paths, for example:

```yaml
    volumes:
      - ./data:/app/data
      - ./uploads:/app/public/uploads
```

Then on the server:

```bash
mkdir -p data uploads
# fix ownership for container user nextjs (uid 1001)
sudo chown -R 1001:1001 data uploads
```

From your Mac:

```bash
# trips + comments
rsync -avz ./data/ user@ORACLE_IP:~/Trip/data/
# photos
rsync -avz ./public/uploads/ user@ORACLE_IP:~/Trip/uploads/
ssh user@ORACLE_IP 'sudo chown -R 1001:1001 ~/Trip/data ~/Trip/uploads'
```

Restart: `docker compose up -d`.

## 6. HTTPS (recommended)

`NODE_ENV=production` sets **Secure** admin cookies — use HTTPS in the browser
or login may fail on plain HTTP.

### Option A — Caddy (automatic TLS)

Install Caddy on the host, reverse-proxy to `127.0.0.1:3000`:

```caddyfile
# /etc/caddy/Caddyfile
your.domain.com {
  reverse_proxy 127.0.0.1:3000
}
```

Point DNS A/AAAA to the Oracle public IP. Compose can keep publishing
`127.0.0.1:3000:3000` only if you change the ports line to localhost.

### Option B — leave port 3000 open

Fine for a private friends link over HTTP, but change cookie secure behavior
or use HTTPS before relying on admin login remotely.

## 7. Backups

```bash
# with bind mounts
tar czf trip-backup-$(date +%F).tgz data uploads .env

# with named volumes
docker run --rm -v trip_trip-data:/d -v trip_trip-uploads:/u -v $(pwd):/out alpine \
  tar czf /out/trip-backup.tgz -C / d u
```

Schedule with cron weekly.

## 8. Do you need a database?

**Not for this Docker setup.** One container + volumes is enough for a friends
group. Revisit SQLite/Postgres only if you later scale to multiple instances
or object storage.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Blank page / 500 on upload | Volume writable by uid 1001; disk space |
| Admin login loops | HTTPS + Secure cookies; `ADMIN_PASSWORD` set in `.env` |
| `sharp` / HEIC fails | Rebuild **on the Oracle host** (correct arch) |
| Old trips after rebuild | Data is in the volume — don’t delete volumes unless intentional |
| OOM on free tier | Close other services; Next + sharp needs ~512MB–1GB free |
