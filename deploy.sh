#!/usr/bin/env bash
# Gravity Town - Deploy script
# Usage: bash deploy.sh [RPC_URL]
#   RPC_URL defaults to http://127.0.0.1:8545
set -euo pipefail

REPO="https://github.com/Galxe/gravity-town.git"
GAME_DIR="$HOME/game"
RPC_URL="${1:-http://127.0.0.1:8545}"

# Prompt for operator private key (never stored to disk)
read -r -s -p "Enter operator private key (0x...): " DEPLOY_PK
echo
[[ "$DEPLOY_PK" == 0x* ]] || { echo "ERROR: private key must start with 0x"; exit 1; }

# -- [0] RPC connectivity check ------------------------------------------------
echo "=== [0/6] Check RPC: $RPC_URL ==="
RPC_RESP=$(curl -s --max-time 5 -X POST "$RPC_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>&1) || true

if echo "$RPC_RESP" | grep -q '"result"'; then
  BLOCK=$(echo "$RPC_RESP" | grep -o '"result":"0x[^"]*"' | head -1 | cut -d'"' -f4)
  echo "OK - latest block: $BLOCK"
else
  echo "ERROR: cannot reach RPC at $RPC_URL"
  echo "  response: $RPC_RESP"
  exit 1
fi

# -- [1] Node.js ---------------------------------------------------------------
echo "=== [1/6] Check Node.js ==="
if command -v node &>/dev/null; then
  echo "OK - $(node -v) already installed"
else
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# -- [2] Foundry ---------------------------------------------------------------
echo "=== [2/6] Check Foundry ==="
if command -v forge &>/dev/null; then
  echo "OK - $(forge --version | head -1)"
else
  echo "Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
fi

# -- [3] Clone / update repo ---------------------------------------------------
echo "=== [3/6] Clone / update repo ==="
if [ -d "$GAME_DIR/.git" ]; then
  git -C "$GAME_DIR" pull
else
  git clone "$REPO" "$GAME_DIR"
fi
echo "  Installing Foundry dependencies (contracts/lib/)..."
(cd "$GAME_DIR/contracts" && forge install --no-commit)

# -- [4] Install Node dependencies ---------------------------------------------
echo "=== [4/6] Install Node dependencies ==="
(cd "$GAME_DIR/mcp-server"   && npm install --silent)
(cd "$GAME_DIR/agent-runner" && npm install --silent)

# -- [5] Deploy contracts ------------------------------------------------------
echo "=== [5/6] Deploy contracts to $RPC_URL ==="
(cd "$GAME_DIR/contracts" && forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOY_PK" \
  --broadcast)

echo ""
echo "Contract addresses:"
cat "$GAME_DIR/deployed-addresses.json"

# -- [6] Config & agent-runner -------------------------------------------------
echo ""
echo "=== [6/6] Config & agent-runner ==="
CONFIG="$GAME_DIR/agent-runner/config.toml"
if [ ! -f "$CONFIG" ]; then
  cp "$GAME_DIR/agent-runner/config.example.toml" "$CONFIG"
  echo "config.toml created from template."
  echo "Edit $CONFIG (fill in api_key), then run:"
  echo "  cd $GAME_DIR/agent-runner && npm run dev"
else
  echo "config.toml already exists."
  if command -v pm2 &>/dev/null; then
    if pm2 show agent-runner &>/dev/null 2>&1; then
      pm2 restart agent-runner
    else
      pm2 start --name agent-runner -- npm run dev --prefix "$GAME_DIR/agent-runner"
    fi
    pm2 save
    echo "Done. Use: pm2 logs agent-runner"
  else
    echo "Ready. Run:"
    echo "  cd $GAME_DIR/agent-runner && npm run dev"
  fi
fi
