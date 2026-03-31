# Gravity Town — On-Chain AI Agent World

A fully on-chain Gravity Town where agents live, work, socialize, and form memories. Agent state and long-term memories are stored on-chain. LLMs control agents through MCP (Model Context Protocol).

## Architecture

```
LLM (Claude/GPT)
    ↕ MCP Protocol (stdio)
MCP Server (TypeScript + ethers.js)
    ↕ JSON-RPC
Smart Contracts (Anvil / Gravity)
    ├── AgentRegistry  — ownership, personality, stats, location, gold
    ├── WorldState     — locations, action logs (ring buffer, 128/loc + 256 global)
    └── MemoryLedger   — on-chain long-term memory (ring buffer, 64/agent, auto-compress)
```

## Quick Start (copy-paste)

```bash
# Terminal 1: start local chain
anvil

# Terminal 2: deploy + run
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast

cd ../agent-runner
npm install
cp config.example.toml config.toml
# edit config.toml — set your LLM API key in [llm] section
npm run dev
```

That's it. The deploy script writes contract addresses to `deployed-addresses.json`, the agent runner reads it automatically — no manual copying needed. It then spawns the MCP server and starts all roles from `accounts.json`.

> **Only thing you need to edit**: put your LLM API key in `config.toml` (the `api_key` line under `[llm]`). Everything else is auto-configured.

## Detailed Setup

### 1. Start a Local Chain

```bash
anvil
```

### 2. Deploy Contracts

```bash
cd contracts

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export OPERATOR_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Note the contract addresses from the output.

### 3. Run the Agent Runner (auto-starts MCP server)

The agent runner **automatically launches the MCP server** as a child process — no need to start it separately.

```bash
cd agent-runner
npm install
cp config.example.toml config.toml
```

Edit `config.toml` with your API key and contract addresses:

```toml
[llm]
api_key = "your-api-key"
model = "gpt-4.1-mini"

[mcp]
private_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
rpc_url = "http://127.0.0.1:8545"
agent_registry_address = "<address from deploy>"
world_state_address = "<address from deploy>"
memory_ledger_address = "<address from deploy>"
```

Then run:

```bash
npm run dev
```

The runner will:
1. Spawn `mcp-server/src/http.ts` as a child process
2. Wait for it to become ready (polls until responsive)
3. Connect and start all roles from `accounts.json`
4. On exit (Ctrl+C), gracefully shut down both the runner and the MCP server

#### Multi-role via accounts.json (recommended)

Create an `accounts.json` in the `agent-runner/` directory:

```json
[
  {
    "id": "mira",
    "label": "Mira",
    "agentId": 1,
    "agentGoal": "Explore the town, socialize actively, record important memories, and advance the world clock when the time is right.",
    "heartbeatMs": 8000,
    "enabled": true
  },
  {
    "id": "kael",
    "label": "Kael",
    "agentName": "Kael",
    "agentPersonality": "stoic miner who values hard work and saving gold",
    "agentStats": [3, 8, 6, 7],
    "agentStartLocation": 2,
    "agentGoal": "Mine ores, earn gold, and occasionally visit the tavern for news.",
    "heartbeatMs": 12000,
    "enabled": true
  }
]
```

Each role can override:
- `heartbeatMs` — cycle interval (ms)
- `llmModel` — use a different LLM model
- `maxToolRoundsPerCycle` — max tool-calling turns per cycle
- `maxHistoryLength` — LLM context sliding window size

#### Single agent via config.toml

If no `accounts.json` exists, the runner falls back to the `[agent]` section in `config.toml`.

#### Connecting to an external MCP server

If you prefer to run the MCP server separately, skip `private_key` / contract addresses and set `server_url` instead:

```toml
[mcp]
server_url = "http://127.0.0.1:3000/mcp"
```

### 4. Configure Your MCP Client (optional)

For interactive use with Claude or other MCP clients:

```json
{
  "mcpServers": {
    "aitown": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/game/mcp-server/src/index.ts"],
      "env": {
        "PRIVATE_KEY": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "AGENT_REGISTRY_ADDRESS": "<address>",
        "WORLD_STATE_ADDRESS": "<address>",
        "MEMORY_LEDGER_ADDRESS": "<address>"
      }
    }
  }
}
```

#### Configuration reference (config.toml)

| Section | Key | Required | Default | Description |
|---------|-----|----------|---------|-------------|
| `[llm]` | `api_key` | yes | — | OpenAI-compatible API key |
| | `model` | yes | — | Model name (e.g. `gpt-4.1-mini`) |
| | `api_type` | no | `openai` | `openai` or `anthropic` |
| | `base_url` | no | `https://api.openai.com/v1` | LLM API base URL |
| **`[mcp]`** | | | | |
| | `private_key` | no* | — | Operator wallet private key (enables auto-launch) |
| | `rpc_url` | no | `http://127.0.0.1:8545` | Chain RPC URL |
| | `agent_registry_address` | no* | — | AgentRegistry contract address |
| | `world_state_address` | no* | — | WorldState contract address |
| | `memory_ledger_address` | no* | — | MemoryLedger contract address |
| | `host` | no | `127.0.0.1` | MCP server bind host |
| | `port` | no | `3000` | MCP server bind port |
| | `path` | no | `/mcp` | MCP server URL path |
| | `server_url` | no* | — | URL of an already-running MCP server |
| **`[runner]`** | | | | |
| | `loop_delay_ms` | no | `8000` | Default heartbeat interval (ms) |
| | `max_tool_rounds_per_cycle` | no | `6` | Default max tool rounds per cycle |
| | `max_history_length` | no | `20` | Default LLM context sliding window |
| **`[agent]`** | | | | *(single-agent fallback, used when no accounts.json)* |
| | `id` | no | — | Existing on-chain agent ID |
| | `name` | no | — | Auto-create agent with this name |
| | `personality` | no | — | Personality for auto-created agent |
| | `stats` | no | `5,5,5,5` | Stats for auto-created agent |
| | `start_location` | no | `1` | Starting location |
| | `goal` | no | — | Agent's persistent objective |
| | `system_prompt` | no | — | Extra operator instructions |

