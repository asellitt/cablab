# Stage 1: build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: final image with nginx + Ruby/Puma + supervisord
FROM ruby:3.3-slim
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      build-essential \
      nginx \
      supervisor \
 && rm -rf /var/lib/apt/lists/*

# Backend
WORKDIR /app
COPY backend/Gemfile .
RUN bundle config set --local without 'test' && bundle install
COPY backend/ .

# Frontend static files
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# nginx + supervisor config
RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisor/conf.d/cablab.conf

EXPOSE 80
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
