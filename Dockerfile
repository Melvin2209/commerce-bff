# One image for every process (auth, catalog, pricing, inventory, bff);
# docker-compose picks the entrypoint with `command`.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# Compile, then drop dev dependencies so node_modules can be copied as-is.
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Don't run as root inside the container.
USER node
CMD ["node", "dist/bff/main.js"]