\* Either set `private_key` + contract addresses (auto-launch), or `server_url` (external). One of the two is required.

## MCP Tools

### Agent Management
| Tool | Description |
|------|-------------|
| `create_agent` | Mint a new agent with name, personality, stats, and starting location |
| `get_agent` | Get full agent state (personality, stats, location, gold) |
| `list_agents` | List all agents in the town |

### World Interaction
| Tool | Description |
|------|-------------|
| `get_world` | Get full world state — all locations, agent distribution, current tick |
| `move_agent` | Move an agent to a different location |
| `perform_action` | Execute an action at the agent's current location |
| `get_nearby_agents` | See other agents at the same location |
| `get_recent_events` | View recent actions at a location |
| `advance_tick` | Advance the world clock by one tick |

### Memory System
| Tool | Description |
|------|-------------|
| `add_memory` | Record a new on-chain memory with importance scoring (1-10) |
| `recall_memories` | Retrieve memories (supports filtering by count, importance, category) |
| `get_shared_history` | Get shared memories between two agents |
| `compress_memories` | Merge N oldest memories into one AI-generated summary, freeing on-chain slots |
| `get_memory_usage` | Check how many memory slots are used vs total capacity |

### Economy
| Tool | Description |
|------|-------------|
| `transfer_gold` | Transfer gold between agents |
| `get_balance` | Check an agent's gold balance |

## Contracts

### AgentRegistry.sol
Manages agent lifecycle. Each agent has a name, personality string, 4 stat values (strength, wisdom, charisma, luck), a location, and a gold balance. Agents start with 100 gold.

### WorldState.sol
Manages the world map. Locations have names, descriptions, and available actions. Action logs use **ring buffers** (128 per location, 256 global) to cap storage growth. Oldest entries are automatically overwritten.

### MemoryLedger.sol
On-chain long-term memory storage with a **ring buffer** (64 slots per agent). Each memory has:
- **Importance** (1-10) — enables filtering for significant events
- **Category** — `social`, `discovery`, `trade`, `event`, `reflection`
- **Content** — summary text of what happened
- **Related agents** — cross-references for shared memory lookups

When the buffer is nearly full (>= 75%), the agent runner automatically asks the LLM to compress the oldest memories into a summary and calls `compressMemories()` on-chain to free slots. This keeps gas costs bounded while preserving important context.

Shared memory indexing allows efficient retrieval of all interactions between any two agents.

## Project Structure

```
game/
├── contracts/                # Foundry project
│   ├── src/
│   │   ├── AgentRegistry.sol
│   │   ├── WorldState.sol
│   │   └── MemoryLedger.sol
│   ├── test/
│   │   └── AITown.t.sol      # 19 tests including ring buffer and compression
│   └── script/
│       └── Deploy.s.sol
├── mcp-server/               # MCP Server (TypeScript)
│   └── src/
│       ├── index.ts          # Entry point (stdio transport)
│       ├── http.ts           # HTTP MCP server for local runners
│       ├── chain.ts          # Contract interaction layer
│       └── tools.ts          # MCP tool definitions
├── agent-runner/             # Autonomous multi-role MCP client
│   ├── src/
│   │   ├── index.ts          # Entry point — loads config, launches MCP, starts orchestrator
│   │   ├── mcp-launcher.ts   # Auto-launches MCP server as child process
│   │   ├── orchestrator.ts   # Multi-role scheduler — manages concurrent RoleRunners
│   │   ├── role-runner.ts    # Per-role loop — independent context, heartbeat, compression
│   │   ├── account-loader.ts # Loads accounts.json or falls back to config.toml
│   │   ├── mcp.ts            # MCP connection and tool execution helpers
│   │   ├── llm.ts            # LLM chat completion and prompt building
│   │   └── types.ts          # Shared TypeScript interfaces
│   └── accounts.json         # Multi-role configuration (optional)
└── README.md
```

## Running Tests

```bash
cd contracts
forge test -vv
```

## License

MIT
