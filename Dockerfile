FROM node:lts-alpine
RUN apk update
# RUN apk add socat
# RUN apk add bash
WORKDIR /usr/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm","run","prod"]