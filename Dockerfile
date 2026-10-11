# syntax=docker/dockerfile:1
# =====================================================================================================
#  Ayush360 web: the React app served by Nginx, which also forwards /api to the backend containers so the
#  browser only ever talks to ONE origin (no CORS; the refresh-token cookie stays first-party).
#
#    docker build -t ayush360-web .
#    docker run -p 8080:8080 -e IDENTITY_API_URL=http://identity:8080 -e HMS_API_URL=http://hms:8080 ayush360-web
#
#  Runtime settings (environment variables, read when the container starts):
#    IDENTITY_API_URL   where /api/auth/* goes   e.g. https://ayush360-identity.internal.<env>.azurecontainerapps.io
#    HMS_API_URL        where every other /api/* goes
#  Build-time settings (baked into the JavaScript, change = rebuild): see the ARGs below.
# =====================================================================================================

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Real backend through the same origin. .env.local is NOT copied (see .dockerignore).
ARG VITE_USE_MOCK_API=false
ARG VITE_USE_REAL_AUTH=true
ARG VITE_API_BASE_URL=/api
ARG VITE_IDLE_TIMEOUT_MINUTES=15
ENV VITE_USE_MOCK_API=${VITE_USE_MOCK_API} \
    VITE_USE_REAL_AUTH=${VITE_USE_REAL_AUTH} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_IDLE_TIMEOUT_MINUTES=${VITE_IDLE_TIMEOUT_MINUTES}
RUN npm run build

# Non-root Nginx listening on 8080; files in /etc/nginx/templates get ${VARS} filled in at start-up.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
