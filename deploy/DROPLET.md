# MyLand DigitalOcean Droplet deploy

Use this instead of App Platform. Follow these steps on a new Ubuntu 24.04 Droplet.

Target layout on the server:

```text
Internet → Nginx :80 → /           client static files
                      → /admin/     admin static files
                      → /api        Node API :5000
                                 → PostgreSQL localhost:5432
```

Do not open port 5432 or 5000 on the firewall. Only 22, 80, and later 443.

## 1. Create the Droplet

In DigitalOcean project **myland_web**:

- Image: Ubuntu 24.04 LTS
- Region: Singapore (SGP1) is fine for Sri Lanka
- Size: 2 GB RAM / 1 vCPU / 50+ GB SSD
- Auth: SSH key (preferred)
- Hostname: `myland`

Skip App Platform. One Droplet is enough.

## 2. SSH in (Windows PowerShell)

Replace with your Droplet IP:

```bash
ssh root@YOUR_DROPLET_IP
```

## 3. Update Ubuntu and install tools

```bash
apt update
apt upgrade -y
apt install -y git curl nginx ufw postgresql postgresql-contrib
```

## 4. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
npm install -g pm2
```

## 5. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

Do not `ufw allow 5432` or `ufw allow 5000`.

## 6. PostgreSQL (on the Droplet, not public)

```bash
sudo -u postgres psql
```

In the `psql` prompt (use a real strong password):

```sql
CREATE USER myland_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';
CREATE DATABASE myland_db OWNER myland_user;
GRANT ALL PRIVILEGES ON DATABASE myland_db TO myland_user;
\c myland_db
GRANT ALL ON SCHEMA public TO myland_user;
ALTER SCHEMA public OWNER TO myland_user;
\q
```

The extra schema grants are required on PostgreSQL 15+. `GRANT ALL ON DATABASE` alone is not enough for `CREATE TABLE`.

Backend connects to `localhost:5432`. Tables are created automatically when the API starts.

## 7. Clone the three repos (branch main)

```bash
mkdir -p /var/www/myland
cd /var/www/myland

git clone -b main https://github.com/Kavithra2002/myland_shared_backend.git shared_backend
git clone -b main https://github.com/Kavithra2002/myland_client_frontend.git client
git clone -b main https://github.com/Kavithra2002/myland_admin_frontend.git admin
```

If GitHub asks for auth, use a personal access token as the password, or add a deploy key.

## 8. API env and start

```bash
cd /var/www/myland/shared_backend
cp .env.example .env
nano .env
```

Set:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=myland_db
PGUSER=myland_user
PGPASSWORD=YOUR_STRONG_PASSWORD
PORT=5000
CORS_ORIGINS=
PGSSLMODE=
```

Leave `VITE_API_URL` empty on the frontends. Nginx puts site and API on the same host, so `/api` works.

```bash
npm ci --omit=dev
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
curl -s http://127.0.0.1:5000/api/health
```

You want `{"ok":true,"db":"connected"}`.

## 9. Build the websites into one Nginx folder

```bash
cd /var/www/myland/client
npm ci
npm run build

cd /var/www/myland/admin
npm ci
VITE_BASE=/admin/ npm run build

rm -rf /var/www/myland/site
mkdir -p /var/www/myland/site/admin
cp -r /var/www/myland/client/dist/. /var/www/myland/site/
cp -r /var/www/myland/admin/dist/. /var/www/myland/site/admin/
```

Admin must be built with `VITE_BASE=/admin/` so it works at `http://YOUR_IP/admin/`.

## 10. Nginx

```bash
cp /var/www/myland/shared_backend/deploy/nginx.myland.conf /etc/nginx/sites-available/myland
ln -sf /etc/nginx/sites-available/myland /etc/nginx/sites-enabled/myland
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 11. Check

In a browser:

- Public site: `http://YOUR_DROPLET_IP/`
- Admin: `http://YOUR_DROPLET_IP/admin/`
- API health: `http://YOUR_DROPLET_IP/api/health`
- Swagger: `http://YOUR_DROPLET_IP/api-docs`

## Later: custom domain + HTTPS

Point DNS A records to the Droplet IP, then:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Edit `server_name` in the Nginx config first.

## Update after a code change

```bash
cd /var/www/myland/shared_backend && git pull origin main && npm ci --omit=dev && pm2 restart myland-api
cd /var/www/myland/client && git pull origin main && npm ci && npm run build
cd /var/www/myland/admin && git pull origin main && npm ci && VITE_BASE=/admin/ npm run build
rm -rf /var/www/myland/site
mkdir -p /var/www/myland/site/admin
cp -r /var/www/myland/client/dist/. /var/www/myland/site/
cp -r /var/www/myland/admin/dist/. /var/www/myland/site/admin/
```
