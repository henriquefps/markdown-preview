FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./

# Notes are persisted here as a single JSON file. Mount a volume on this path
# so data survives container restarts/rebuilds.
RUN mkdir -p /app/data
VOLUME /app/data

ENV PORT=3041
ENV DATA_DIR=/app/data
EXPOSE 3041

CMD ["node", "server.js"]
