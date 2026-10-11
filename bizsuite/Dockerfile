FROM node:22-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 TZ=Africa/Mogadishu
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY public ./public
COPY scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
