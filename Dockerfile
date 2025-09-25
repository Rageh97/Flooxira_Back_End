# Use Ubuntu as base image for snap support
FROM node:18-bullseye

# Install snapd and dependencies
RUN apt-get update && apt-get install -y \
    snapd \
    wget \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium via snap
RUN snap install chromium

# Set Chrome path
ENV PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create data directory for WhatsApp sessions
RUN mkdir -p /app/data/wa-auth

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
