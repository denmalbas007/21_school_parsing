FROM node:22-alpine

WORKDIR /app

# Install deps first to leverage Docker layer caching
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the source and build the Next.js bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
