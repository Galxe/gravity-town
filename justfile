# AI Town Game - Development Commands

# -- Anvil (local chain) --

# Start local Anvil chain
anvil-start:
    anvil

# Deploy contracts to local chain
# Usage: just anvil-deploy [rpc_url] [private_key] [operator_address]
[working-directory: "contracts"]
anvil-deploy \
    rpc_url="http://127.0.0.1:8545" \
    private_key="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" \
    operator_address="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266":
    PRIVATE_KEY={{private_key}} OPERATOR_ADDRESS={{operator_address}} \
    forge script script/Deploy.s.sol --rpc-url {{rpc_url}} --broadcast -v
    @echo ""
    @echo "Router: $(grep -o '0x[0-9a-fA-F]*' ../deployed-addresses.json)"
    @echo ""
    @echo "Next steps:"
    @echo "  just agent-start config/localhost.toml"
    @echo "  just frontend-start"

# Deploy contracts to Gravity Testnet
[working-directory: "contracts"]
gravity-deploy:
    #!/usr/bin/env bash
    source ../agent-runner/config/gravity.env 2>/dev/null || true
    PRIVATE_KEY=${PRIVATE_KEY:-"0x859b68e0eddb79598540a35dcd0f7cf4df7c7b8cad35151177439268566cbfa9"} \
    OPERATOR_ADDRESS=${OPERATOR_ADDRESS:-"$(cast wallet address 0x859b68e0eddb79598540a35dcd0f7cf4df7c7b8cad35151177439268566cbfa9)"} \
    forge script script/Deploy.s.sol \
        --rpc-url https://rpc-testnet.gravity.xyz \
        --broadcast \
        --use 0.8.30 \
        -v
    echo ""
    echo "Router: $(grep -o '0x[0-9a-fA-F]*' ../deployed-addresses.json)"
    echo ""
    echo "Next steps:"
    echo "  1. Update frontend/config/gravity.json with the new router address"
    echo "  2. just agent-start config/gravity.toml"
    echo "  3. just frontend-start gravity"

# Upgrade contracts on Gravity Testnet (keeps proxy addresses, only swaps implementations)
[working-directory: "contracts"]
gravity-upgrade:
    #!/usr/bin/env bash
    source ../agent-runner/config/gravity.env 2>/dev/null || true
    PRIVATE_KEY=${PRIVATE_KEY:-"0x859b68e0eddb79598540a35dcd0f7cf4df7c7b8cad35151177439268566cbfa9"} \
    ROUTER_ADDRESS=$(grep -o '0x[0-9a-fA-F]*' ../frontend/config/gravity.json | head -1) \
    forge script script/Upgrade.s.sol \
        --rpc-url https://rpc-testnet.gravity.xyz \
        --broadcast \
        -v
    echo ""
    echo "All implementations upgraded. Proxy addresses unchanged."

# Upgrade contracts on local Anvil
[working-directory: "contracts"]
anvil-upgrade:
    #!/usr/bin/env bash
    PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    ROUTER_ADDRESS=$(grep -o '0x[0-9a-fA-F]*' ../deployed-addresses.json) \
    NO_PROXY="*" HTTP_PROXY="" HTTPS_PROXY="" \
    forge script script/Upgrade.s.sol \
        --rpc-url http://127.0.0.1:8545 \
        --broadcast \
        -v
    echo ""
    echo "All implementations upgraded. Proxy addresses unchanged."

# -- Agent runner --

# Start agent runner
# Usage: just agent-start [config-file]
#   e.g.  just agent-start config/localhost.toml
#         just agent-start /abs/path/to/config.toml
[working-directory: "agent-runner"]
agent-start config="config/localhost.toml":
    npm run dev -- --config {{config}}

# -- MCP server --

# Start MCP server dev server
[working-directory: "mcp-server"]
mcp-start:
    npm run dev

# -- Frontend --

# Start frontend dev server
# Usage: just frontend-start [config] [port] [host]
#   e.g.  just frontend-start localhost
#         just frontend-start localhost 3001
[working-directory: "frontend"]
frontend-start config="localhost" port="3000" host="0.0.0.0":
    APP_CONFIG={{config}} npm run dev -- -H {{host}} -p {{port}}

# -- Release --

# Full Gravity Testnet release: build + test + snapshot check + deploy + bump frontend router
release:
    #!/usr/bin/env bash
    set -euo pipefail
    cd contracts
    forge build
    forge test -vv
    if ! forge snapshot --check; then
        echo ""
        echo "ERROR: gas snapshot drift detected (.gas-snapshot does not match current contracts)."
        echo "If you intentionally changed contracts, refresh the baseline:"
        echo "  cd contracts && forge snapshot && git add .gas-snapshot && git commit -m 'chore: refresh gas snapshot'"
        echo ""
        exit 1
    fi
    cd ..
    just gravity-deploy
    # Extract router address by field name (not just "first 0x… in file") so future fields
    # like operator/deployer/tx hash in deployed-addresses.json can't silently leak through.
    ROUTER=$(grep -oE '"routerAddress"[[:space:]]*:[[:space:]]*"0x[0-9a-fA-F]{40}"' deployed-addresses.json | grep -oE '0x[0-9a-fA-F]{40}' || true)
    if [ -z "${ROUTER:-}" ]; then
        echo "ERROR: failed to read routerAddress from deployed-addresses.json."
        echo "Expected a field like:  \"routerAddress\": \"0x...40 hex chars...\""
        exit 1
    fi
    CONFIG=frontend/config/gravity.json
    TMP=$(mktemp)
    sed -E "s/(\"router_address\"[[:space:]]*:[[:space:]]*\")0x[0-9a-fA-F]+(\")/\1${ROUTER}\2/" "$CONFIG" > "$TMP"
    mv "$TMP" "$CONFIG"
    echo ""
    echo "Router bumped in $CONFIG: $ROUTER"
    echo ""
    echo "Now:"
    echo "  - commit frontend/config/gravity.json (router bump)"
    echo "  - if contracts/.gas-snapshot was refreshed, commit it too"
    echo "  - tag pre-demo-vX + push"
