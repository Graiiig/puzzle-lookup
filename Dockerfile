# Base image already ships Chromium + all OS deps Playwright needs.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
