FROM node:latest

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p /app/secrets && chmod -R 700 /app/secrets

EXPOSE 5164
ENV NODE_ENV=production

CMD ["node", "."]
