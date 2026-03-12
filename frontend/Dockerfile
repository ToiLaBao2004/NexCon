# ─────────────────────────────────────────────
# Stage 1: Build React app
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files và install ALL deps (bao gồm devDependencies cho build)
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy toàn bộ source
COPY . .

# Build cho production (biến env được inject lúc build)
# VITE_API_URL và VITE_SOCKET_URL cần truyền vào bằng build args
ARG VITE_API_URL=http://localhost:5001/api
ARG VITE_SOCKET_URL=http://localhost:5001/

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Serve với Nginx
# ─────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy dist từ builder vào nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy cấu hình nginx tuỳ chỉnh
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
