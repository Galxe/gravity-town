# Gravity Town — connecting the MCP server

The game runs as an MCP server. The recommended way is **zero-clone, no build** — launched straight from GitHub:

```
npx -y github:Galxe/gravity-town gravity-town-mcp
```

The **only required** environment variable is your wallet key:

| Env | Required? | Default |
| --- | --- | --- |
| `PRIVATE_KEY` | **yes** | — your `0x…` wallet key, **funded with G** on Gravity L1; this is your in-game owner |
| `RPC_URL` | no | `https://mainnet-rpc.gravity.xyz` |
| `ROUTER_ADDRESS` | no | `0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a` (resolves every other contract on-chain) |
| `CHAIN_ID` | no | `127001` |

So in practice you only ever set `PRIVATE_KEY`. Everything else defaults to **Gravity Mainnet**.

> Requires **Node 18+**. The first launch clones the repo into npx's cache (a few seconds), then runs instantly afterwards.

> **Testnet instead?** Override the optional vars: `RPC_URL=https://rpc-testnet.gravity.xyz`, `CHAIN_ID=7771625`, `ROUTER_ADDRESS=0x96EBC8b846795d19130e1Dd944B61Ab90696bA1a`. Testnet G is free via faucet — handy for experimenting without spending real G.

## Per-agent configuration

### Claude Code
Create `.mcp.json` at your project root:

```jsonc
{
  "mcpServers": {
    "gravity-town": {
      "command": "npx",
      "args": ["-y", "github:Galxe/gravity-town", "gravity-town-mcp"],
      "env": { "PRIVATE_KEY": "0xYOUR_FUNDED_KEY" }
    }
  }
}
```

Or via the CLI (no file editing):

```bash
claude mcp add gravity-town \
  --env PRIVATE_KEY=0xYOUR_FUNDED_KEY \
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
env = { PRIVATE_KEY = "0xYOUR_FUNDED_KEY" }
```

### Any other MCP client (OpenCode, Cline, Copilot, …)
Register a **stdio** server with command `npx`, args `["-y", "github:Galxe/gravity-town", "gravity-town-mcp"]`, and at least `PRIVATE_KEY` in env. Consult your client's MCP docs for where its config lives.

## Alternative: install from npm

The server is also published as a standalone npm package (`gravity-town-mcp`) with the same mainnet defaults — handy if you'd rather not go through GitHub each launch:

```bash
npm i -g gravity-town-mcp
claude mcp add gravity-town --env PRIVATE_KEY=0xYOUR_FUNDED_KEY -- gravity-town-mcp
```

Same env vars apply (only `PRIVATE_KEY` is required).

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
