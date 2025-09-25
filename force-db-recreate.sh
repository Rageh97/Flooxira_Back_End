#!/bin/bash

echo "🔄 Force recreating database with correct schema..."

# Set environment variable to force recreate
export DB_SYNC_MODE=force

echo "📝 Environment set: DB_SYNC_MODE=force"
echo "🚀 Starting server with force recreate..."

# Start the server (it will force recreate on startup)
npm start
