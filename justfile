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
