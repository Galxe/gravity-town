#!/usr/bin/env bash
# Gravity Town — One-shot server deploy script
# Usage: bash deploy.sh
# Run this on a fresh Debian/Ubuntu GCP instance.
set -euo pipefail

REPO="https://github.com/Galxe/gravity-town.git"
GAME_DIR="$HOME/game"
ANVIL_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://127.0.0.1:8545"

echo "=== [1/7] Install Node.js 20 ==="
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "=== [2/7] Install Foundry ==="
if ! command -v forge &>/dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
fi

echo "=== [3/7] Install PM2 ==="
if ! command -v pm2 &>/dev/null; then
  sudo npm install -g pm2
fi

echo "=== [4/7] Clone / update repo ==="
if [ -d "$GAME_DIR/.git" ]; then
  git -C "$GAME_DIR" pull
else
  git clone "$REPO" "$GAME_DIR"
fi

echo "=== [5/7] Install Node dependencies ==="
(cd "$GAME_DIR/mcp-server"   && npm install --silent)
(cd "$GAME_DIR/agent-runner" && npm install --silent)

echo "=== [6/7] Start anvil & deploy contracts ==="
if ! pm2 show anvil &>/dev/null; then
  pm2 start --name anvil -- anvil --host 127.0.0.1 --block-time 2
  sleep 4
fi

(cd "$GAME_DIR/contracts" && forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --private-key "$ANVIL_PK" \
  --broadcast --silent)

echo "Contract addresses:"
cat "$GAME_DIR/deployed-addresses.json"

echo ""
echo "=== [7/7] Create config.toml (if not exists) ==="
CONFIG="$GAME_DIR/agent-runner/config.toml"
if [ ! -f "$CONFIG" ]; then
  cp "$GAME_DIR/agent-runner/config.example.toml" "$CONFIG"
  echo ""
  echo "⚠️  config.toml created from example."
  echo "    Please edit $CONFIG and fill in your LLM API key, then run:"
  echo "    pm2 start --name agent-runner -- npm run dev --prefix $GAME_DIR/agent-runner"
  echo "    pm2 save && pm2 startup"
else
  echo "config.toml already exists, skipping."

  echo "=== Starting agent-runner ==="
  if pm2 show agent-runner &>/dev/null; then
    pm2 restart agent-runner
  else
    pm2 start --name agent-runner -- npm run dev --prefix "$GAME_DIR/agent-runner"
  fi

  pm2 save
  echo ""
  echo "✅ Done! Use: pm2 logs agent-runner"
fi
