# Stage 1: build the static page with Node.
FROM node:22-alpine AS build
WORKDIR /app
# Install exactly the locked packages first, so this layer is reused when only the code changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the built files with nginx, which also passes /api on to the back end.
# Only the built files are copied over; Node and node_modules are left behind.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
