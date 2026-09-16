# Minimal Node pay API for WeChat Native + Alipay precreate.
# Build from repo root: docker build -f server/pay/deploy/Dockerfile -t chengyu-pay .
FROM node:22-alpine
WORKDIR /app
# Only the pay service + commerce pricing file are required at runtime.
COPY content/commerce.json /app/content/commerce.json
COPY server/pay /app/server/pay
ENV NODE_ENV=production
ENV PAY_HOST=0.0.0.0
ENV PAY_PORT=8787
EXPOSE 8787
# Persist orders/accounts outside the container.
VOLUME ["/app/server/pay/.pay-data"]
CMD ["node", "server/pay/index.mjs"]
