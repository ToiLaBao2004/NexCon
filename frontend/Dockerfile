FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ARG VITE_NATIVE_API_URL=http://localhost:5001/api
ARG VITE_SOCKET_URL=http://localhost:5001/
ARG VITE_LIVEKIT_URL=ws://localhost:7880

ENV VITE_NATIVE_API_URL=$VITE_NATIVE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL

RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

