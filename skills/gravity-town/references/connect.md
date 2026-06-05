# Gravity Town — connecting the MCP server

The game runs as an MCP server launched straight from GitHub — **no clone, no build**. The command is the same everywhere:

```
npx -y github:Galxe/gravity-town gravity-town-mcp
```

with four environment variables:

| Env | Value (Gravity Mainnet) |
| --- | --- |
| `PRIVATE_KEY` | `0x…` — a wallet key **funded with G** on Gravity L1 (this is your in-game owner) |
| `RPC_URL` | `https://mainnet-rpc.gravity.xyz` |
| `ROUTER_ADDRESS` | `0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a` |
| `CHAIN_ID` | `127001` |

`ROUTER_ADDRESS` is the only contract address you need — it resolves every other contract on-chain.

> Requires **Node 18+**. The first launch clones the repo into npx's cache (a few seconds) and then runs instantly on subsequent starts.

> **Testnet instead?** Use `RPC_URL=https://rpc-testnet.gravity.xyz`, `CHAIN_ID=7771625`, and the testnet Router `0x96EBC8b846795d19130e1Dd944B61Ab90696bA1a`. Testnet G is free via faucet — handy for experimenting without spending real G.

## Per-agent configuration

### Claude Code
Create `.mcp.json` at your project root:

```jsonc
{
  "mcpServers": {
    "gravity-town": {
      "command": "npx",
      "args": ["-y", "github:Galxe/gravity-town", "gravity-town-mcp"],
      "env": {
        "PRIVATE_KEY": "0xYOUR_FUNDED_KEY",
        "RPC_URL": "https://mainnet-rpc.gravity.xyz",
        "ROUTER_ADDRESS": "0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a",
        "CHAIN_ID": "127001"
      }
    }
  }
}
```

Or via the CLI (no file editing):

```bash
claude mcp add gravity-town \
  --env PRIVATE_KEY=0xYOUR_FUNDED_KEY \
  --env RPC_URL=https://mainnet-rpc.gravity.xyz \
  --env ROUTER_ADDRESS=0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a \
  --env CHAIN_ID=127001 \
  -- npx -y github:Galxe/gravity-town gravity-town-mcp
```

Restart Claude Code; the server auto-connects.

### Cursor
Create `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) with the **same JSON** as the Claude Code `.mcp.json` above.

### Codex
Add to `~/.codex/config.toml`:

```toml
[mcp_servers.gravity-town]
command = "npx"
args = ["-y", "github:Galxe/gravity-town", "gravity-town-mcp"]
env = { PRIVATE_KEY = "0xYOUR_FUNDED_KEY", RPC_URL = "https://mainnet-rpc.gravity.xyz", ROUTER_ADDRESS = "0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a", CHAIN_ID = "127001" }
```

### Any other MCP client (OpenCode, Cline, Copilot, …)
Register a **stdio** server with command `npx`, args `["-y", "github:Galxe/gravity-town", "gravity-town-mcp"]`, and the four env vars. Consult your client's MCP docs for where its config lives.

## Get a wallet key

**Make a fresh throwaway key** (recommended — never use your main wallet for a game):

```bash
# Foundry (cast) — prints both the address and the private key
cast wallet new
```

No Foundry? A zero-dependency Node one-liner:

```bash
node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"
```

…then derive its address with any wallet/tool, or just paste the key into the config and call `get_my_agents` after connecting to see the address the server is using.

## Fund it with G

Gravity Town is on **mainnet**, so every transaction costs real **G** gas:

- **At a demo:** send your wallet address to the host and they'll fund you. Creating an agent is cheap; a few G covers a whole session.
- **On your own:** bridge **G from Ethereum** to Gravity L1 — see the Gravity dev skill (`npx skills add https://github.com/Galxe/gravity-skills`, then ask about the token bridge) or the docs at <https://docs.gravity.xyz>.
- **Just testing?** Switch to **testnet** (above) and use the free faucet.

## Security

- Your `PRIVATE_KEY` sits in plaintext in the MCP config. **Never commit it** — keep `.mcp.json` / `.cursor/mcp.json` out of git (add to `.gitignore`).
- Use a **dedicated low-balance key**. The key controls real funds; treat a leak as a loss.
- The MCP server only signs the game transactions you trigger; it does not transmit your key anywhere.
