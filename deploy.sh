#!/usr/bin/env bash
# Gravity Town — Deploy script
# Usage: bash deploy.sh
# Works both locally and on a remote server.
set -euo pipefail

REPO="https://github.com/Galxe/gravity-town.git"
GAME_DIR="$HOME/game"
RPC_URL="http://35.199.186.180:8545"

# Prompt for operator private key (never stored to disk)
read -r -s -p "Enter operator private key (0x...): " DEPLOY_PK
echo
[[ "$DEPLOY_PK" == 0x* ]] || { echo "❌ Private key must start with 0x"; exit 1; }

# ── [1] Node.js ────────────────────────────────────────────────────────────────
echo "=== [1/6] Check Node.js ==="
if command -v node &>/dev/null; then
  echo "✓ node $(node -v) already installed, skipping."
else
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# ── [2] Foundry ────────────────────────────────────────────────────────────────
echo "=== [2/6] Check Foundry ==="
if command -v forge &>/dev/null; then
  echo "✓ forge $(forge --version | head -1) already installed, skipping."
else
  echo "Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
fi

# ── [3] Clone / update repo ────────────────────────────────────────────────────
echo "=== [3/6] Clone / update repo ==="
if [ -d "$GAME_DIR/.git" ]; then
  echo "Repo exists, pulling latest..."
  git -C "$GAME_DIR" pull
else
  git clone "$REPO" "$GAME_DIR"
fi

# ── [4] Install Node dependencies ──────────────────────────────────────────────
echo "=== [4/6] Install Node dependencies ==="
(cd "$GAME_DIR/mcp-server"   && npm install --silent)
(cd "$GAME_DIR/agent-runner" && npm install --silent)

# ── [5] Deploy contracts ───────────────────────────────────────────────────────
echo "=== [5/6] Deploy contracts to $RPC_URL ==="
(cd "$GAME_DIR/contracts" && forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOY_PK" \
  --broadcast)

echo ""
echo "Contract addresses written to deployed-addresses.json:"
cat "$GAME_DIR/deployed-addresses.json"

# ── [6] Config & agent-runner ─────────────────────────────────────────────────
echo ""
echo "=== [6/6] Config & agent-runner ==="
CONFIG="$GAME_DIR/agent-runner/config.toml"
if [ ! -f "$CONFIG" ]; then
  cp "$GAME_DIR/agent-runner/config.example.toml" "$CONFIG"
  echo ""
  echo "⚠️  config.toml created from template."
  echo "    Edit $CONFIG — fill in your LLM api_key, then run:"
  echo "    cd $GAME_DIR/agent-runner && npm run dev"
else
  echo "config.toml already exists."
  echo ""

  # PM2 is optional — only use if available
  if command -v pm2 &>/dev/null; then
    if pm2 show agent-runner &>/dev/null 2>&1; then
      pm2 restart agent-runner
    else
      pm2 start --name agent-runner -- npm run dev --prefix "$GAME_DIR/agent-runner"
    fi
    pm2 save
    echo "✅ Done! Use: pm2 logs agent-runner"
  else
    echo "✅ Ready. Start with:"
    echo "   cd $GAME_DIR/agent-runner && npm run dev"
  fi
fi
