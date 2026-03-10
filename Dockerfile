FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY telegram-bot/ ./telegram-bot/
COPY ga4-mcp/ ./ga4-mcp/
COPY clickup-mcp/ ./clickup-mcp/
COPY .claude/skills/ ./.claude/skills/
EXPOSE 8080
CMD ["node", "telegram-bot/index.js"]
