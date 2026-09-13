FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node index.html guide.html favicon.svg ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/var && chown node:node /app/var
USER node
ENV HOST=0.0.0.0 PORT=8766 DATA_DIR=/app/var NODE_ENV=production
EXPOSE 8766
CMD ["node", "server/app.mjs"]
