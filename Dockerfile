# Dockerfile for Luna AI v10
# Multi-stage build for optimization

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Stage 2: Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create directory for database and logs
RUN mkdir -p tmp logs backups

# Expose port (default: 8787)
EXPOSE 8787

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]

