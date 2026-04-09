# 🐳 Docker & Docker Compose — Review

## Summary

| Severity | Count |
|----------|-------|
| 🔴 **Bug / Will Break** | 3 |
| 🟠 **Important Best Practice** | 5 |
| 🟡 **Minor / Cosmetic** | 3 |

---

## 🔴 Bugs — These Will Break Your App

### 1. Frontend Dockerfile copies the wrong path (Line 11)

```dockerfile
# ❌ Current — copies the ENTIRE /app (source + node_modules) into nginx
COPY --from=build /app /usr/share/nginx/html

# ✅ Fix — copy only the Vite build output
COPY --from=build /app/dist /usr/share/nginx/html
```

Vite outputs to `/app/dist`. Right now you're copying the entire `/app` directory (including `node_modules`, `src`, `package.json`, etc.) into the nginx html folder. The result is nginx will **not** find `index.html` at the expected root and your frontend **will not load**.

---

### 2. Frontend `docker-compose.yml` — port mismatch & useless env vars (Lines 77-90)

```yaml
# ❌ Current
ports:
  - "3000:80"        # Container listens on 80 (nginx), host maps to 3000 — this is FINE
environment:
  - PORT=3000         # ⚠️ Nginx ignores this entirely
  - API_URL=http://api-gateway:5000   # ⚠️ React can't read this at runtime
  - JWT_SECRET=jwt_secret_key_2024    # ⚠️ Frontend should NEVER have the JWT secret
  - JWT_EXPIRE=7d                     # ⚠️ Unnecessary
```

**Problems:**
- `PORT=3000` does nothing — nginx is configured to listen on port `80`, not reading this env var.
- `API_URL` is useless at runtime — React/Vite apps are **static bundles**; env vars are baked in at **build time** via `VITE_` prefix, not injected at runtime.
- **`JWT_SECRET` in the frontend is a security risk** — it belongs only in backend services.

```yaml
# ✅ Fix
frontend:
  build:
    context: ./frontend
    args:
      - VITE_API_URL=http://localhost:5000   # Bake the API URL at build time
  container_name: frontend
  ports:
    - "3000:80"
  networks:
    - fastfood-networks
  depends_on:
    - api-gateway
  # No environment section needed for a static frontend
```

And in the frontend Dockerfile, consume the build arg:
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

### 3. Inconsistent Node versions across Dockerfiles

| Service | Base Image |
|---------|-----------|
| user-service | `node:20-alpine` |
| restaurant-service | `node:20-alpine` |
| order-service | `node:20-alpine` |
| api-gateway | `node:18-alpine` ⚠️ |
| frontend (build) | `node:18-alpine` ⚠️ |

The api-gateway and frontend use **Node 18** while all other services use **Node 20**. This can cause subtle runtime differences. Pick one version and use it everywhere.

```dockerfile
# ✅ Use the same version in ALL Dockerfiles
FROM node:20-alpine
```

---

## 🟠 Important Best Practices

### 4. No `.dockerignore` files — anywhere

You have **zero** `.dockerignore` files. This means `COPY . .` sends `node_modules/`, `.git/`, `.env`, and everything else into the Docker build context.

**Impact:**
- Build context is **much larger** than needed → slower builds
- Local `node_modules/` overwrites the container's `npm install` output → potential platform mismatches (e.g. native modules built for Windows end up in a Linux container)

> [!CAUTION]
> Without `.dockerignore`, your local Windows `node_modules` will be copied into the Linux container, potentially causing native module crashes.

**Fix:** Create a `.dockerignore` in each service directory:

```
node_modules
npm-debug.log
.env
.git
.gitignore
Dockerfile
docker-compose.yml
```

---

### 5. `npm install` instead of `npm ci` in all Dockerfiles

```dockerfile
# ❌ Current
RUN npm install

# ✅ Better — deterministic, faster, respects lockfile
RUN npm ci --only=production
```

`npm ci` is preferred in Docker because:
- It uses the exact versions from `package-lock.json`
- It's faster (no dependency resolution)
- It fails if `package-lock.json` is out of sync with `package.json`

---

### 6. Only `api-gateway` uses `--production`, but others don't

```dockerfile
# api-gateway/Dockerfile
RUN npm install --production   ✅

# All other services
RUN npm install                ❌ (installs devDependencies too)
```

Dev dependencies (test frameworks, linters, etc.) bloat your production images. Use `--production` or `npm ci --omit=dev` in **all** services.

---

### 7. No health checks on MongoDB

`depends_on` only waits for the container to **start**, not for MongoDB to be **ready to accept connections**. Your services may crash on first boot because they try to connect before Mongo is listening.

```yaml
# ✅ Fix — add healthcheck + condition
mongodb:
  image: mongo:7
  container_name: mongodb
  ports:
    - "27017:27017"
  volumes:
    - mongo-data:/data/db
  networks:
    - fastfood-networks
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5

user-services:
  # ...
  depends_on:
    mongodb:
      condition: service_healthy
```

---

### 8. Running as root inside containers

None of your Dockerfiles create or switch to a non-root user. This is a security concern.

```dockerfile
# ✅ Add before CMD in each Dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

---

## 🟡 Minor / Cosmetic

### 9. Extra spaces in `order-service/Dockerfile`

```dockerfile
# ❌ Line 1 has double space before image name
FROM  node:20-alpine
COPY  package*.json ./

# ✅ Clean
FROM node:20-alpine
COPY package*.json ./
```
Not a functional issue, but sloppy formatting.

---

### 10. `version: '3.8'` is deprecated

Docker Compose v2 (the current standard) **ignores** the `version` key and shows a warning. You can safely remove it.

```yaml
# ❌ 
version: '3.8'

# ✅ Just remove the line entirely
services:
  # ...
```

---

### 11. Service names don't match directory names

| Directory | Compose Service Name |
|-----------|---------------------|
| `user-service/` | `user-services` (plural) |
| `restaurant-service/` | `restaurant-services` (plural) |
| `order-service/` | `order-services` (plural) |

This is confusing. Consider making them consistent (either all singular or all plural).

---

## Quick-Fix Checklist

- [ ] Fix `COPY --from=build /app` → `COPY --from=build /app/dist` in frontend Dockerfile
- [ ] Remove `JWT_SECRET` and other useless env vars from the frontend service
- [ ] Standardize all Dockerfiles to `node:20-alpine`
- [ ] Add `.dockerignore` to every service directory
- [ ] Replace `npm install` with `npm ci --omit=dev` in all Dockerfiles
- [ ] Add MongoDB healthcheck + `condition: service_healthy`
- [ ] Add non-root `USER` to all Dockerfiles
- [ ] Remove `version: '3.8'` from docker-compose.yml
- [ ] Fix extra whitespace in order-service Dockerfile
- [ ] Make service names consistent with directory names

Want me to apply these fixes to your files?
