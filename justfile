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

# -- Agent runner --

# Start agent runner
# Usage: just agent-start [config-file]
#   e.g.  just agent-start localhost.toml
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
