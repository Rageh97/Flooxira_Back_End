@echo off
echo 🔄 Force recreating database with correct schema...

REM Set environment variable to force recreate
set DB_SYNC_MODE=force

echo 📝 Environment set: DB_SYNC_MODE=force
echo 🚀 Starting server with force recreate...

REM Start the server (it will force recreate on startup)
npm start
