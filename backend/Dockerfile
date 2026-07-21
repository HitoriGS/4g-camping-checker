# 這個版本號一定要跟 package.json 裡 playwright 套件的版本完全一致，
# 否則容器內建的瀏覽器版本會跟 npm 套件期待的不匹配而炸掉。
# npm 升級 playwright 時記得同步改這一行。
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
