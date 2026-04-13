FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code (will be overridden by volume mount in dev)
COPY . .

# Development mode - Vite dev server with HMR
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]