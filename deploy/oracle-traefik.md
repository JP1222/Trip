# Deploy Trip on Oracle + Traefik

Target host: `oracle` (`ubuntu@161.153.42.38`)  
Public URL: **https://trip.jpzen.cn**  
Proxy: existing Traefik on `traefik-servicenet` (Cloudflare DNS ACME)

## One-shot from Mac

```bash
# 1) Sync code (exclude secrets / heavy junk)
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude 'public/uploads' \
  ./ oracle:~/docker/trip/

# 2) Sync trips + photos (first deploy or when data changes)
rsync -avz ./data/ oracle:~/docker/trip/data/
rsync -avz ./public/uploads/ oracle:~/docker/trip/uploads/

# 3) On server: .env, DNS, build
ssh oracle 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/docker/trip
mkdir -p data uploads data/comments
# ownership for nextjs uid 1001
sudo chown -R 1001:1001 data uploads

# Create DNS A if missing (uses Traefik's CF token)
source ~/docker/traefik/.env
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=jpzen.cn" \
  -H "Authorization: Bearer $CF_DNS_API_TOKEN" -H "Content-Type: application/json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
EXIST=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=trip.jpzen.cn" \
  -H "Authorization: Bearer $CF_DNS_API_TOKEN" -H "Content-Type: application/json")
COUNT=$(echo "$EXIST" | python3 -c "import sys,json; print(json.load(sys.stdin)['result_info']['count'])")
if [ "$COUNT" = "0" ]; then
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CF_DNS_API_TOKEN" -H "Content-Type: application/json" \
    --data '{"type":"A","name":"trip.jpzen.cn","content":"161.153.42.38","ttl":1,"proxied":false}' \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('DNS created' if r.get('success') else r)"
else
  echo "DNS trip.jpzen.cn already exists"
fi

docker compose up -d --build
docker compose ps
REMOTE
```

Create `~/docker/trip/.env` once with strong `ADMIN_*` and map keys (copy from laptop `.env.local` carefully).

## Update after code change

```bash
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude 'public/uploads' --exclude data \
  ./ oracle:~/docker/trip/
ssh oracle 'cd ~/docker/trip && docker compose up -d --build'
```

## Notes

- Build **on the server** (arm64 Ampere) so `sharp` matches the CPU.
- Traefik labels match photosite (`traefik-servicenet` + `production` cert resolver).
- No host port 3000 — avoids clash with MoviePilot.
