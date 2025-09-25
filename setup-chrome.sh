#!/bin/bash

# Install Chrome/Chromium for WhatsApp Web
echo "Installing Chrome/Chromium for WhatsApp Web..."

# Update package list
apt-get update

# Install Chrome dependencies
apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils

# Try to install Chromium via snap first (recommended for containers)
if ! command -v chromium &> /dev/null; then
    echo "Installing Chromium via snap..."
    snap install chromium
fi

# Try to install Google Chrome
if ! command -v google-chrome &> /dev/null && ! command -v chromium &> /dev/null; then
    echo "Installing Google Chrome..."
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt-get update
    apt-get install -y google-chrome-stable
fi

# Fallback to Chromium if Chrome installation fails
if ! command -v google-chrome &> /dev/null && ! command -v chromium &> /dev/null; then
    echo "Installing Chromium as fallback..."
    apt-get install -y chromium-browser
fi

# Verify installation
if command -v chromium &> /dev/null; then
    echo "Snap Chromium installed successfully"
    chromium --version
elif command -v google-chrome &> /dev/null; then
    echo "Google Chrome installed successfully"
    google-chrome --version
elif command -v chromium-browser &> /dev/null; then
    echo "Chromium installed successfully"
    chromium-browser --version
else
    echo "Warning: No Chrome/Chromium found. WhatsApp Web may not work properly."
fi

echo "Chrome setup completed!"
