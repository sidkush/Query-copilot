FROM node:20-slim

WORKDIR /app

COPY package*.json .
RUN npm install

COPY . .

RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
