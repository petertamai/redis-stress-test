FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY stress-test.js ./

ENV REDIS_URL=""

CMD ["node", "stress-test.js"]
