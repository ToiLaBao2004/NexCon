# ─────────────────────────────────────────────
# Stage 1: Build dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files and install ONLY production deps
COPY package*.json ./
RUN npm install --legacy-peer-deps

# ─────────────────────────────────────────────
# Stage 2: Runtime image
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY src ./src
COPY package.json ./

# Expose backend port
EXPOSE 5001

# Start the server
CMD ["node", "src/server.js"]
