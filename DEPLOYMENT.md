# 🚀 Deployment Guide - Project Management App

## Pre-Deployment Checklist

### 1. Environment Configuration

#### Generate JWT Secret
```bash
# Node.js method (recommended)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# OpenSSL method
openssl rand -hex 64
```

#### Create Production Environment File
```bash
# Copy the production example
cp .env.production.example .env.production

# Edit with actual values
# NEVER commit .env.production to git!
```

#### Required Environment Variables
- ✅ `JWT_SECRET` - Strong random string (64+ characters)
- ✅ `DB_HOST` - Production database host
- ✅ `DB_USER` - Database user
- ✅ `DB_PASSWORD` - Strong database password
- ✅ `DB_NAME` - Production database name
- ✅ `NODE_ENV=production`
- ✅ `API_URL` - Production API URL (https://)
- ✅ `ALLOWED_ORIGINS` - Production frontend URLs (https://)
- ✅ `NEXT_PUBLIC_API_URL` - Frontend API URL (https://)

---

## 2. Build Process

### Development Build
```bash
npm run dev
```

### Production Build
```bash
# Full build (Next.js + TypeScript server compilation)
npm run build

# Or separately:
npm run build:next    # Build Next.js frontend
npm run build:server  # Compile TypeScript server to JavaScript
```

**Build outputs:**
- `.next/` - Next.js production build
- `dist/server/` - Compiled server JavaScript

---

## 3. Database Setup

### Initial Setup
```bash
# The server automatically creates/updates tables on startup
# Based on JSON schemas in: server/database/structure/systemtables/

# First startup will:
# 1. Create all tables
# 2. Seed role permissions
# 3. Verify database connection
```

### Manual Database Commands (if needed)
```sql
-- Create database
CREATE DATABASE projectmanagement_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create database user with limited permissions
CREATE USER 'prod_user'@'%' IDENTIFIED BY 'strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON projectmanagement_prod.* TO 'prod_user'@'%';
FLUSH PRIVILEGES;
```

---

## 4. Running in Production

### Option A: Direct Node.js
```bash
# Start production server
NODE_ENV=production node dist/server/index.js

# Or use npm script
npm run start:prod
```

### Option B: PM2 Process Manager (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server/index.js --name "project-mgmt" --env production

# Save PM2 configuration
pm2 save

# Setup auto-restart on server reboot
pm2 startup

# Monitor logs
pm2 logs project-mgmt

# Restart application
pm2 restart project-mgmt

# Stop application
pm2 stop project-mgmt
```

### Option C: Docker (Advanced)
```dockerfile
# Create Dockerfile in project root
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

```bash
# Build Docker image
docker build -t project-management .

# Run container
docker run -d -p 3000:3000 --env-file .env.production project-management
```

---

## 5. Nginx Configuration (Reverse Proxy)

### Example Nginx Config
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (get from Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # File upload size limit
    client_max_body_size 50M;
}
```

### Get SSL Certificates (Let's Encrypt)
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet
```

---

## 6. Security Hardening

### Server Security
- ✅ Use HTTPS only (no HTTP)
- ✅ Configure firewall (UFW/iptables)
- ✅ Disable root SSH login
- ✅ Use SSH keys (disable password auth)
- ✅ Keep system updated
- ✅ Configure fail2ban for brute force protection

### Application Security
- ✅ JWT_SECRET is strong and unique
- ✅ CORS configured for production domains only
- ✅ Rate limiting enabled (already configured)
- ✅ Helmet security headers active (already configured)
- ✅ Input validation with Zod (already configured)
- ✅ SQL injection prevention via parameterized queries

### Database Security
- ✅ Strong database password
- ✅ Database user with minimum required permissions
- ✅ Database not exposed to internet (localhost or private network)
- ✅ Regular backups configured
- ✅ Connection pooling configured

---

## 7. Monitoring & Logging

### Application Logs
```bash
# Logs are written to:
logs/error.log      # Error level only
logs/combined.log   # All levels

# Rotate logs (add to logrotate)
/path/to/app/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
}
```

### Health Check Endpoint
```bash
# Check application health
curl https://yourdomain.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-02-07T...",
  "uptime": 3600.5,
  "database": "connected"
}
```

### PM2 Monitoring
```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs project-mgmt --lines 100

# Check status
pm2 status
```

---

## 8. Backup Strategy

### Database Backups
```bash
# Daily backup script (add to crontab)
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups/database"
DB_NAME="projectmanagement_prod"

mysqldump -u backup_user -p'password' $DB_NAME | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

### File Backups
```bash
# Backup uploaded files (if any)
rsync -avz /path/to/app/uploads/ /backups/uploads/
```

---

## 9. Deployment Workflow

### Initial Deployment
```bash
# 1. Clone repository
git clone <repository-url>
cd projectmanagementapp

# 2. Install dependencies
npm ci --only=production

# 3. Configure environment
cp .env.production.example .env.production
# Edit .env.production with actual values

# 4. Build application
npm run build

# 5. Start with PM2
pm2 start dist/server/index.js --name project-mgmt --env production
pm2 save
```

### Updates/Redeployment
```bash
# 1. Pull latest code
git pull origin main

# 2. Install new dependencies (if any)
npm ci --only=production

# 3. Rebuild
npm run build

# 4. Restart application
pm2 restart project-mgmt

# 5. Verify health
curl https://yourdomain.com/health
```

---

## 10. Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs project-mgmt

# Common issues:
# - JWT_SECRET not set → Check .env.production
# - Database connection failed → Check DB credentials
# - Port already in use → Kill process: lsof -ti:3000 | xargs kill
```

### Database connection errors
```bash
# Test database connection
mysql -h DB_HOST -u DB_USER -p DB_NAME

# Check MySQL is running
sudo systemctl status mysql

# Check firewall
sudo ufw status
```

### High memory usage
```bash
# Check PM2 memory
pm2 list

# Restart to clear memory
pm2 restart project-mgmt

# Increase Node.js memory limit
pm2 start dist/server/index.js --name project-mgmt --node-args="--max-old-space-size=2048"
```

### CORS errors
```bash
# Verify ALLOWED_ORIGINS in .env.production
# Must include your frontend domain(s)

# Example:
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 11. Performance Optimization

### Enable Compression
```typescript
// Already configured in server/index.ts via Helmet
// Nginx also compresses if configured
```

### Database Optimization
```sql
-- Add indexes on frequently queried columns
CREATE INDEX idx_tasks_projectid ON Tasks(ProjectId);
CREATE INDEX idx_tasks_assignedto ON Tasks(AssignedTo);
CREATE INDEX idx_timeentries_taskid ON TimeEntries(TaskId);
CREATE INDEX idx_timeentries_userid ON TimeEntries(UserId);
```

### Connection Pooling
```bash
# Increase pool size in production
DB_CONNECTION_LIMIT=50
```

---

## 12. Rollback Plan

### Quick Rollback
```bash
# 1. Checkout previous version
git checkout <previous-commit-hash>

# 2. Rebuild
npm ci --only=production
npm run build

# 3. Restart
pm2 restart project-mgmt
```

### Database Rollback
```bash
# Restore from backup
gunzip < /backups/database/backup_TIMESTAMP.sql.gz | mysql -u root -p projectmanagement_prod
```

---

## 📞 Support Checklist

Before contacting support, check:
- [ ] Application health endpoint responding
- [ ] Database connection working
- [ ] Logs for error messages (`pm2 logs`)
- [ ] Environment variables correctly set
- [ ] Firewall/security groups allow traffic
- [ ] SSL certificates valid
- [ ] Disk space available
- [ ] System resources (CPU/RAM) available

---

**🎉 Deployment complete!**

Access your application at: `https://yourdomain.com`
API documentation at: `https://yourdomain.com/api-docs`
