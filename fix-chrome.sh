#!/bin/bash

echo "Fixing Chrome/Chromium for WhatsApp Web..."

# Method 1: Install Chromium via snap
echo "Installing Chromium via snap..."
snap install chromium

# Method 2: Set environment variable to use snap Chromium
export PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium

echo "Chrome fix completed!"
echo "Environment variable set: PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium"
echo "Restart your application for changes to take effect."
