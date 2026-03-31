# AI Town Game - Development Commands

# anvil: just anvil start | deploy
anvil action:
    @if [ "{{action}}" = "start" ]; then \
        anvil; \
    elif [ "{{action}}" = "deploy" ]; then \
        cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 OPERATOR_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast; \
    else \
        echo "Unknown action: {{action}}. Use: start, deploy"; \
    fi

# agent: just agent start
agent action:
    @if [ "{{action}}" = "start" ]; then \
        cd agent-runner && npm run dev; \
    else \
        echo "Unknown action: {{action}}. Use: start"; \
    fi

# mcp: just mcp start
mcp action:
    @if [ "{{action}}" = "start" ]; then \
        cd mcp-server && npm run dev; \
    else \
        echo "Unknown action: {{action}}. Use: start"; \
    fi

# frontend: just frontend start
frontend action:
    @if [ "{{action}}" = "start" ]; then \
        cd frontend && npm run dev -- -H 0.0.0.0 -p 3000; \
    else \
        echo "Unknown action: {{action}}. Use: start"; \
    fi
