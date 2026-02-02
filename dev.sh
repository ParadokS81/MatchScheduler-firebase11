#!/bin/bash
# MatchScheduler Development Startup Script

echo "🚀 Starting MatchScheduler Development Environment..."

# Load Node.js environment
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Navigate to project directory
cd /home/paradoks/Projects/MatchScheduler

# Start Firebase emulator and CSS watcher concurrently
npm run dev