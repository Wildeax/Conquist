FROM node:22-bookworm-slim
WORKDIR /app
COPY app/server/ ./server/
COPY app/lib/cosmetics.ts ./lib/cosmetics.ts
COPY app/packages/rules/ ./packages/rules/
COPY app/package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
ENV CONQUIST_DATA_DIR=/data PORT=3102
EXPOSE 3102
CMD ["node", "--experimental-strip-types", "server/index.ts"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3102/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
