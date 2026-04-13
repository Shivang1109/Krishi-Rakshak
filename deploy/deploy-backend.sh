#!/bin/bash
# Krishi Rakshak — EC2 Backend Deploy Script
# Run this ON your EC2 instance after SSH-ing in
# Usage: bash deploy-backend.sh

set -e

echo "=== Krishi Rakshak Backend Deploy ==="

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "Docker installed. Re-login or run: newgrp docker"
fi

# 2. Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  echo "Installing Docker Compose..."
  sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# 3. Clone or pull latest code
if [ -d "Krishi_Rakshak" ]; then
  echo "Pulling latest code..."
  cd Krishi_Rakshak && git pull
else
  echo "Cloning repo..."
  git clone https://github.com/Shivang1109/Krishi-Rakshak.git Krishi_Rakshak
  cd Krishi_Rakshak
fi

# 4. Create .env if not exists
if [ ! -f ".env" ]; then
  echo "Creating .env — EDIT THIS with your real keys!"
  cat > .env << 'EOF'
ANTHROPIC_API_KEY=your_anthropic_key_here
DATAGOV_KEY=
EOF
  echo "⚠️  Edit .env with your Anthropic API key before continuing!"
  echo "    nano .env"
  exit 1
fi

# 5. Build and start
echo "Building Docker image..."
docker compose build --no-cache

echo "Starting services..."
docker compose up -d

echo ""
echo "✅ Backend running at http://$(curl -s ifconfig.me):8000"
echo "   Health check: http://$(curl -s ifconfig.me):8000/health"
