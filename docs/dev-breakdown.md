# Gravity Town · 开发任务分解（可执行工单版）

> 目的：把「demo 预览的 UX + roadmap 想要的功能」翻译成一份按文件域切分、可多人并行 review 的开发工单。本文所有缺口均锚定当前 `pr76` 工作树真实源码行号；旧稿行号已重新核校。
>
> 关系：本文是 [`docs/roadmap.md`](roadmap.md) WBS 的细化稿。roadmap 给 epic 和方向；本文据当前代码、[`demo/index.html`](../demo/index.html)、[`docs/demo-user-stories.md`](demo-user-stories.md)、[`docs/player-capabilities.md`](player-capabilities.md)、[`docs/capability-matrix.md`](capability-matrix.md) 重新校准「已做 / mock-only / 未做」，并把任务拆成互不撞文件域的 lane。
>
> 命名约定：`E*.*` 复用 roadmap epic/任务号；`US-*` 是 demo 用户故事号；`Lane P/A-F` 是本文的并行车道；`maps-to` 标注来自 roadmap、demo story 或本文新增。
>
> 角色：`SC`=合约 · `MCP`=工具层 · `FE`=前端 · `INFRA`=keeper/runner/遥测 · `PLAT`=部署/Router/授权 · `DOC`=文档/决策。

---

## 1. 现状快照（一表锚定，含 file:line）

| 领域 | DONE（已可用） | MOCK-ONLY（demo 里假的） | MISSING / GAP（要新建或修正） |
|---|---|---|---|
| **合约 · 主世界** | hex/ore/建造/战斗/民心/incite/chronicle/圣典/三类 ledger 均由 `GameEngine` 驱动；`createAgent` 自动 7 格 + 200 ore（`contracts/src/GameEngine.sol:232`、`:261-264`）；`harvest` 是 permissionless（`:288-290`）；`build`/`raid` 受 `canControlAgent` gate（`:344-345`、`:623-624`）；外部系统可经 `spendOre`/`refundOre` 动 ore（`:471-482`）；身份 gate 认 registry operator 或 agent owner（`:164-178`）。 | demo 的 `/me` 手动 harvest/build/raid、autopilot 行为、AgentMind 行为流均为内存态。 | **21 个主世界参数仍是 `constant`**（`GameEngine.sol:25-45`，debate 常量 `:48-55`，chronicle 常量 `:58-59`），`_calcDecay` 系数硬编码（`:1173-1186`）；事件列表 `:139-160` 无 `AchievementUnlocked`；`MAX_ORE_POOL=1000` cap 会影响 `refundOre` 和派彩（`:26`、`:482-486`）。 |
| **合约 · Auth/Delegation** | `AgentRegistry` 同时有单一 `operator`（`contracts/src/AgentRegistry.sol:19`）和全局 `operators` mapping（`:24`）；`addOperator/removeOperator/isOperator` 是 owner-only 全局权限（`:67-69`；`setOperator`=66、add/remove=`:67-68`、`isOperator`=69）；`canControlAgent` 只认全局 operator 或 `agentOwner`（`:45-48`）。 | demo `#/me` 的 AUTOPILOT 开关呈现为用户可独立开关/撤回。 | **无 per-agent delegation**；用户不能自己调用 `addOperator/removeOperator` 给某个 agent 委托或撤权。E3/E1b/E7/D7 必须先过 §2 Auth 决策门，不能声称当前合约支持用户级链上委托。 |
| **合约 · 预测市场** | 当前只有 debate 内的 parimutuel 雏形：`startDebate` 必须挂当前 hex（`GameEngine.sol:710-743`），`resolveDebate` 处理注池/Oracle 10% tax（`:804`、`:862-868`），无赢家退款分支在 `:889-890`，退款 helper `_refundDebateBettors` 在 `:914-924`。 | demo 预置 SELF_RESOLVING 与 ORACLE 市场（`demo/index.html:177-215`），Oracle 10% rake（`:236-244`），下注/结算/凭证全为内存态。 | **无独立 `PredictionMarket` 合约**；`Router` 仅到 `cardLedger` 槽位（`contracts/src/Router.sol:10-21`），getter 止于 V3（`:86-108`）；现 debate 与 hex 民心耦合，不能做 scoreboard/hex ownership 等解耦市场。 |
| **合约 · Arena/卡** | Arena 已有 G-tier、shop、bench、匹配、ELO、二级市场：`buy/place/remove/move/freeze/roll` 在 `ArenaEngine`（`contracts/src/ArenaEngine.sol:274-403`）；tier 可热调（`:217-221`、`:573-575`）；`CardLedger` 支持 `mintCard/listCard/cancelListing/buyListed`（`contracts/src/CardLedger.sol:75-138`）；12 单位在 `UnitCatalog`（`contracts/src/UnitCatalog.sol:6-12`）；`simulateWithTrace` 输出攻击 turn（`contracts/src/ArenaCombat.sol:54-67`）。 | demo 的 story card `variant/edition/achievementTag/story/provenance` 明确是 mock（`demo/index.html:283-320`、`:2250-2295`）；Share 链接是 mock toast（`:2513-2515`）。 | `CardLedger.Card` 只有 `id/unitType/ownerAgent/mintedAt`（`CardLedger.sol:17-22`），无叙事元数据/`mintStoryCard`；`ArenaCombat.Turn` 只记录普攻（`ArenaCombat.sol:30-36`），没有 `AbilityEvent[]`；RNG 仍用 `block.prevrandao`（`ArenaEngine.sol:398-400`、`:545-548`）。 |
| **MCP** | 主世界工具齐全：`create_agent`（`mcp-server/src/tools.ts:20`）、`harvest`（`:132`）、`build`（`:142`）、`raid`（`:177`）、ledger/chronicle/bible 读写（`:297`、`:529`、`:597`）；Arena 已有 buy/deposit/withdraw/place/remove/inventory/market/listing/submit 及 `arena_get_card`（`:630-762`、`arena_get_card` 在 `:954`）。`chain.ts` 解析 Router V3/V2/V1（`mcp-server/src/chain.ts:261-281`），已有 CardLedger ABI（`:166-175`）与 `simulateMatch`（`:136`）。 | demo 市场工具、shop roll/freeze/move、成就铸卡 keeper 都是假体验或未连后端。 | 无 `create_market/bet/resolve_market/list_markets/get_market`；MCP `tools.ts` 无 `arena_roll/arena_freeze/arena_move`，但旧 e2e 脚本已期待这些工具（`mcp-server/scripts/e2e-arena-tools.mjs:51-58`）；`tools.ts` 文案漂移：公告板写 +10（`:316`）但合约 `POST_MORALE=5`（`GameEngine.sol:42`），chronicle 写 10 分钟（`tools.ts:530`）但合约 5 分钟（`GameEngine.sol:58`）；`chain.ts` 事件 ABI 漂移：不存在 `HexClaimed`（`:44`）、`Harvested(bytes32,...)` 签名错误（`:47`），缺 `HexCaptured/HexRebelled`（真实事件 `GameEngine.sol:150-151`）。 |
| **前端** | 真实路由只有 `/` 与 `/arena`：`frontend/src/app/page.tsx:11-23`、`frontend/src/app/arena/page.tsx:13-51`；均为只读 RPC。`useGameEngine` 已读 world、memories、location board、inbox、chronicle、evaluations、world bible（`frontend/src/hooks/useGameEngine.ts:123-250`）；`useArenaEngine` 已读 Arena、events、inventory（`frontend/src/hooks/useArenaEngine.ts:119-218`，CardLedger ABI `:55-63`，inventory mapping `:400-427`）；arena 页复用 `useGameEngine` 喂 AgentMind（`app/arena/page.tsx:15-18`、`AgentMindPanel.tsx:26-30`）。 | demo 有 `#/ #/me #/markets #/arena #/lore #/onboard` 六路由（`demo/index.html:455-456`、`:2571`），但全部内存态。 | 无钱包/写链依赖：`frontend/package.json:11-19` 只有 `ethers/lucide/next/phaser/zustand` 等，`rg` 未发现 wagmi/viem/RainbowKit/Privy/sendTransaction/useWallet；无 `/onboard`、`/me`、`/markets`、`/lore` 路由；`frontend/src/chain/*` 五文件存在但无 import 引用，且与当前直读 hook 重复/过时。 |
| **demo / 故事文档** | `demo/index.html` 2604 行，六路由，用户故事覆盖观众、onboarding、My Agent、Markets、Arena、Lore；story manual 标注 demo 纯 mock（`docs/demo-user-stories.md:7-9`），六路由入口（`:9`）。 | 所有余额、交易、对局、钱包、下注、卡 metadata、分享链接刷新即丢。 | demo 是目标 UX 规格，不是可复用实现；真实代码必须分别落到合约/MCP/FE/keeper 工单。 |
| **infra / runner / config** | Arena keeper 已有独立心跳脚本（`mcp-server/scripts/keeper.mjs:1-33`），`just keeper-start`/`keeper-gravity` 调它（`justfile:90-110`）；agent-runner 支持 accounts + heartbeat（`agent-runner/src/orchestrator.ts:76-83`、`role-runner.ts:63-109`）。 | demo 的 relay/gasless/autopilot 计费均为文案。 | runner 当前固定 `agent-runner/accounts.json` 26 个启用角色，25 个 `heartbeatMs=5000`、Oracle `60000`（`accounts.json:13-14`、`:349-350`、`:363-367`）；全局 `loop_delay_ms` 随 config 不同：mainnet 5min（`agent-runner/config/gravity-mainnet.toml:27-31`）、testnet 10s（`agent-runner/config/gravity.toml:27-32`）、localhost 15s（`agent-runner/config/localhost.toml:23-28`）。无多租户 runner、relay 后端、市场 keeper、成就铸卡 keeper、遥测。 |
| **部署/config 风险** | `agent-runner/config/gravity.toml` 指向 Gravity Testnet router `0x96...`（`:13-16`）；`frontend/config/gravity.json` 当前指向 Gravity Mainnet `chain_id=127001`、router `0x13860c...`（`frontend/config/gravity.json:1-7`）；`just gravity-upgrade` 用 `grep -o '0x...' frontend/config/gravity.json | head -1` 取 `ROUTER_ADDRESS`（命中的是 mainnet router），但 `--rpc-url` 硬编码为 testnet RPC `https://rpc-testnet.gravity.xyz`（`justfile:47-53`）。 | — | 真实风险不是“升级到 mainnet”，而是 **mainnet router 地址 + testnet RPC 的链/地址 mismatch**：脚本会拿 mainnet router 去 testnet RPC 上跑 upgrade，地址在 testnet 链上不存在/不对应，行为未定义。任何 P2/P3a/P5 验收跑 `just gravity-upgrade` 前必须先对齐 router 地址与 RPC 所属链。 |

---

## 2. 按文件域切分的并行车道（lane 内串行，lane 间并行）

> **防撞总则**：
> 1. `GameEngine.sol` 的存储改动由 Lane A 独占，先 land；其他 lane 不得 append `GameEngine` storage。
> 2. 新事件、新独立合约可以并行；但 Router/Deploy/Upgrade/授权统一进 Lane P。
> 3. 每个 ledger/合约单一 owner：`CardLedger` + `ArenaCombat` + `AbilityLib` + `ArenaEngine` + `UnitCatalog` 归 Lane B；`PredictionMarket` 新文件归 Lane C。
> 4. Lane P 唯一拥有 `Router.sol`、部署/升级脚本、operator 授权、前端 config、P 自己的新地址解析层；D 才拥有 `mcp-server/src/chain.ts`。
> 5. 前端写链（Lane E）只建新 wallet/write 子树和新路由；既有 `/arena` 页、`useArenaEngine.ts`、只读 store/组件由 Lane F 独占。
> 6. `/me` 拆法：`frontend/src/app/me/*` 主壳和写控件归 E；只读账本/AgentMind 子组件落 `frontend/src/components/ledger/*` 归 F，由 E import。

> **决策门 · Auth / Delegation（E3/E1b/E7/D7 共同前置）**：
> - 当前事实：`AgentRegistry` 有全局 `operator`（`AgentRegistry.sol:19`）和全局 `operators` mapping（`:24`）；`addOperator/removeOperator` 是 `onlyOwner`（`:67-68`）；`canControlAgent` 只认全局 operator 或 agent owner（`:45-48`）。**没有 per-agent delegation**。
> - **默认路径 (a)：全局平台 operator/relay signer + off-chain 用户开关**。平台 owner 把 relay signer 加进全局 operator；用户的“开/关 autopilot”是 DB/runner/relay flag，不是链上用户可撤回委托。验收授权必须用 `build`/`raid` 这类有 `canControlAgent` 的动作（`GameEngine.sol:344-345`、`:623-624`），不能用 permissionless `harvest`（`:288-290`）。
> - **备选路径 (b)：新增 per-agent delegation 合约能力（A3）**。新增 `delegate/undelegate` 和 per-agent mapping，再改 `canControlAgent`。这会引入 storage layout 测试，并改变 E3/E1b/E7/D7 的实现语义。
> - 本轮默认按 (a) 写工单；若 owner 选择 (b)，A3 必须打开并成为 E3/E1b/E7/D7 的合约前置。

### 2.1 文件域归属表（互斥确认）

| Lane | owner 角色 | 独占文件域 | 关键互斥点 |
|---|---|---|---|
| **P** | PLAT·部署/授权 | `contracts/src/Router.sol`、`contracts/script/{Deploy,Upgrade}.s.sol`、operator 授权编排、`frontend/config/*.json`、新建 `mcp-server/src/addressResolver.ts`、部署/运维文档 | 唯一改 Router 槽位/getter、部署脚本和 config；P 不改 `mcp-server/src/chain.ts`，ABI/地址同步请求交 D |
| **A** | SC·主世界 | `contracts/src/GameEngine.sol`；若 Auth 选 (b)，再含 `contracts/src/AgentRegistry.sol` per-agent delegation | 唯一允许改主世界存储/事件；A1→A2 串行 |
| **B** | SC·Arena | `contracts/src/{ArenaEngine,ArenaCombat,AbilityLib,CardLedger,UnitCatalog}.sol` | 不碰 Router/Deploy；注册或授权请求进 P |
| **C** | SC·新合约 | 新建 `contracts/src/PredictionMarket.sol` 与 interface/test | 不碰 Router/Deploy；只读 GameEngine，经 `spendOre/refundOre` 钩子动 ore |
| **D** | MCP/INFRA | `mcp-server/src/{tools,chain}.ts`、新建 `mcp-server/scripts/keeper-market.mjs`、`keeper-achievement.mjs`、`telemetry/`、`agent-runner/*` | `chain.ts` 唯一 owner；不碰 `frontend/config/*`；不改现有 Arena keeper 逻辑除非 D 自己维护 scripts |
| **E** | FE·写链路 | 新建 `frontend/src/hooks/wallet/*`、`frontend/src/lib/wallet/*`（含 `relay-client`）、`frontend/src/components/wallet/*`、`frontend/src/app/onboard/*`、`frontend/src/app/markets/*`、`frontend/src/app/arena/market/*`、`frontend/src/app/me/page.tsx` | 不改既有 `useGameEngine.ts`/`useArenaEngine.ts`/`app/page.tsx`/`app/arena/page.tsx`；写控件只 import F 的只读组件；**relay 后端目录不归 E**：E 只拥有 `lib/wallet/relay-client` 前端侧，relay 后端落点是 D6 决策门，定下后该后端归单一 owner（放 `mcp-server` 则归 D，独立服务则归该服务 owner），E 不在未授权文件域里建后端 |
| **F** | FE·只读视图 | 既有 `frontend/src/{phaser,game,store}`、`frontend/src/hooks/useArenaEngine.ts`、`frontend/src/components/arena/*`、`frontend/src/app/arena/page.tsx`、`frontend/src/app/page.tsx`、新建 `frontend/src/app/lore/*`、`frontend/src/components/{spectator,ledger}/*` | Arena 页/store/hook 唯一 owner；F 不拥有 `app/me/*` 与 `app/arena/market/*` |

### 2.2 跨 lane「注册/授权」请求（统一进 Lane P 排队）

| 发起 lane | 需要 P 做的事 | 阻塞的下游 |
|---|---|---|
| C（PredictionMarket） | `Router` 加 `predictionMarket` 槽位 + V4 getter/setter；Deploy/Upgrade 部署 proxy 并 set；`AgentRegistry.addOperator(predictionMarket)`，否则 `GameEngine.spendOre/refundOre` 的 `onlyOperatorOrOwner` 会 revert（`GameEngine.sol:168-170`、`:471-482`）；地址/config 同步。 | D1、D2、E4 |
| D（achievement keeper） | 给成就铸卡 keeper signer 加全局 operator，或复用已授权 operator；用于调用 B3 的 `mintStoryCard`。market keeper 因 C2 `resolve` permissionless，不需要 operator，只要 gas。 | D3 |
| E1b（relay signer） | 若 Auth 走 (a)，把 relay signer 加全局 operator；撤权是 owner-only 全局 kill switch。若走 (b)，P 不做全局授权，用户走 per-agent `delegate`。 | E1b-b、E2 gasless、E7、D7 |

### Lane P · 平台集成 / 部署 / 授权（唯一 owner：Router + 脚本 + operator 授权 + 地址配置）

#### P1 · Router 市场槽位与 V4 getter [PLAT/SC | `Router.sol` | 依赖 C1 | maps-to 新增]

**功能点（交付什么）**
- 玩家/用户可见：市场页和 MCP 能从 Router 发现真实 PredictionMarket 地址，不需要手填地址。
- 技术交付物：在 `cardLedger` 之后 append `predictionMarket` storage；新增 `setPredictionMarket(address)` 和 `getAddressesV4()`；保持 `getAddresses`/V2/V3 ABI 完全不变。

**现状 & 缺口（file:line 锚定）**
- 已有：Router 槽位止于 `cardLedger`（`contracts/src/Router.sol:10-21`）；setter 止于 `setCardLedger`（`:45-53`）；V3 getter 返回 9-tuple（`:86-108`）。
- 缺：无 `predictionMarket` 槽位、setter、V4 getter；无 Router storage append 测试。

**子任务拆分（有序，可独立提交）**
1. 在 `Router.sol` append `address public predictionMarket;`，新增 setter。
2. 新增 `getAddressesV4()`，返回 V3 九项 + predictionMarket；旧 getter 不改。
3. 补 Router ABI/storage 测试，覆盖 legacy getter decode 长度和新槽位。
4. 在 P3a/F7/D1 的接口说明中同步 V4 tuple 顺序。

**验收标准（命令 + 期望结果）**
- [ ] 命令：`cd contracts && forge test --match-test test_RouterV4KeepsLegacyGetters -vv` → 期望：`getAddresses`/V2/V3 返回值与升级前兼容，V4 返回第 10 项 market 地址。
- [ ] 命令：`cd contracts && forge test --match-test test_RouterStorageAppendPredictionMarket -vv` → 期望：升级后既有 `registry/gameEngine/arenaEngine/gTreasury/cardLedger` 未漂移，新 `predictionMarket` 可 set/get。

#### P2 · Deploy/Upgrade 部署 PredictionMarket proxy 并授权 [PLAT/SC | `Deploy.s.sol`,`Upgrade.s.sol` | 依赖 P1,C2 | maps-to 新增]

**功能点**
- 玩家/用户可见：测试网/本地升级后，市场下注能真正扣/退 agent ore。
- 技术交付物：部署 `PredictionMarket` implementation + UUPS proxy；`Router.setPredictionMarket(proxy)`；`AgentRegistry.addOperator(market)`；本地和 Gravity upgrade 冒烟。

**现状 & 缺口**
- 已有：Deploy 已部署 Router、GameEngine、GTreasury、CardLedger、ArenaEngine（`contracts/script/Deploy.s.sol:26-122`）；现有 operator 授权范式在 `registry.addOperator(address(engine))`/`cardLedger`/`arena`（`:97-99`、`:117-119`）。
- 已有：Upgrade 可 backfill/upgrade G/Card/Arena 并授权（`contracts/script/Upgrade.s.sol:107-185`）。
- 缺：脚本未 import/deploy/upgrade `PredictionMarket`；未 set Router market；未授权 market 调 `spendOre/refundOre`；`just gravity-upgrade` 从 `frontend/config/gravity.json` grep 出的是 mainnet router `0x13860c...`，却把 `--rpc-url` 硬编码为 testnet RPC（`justfile:47-53`、`frontend/config/gravity.json:1-7`）——存在 mainnet router 地址 + testnet RPC 的链/地址 mismatch，升级前必须对齐。

**子任务拆分**
1. 在 Deploy/Upgrade 引入 `PredictionMarket`，遵循现有 proxy 初始化模式。
2. Deploy fresh 时 set Router market 并 `registry.addOperator(marketProxy)`。
3. Upgrade 时检测 `router.predictionMarket()` 或 V4 getter；为空则部署 proxy，非空则 upgrade implementation；两条路径都保证 operator 授权。
4. 给 Upgrade 加日志输出与 idempotency：重复执行不重置市场状态。
5. 修正文档/justfile 风险：明确 `gravity-upgrade` 的目标 config，必要时新增 testnet 专用 recipe。

**验收标准**
- [ ] 命令：`just anvil-deploy && just anvil-upgrade` → 期望：本地 `deployed-addresses.json`/Router 能解析 `predictionMarket`，重复 `just anvil-upgrade` 不重置已有市场状态。
- [ ] 命令：`cd contracts && forge test --match-test test_UpgradeDeploysAndAuthorizesPredictionMarket -vv` → 期望：`registry.isOperator(predictionMarket)==true`，未授权路径的 `bet` 会因 `spendOre` revert，授权后通过。

#### P3a · 地址配置与 MCP 地址解析层 [PLAT/MCP | `frontend/config/*`,`addressResolver.ts` | 依赖 P2 | maps-to 新增]

**功能点**
- 玩家/用户可见：前端/keeper/MCP 在 local/testnet/mainnet 都能读到同一套部署地址。
- 技术交付物：新增 `mcp-server/src/addressResolver.ts`，统一读取 env、`frontend/config/<network>.json`、Router V4/V3 fallback；前端 config 文件增加 market 地址或明确通过 Router 解析。

**现状 & 缺口**
- 已有：keeper 直接读 `frontend/config/<NETWORK>.json` 并通过 Router V3/V2 找 Arena（`mcp-server/scripts/keeper.mjs:47-104`）。
- 已有：MCP `ChainClient` 自己在 `chain.ts` 里解析 Router V3/V2/V1（`mcp-server/src/chain.ts:261-281`），P 不应改此文件。
- 缺：无 `mcp-server/src/addressResolver.ts`；`frontend/config/gravity.json` 与 `agent-runner/config/gravity.toml` 目标网络不一致（`frontend/config/gravity.json:1-7`、`agent-runner/config/gravity.toml:13-16`）。

**子任务拆分**
1. 定义 `addressResolver.ts` API：`resolveAddresses({network, rpcUrl, routerAddress})`，返回 registry/game/arena/card/market 等地址。
2. P 只提供/同步地址解析（`addressResolver.ts` + `frontend/config/*`），并让 P 自己拥有的脚本使用它；`keeper-market.mjs` 归 D（见 D2），P 不拥有它，只把 resolver/地址供 D 消费。D 后续可把 `chain.ts` 地址解析迁移为调用该 API（由 D 实施）。
3. 修正/新增 `frontend/config/gravity-testnet.json` 或明确 `gravity.json` 指向环境；避免 `just gravity-upgrade` grep 到 mainnet router 却配 testnet RPC 的链/地址 mismatch。
4. 增加 resolver fallback 测试：V4 存在取 market，V4 不存在安全回落。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：`addressResolver.ts` 编译通过，未引入循环依赖。
- [ ] 命令：`cd mcp-server && NETWORK=localhost node scripts/check-address-resolver.mjs` → 期望：输出 `router/gameEngine/arenaEngine/cardLedger/predictionMarket`；未升级 Router 时 `predictionMarket` 为 `null` 且进程退出码 0。

#### P4 · 成就铸卡 keeper operator 授权 [PLAT/INFRA | Deploy/Upgrade/运维文档 | 依赖 B3（部署前置 P2） | maps-to 新增]

**功能点**
- 玩家/用户可见：达成圣典/翻盘/声望成就后，系统能自动铸故事卡。
- 技术交付物：为 D3 keeper signer 授权 `CardLedger.mintStoryCard` 所需 operator；记录撤权和轮换流程。market keeper 不在 P4，因为 C2 `resolve` permissionless。

**现状 & 缺口**
- 已有：`CardLedger.onlyOperator` 依赖 `registry.isOperator(msg.sender)`（`contracts/src/CardLedger.sol:61-63`）；Deploy/Upgrade 已授权 CardLedger/Arena（`Deploy.s.sol:98-99`、`:118`；`Upgrade.s.sol:150`、`:176-182`）。
- 缺：没有故事卡铸造入口（B3 负责）；没有 keeper signer 授权/撤权编排；没有 D3 exactly-once 运维文档。

**子任务拆分**
1. 与 D3 确认 keeper signer 来源：独立 signer 或复用 platform operator。
2. Deploy/Upgrade 增加可选授权分支，避免无 env 时阻塞普通升级。
3. 写运维文档：授权、撤权、轮换、重放事件去重责任归 D3。
4. 加 forge 测试覆盖授权/撤权后 `mintStoryCard` 成功/失败。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_AchievementKeeperOperatorGrantAndRevoke -vv` → 期望：授权 signer 可调用 `mintStoryCard`，撤权后 revert `not operator`。
- [ ] 命令：`KEEPER_ACHIEVEMENT_ADDRESS=0x... just anvil-upgrade` → 期望：日志显示 keeper 授权；随后 `cast call <registry> "isOperator(address)(bool)" <keeper>` 返回 `true`。

#### P5 · Relay signer 全局授权编排 [PLAT/INFRA | Deploy/Upgrade/运维文档 | 依赖 Auth 决策 | maps-to 新增]

**功能点**
- 玩家/用户可见：gasless onboarding/autopilot 在默认 (a) 路径下可以由平台 relay 代发真实受控动作。
- 技术交付物：把 relay signer 加入全局 operator；记录平台级撤权；若选 (b)，P5 改为不授权，只记录 per-agent delegate 前置。

**现状 & 缺口**
- 已有：全局 operator 添加/删除是 `onlyOwner`（`AgentRegistry.sol:67-68`）；`build`/`raid` 会检查 `canControlAgent`（`GameEngine.sol:345`、`:624`）。
- 缺：无用户级链上撤权；无 relay signer 授权脚本；无撤权后端到端验证。

**子任务拆分**
1. 在 Auth 决策记录中确认 (a)/(b)。
2. (a) 增加 `RELAY_SIGNER_ADDRESS` 授权脚本/recipe；(b) 禁止全局授权并等待 A3。
3. 写撤权语义：用户暂停是 off-chain flag；owner `removeOperator(relay)` 是全局 kill switch。
4. 与 E1b-b 对接 relay 健康检查与授权检查。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_RelaySignerCanBuildOnlyWhenGlobalOperator -vv` → 期望：授权前 relay 代发 `build` revert，授权后成功，撤权后再次 revert。
- [ ] 命令：`RELAY_SIGNER_ADDRESS=0x... just anvil-upgrade` → 期望：`registry.isOperator(relaySigner)==true`；执行撤权脚本后为 `false`，且 relay 代发 `raid` 失败。

### Lane A · 主世界合约（GameEngine 唯一 owner，存储改动序列化）

#### A1 · 主世界平衡参数 storage 化 [SC | `GameEngine.sol` | 依赖无 | maps-to roadmap E2.1]

**功能点**
- 玩家/用户可见：运营可在不升级合约的情况下调整产矿、建筑成本、战斗、民心、debate、chronicle 参数。
- 技术交付物：把当前常量迁移为 append storage + owner setter/batch setter；`_calcDecay` 系数参数化；保留 ABI 兼容读路径或提供新 getter。

**现状 & 缺口**
- 已有：主世界常量在 `GameEngine.sol:25-45`，debate 常量在 `:48-55`，chronicle 常量在 `:58-59`。
- 已有：Arena 已有运行时调参范式 `setTierThresholds`/`setMatchmakingPeriod`（`ArenaEngine.sol:217-221`、`:573-575`）。
- 缺：`_calcDecay` 写死 `1 + hexCount/3`、chronicle bonus/penalty（`GameEngine.sol:1173-1186`）；无 storage layout 测试。

**子任务拆分**
1. 定义 `WorldParams`/`DebateParams`/`ChronicleParams` append storage，不改变旧 storage 顺序。
2. 初始化默认值等于当前常量；把内部调用切到 storage 值。
3. 增加 owner-only batch setter + 单项 getter/事件。
4. 补 storage layout 与现有行为回归测试。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_WorldParamsDefaultMatchLegacyConstants -vv` → 期望：默认成本、产量、民心、debate、chronicle 行为与现有测试完全一致。
- [ ] 命令：`cd contracts && forge test --match-test test_OwnerCanRetuneWorldParamsWithoutUpgrade -vv` → 期望：修改 mine cost/ore rate/decay 后，`build`、`harvest`、`currentHappiness` 读到新参数；非 owner setter revert。

#### A2 · `AchievementUnlocked` 主世界成就事件 [SC | `GameEngine.sol` | 依赖 A1 | maps-to roadmap E3.2, US-E5]

**功能点**
- 玩家/用户可见：写圣典、0 格翻盘、声望破阈等主世界成就可触发故事卡/通知。
- 技术交付物：新增 `AchievementUnlocked(uint256 indexed agentId, bytes32 indexed achievementTag, bytes32 contextKey, uint256 entryIdOrValue)` 事件；仅 emit，不加状态位；D3 负责 exactly-once 去重。

**现状 & 缺口**
- 已有：事件列表无成就事件（`GameEngine.sol:139-160`）。
- 已有：capture/raid 成功 emit `HexCaptured`（`:441`、`:688`），neutral claim emit `HexCaptured(agent,hex,0)`（`:554`），rebellion emit `HexRebelled`（`:846`、`:1165`）；chronicle 写入后重算分并 emit（`:982-987`）；world bible 写入 emit（`:1038-1059`）。
- 缺：没有成就 tag，也没有破阈逻辑事件；无测试断言事件只发一次或由 keeper 去重。

**子任务拆分**
1. 定义 tag 常量：`WORLD_BIBLE_AUTHORED`、`RISEN_FROM_ASHES`、`CHRONICLE_THRESHOLD_*` 等。
2. 在 world bible 成功写入后 emit tag。
3. 在 0 hex agent 通过 claim/incite/raid 重新获得 hex 的路径 emit comeback tag。
4. 在 chronicle score 跨阈值时 emit reputation tag；不加持久去重状态。
5. 补事件单测，并在 D3 文档明确 `(agentId, achievementTag)` 幂等。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_AchievementUnlockedWorldBibleAndComeback -vv` → 期望：写圣典和 0 格翻盘均 emit 含正确 `agentId/achievementTag` 的事件。
- [ ] 命令：`cd contracts && forge test --match-test test_AchievementUnlockedChronicleThresholdNoStorageChange -vv` → 期望：声望跨阈 emit，storage layout append 数量为 0（A2 只加事件/逻辑）。

#### A3 · per-agent delegation（条件任务，仅 Auth 选 b） [SC | `AgentRegistry.sol` + gate 调整 | 依赖 Auth 决策 | maps-to 新增]

**功能点**
- 玩家/用户可见：用户能只授权/撤销某个 agent 的 relay 或第三方，不影响其他 agent。
- 技术交付物：append `delegated[agentId][addr]`；新增 `delegate/undelegate/isDelegate`；`canControlAgent` 纳入 per-agent delegate；E3/E1b/E7 使用此路径。

**现状 & 缺口**
- 已有：全局 operator + global mapping（`AgentRegistry.sol:19`、`:24`），`canControlAgent` 只认 operator 或 owner（`:45-48`）。
- 缺：无 per-agent mapping；`ownerAgentIds` 是当前最后的 agent-owner 相关存储锚点（`:29-30`）；无 storage layout 测试。

**子任务拆分**
1. 设计 append storage 和事件 `AgentDelegated/AgentUndelegated`。
2. 只有 `agentOwner[agentId]` 可 delegate/undelegate；全局 owner/operator 不能替用户设置 per-agent delegate，除非另有安全决策。
3. 更新 registry 和 GameEngine/CardLedger/ArenaEngine 对 control 判断的调用方式，避免复制逻辑漂移。
4. 补合约和 MCP/FE ABI 更新请求给 D/F/E。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_AgentOwnerCanDelegateSingleAgentOnly -vv` → 期望：delegate 只控制指定 agent，不能控制同 owner 或其他 owner 的 agent。
- [ ] 命令：`cd contracts && forge test --match-test test_UndelegateRevokesBuildRaidAndArenaControl -vv` → 期望：撤权后 `build`、`raid`、`ArenaEngine.placeCard` 均 revert；旧 owner 直签仍成功。

### Lane B · Arena 合约（ArenaCombat/AbilityLib/CardLedger 单一 owner）

#### B1 · Arena RNG 硬化 [SC | `ArenaEngine.sol` | 依赖无 | maps-to roadmap E0.1]

**功能点**
- 玩家/用户可见：真实价值上来后，匹配和 roll 不再可由出块者/keeper 轻易 grind。
- 技术交付物：替换 `block.prevrandao` seed 来源；候选方案为 VRF 或 commit-reveal；保持 `simulate(seed)` 可复算。

**现状 & 缺口**
- 已有：roll seed 用 `block.prevrandao, agentId, block.timestamp, g.shopSeed`（`ArenaEngine.sol:398-400`）。
- 已有：matchmaking seed 有 TODO 指出 prevrandao 可 grind（`:545-548`）。
- 缺：无 commit/reveal 状态、无 VRF consumer、无 seed finalize 测试。

**子任务拆分**
1. 写一页方案选择（VRF vs commit-reveal）并确认外部依赖。
2. 实现 seed 提交/揭示或 VRF fulfill，限定 seed 可用窗口。
3. 让 `_createMatch`/`roll` 使用 finalized seed；保留 seed 写入 Match，回放仍 deterministic。
4. 补 grind/重复 reveal/超时 fallback 测试。

**验收标准**（方案无关；测试名按所选方案 a=commit-reveal / b=VRF 二选一）
- [ ] 命令：`cd contracts && forge test --match-test test_ArenaRngSeedNotUsableBeforeFinalize -vv`（commit-reveal 命名 `...CannotSettleBeforeReveal`，VRF 命名 `...CannotSettleBeforeFulfill`） → 期望：在 reveal/VRF 回调前不可创建可结算 match seed；同块/可预测来源不可被 grind（同一区块内枚举 seed 不能改变可结算性）。
- [ ] 命令：`cd contracts && forge test --match-test test_ArenaSimulationStillDeterministicAfterRngChange -vv` → 期望：相同 bench + finalized seed 的 `simulate`/`simulateWithTrace` 输出稳定。

#### B2 · Combat trace 输出 AbilityEvent[] [SC | `ArenaCombat.sol`,`AbilityLib.sol` | 依赖无 | maps-to roadmap E4.1, US-E4]

**功能点**
- 玩家/用户可见：战斗回放能展示召唤、buff、伤害、死亡连锁，而不只是普攻。
- 技术交付物：新增 `AbilityEvent` 结构；`simulateWithTrace` 返回 turns + ability events；不改变 `simulate` settlement 结果。

**现状 & 缺口**
- 已有：`Turn` 只记录攻击方/槽位/伤害/死亡（`ArenaCombat.sol:30-36`），`simulateWithTrace` 只返回 `Turn[]` + winner（`:54-67`）。
- 已有：AbilityLib FIFO 队列只存 packed side/slot/trigger（`AbilityLib.sol:74-98`），`processAbility`/`_resolveOne`/`_applyEffect` 是内部/private 逻辑（`:105-190`）；实际效果在 `_applyToUnit`（`:192-264`）与 `dealCombatDamage`（`:270-290`）。
- 缺：无可视化所需 effect/target/delta/summon/death 事件；MCP/FE ABI 也未支持。

**子任务拆分**
1. 定义 `AbilityEvent {step, trigger, effectType, sourceSide, sourceSlot, targetSide, targetSlot, deltaAtk, deltaHp, unitType, died}`。
2. 重构 AbilityLib：保留 settlement pure 路径，给 trace 路径传入 bounded event buffer。
3. 更新 `ArenaCombat.simulateWithTrace` 返回 `(Turn[], AbilityEvent[], winnerAgentId)` 或新增 V2 函数以保持旧 ABI。
4. 补 Wraith summon、Crystalwarden buff、Stormcaller damage、death-chain 顺序测试。
5. 向 D（D9 trace ABI/工具）与 F（F2 store/decode）提 ABI 更新请求。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_SimulateWithTraceEmitsAbilityEventsInOrder -vv` → 期望：Wraith death 后出现 `ON_DEATH -> SUMMON`，事件顺序与回合顺序稳定。
- [ ] 命令：`cd contracts && forge test --match-test test_SimulateWinnerUnchangedByTraceInstrumentation -vv` → 期望：同 seed 的 `simulate` winner 与 trace winner 一致。
- [ ] 命令：`cd contracts && forge build --sizes | rg -i 'ArenaCombat|AbilityLib'` 与 `cd contracts && forge test --gas-report --match-test test_SimulateWithTraceEmitsAbilityEventsInOrder` → 期望：ArenaCombat/AbilityLib 合约 size 仍在 EIP-170 24576 字节上限内；`simulateWithTrace` 的 gas-report 数值作为基线记录在 PR（后续回归不显著上涨）。

#### B3 · CardLedger 叙事元数据与 mintStoryCard [SC | `CardLedger.sol` | 依赖无 | maps-to roadmap E3.1, US-E5]

**功能点**
- 玩家/用户可见：故事卡能展示 variant、edition、originAgent、achievementTag、铸造原因。
- 技术交付物：扩展 `Card` struct；新增 `mintStoryCard(...) onlyOperator`；emit `StoryCardMinted`；二级市场行为不变。

**现状 & 缺口**
- 已有：`Card` 仅 4 字段（`CardLedger.sol:17-22`）；普通 mint 只 emit `CardMinted`（`:75-85`）；二级市场用 `listCard/cancelListing/buyListed`（`:88-138`）。
- 缺：无 variant/edition/origin/mintedReason；无成就 keeper 调用入口；无 story card 专用事件。

**子任务拆分**
1. 设计字段类型，避免动态 string 过多上链；长故事可用 bytes32 tag + URI/hash。
2. Append struct 字段并升级 getter ABI；旧 `getCard` 调用方需可解码。
3. 新增 `mintStoryCard(ownerAgent, unitType, originAgent, achievementTag, variant, edition, reasonHashOrUri)`。
4. emit `StoryCardMinted`，并保持普通 mint/market 事件不变。
5. 回归 CardLedger/ArenaEngine/BenchInvariant 测试。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_MintStoryCardStoresNarrativeMetadata -vv` → 期望：`getCard` 返回 story metadata，事件含 `cardId/ownerAgent/achievementTag`。
- [ ] 命令：`cd contracts && forge test --match-test 'test_buy_listed_transfers_card_and_g|test_card_on_bench_cannot_be_listed' -vv` → 期望：二级市场转移/G 结算不受 metadata 扩展影响。

### Lane C · 预测市场（全新独立合约，注册/授权依赖 Lane P）

#### C1 · PredictionMarket interface 与设计稿 [SC/DOC | 新 interface/design | 依赖无 | maps-to roadmap E1.1, US-D1]

**功能点**
- 玩家/用户可见：市场题目、outcomes、类型、resolveAt、货币、赔率语义被固定，前后端可并行。
- 技术交付物：`IPredictionMarket`/设计稿；v1 currency=ORE，但结构保留 currency 参数；明确 P1/P2 授权需求、`MAX_ORE_POOL` 派彩处理、以及 `bet` 必须自校验 caller 控制权（见子任务 5）。

**现状 & 缺口**
- 已有：roadmap 描述解耦市场（`docs/roadmap.md:123-133`）；demo markets 有 SELF_RESOLVING/ORACLE（`demo/index.html:177-215`）和 rake 逻辑（`:236-244`）。
- 已有：GameEngine debate 注池可参考（`GameEngine.sol:854-880`）。
- 缺：无 interface 文件；无派彩 cap 决策；无事件签名。

**子任务拆分**
1. 定义市场结构、状态机、outcome 编码、currency enum。
2. 定义 self-resolving 条件最小集合：agent owns hex / hexCount / score / ownerId。
3. 定义事件：`MarketCreated`、`BetPlaced`、`MarketResolved`、`MarketRefunded`、`Claimed`（如采用 claim 模式）。
4. 写明 `GameEngine.spendOre/refundOre` 授权前置，向 Lane P 提注册/授权请求。
5. **定义 bet 的 caller 控制权校验语义**：`GameEngine.spendOre/refundOre` 用 `onlyOperatorOrOwner`（`GameEngine.sol:471`、`:482`、`:168-170`），只校验 `msg.sender` 是全局 operator/owner，**不校验 bet 实际控制的是哪个 `agentId`**。一旦 P2 把 `PredictionMarket` `addOperator` 成全局 operator，它就能替任意 agent 花 ore——因此 `bet(agentId, ...)` 必须**自行复刻控制权校验**再调 `spendOre`。注意 `AgentRegistry.canControlAgent` 是一个**入参为 `agentId` 的 modifier**（`AgentRegistry.sol:45-48`：`_isOperator(msg.sender) || msg.sender == agentOwner[agentId]`），**不是**一个传 caller 地址、可外部调用的函数；不能写成 `registry.canControlAgent(msg.sender)`。`AgentRegistry` 可供外部读取的真实接口是：public mapping `agentOwner(uint256)`（`:22`）、`isOperator(address)`（`:69`）、public `operator`（`:19`）、public mapping `operators(address)`（`:24`）。因为市场合约本身就是全局 operator，若直接套用 modifier 语义会因 `_isOperator(market)` 恒真而放行任意 caller——故 `bet` 必须收紧为「**`msg.sender` 是该 `agentId` 的 owner（或在 Auth 路径 b 下是其 per-agent 委托者）**」，即 `require(msg.sender == registry.agentOwner(agentId), ...)`（路径 b 再补 `|| registry.isDelegate(agentId, msg.sender)`），而不是复用「任意全局 operator 即放行」的判断。设计稿须固定该前置。
6. 与 D/E 对齐 MCP 工具入参与前端 UI 所需字段。

**验收标准**
- [ ] 命令：`test -f docs/prediction-market-interface.md && rg -n "currency|SELF_RESOLVING|ORACLE|addOperator|MAX_ORE_POOL|agentOwner" docs/prediction-market-interface.md` → 期望：六类关键决策均有明确段落；其中 bet 控制权校验段落须写明用 `agentOwner(agentId)` 收紧，并说明 `canControlAgent` 是 `agentId`-入参 modifier、不可作为传 caller 的外部函数复用。
- [ ] 命令：`test -f contracts/src/IPredictionMarket.sol && cd contracts && forge build` → 期望：interface 编译通过，未引入部署脚本变更。

#### C2 · 自结算 PredictionMarket 合约 [SC | `PredictionMarket.sol` | 依赖 C1,P1；集成依赖 P2 | maps-to roadmap E1.2, US-D1/D3/D4]

**功能点**
- 玩家/用户可见：可以创建链上事实题、用 ore 下注、到期后任何人触发结算并看到派彩。
- 技术交付物：`createMarket/bet/resolve/getMarket/listMarkets`；self-resolving oracle 读取 GameEngine；permissionless `resolve`；通过 `spendOre/refundOre` 动 ore；`bet` 自校验 caller 对 `agentId` 的控制权。

**现状 & 缺口**
- 已有：`GameEngine.getScore` 可读分数（`GameEngine.sol:494-506`），`hexCount` 为 public，`getHex` 返回 owner（`:513-519`）。
- 已有：`spendOre/refundOre` 需 operator（`:471`、`:482`），未授权会 revert；但 `onlyOperatorOrOwner` 只认 `msg.sender`，**不校验下注控制的是哪个 agent**（`:168-170`）。`AgentRegistry` 侧 `canControlAgent` 是 `agentId`-入参 modifier（`AgentRegistry.sol:45-48`），不可外部传 caller 调用；可外部读取的是 `agentOwner(uint256)`（`:22`）与 `isOperator(address)`（`:69`）。
- 缺：无 `PredictionMarket.sol`；无 Router 槽位/部署授权（P1/P2）；无 market tests；无自行复刻的 bet 控制权校验（须用 `agentOwner(agentId)` 收紧）。

**子任务拆分**
1. 实现 UUPS/Ownable 初始化，持有 `GameEngine`/`AgentRegistry` 地址。
2. 实现 market 创建与 bet：下注前先**自行复刻控制权校验**，要求 `msg.sender` 是该 `agentId` 的 owner——即读 `AgentRegistry` 的 public mapping `agentOwner(agentId)`（`AgentRegistry.sol:22`）并 `require(msg.sender == registry.agentOwner(agentId), ...)`（Auth 路径 b 再追加 `|| registry.isDelegate(agentId, msg.sender)`），通过后再 `spendOre(agentId, amount)`。**不可**写成 `registry.canControlAgent(msg.sender)`：`canControlAgent` 是入参为 `agentId` 的 modifier（`:45-48`）、不是传 caller 的外部函数；且其 `_isOperator` 分支对身为全局 operator 的市场合约恒真，直接复用会放行任意 caller 替他人下注。
3. 实现到期 self-resolve，读链上事实算 winning outcome；`resolve` 不设 onlyOwner/operator。
4. 实现退款/派彩策略，明确 cap：避免 `refundOre` 1000 cap 静默吞收益，或测试中显式断言 cap 行为。
5. 补授权集成测试：未 `addOperator(market)` 时 bet revert，授权后成功。
6. 补控制权测试：非控制者替他人 agent 下注必须 revert。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_SelfResolvingMarketOwnsHexSettlesPermissionlessly -vv` → 期望：任意 caller 到期后 resolve，winning outcome 正确，事件 `MarketResolved` 发出。
- [ ] 命令：`cd contracts && forge test --match-test test_MarketBetRequiresRegistryOperatorAuthorization -vv` → 期望：未授权 market 调 `spendOre` revert；`registry.addOperator(market)` 后下注扣 ore 成功。
- [ ] 命令：`cd contracts && forge test --match-test test_MarketBetRejectsNonControllerBettingForOthersAgent -vv` → 期望：非 owner（既非该 `agentId` 的 `agentOwner` 也非其 per-agent 委托者）替他人 `agentId` 下注 revert，即使 market 已是全局 operator；owner 本人下注成功。

#### C3 · Oracle 市场、过期退款与 rake [SC | `PredictionMarket.sol` | 依赖 C2 | maps-to roadmap E1.3, US-D1]

**功能点**
- 玩家/用户可见：主观市场可由 Oracle 裁定；过期未裁定可退款；Oracle 市场对 losing pool 抽成。
- 技术交付物：ORACLE market type；resolver/oracle agent 配置；10% rake；timeout refund；`MarketRefunded` 事件。

**现状 & 缺口**
- 已有：debate Oracle 由 operator 调 `outcomeOverride`（`GameEngine.sol:811-823`），10% tax 写死（`:862-868`）；demo 对齐 10% rake（`demo/index.html:236-244`）。
- 缺：独立 market 无 Oracle resolver；无过期退款；无 rake 事件/会计测试。

**子任务拆分**
1. 设计 oracle/resolver 角色：owner 设置、market creator 设置或 agent ID 映射。
2. 实现 oracle resolve 权限与超时 refund。
3. 实现 rake 入账目标（oracle agent ore 或 protocol pool）并测试 cap。
4. 更新 C1 docs/D1 tools/E4 UI 字段。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_OracleMarketRakeAndPayoutAccounting -vv` → 期望：losing pool 10% 进入 Oracle，剩余按 winning stake 比例派发。
- [ ] 命令：`cd contracts && forge test --match-test test_OracleMarketTimeoutRefundsAllBettors -vv` → 期望：超过 grace 后任何人可触发 refund，`MarketRefunded` 发出，重复 refund 不可二次领取。

### Lane D · MCP / keeper / telemetry / autopilot

#### D0 · 修 MCP 文案漂移 [MCP | `tools.ts` | 依赖无 | maps-to roadmap E5.5]

**功能点**
- 玩家/用户可见：MCP 输出的民心加成和 chronicle cooldown 与链上一致。
- 技术交付物：`post_to_location` 文案 `+10` 改 `+5`；`write_chronicle` 文案 10-minute 改 5-minute。

**现状 & 缺口**
- 已有：`post_to_location` 返回 `happiness +10`（`mcp-server/src/tools.ts:316`），但合约 `POST_MORALE=5`（`GameEngine.sol:42`）。
- 已有：`write_chronicle` 写 10-minute cooldown（`tools.ts:529-530`），但合约 `CHRONICLE_COOLDOWN=300`（`GameEngine.sol:58`）。
- 缺：无文案一致性测试。

**子任务拆分**
1. 修改两处工具描述/返回文案。
2. 增加轻量文本一致性测试或 `rg` 检查脚本。
3. 跑 MCP build。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：TypeScript 编译通过。
- [ ] 命令：`cd mcp-server && rg -n "happiness \\+10|10-minute cooldown" src/tools.ts` → 期望：无输出，退出码 1；对应文案出现 `+5` 与 `5-minute`。

#### D0b · 修 `chain.ts` GameEngine 事件 ABI [MCP | `chain.ts` | 依赖无 | maps-to 新增，阻塞 D5]

**功能点**
- 玩家/用户可见：遥测和事件监听能正确识别 harvest、capture、rebellion。
- 技术交付物：删不存在 `HexClaimed`；修 `Harvested(uint256,uint256)`；加 `HexCaptured`/`HexRebelled`。

**现状 & 缺口**
- 已有：`chain.ts` 里有不存在的 `HexClaimed`（`mcp-server/src/chain.ts:44`）。
- 已有：`Harvested` ABI 写成 `bytes32 hexKey`（`:47`），真实为 `Harvested(uint256 indexed agentId, uint256 oreGained)`（`GameEngine.sol:142`）。
- 缺：`chain.ts` 未声明真实 `HexCaptured/HexRebelled`（`GameEngine.sol:150-151`）。

**子任务拆分**
1. 更新 `GAME_ENGINE_ABI` 事件签名。
2. 检查 log parse 代码里对 `Harvested` 的 arg 使用（`chain.ts:423`）是否仍正确。
3. 给 D5 telemetry 增加事件源 smoke test。

**验收标准**
- [ ] 命令：`cd mcp-server && rg -n "HexClaimed|Harvested\\(bytes32" src/chain.ts` → 期望：无输出，退出码 1。
- [ ] 命令：`cd mcp-server && npm run build` → 期望：编译通过，`HexCaptured`/`HexRebelled` ABI 字符串存在。

#### D1 · PredictionMarket MCP 工具 [MCP | `tools.ts`,`chain.ts` | 依赖 C1,P3a；e2e 依赖 C2,P2 | maps-to roadmap E1.4, US-D1/D3]

**功能点**
- 玩家/用户可见：LLM agent 可创建市场、下注、查询、触发结算。
- 技术交付物：MCP 工具 `create_market/bet/resolve_market/list_markets/get_market`；`chain.ts` 增 PredictionMarket ABI；地址从 P3a resolver/Router V4 取。

**现状 & 缺口**
- 已有：MCP 工具注册入口 `registerTools`（`tools.ts:10-20`）和 ChainClient ready 解析 Router（`chain.ts:261-281`）。
- 缺：无 PredictionMarket ABI/Contract；无 market 工具；P3a 未提供 market address；未授权 market 时下注会因 `spendOre` revert。

**子任务拆分**
1. 在 `chain.ts` 增 ABI 和 `requirePredictionMarket`。
2. 在 `tools.ts` 注册五个工具，参数与 C1 interface 对齐。
3. 新建/更新 `mcp-server/scripts/e2e-market-tools.mjs`，走 HTTP MCP 客户端调用。
4. 本地 e2e 使用 anvil + P2 授权市场；测试未授权错误文案。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：新增工具和 ABI 编译通过。
- [ ] 命令：`cd mcp-server && node scripts/e2e-market-tools.mjs http://127.0.0.1:3005/mcp` → 期望：`create_market -> bet -> resolve_market -> get_market` 全链路通过；未授权/余额不足时返回可读错误。

#### D1b · Arena shop MCP 工具 roll/freeze/move [MCP | `tools.ts`,`chain.ts`,e2e script | 依赖无 | maps-to demo Shop/Roll]

**功能点**
- 玩家/用户可见：agent 可通过 MCP 真实 roll shop、freeze shop slot、移动 bench。
- 技术交付物：`arena_roll`、`arena_freeze`、`arena_move` 工具；`ARENA_ENGINE_ABI` 增 `roll/freeze/move`；修**两个**旧 e2e 脚本（`e2e-arena-tools.mjs` 与 `e2e-arena-full.mjs`）使其工具名与现工具名一致、交付后无残留坏调用。

**现状 & 缺口**
- 已有：链上 `move/freeze/roll` 已在 `ArenaEngine`（`contracts/src/ArenaEngine.sol:347-403`）。
- 已有：`tools.ts` Arena 工具从 `arena_list_units` 到 `arena_submit`，无三项 shop 工具（`mcp-server/src/tools.ts:610-773`）。
- 已有：旧 `e2e-arena-tools.mjs` 已调用缺失工具 `arena_move/arena_freeze/arena_roll`（`mcp-server/scripts/e2e-arena-tools.mjs:51-58`），还含过时的 `arena_sell`（`:60`，`tools.ts` 无此工具）。
- 已有：`e2e-arena-full.mjs` 同样调用缺失的 `arena_move/arena_freeze/arena_roll`（`mcp-server/scripts/e2e-arena-full.mjs:64-71`），并调用**不存在的过时工具名** `arena_get_g_balance`/`arena_fund_g`（`:78`、`:83`）——`tools.ts` 现工具名是 `arena_deposit_g`（`tools.ts:644`）/`arena_withdraw_g`（`:657`），G 余额读取走 `arena_get_state`（`:620`），无独立 `arena_get_g_balance`/`arena_fund_g`。
- 缺：chain ABI 和 ChainClient method。

**子任务拆分**
1. `chain.ts` ABI 增 `move/freeze/roll`，实现 `arenaMove/arenaFreeze/arenaRoll`。
2. `tools.ts` 注册三个工具，返回 tx hash、冻结态、new seed。
3. 修 `e2e-arena-tools.mjs`：补上新增的 `arena_move/arena_freeze/arena_roll` 调用，移除/更新不存在的 `arena_sell` 和旧参数。
4. 修 `e2e-arena-full.mjs`：同样接通 `arena_move/arena_freeze/arena_roll`，并把过时工具名更新为现工具名——`arena_fund_g` → `arena_deposit_g`（`tools.ts:644`），`arena_get_g_balance` → 用 `arena_get_state`（`tools.ts:620`）读 G 余额（或 `arena_withdraw_g`，`:657`，按脚本语义选其一）。
5. 跑本地 anvil MCP e2e，确保两个脚本都无残留坏调用。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：ABI/method/tool 编译通过。
- [ ] 命令：`cd mcp-server && rg -n "arena_sell|arena_get_g_balance|arena_fund_g" scripts/e2e-arena-tools.mjs scripts/e2e-arena-full.mjs` → 期望：无输出、退出码 1（两个脚本已无过时/不存在工具名）。
- [ ] 命令：`cd mcp-server && node scripts/e2e-arena-tools.mjs http://127.0.0.1:3005/mcp` → 期望：`arena_move` 显示 swapped，`arena_freeze` 显示 frozen/unfrozen，`arena_roll` 扣 1 G 并返回新 seed。
- [ ] 命令：`cd mcp-server && node scripts/e2e-arena-full.mjs http://127.0.0.1:3005/mcp` → 期望：`arena_move/arena_freeze/arena_roll` 与 `arena_deposit_g` 全链路通过，G 余额经 `arena_get_state` 可读，无 unknown-tool 报错。

#### D2 · 市场结算 keeper [INFRA | `keeper-market.mjs` | 依赖 C2,P3a | maps-to roadmap E1.6, US-D4]

**功能点**
- 玩家/用户可见：到期自结算市场无需人工点击，会自动开奖。
- 技术交付物：新 `mcp-server/scripts/keeper-market.mjs`；读取 P3a resolver；扫描到期 market；调用 permissionless `resolve`；ONCE 和 loop 两种模式。

**现状 & 缺口**
- 已有：Arena keeper 模式可参考：env 配置、ONCE、tick、Router 解析、permissionless 调用（`mcp-server/scripts/keeper.mjs:15-33`、`:152-168`）。
- 缺：无 market keeper；无 list due markets API（D1/C2 需提供）；无 `just keeper-market-*` recipe。

**子任务拆分**
1. 实现 keeper-market env：`NETWORK/RPC_URL/ROUTER_ADDRESS/KEEPER_KEY/TICK_SECONDS/ONCE`。
2. 调 D1/C2 提供的 due market 读取接口，逐个 `resolve`。
3. 处理已结算/未到期/resolve revert 的日志与重试。
4. 增加 justfile recipe 和 README。

**验收标准**
- [ ] 命令：`cd mcp-server && NETWORK=localhost KEEPER_KEY=0xac0974... ONCE=1 node scripts/keeper-market.mjs` → 期望：到期 SELF_RESOLVING market 在一 tick 内 resolved，日志含 marketId 和 tx hash。
- [ ] 命令：`cd mcp-server && node scripts/e2e-market-keeper.mjs` → 期望：创建短到期市场、下注、等待/warp、keeper ONCE、`get_market` 返回 `resolved=true` 且派彩/退款可观测。

#### D3 · 成就铸卡 keeper（exactly-once） [INFRA | `keeper-achievement.mjs` | 依赖 A2,B3,P4 | maps-to roadmap E3.3, US-E5]

**功能点**
- 玩家/用户可见：达成成就后自动得到故事卡，重复事件不重复铸。
- 技术交付物：监听 `AchievementUnlocked`；按 `(agentId, achievementTag)` 持久去重；调用 `mintStoryCard`；支持重启恢复。

**现状 & 缺口**
- 已有：无 `AchievementUnlocked`（A2 补）；无 `mintStoryCard`（B3 补）。
- 已有：`CardLedger.onlyOperator` 需要 P4 授权（`CardLedger.sol:61-63`）。
- 缺：无 keeper-achievement；无 seen-set 存储；无撤权测试。

**子任务拆分**
1. 设计 seen-set 存储（json/sqlite/kv），key=`chainId:agentId:achievementTag`。
2. 实现事件扫描 + live polling；支持 `FROM_BLOCK`/`ONCE`。
3. 调 `mintStoryCard`，记录 tx hash 和失败重试策略。
4. 写 e2e：重启 keeper 或重复扫描不二次 mint。

**验收标准**
- [ ] 命令：`cd mcp-server && NETWORK=localhost KEEPER_KEY=0x... ONCE=1 node scripts/keeper-achievement.mjs` → 期望：监听到 A2 事件后铸出一张带 B3 metadata 的故事卡。
- [ ] 命令：`cd mcp-server && node scripts/e2e-achievement-keeper.mjs --replay` → 期望：重复扫描同一区块/重启 keeper 后卡数不变；`removeOperator(keeper)` 后铸卡失败并有明确日志。

#### D4 · MCP 背包返回卡元数据 [MCP | `tools.ts`,`chain.ts` | 依赖 B3 | maps-to roadmap E3.4, US-E5]

**功能点**
- 玩家/用户可见：LLM agent/MCP 客户端能读卡的来历和故事标签。
- 技术交付物：CardLedger ABI decode B3 字段；`arena_list_inventory`/`arena_list_market`/`arena_get_card` 返回 metadata。

**现状 & 缺口**
- 已有：`arenaListInventory` 只 decode base card + onBench/listed（`mcp-server/src/chain.ts:920-934`）；`decodeCard` 当前按旧 4-字段 struct（`chain.ts:793-806`）。
- 已有：tools 暴露 inventory/market/listing（`tools.ts:697-748`），`arena_get_card` 已存在（`tools.ts:954`、chain `arenaGetCard` 在 `chain.ts:1064`）。
- 缺：无 story fields；前端 F5 走 direct RPC，不依赖 D4。

**子任务拆分**
1. 更新 `CARD_LEDGER_ABI.getCard` tuple（`chain.ts:166-167`）。
2. 更新 `decodeCard`（`chain.ts:793`）与 `arenaGetCard`（`chain.ts:1064`），保留旧合约 fallback。
3. **扩展既有** `arena_get_card`（`tools.ts:954`）返回 metadata，并补 inventory/market metadata 输出。
4. 补 e2e 覆盖普通卡 metadata 为空、故事卡非空。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：新 tuple 类型编译通过，旧字段调用不报错。
- [ ] 命令：`cd mcp-server && node scripts/e2e-arena-card-flow.mjs` → 期望：`arena_list_inventory` 返回 `variant/edition/originAgent/achievementTag/mintedReason`，普通卡字段为空但结构存在。

#### D5 · 链上遥测与健康指标 [INFRA | `telemetry/` | 依赖 D0b | maps-to roadmap E2.2]

**功能点**
- 玩家/用户可见：运营能看到策略分布、财富集中、复活率、领地周转，支撑调参。
- 技术交付物：事件扫描脚本/CSV/dashboard；指标公式写清；读取修正后的事件 ABI。

**现状 & 缺口**
- 已有：GameEngine 真实事件源：`AttackResult`、`HexCaptured`、`HexRebelled`、`DebateResolved`、`Harvested`（`GameEngine.sol:142-155`）。
- 缺：`chain.ts` 事件 ABI 未修前无法稳定解析（D0b）；无 telemetry 目录；无指标输出。

**子任务拆分**
1. 新建 `telemetry/`，实现 event backfill：block range + RPC + router。
2. 计算：基尼、复活率、captures/hour、ore harvested/hour、attack success rate。
3. 输出 CSV 和可选 HTML/dashboard。
4. 加 sample fixture 或 local chain smoke。

**验收标准**
- [ ] 命令：`cd telemetry && NETWORK=localhost node collect.mjs --from-block 0 --to-block latest --out out.csv` → 期望：生成列 `metric,window,value,computedAt`，至少含 `ore_gini,captures_per_hour,revival_rate`。
- [ ] 命令：`cd telemetry && node test/formulas.test.mjs` → 期望：固定 fixture 的基尼/复活率/领地周转结果与手算值一致。

#### D6 · autopilot 计费/gas/operator-relay 决策稿 [DOC/INFRA | 决策文档 | 依赖无 | maps-to roadmap E7.1]

**功能点**
- 玩家/用户可见：后续 onboarding 和 autopilot 不再基于错误授权假设。
- 技术交付物：一页决策稿，覆盖 LLM 计费、gas payer、relay 风控、Auth 选 (a)/(b)、后端 owner。

**现状 & 缺口**
- 已有：roadmap 认为 operator-relay 是关键（`docs/roadmap.md:62-63`、`:79-83`），但也有“用户可收回 operator”的 false premise（`:36-38`、`:264-266`）。
- 已有：代码事实是全局 operator，无 per-agent delegation（`AgentRegistry.sol:19-24`、`:66-69`）。
- 缺：relay endpoint 落点未定；免费档/限流/计费未定。

**子任务拆分**
1. 写 `docs/autopilot-relay-decision.md`，列 (a)/(b) 取舍。
2. 明确 relay 后端目录归属：mcp-server(D) 或新服务(E/INFRA)，并同步 §2.1。
3. 明确用户级暂停与平台级撤权的差别。
4. 评审通过后更新 E1b/E3/E7/D7 DoD。

**验收标准**
- [ ] 命令：`test -f docs/autopilot-relay-decision.md && rg -n "per-agent|global operator|rate limit|gas payer|owner" docs/autopilot-relay-decision.md` → 期望：关键决策全部出现。
- [ ] 命令：`rg -n "用户.*addOperator|owner→operator 委托开关\\（开/关 autopilot；可收回\\）" docs` → 期望：旧 false premise 已被修正或标注为不成立。

#### D7 · agent-runner 多租户化 [INFRA | `agent-runner/*` | 依赖 D6,Auth 决策 | maps-to roadmap E7.2, US-C1/C2]

**功能点**
- 玩家/用户可见：新创建的用户 agent 能进入 autopilot，不需要手改 `accounts.json` 或重启全部 runner。
- 技术交付物：动态加载 tenant agent；per-tenant heartbeat/配额；目标更新；暂停/恢复；隔离 MCP signer/relay。

**现状 & 缺口**
- 已有：启动时加载 accounts，一次性 start enabled（`agent-runner/src/index.ts:10-25`、`orchestrator.ts:76-83`）；heartbeat 来自 account 或全局 config（`role-runner.ts:63-109`）。
- 已有：固定 26 accounts，25 个 5s、Oracle 60s（`agent-runner/accounts.json:13-14`、`:349-367`）。
- 缺：无动态注册；无 tenant store；无 per-user limit；无目标 API。

**子任务拆分**
1. 设计 tenant registry（文件/DB/API），字段含 owner、agentId、enabled、heartbeat、quota、goal。
2. Orchestrator 支持 add/update/remove runner，不重启主进程。
3. RoleRunner 支持外部 goal 更新和暂停 flag。
4. 加并发/隔离测试，防止 tenant 串 MCP credentials。
5. 新建 `agent-runner/scripts/e2e-multitenant-runner.mjs`（当前 `agent-runner/` 无 `scripts/` 目录），并在 `agent-runner/package.json` 加对应 script（如 `"e2e:multitenant"`），使验收命令自洽。

**验收标准**
- [ ] 命令：`cd agent-runner && npm run build` → 期望：多租户类型与 orchestrator 编译通过。
- [ ] 命令：`cd agent-runner && node scripts/e2e-multitenant-runner.mjs --agents 3 --duration 60`（需先按子任务 5 新建该脚本） → 期望：3 个动态 agent 各完成至少 1 cycle；暂停其中 1 个后只停该 tenant，其余继续。

#### D8 · gas/LLM 计量与配额 [INFRA | `agent-runner/*`,keeper/relay | 依赖 D6,D7 | maps-to roadmap E7.4]

**功能点**
- 玩家/用户可见：超额停跑、充值续跑、免费档限流明确可解释。
- 技术交付物：记录 LLM token/gas/tx 次数；quota enforcement；超额状态暴露给 E7/E8。

**现状 & 缺口**
- 已有：RoleRunner 有 max rounds/history/context 参数（`agent-runner/src/role-runner.ts:94`、`:325`），但不是计费系统。
- 缺：无 token/gas 计量、无 user quota、无充值联动、无超额停跑状态。

**子任务拆分**
1. 定义 usage ledger：tenant、cycle、tool calls、estimated tokens、tx hashes、gas used。
2. 在 runner/relay/keeper 写 usage 事件。
3. 实现 quota check，超额禁用 autopilot 但保留用户自签动作。
4. 对接 E8 通知和 E7 状态。
5. 新建 `agent-runner/scripts/e2e-quota.mjs`（`agent-runner/scripts/` 由 D7 子任务 5 新建）并在 `agent-runner/package.json` 加对应 script（如 `"e2e:quota"`），使验收命令自洽。

**验收标准**
- [ ] 命令：`cd agent-runner && node scripts/e2e-quota.mjs --quota-cycles 1`（需先按子任务 5 新建该脚本） → 期望：第 1 cycle 后 usage 递增，第 2 cycle 被拒并输出 `quota_exceeded`。
- [ ] 命令：`cd agent-runner && rg -n "gasUsed|token|quota_exceeded|tenantId" src scripts` → 期望：runner/relay 计量路径和超额事件均有实现。

#### D9 · MCP 暴露 trace/AbilityEvent ABI 与 simulate-with-trace 工具 [MCP | `tools.ts`,`chain.ts` | 依赖 B2,D1b | maps-to 新增，阻塞 F2/F3]

**功能点**
- 玩家/用户可见：LLM agent/MCP 客户端能读到含能力事件（summon/buff/damage/death-chain）的对局 trace，而不只是普攻 turn。
- 技术交付物：`chain.ts` 的 `ARENA_ENGINE_ABI`（含 `simulateMatch`，`chain.ts:114`、`:136`）simulate 解码升级到 B2 的 `(Turn[], AbilityEvent[], winnerAgentId)`；新增/扩展 MCP 工具暴露 trace（如 `arena_simulate_with_trace`）；保留旧 `Turn[]` 解码兼容旧合约。

**现状 & 缺口**
- 已有：`chain.ts` 的 `simulateMatch` ABI 仍是旧 `Turn[]` 普攻签名（`mcp-server/src/chain.ts:136`），decode 在 `:995`，无 `AbilityEvent`。
- 已有：B2 将让 `ArenaCombat.simulateWithTrace` 返回 `AbilityEvent[]`（B2 子任务 1-3）。
- 缺：MCP 侧无 `AbilityEvent` ABI/decode；无暴露 trace 的工具；F2/F3 没有 MCP 侧 trace 来源（F2 走 direct RPC 也需对齐同一 ABI tuple）。
- 注意：旧 `e2e-arena-tools.mjs` 当前会先调用尚不存在的 `arena_move/arena_freeze/arena_roll`（`mcp-server/scripts/e2e-arena-tools.mjs:51-58`）而中途失败，故 D9 验收不能直接依赖该脚本现状；本任务依赖 D1b（D1b 补齐这三个工具并修复脚本），且 D9 自带 trace 断言（见子任务 4 / 验收）。

**子任务拆分**
1. 在 `chain.ts` 增 `AbilityEvent` tuple 与 simulate-with-trace ABI/method，保留旧 `Turn[]` fallback。
2. 在 `tools.ts` 新增/扩展工具返回 turns + ability events + winner。
3. 与 F2/F3 对齐 tuple 字段名（`step/trigger/effectType/sourceSide/...`），避免前后端 decode 漂移。
4. 新建 `mcp-server/scripts/e2e-arena-trace.mjs`（不复用尚需 D1b 修复的旧脚本），构造含 Wraith summon/death-chain 的对局，调 simulate-with-trace 工具，**断言** trace 含 `ON_DEATH`→`SUMMON` 等 ability events 且顺序稳定；旧合约无事件时退回普攻 turns 不崩。在 `mcp-server/package.json` 加对应 script（如 `"e2e:arena-trace"`）使验收自洽。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：新 `AbilityEvent` ABI/tuple 与工具编译通过，旧 `Turn[]` decode 仍可用。
- [ ] 命令：`cd mcp-server && node scripts/e2e-arena-trace.mjs http://127.0.0.1:3005/mcp`（本任务子任务 4 新建；不依赖尚需 D1b 修复的 `e2e-arena-tools.mjs`） → 期望：simulate-with-trace 工具返回含 `ON_DEATH`→`SUMMON` 等 ability events 的 trace，脚本对事件存在与顺序做断言（缺失/乱序则非零退出）；旧合约无事件时退回普攻 turns 不崩。

### Lane E · 前端写链路 + 真人 UI（新子树，不碰既有只读 hook/页面）

#### E1 · 钱包连接与写链路基座 [FE | wallet 新子树 | 依赖无 | maps-to roadmap E6.1, US-A4/B1]

**功能点**
- 玩家/用户可见：用户能登录/连接钱包，并看到真实交易 pending/confirmed/failed 三态。
- 技术交付物：新增 wallet provider/hooks/lib/components；支持嵌入式钱包或外部钱包；write client 可调 `build`/`raid` 等受控动作；链错/未连接错误态。

**现状 & 缺口**
- 已有：前端依赖只有 `ethers` 等只读栈（`frontend/package.json:11-19`）；hook 使用 `JsonRpcProvider` 无 signer（`useGameEngine.ts:92-115`、`useArenaEngine.ts:154-158`）。
- 缺：无 wagmi/viem/Privy/RainbowKit/sendTransaction；无 tx 状态组件；无 wallet 子树。

**子任务拆分**
1. 选 wallet provider 并增加依赖/Provider。
2. 新建 `useWalletAccount/useTxState/writeContract` 基础 API。
3. 实现 `TxButton`/`TxStatus`，统一 pending/confirmed/failed。
4. 用 `build` 或 `raid` 做最小真实写入验收；不以 `harvest` 作为授权验收。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：wallet provider 和写链 hooks 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：在 `http://127.0.0.1:3000/onboard` 或测试页连接钱包后，点击受控 `build`/`raid` demo 按钮可看到 pending→confirmed；断网/链错显示 failed/error。

#### E1b-a · operator-relay skeleton [FE（前端 client）/INFRA（后端归 D6 owner） | `lib/wallet/relay-client` + relay 后端骨架 | 依赖无 | maps-to roadmap E7.1/E7.2]

> **文件域**：E 只拥有前端侧 `frontend/src/lib/wallet/relay-client`。`POST /relay` 后端 + auth/限流中间件落点是 D6 决策门：定下前不在任何未授权文件域（如 `mcp-server/src/http.ts` 当前只有 `/mcp` handler，`mcp-server/src/http.ts:46-48`）里直接建后端；定下后该后端归单一 owner（放 `mcp-server` 则归 D，独立服务则归该服务 owner）。E1b-a 阶段先交付前端 client + 接口形状，后端 stub 由该 owner 实现。

**功能点**
- 玩家/用户可见：暂无真实代发，但前端和后端接口形状稳定。
- 技术交付物：`lib/wallet/relay-client`（E 拥有）、relay endpoint skeleton 与鉴权/限流中间件挂载点（由 D6 拍板的后端 owner 拥有）、stub response。

**现状 & 缺口**
- 已有：`mcp-server/src/http.ts` 有 HTTP 服务范式，但只暴露 `/mcp` handler，无 `/relay`（`mcp-server/src/http.ts:46-48`、`:78`）。
- 缺：relay 后端目录/owner 未定（D6/§7）；无 client API；无鉴权/限流骨架。

**子任务拆分**
1. 根据 D6 前的临时约定创建 relay client interface（`lib/wallet/relay-client`，E 拥有），不绑定具体 signer。
2. 待 D6 拍板后端 owner 后，由该 owner 在其文件域建 stub endpoint：`POST /relay` 返回 deterministic stub tx id；E 阶段先 mock 该响应。
3. 后端 owner 挂载 auth/rate-limit placeholder。
4. 写前端单元或 smoke，确保 E2/E3 可先接桩。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：relay client 类型可被 E2/E3 import，未实现真实 signer 不阻塞构建。
- [ ] 命令（后端 owner 落点定下并实现 stub 后）：`curl -sS -X POST <relay-base>/relay -H 'content-type: application/json' -d '{"action":"stub"}'` → 期望：返回 JSON `{status:"stub"}` 或明确 501，且 auth/rate-limit middleware 日志可见。

#### E1b-b · operator-relay 真实代发 [FE（前端 client）/INFRA（后端归 D6 owner） | `relay-client` + relay 后端 endpoint | 依赖 D6,Auth 决策,P5 | maps-to roadmap E7.1/E7.2]

> **文件域**：relay 后端 endpoint/中间件归 D6 拍板的单一 owner（放 `mcp-server` 则归 D，独立服务则归该服务 owner）；E 只拥有前端 `relay-client`。下方验收命令的 `npm run test:e2e:relay` 在当前 `mcp-server/package.json` scripts 不存在（只有 `build/start/dev/http`），需作为本任务子任务新建该 script + e2e 脚本文件，落在后端 owner 的包里。

**功能点**
- 玩家/用户可见：gasless create/build/raid 等动作由平台代发；用户暂停后 relay 拒发。
- 技术交付物：relay signer、签名/会话鉴权、限流、用户级 off-chain flag、平台级撤权检查、e2e relay 测试脚本 + npm script。

**现状 & 缺口**
- 已有：默认 (a) 只能通过全局 operator 代发；`build`/`raid` 是授权验收动作（`GameEngine.sol:345`、`:624`）。
- 缺：relay 后端 owner/落点未定（D6）；无 relay signer 授权（P5）；无用户级 off-chain flag；无 429/401/403 行为；无 `test:e2e:relay` script（`mcp-server/package.json:12-19` 只有 `build/start/dev/http`）与 e2e 脚本文件。

**子任务拆分**
1. 接入 D6 决策的后端落点和鉴权模型；relay 后端只在该 owner 文件域内实现。
2. 实现 relay action allowlist，禁止任意 calldata。
3. 对受控动作执行前检查用户 agent ownership/off-chain enabled flag/quota。
4. 实现限流和撤权：用户 flag 拒发；平台 `removeOperator` 后链上 revert。
5. 新建 relay e2e 脚本（如后端落 `mcp-server` 则 `mcp-server/scripts/e2e-relay.mjs`），并在对应 `package.json` 加 `"test:e2e:relay"` script 指向它，使下方验收命令可跑。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run test:e2e:relay -- --grep relay-build`（需先按子任务 5 新建该 script + 脚本文件） → 期望：授权 relay signer 代发 `build` 成功；撤销全局 operator 后同请求链上 revert。
- [ ] 命令：`cd mcp-server && npm run test:e2e:relay -- --grep relay-rate-limit`（同上） → 期望：并发 20 请求命中 429；用户暂停 flag 后返回 401/403 且不发链上交易。

#### E2 · Agent 创建 / onboarding 流 [FE/MCP | `app/onboard/*` | 依赖 E1；gasless 依赖 E1b-b | maps-to roadmap E6.2, US-B1]

**功能点**
- 玩家/用户可见：4 步 onboarding：登录、定义 agent、确认、成功进入 `/me`，真实创建 7 格 + 200 ore。
- 技术交付物：`/onboard` 路由；调用 `GameEngine.createAgent` 或 relay；重复访问已有 agent 显示去 dashboard。

**现状 & 缺口**
- 已有：demo onboarding 4 步写在 `docs/demo-user-stories.md:122-127`，真实代码无 `/onboard`（`frontend/src/app` 仅 `/` 与 `/arena`）。
- 已有：合约 `createAgent` 自动 7 格 + 200 ore（`GameEngine.sol:232-264`）。
- 缺：真实 FE 路由、表单、tx 状态、错误态。

**子任务拆分**
1. 新建 `frontend/src/app/onboard/page.tsx` 和 step components。
2. 接 E1 wallet 与 E1b relay，支持自签/代发两种模式。
3. 创建成功后回读 `get_my_agents`/链上 agent owner，跳 `/me`。
4. 处理 duplicate name、tx failed、链错、已有 agent。
5. **新建 `frontend/scripts/i18n-key-diff.mjs`**（i18n 完整性校验脚本的共用落点放在 E2，作为最早消费 i18n 的写链路任务）：加载 `frontend/src/i18n` 的 zh/en keyset，对称差集非空则非零退出。原因：缺键只在 dev `console.warn`（`frontend/src/i18n/index.ts:46-49`），生产 build 不失败，必须靠脚本观测。E9 直接复用该脚本，不重复新建。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：`/onboard` 编译通过。
- [ ] 命令：`cd frontend && node scripts/i18n-key-diff.mjs`（脚本由本任务子任务 5 新建、E9 复用；比对 zh/en keyset，缺键非零退出；生产 build 不会报缺键，故 i18n 完整性单独校验） → 期望：`/onboard` 新增 key 在 zh/en 两侧齐全，退出码 0。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：375x812 视口打开 `/onboard`，4 步可前进/后退；点击 Spawn 显示 pending→confirmed，成功页展示 `CLAIMED 7 hexes` 和 `STARTING ORE 200`。

#### E3 · Autopilot 开关语义与 UI [FE | `components/wallet/AutopilotToggle` | 依赖 E1,Auth 决策；b 依赖 A3 | maps-to roadmap E6.3, US-C2]

**功能点**
- 玩家/用户可见：用户可开启/暂停 agent autopilot，并清楚知道这是平台代发/AI 执行状态。
- 技术交付物：(a) off-chain flag UI + relay/runner 同步；(b) per-agent delegate tx UI。

**现状 & 缺口**
- 已有：demo `/me` AUTOPILOT 区块（`demo/index.html:1310-1337`）。
- 缺：真实 `/me` 不存在；当前合约无用户级 `addOperator/removeOperator`（`AgentRegistry.sol:67-68`，owner-only）；无 off-chain flag API。

**子任务拆分**
1. 在 D6/Auth 决策后固定 UI 文案：默认 (a) 不声称链上用户撤权。
2. 实现 toggle：读取/写入 autopilot flag；同步 relay/runner 状态。
3. 如果走 (b)，接 `delegate/undelegate` tx 三态。
4. 与 E7 手动动作禁用态联动。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：AutopilotToggle 编译通过，未 import A3 ABI 除非 Auth 选 (b)。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/me` 375x812 下 toggle 可点；(a) 切换后 UI/relay flag 变更且无链上 `addOperator` 文案；(b) 显示 tx pending/confirmed/failed。

#### E4 · 预测市场前端 UX [FE | `app/markets/*` | 依赖 E1,D1,C2；Oracle 依赖 C3 | maps-to roadmap E6.4, US-D1-D4]

**功能点**
- 玩家/用户可见：浏览市场、看详情、下注、看持仓、开奖凭证；SELF_RESOLVING 与 ORACLE 两型。
- 技术交付物：`/markets`、`/markets/[id]`；下注弹层；positions；settlement receipt；tx 三态。

**现状 & 缺口**
- 已有：demo markets 入口和体验（`demo/index.html:1711-2000`）；user stories D1-D4（`docs/demo-user-stories.md:182-208`）。
- 缺：真实 `/markets` 不存在；D1/C2/P2 前置未完成；无 wallet write path。

**子任务拆分**
1. 新建 markets routes 与 read client，接 D1 或 direct RPC（由 E/D 决策）。
2. 实现 market card/list/detail，显示 pools、odds、resolveAt、AI brief/context。
3. 实现 bet modal：金额校验、parimutuel 预估、tx 三态、未登录跳 onboarding。
4. 实现 positions 和 settlement receipt。
5. Oracle slice 在 C3 后启用。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：`/markets` 与 `/markets/[id]` 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：桌面 1440x900 打开 `/markets`，点击市场卡进详情；下注按钮显示 pending→confirmed；余额不足/未登录/市场已结算有明确错误态；`/markets/[id]` 结算后显示链上 fact receipt。

#### E5 · 卡牌画廊与二级市场 UI [FE | `app/arena/market/*`,wallet components | 依赖 E1,E6；provenance 依赖 B3/F5 | maps-to roadmap E6.5, US-E3/E5]

**功能点**
- 玩家/用户可见：浏览/买/卖/取消卡牌挂单，查看故事卡 provenance。
- 技术交付物：新 `app/arena/market/*` 子路由；list/buy/cancel tx 三态；G 不足错误态；不改 F 的 `/arena/page.tsx`。

**现状 & 缺口**
- 已有：CardLedger 二级市场合约可用（`CardLedger.sol:88-138`）；MCP listing 工具已存在（`tools.ts:721-748`）。
- 已有：真实 Arena `InventoryPanel` 只读 source tx（`frontend/src/components/arena/InventoryPanel.tsx:12-16`、`:47-100`）。
- 缺：人类卡市 UI 不存在；`app/arena/market` 不存在；provenance metadata 缺 B3/F5。

**子任务拆分**
1. 新建卡市路由和 cards/listings read model。
2. 实现 buy/list/cancel 三个动作，接 E1 wallet tx state。
3. 显示 G balance 与不足错误。卡市入口链接由 F 在其独占的 `app/arena/page.tsx` 加（见 F5 子任务 5），E 不改该文件；E 侧只在自己拥有的 `app/arena/market/*` 子壳内做内部导航/返回链接。
4. 在 F5 metadata 可用后展示 story fields。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：`/arena/market` 编译通过，未修改 `frontend/src/app/arena/page.tsx`。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena/market` 1440x900 下可 list/buy/cancel，按钮有 pending/confirmed/failed；G 不足显示错误且不发交易。

#### E6 · G 充值与余额展示 [FE（MCP 工具已就绪，仅缺前端写链 UI）| wallet DepositG | 依赖 E1 | maps-to roadmap E6.6, US-E1]

**功能点**
- 玩家/用户可见：能向 agent 充值 G，看到 G/ore 余额和 G 模式说明。
- 技术交付物：`DepositG` 组件；调用 `GTreasury.depositG` payable；读 `gBalance`/`orePool`；tx 三态。

**现状 & 缺口**
- 已有：MCP `arena_deposit_g`/`arena_withdraw_g`（`tools.ts:644-665`）；chain method `arenaDepositG`（`chain.ts:841-847`）。
- 缺：前端无钱包 signer/payable UI；demo deposit 是本地加数（`demo/index.html:2060`）。

**子任务拆分**
1. 新建 DepositG component，支持 +20/+100/+1000 和自定义。
2. 用 signer 发 payable tx；处理 withdraw/faucet 模式说明。
3. 回读余额，更新 `/me` 和 `/arena/market` 展示。
4. 错误态：非 owner、withdraw disabled、余额/链错。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：DepositG 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/me` 或 `/arena/market` 375x812 下点击 `+20 G` 显示 pending→confirmed，G balance 增加；失败时显示 revert reason。

#### E7 · 喂目标 / 接管 / 暂停控制面 [FE/MCP | `AgentControls` | 依赖 E3,D7,E1b-b/P5 | maps-to roadmap E7.3, US-C2/C3]

**功能点**
- 玩家/用户可见：用户能设置高层目标、暂停 autopilot、手动接管一回合。
- 技术交付物：goal input、quick actions、manual action tx state；接 D7 runner goal API 和 relay。

**现状 & 缺口**
- 已有：demo `SET GOAL / STRATEGY` 与 `QUICK ACTIONS`（`demo/index.html:1337-1365`），autopilot 开时禁用手动动作（`docs/demo-user-stories.md:154-170`）。
- 缺：真实 `/me`、runner goal API、relay 实现、状态联动。

**子任务拆分**
1. 实现 Goal input，调用 D7 API 写 tenant goal。
2. 实现 quick actions：harvest/build/raid/bet link；受 autopilot flag 控制。
3. 手动动作走 self-sign 或 relay allowlist；展示 tx 三态。
4. AgentMind/F9 记录 owner goal 更新。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：AgentControls 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/me` 1440x900 下 push goal 后 D7 runner goal 可查；autopilot ON 时手动 `Build/Raid` 禁用，OFF 后按钮可发 tx 并有三态。

#### E8 · 通知中心 [FE/INFRA | `Notifications` | 依赖 C2,C3,B3,CardLedger events | maps-to roadmap E6.7]

**功能点**
- 玩家/用户可见：市场结算/退款、被买单、成就铸卡、派彩到账有 toast 和通知列表。
- 技术交付物：事件源清单；订阅/轮询；toast + persistent list；点击跳转。

**现状 & 缺口**
- 已有：CardLedger 买卖事件（`CardLedger.sol:44-47`）；Arena hook 已有事件扫描模式（`useArenaEngine.ts:73-105`）。
- 缺：C2/C3/B3 命名事件尚未存在；无通知组件；无 wallet user filter。

**子任务拆分**
1. 定义事件源清单：`MarketResolved`、`MarketRefunded`、`StoryCardMinted`、`ListedCardBought`。
2. 实现按用户 agent/card/position 过滤。
3. toast + list + read/unread 状态。
4. 点击跳转 `/markets/[id]` 或 `/arena/market/card/[id]`。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：Notifications 编译通过，事件源注释存在。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：触发 market resolve/story mint/listed buy 后 toast 出现；通知点击跳到对应详情页。

#### E9 · 移动端响应式与 i18n 收口 [FE | E 新路由 + i18n | 依赖 E2-E8 | maps-to roadmap E6.9]

**功能点**
- 玩家/用户可见：核心新路由在手机上可完整使用，中文/英文无缺键。
- 技术交付物：`/onboard`、`/markets`、`/me`、`/arena/market` 响应式；i18n keys。

**现状 & 缺口**
- 已有：项目有 i18n store/files（`frontend/src/i18n`），但 E 新路由不存在。
- 缺：新写链页面移动布局、长文案溢出检查、i18n keys。

**子任务拆分**
1. 为 E2-E8 新组件补 i18n keys。
2. 审查 375x812、390x844、768x1024、1440x900。
3. 修按钮/卡片文字溢出、横向滚动、弹层高度。
4. 补移动验收截图或 QA checklist。
5. 复用 E2 子任务 5 新建的 `frontend/scripts/i18n-key-diff.mjs`（加载 `frontend/src/i18n` 的 zh/en keyset，对称差集非空则非零退出；缺键只在 dev `console.warn`（`frontend/src/i18n/index.ts:46-49`），生产 build 不失败，必须靠脚本观测）；E9 不重复新建，只在此做 E2-E8 全量收口校验（若因 lane 顺序该脚本尚未由 E2 落地，则在此补建）。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：无 i18n import/build 错误（注意：build 不会因缺键失败）。
- [ ] 命令：`cd frontend && node scripts/i18n-key-diff.mjs` → 期望：zh/en keyset 对称差集为空，退出码 0；故意删一个 key 后退出码非零并打印缺失 key 列表。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：375x812 视口访问 `/onboard`、`/markets`、`/me`、`/arena/market`，无横向滚动，关键按钮可点击，弹层可关闭。

### Lane F · 前端只读可视化 + 账本/Lore 页

#### F1 · 删除死代码 `frontend/src/chain/*` [FE | `frontend/src/chain` | 依赖无 | maps-to roadmap E5.6]

**功能点**
- 玩家/用户可见：无直接功能变化，减少维护误导。
- 技术交付物：删除 dead `chain` 子树或迁移仍有价值的 ABI；构建不受影响。

**现状 & 缺口**
- 已有：`frontend/src/chain/abis.ts` 等五文件存在（`frontend/src/chain/abis.ts:1-56`、`contracts.ts:1-31`、`events.ts:1-80`、`index.ts:1-4`、`sync.ts:1-80`）。
- 已有：真实页面直接在 hooks 内部建 Contract（`useGameEngine.ts:92-115`、`useArenaEngine.ts:171-218`）。
- 缺：`rg "from .*chain|@/chain"` 无引用；`frontend/src/chain/contracts.ts:21-22` 仍按旧 5-return Router 解码，已过时。

**子任务拆分**
1. 再跑 `rg` 确认无引用。
2. 删除 `frontend/src/chain` 五文件。
3. 跑 build，若有引用则迁移到 F-owned hooks。

**验收标准**
- [ ] 命令：`rg -n "from ['\\\"].*chain|from ['\\\"]@/chain" frontend/src` → 期望：无输出，退出码 1。
- [ ] 命令：`cd frontend && npm run build` → 期望：删除 `frontend/src/chain` 后构建通过。

#### F2 · 能力事件回放动画 [FE | `components/arena/*`,`useArenaEngine.ts` | 依赖 B2,D9（trace ABI/tool） | maps-to roadmap E4.2, US-E4]

**功能点**
- 玩家/用户可见：回放中可看见 summon/buff/death-chain 等能力事件穿插在攻击步之间。
- 技术交付物：Arena store 扩展 `AbilityEvent`；`ReplayCanvas` 动画；`BattleLog` 展示能力行；读取 B2 trace。

**现状 & 缺口**
- 已有：store 只有 `ArenaTurn`（`frontend/src/store/useArenaStore.ts:42-49`）；simulation 只有 `turns/winner/initial`（`:69-76`）。
- 已有：`ReplayCanvas` 只按 attack turn 更新 HP/ATK（`frontend/src/components/arena/ReplayCanvas.tsx:47-81`），`BattleLog` 只渲染 damage/KO（`BattleLog.tsx:31-85`）。
- 缺：无 AbilityEvent 类型、动画状态、ABI decode。

**子任务拆分**
1. 扩展 store 与 `useArenaEngine` ABI decode B2 trace。
2. 在 `ReplayCanvas` 插入事件 timeline，支持 summon enter、buff pulse、death-chain highlight。
3. `BattleLog` 增能力事件行和筛选/样式。
4. 兼容旧合约：无 ability events 时仍回放普攻。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：AbilityEvent 类型和 ABI 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena` 1440x900 点击 Play，Wraith death 后出现 summon 动画，BattleLog 有 `ON_DEATH/SUMMON` 行；旧 trace 无事件时不崩。

#### F3 · BattleLog 能力旁白 [FE | `BattleLog.tsx` | 依赖 B2,F2 | maps-to roadmap E4.3, US-E4]

**功能点**
- 玩家/用户可见：能力事件以可读短句解释，而不是只显示枚举。
- 技术交付物：trigger/effect/target 文案映射；i18n；按事件顺序滚动高亮。

**现状 & 缺口**
- 已有：`BattleLog` 只生成攻击行（`BattleLog.tsx:31-51`）。
- 缺：无 ability narration、无 i18n keys、无 target/delta 文案。

**子任务拆分**
1. 定义 narration helper：`Wraith triggers ON_DEATH: summons 3/3 token`。
2. 补 zh/en i18n。
3. BattleLog 合并 turn 和 ability event timeline。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：旁白 helper/i18n 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena` 回放日志中能力行可读，当前行随 scrub/play 自动滚动高亮。

#### F4 · 战斗回放分享链接 / 导出 [FE | Arena components | 依赖回放就绪 | maps-to roadmap E6.8, US-E4]

**功能点**
- 玩家/用户可见：一场 match 可复制分享链接或导出短片/片段。
- 技术交付物：URL state 包含 matchId/turn range；Share button；导出截图/GIF/clip（先可 PNG/JSON，再扩视频）。

**现状 & 缺口**
- 已有：demo Share 是 mock toast（`demo/index.html:2513-2515`）。
- 已有：真实 Arena 有 selected match/store（`useArenaStore.ts:101-108`、`:157-158`）。
- 缺：无分享 URL、无导出、无 route param hydration。

**子任务拆分**
1. 定义 `/arena?match=<id>&t=<turn>` 或 hash 参数。
2. Share 复制真实 URL，加载时选中 match/turn。
3. 导出当前帧 PNG 或 replay JSON；后续再做视频。
4. 增加错误态：match 不存在/未结算。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：share/export 功能编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena` 点击 Share 复制含 matchId 的 URL；新标签打开该 URL 后聚焦同一 match 和 turn；导出按钮生成可下载文件。

#### F5 · 卡详情展示真实 metadata [FE | `UnitCard`/详情弹窗/`useArenaEngine.ts`/store/`app/arena/page.tsx`（卡市入口链接） | 依赖 B3 | maps-to roadmap E3.4, US-E5]

**功能点**
- 玩家/用户可见：背包/卡详情展示真实 provenance，不再显示 mock 警告。
- 技术交付物：扩展 CardLedger ABI 和 ArenaCard 类型；详情弹窗显示 B3 fields；普通卡显示 standard metadata。

**现状 & 缺口**
- 已有：前端 CardLedger ABI 只读旧 tuple（`useArenaEngine.ts:53-63`）；store `ArenaCard` 仅 `id/unitType/mintedAt/listed/lastTx`（`useArenaStore.ts:51-59`）。
- 已有：InventoryPanel 展示基础卡与 source tx（`InventoryPanel.tsx:47-100`）。
- 缺：无卡详情弹窗；无 story metadata fields；前端不经 D4，需 direct RPC 自读。

**子任务拆分**
1. 扩展 `CARDLEDGER_ABI.getCard` 与 `ArenaCard` 类型。
2. 更新 `fetchCardLastTx` 与 inventory mapping，兼容旧合约。
3. 新增卡详情弹窗，展示 variant/edition/originAgent/achievementTag/reason。
4. 与 E5 卡市 provenance UI 对齐字段名。
5. 在 F 独占的 `frontend/src/app/arena/page.tsx` 加一个跳 `/arena/market` 的入口链接（该文件 F 独占，E 不改），让 E5 卡市可从 Arena 页进入。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：新 Card 类型和详情组件编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena` Inventory 点击故事卡显示真实 B3 metadata；普通卡显示 Standard，无 mock provenance 警告。

#### F6 · My-Agent / Lore / 账本只读页组件 [FE | `app/lore/*`,`components/ledger/*` | 依赖现有 direct RPC | maps-to US-F1-F5]

**功能点**
- 玩家/用户可见：能阅读 memory、inbox、location board、chronicle、world bible。
- 技术交付物：`/lore` 路由；`components/ledger/*` 只读组件；E 的 `/me` 主壳可 import。

**现状 & 缺口**
- 已有：`useGameEngine` 已读 memories/location/inbox/chronicle/evaluations/world bible（`useGameEngine.ts:192-247`）；store 有相应状态（`useGameStore.ts:83-102`）。
- 已有：arena `AgentMindPanel` 已合并 memories/evaluations（`AgentMindPanel.tsx:51-62`）。
- 缺：无 `/lore` 路由；无通用 ledger 组件；无 `/me` 账本子组件。

**子任务拆分**
1. 新建 `components/ledger/MemoryList/InboxList/ChronicleList/WorldBiblePanel`。
2. 新建 `/lore`，展示 world bible + chronicle leaderboard。
3. 导出 `/me` 可嵌入的 agent ledger bundle。
4. 空态/加载态/容量 ring buffer 显示。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：`/lore` 和 ledger 组件编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/lore` 显示 World Bible 条目；E 的 `/me` 壳 import ledger bundle 后可显示该 agent memories/inbox/evaluations。

#### F7 · 前端 Router V4 resolver [FE | `useArenaEngine.ts`,`useArenaStore.ts` | 依赖 P1 | maps-to 新增]

**功能点**
- 玩家/用户可见：前端可发现 PredictionMarket 地址，同时旧 Router 不崩。
- 技术交付物：在 F-owned `useArenaEngine.ts` 的 resolver 顶部探测 `getAddressesV4()`；回落 V3/V2/V1。

**现状 & 缺口**
- 已有：Router ABI 只有 V3/V2/V1 和 `arenaEngine/gTreasury`（`frontend/src/hooks/useArenaEngine.ts:12-21`）。
- 已有：resolveContracts 只探 V3→V2→V1（`:171-218`）。
- 已有：`ArenaState` 只有 `arenaEngineAddress`（`frontend/src/store/useArenaStore.ts:87-89`），无 market address 字段。
- 缺：无 V4 ABI/tuple decode；无 `predictionMarket` store/config。

**子任务拆分**
1. 在 `ROUTER_ABI` 添加 V4 签名。
2. 在 resolveContracts 先尝试 V4，解出 market address，旧 Router catch 回落。
3. 增加 staticConfig 或 market address store（若 F8/E4 需要）。
4. 本地旧 Router fallback smoke。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：V4 resolver 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：连接旧 Router（无 V4）时 `/arena` 不报错；升级后 console/store 能看到 `predictionMarket` 地址。

#### F8 · World 观众态落地页 [FE | `app/page.tsx`,`components/spectator/*` | 依赖现有 direct RPC；市场卡依赖 D1/C2 | maps-to US-A1-A3]

**功能点**
- 玩家/用户可见：无需钱包落地即可看到 live drama、scoreboard、featured markets、AgentMind、CTA。
- 技术交付物：重构 `/` 页面观众层；复用 Phaser/Sidebar/HUD 或改为观众首屏；市场卡未就绪时占位。

**现状 & 缺口**
- 已有：真实 `/` 只是 full-screen PhaserMap + Sidebar + HUD（`frontend/src/app/page.tsx:11-23`）。
- 已有：demo/user story 要求 `SPECTATOR MODE`、LIVE DRAMA、SCOREBOARD、FEATURED MARKETS、AGENTMIND（`docs/demo-user-stories.md:76-87`；demo anchors `demo/index.html:924-970`）。
- 缺：无观众转化层组件；无 featured market data；无 CTA 到 `/onboard`。

**子任务拆分**
1. 设计 `/` 信息架构：地图与观众内容如何共存，避免遮挡。
2. 新建 `components/spectator/*`：Hero、DramaTicker、Scoreboard、FeaturedMarkets、AgentMindLog。
3. 复用 `useGameStore` agents/chronicles/memories；market 未就绪显示 disabled/placeholder。
4. CTA 跳 `/onboard`，See-how-AI-thinks 平滑滚动到 AgentMind。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：spectator components 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/` 1440x900 和 375x812 均显示 `SPECTATOR MODE · no wallet needed`、drama、scoreboard、AgentMind；CTA 可跳 `/onboard`。

#### F9 · `/me` 实时 AgentMind / status 只读面板 [FE | `components/ledger/AgentMindLive` | 依赖现有 direct RPC；E 主壳 import | maps-to US-C1]

**功能点**
- 玩家/用户可见：进入 My Agent 即看到自己的思考流、ore/G、建筑数、状态联动。
- 技术交付物：F-owned 只读 `AgentMindLive`；读取 `useGameStore` memories/evaluations/agentHexes/agents；E 的 `/me/page.tsx` import。

**现状 & 缺口**
- 已有：AgentMindPanel 已在 Arena 合并 memory/evaluation（`AgentMindPanel.tsx:21-30`、`:51-62`）。
- 已有：store 有 agents、agentHexes、memories、evaluations、worldBible（`useGameStore.ts:78-102`）。
- 缺：无 `/me` 主壳；无通用 AgentMindLive；无 G balance 汇总（需要 E6/F5 或 Arena state）。

**子任务拆分**
1. 新建 `components/ledger/AgentMindLive.tsx`，props 接 `agentId`。
2. 合并 memories/evaluations，按 timestamp 排序；显示空态和 loading。
3. 显示 ORE/territory/buildings；G balance 从 E6/F-owned store 接入。
4. 暴露纯组件给 E `/me` import，不写链。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：AgentMindLive 编译通过，不依赖 E 写链子树。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/me` 中导入该组件后，选中 agent 显示非空 memories/evaluations；新 memory 写入后 5s 轮询内刷新。

---

## 3. 并行计划（lane × milestone 矩阵，零文件域碰撞）

| Lane \ 里程碑 | **M0 · 解锁** | **M1 · 第一批竖切** | **M2 · 闭环/打磨** |
|---|---|---|---|
| **P** | P5（relay signer gate，依 Auth 决策）、P1（Router V4） | P2（部署+market 授权）、P3a（地址解析/config） | P4（achievement keeper 授权） |
| **A** | A1（参数 storage 化，先 land） | A2（成就事件） | A3（仅 Auth 选 b） |
| **B** | B1（RNG 方案/实现）、B2（AbilityEvent trace） | B3（Card metadata + mintStoryCard） | — |
| **C** | C1（interface/设计稿） | C2（自结算市场） | C3（Oracle/rake/refund） |
| **D** | D0、D0b、D1b、D5（依 D0b）、D6 | D1（市场工具）、D4（卡元数据）、D7（多租户）、D9（trace ABI/tool，依 B2,D1b） | D2（market keeper）、D3（achievement keeper）、D8（配额） |
| **E** | E1、E1b-a | E2、E3、E1b-b、E4 | E5、E6、E7、E8、E9 |
| **F** | F1、F6、F8、F9 | F2、F4、F7 | F3、F5 |

### 关键路径

```text
市场竖切：
  C1 -> P1 -> C2 -> P2(addOperator market) -> P3a -> D1 -> E4
                      \
                       -> D2 keeper（C2 resolve permissionless，只需 gas）

Auth / relay：
  D6 + Auth 决策 -> P5 -> E1b-b -> E2/E3/E7/D7
  若选 (b)：Auth 决策 -> A3 -> E3/E1b-b/E7/D7

成就故事卡：
  A2 + B3 -> P4 -> D3 -> E8/F5/E5

能力回放：
  B2 + D1b -> D9（MCP trace ABI/tool） -> F2 -> F3/F4
```

- **最长链是市场竖切**：不能跳过 P1/P2/P3a。没有 Router 槽位，D/E 找不到市场；没有 `addOperator(market)`，`spendOre/refundOre` 会 revert。
- **E1 是所有真人写操作地基**：E2-E8 都依赖 wallet/tx 三态；gasless 体验再依 E1b-b/P5/D6。
- **Auth 决策是 M0 gate**：默认 (a) 可先走全局 relay + off-chain flag；若产品/安全要求用户链上可撤权，则必须开 A3。
- **D0b 是 D5 硬前置**：事件 ABI 不修，遥测 capture/rebellion/harvest 指标会错。
- **F 与 E 的边界不变**：E 新建写链路和路由；F 维护既有只读 hooks、Arena 页、观众/lore/ledger 只读组件。

---

## 4. Make-the-demo-real 映射（诚实标注合约/部署前置）

| demo 预览功能 | demo / story 锚点 | 让它变真的任务 | 阻塞依赖 / 诚实说明 |
|---|---|---|---|
| World 观众落地页（Hero、LIVE DRAMA、SCOREBOARD、FEATURED MARKETS、AgentMind） | US-A1-A3（`docs/demo-user-stories.md:76-98`）；demo `demo/index.html:924-970` | F8；FEATURED MARKETS 真数据再接 D1/C2 | 真实 `/` 当前仅地图壳（`frontend/src/app/page.tsx:14-23`）；不需要钱包；市场卡可先占位 |
| 钱包 onboarding / gasless | US-B1（`docs/demo-user-stories.md:114-127`） | E1 -> E1b-a/b -> E2 | `createAgent` 无 canControl gate，但 gasless relay/后续 autopilot 仍受 Auth 决策和 P5；不能声称用户可链上 `addOperator` |
| `/me` autopilot / goal / quick actions / 实时 AgentMind | US-C1-C3（`docs/demo-user-stories.md:139-170`）；demo `demo/index.html:1191-1457` | E3、E7、D7、F9、F6 | 默认 (a) 为 off-chain flag；若要用户链上委托需 A3；F9 是只读组件，E 主壳 import |
| 预测市场下注/赔率/持仓/结算凭证 | US-D1-D4（`docs/demo-user-stories.md:182-208`）；demo `demo/index.html:1711-2000` | C1->P1->C2->P2->P3a->D1->E4；Oracle 再加 C3 | 现仅 debate 内 Oracle 雏形（`GameEngine.sol:710-880`）；独立市场、Router、授权都缺 |
| 账本视图（memory/inbox/location/chronicle/bible） | US-F1-F5；demo `/me`/`#/lore` | F6 | 后端读路径已在 `useGameEngine.ts:192-247`；主要是页面和组件 |
| Arena shop roll/freeze/move | demo `#/arena`，capability matrix #75-77（`docs/capability-matrix.md:114-117`） | D1b；E5/E6 做人类 UI | 链上已有 `move/freeze/roll`（`ArenaEngine.sol:347-403`）；MCP 缺工具 |
| Arena 收藏/买卖/卡市 | US-E0-E3/E5；demo `demo/index.html:2120-2446` | E5、E6、F5；D4 给 MCP/agent 侧 | 合约 + MCP listing 已有（`CardLedger.sol:88-138`、`tools.ts:721-748`）；人类 UI 缺 |
| 能力连锁回放 | US-E4；demo 固定脚本（`demo/index.html:2474-2534`） | B2 -> F2 -> F3/F4 | 现 `Turn` 只记普攻（`ArenaCombat.sol:30-36`）；必须先 B2 |
| story/provenance card | demo mock warning（`demo/index.html:2250-2295`） | B3 -> D3/D4/F5/E5/E8 | `Card` struct 无 metadata（`CardLedger.sol:17-22`）；真实 metadata 需要合约先做 |
| 战斗分享 | demo Share mock（`demo/index.html:2513-2515`） | F4 | 纯前端；真实数据来自 current match/route state |

---

## 5. 风险 / 待决（review 时拍板）

1. **部署目标 config 漂移（router/RPC 链 mismatch）**：`just gravity-upgrade` 用 `grep -o '0x...' frontend/config/gravity.json | head -1` 取 `ROUTER_ADDRESS`，命中的是 mainnet router `0x13860c...`（`frontend/config/gravity.json:1-7`），但 `--rpc-url` 硬编码为 testnet RPC（`justfile:47-53`）；而 `agent-runner/config/gravity.toml` 又指向 testnet router（`:13-16`）。真实风险是用 mainnet router 地址在 testnet RPC 上跑升级的链/地址 mismatch，不是“升级到 mainnet”。P2/P3a 前必须拍板 `gravity` 命名、router 与 RPC 的链对齐。
2. **Auth/Delegation false premise**：当前只有全局 operator 集合和 agent owner（`AgentRegistry.sol:19-24`、`:45-48`、`:66-69`）。默认 (a) 可落地，但用户级链上撤权不存在；若产品必须要，开 A3。
3. **PredictionMarket 授权是硬前置**：C2 下注会调用 `GameEngine.spendOre`（`GameEngine.sol:471-475`），market 合约未被 `AgentRegistry.addOperator` 授权必 revert。
4. **`MAX_ORE_POOL=1000` 派彩 cap**：`refundOre` 会 cap 到 1000（`GameEngine.sol:478-486`）。C1/C2 必须决定市场派彩是否接受 cap、拆 claim、或改 ore accounting。
5. **RNG 完整性**：`ArenaEngine` 明确 TODO prevrandao 可 grind（`ArenaEngine.sol:545-548`）；真实价值/G 经济扩大前 B1 是安全 gate。
6. **成就 exactly-once**：A2 不加状态位，D3 必须持久去重 `(agentId, achievementTag)`；否则重放事件可重复铸卡。
7. **relay 后端 owner 未定**：若放 `mcp-server`，归 D；若新服务，需在 §2.1 新增唯一 owner。E1b-a 只能先做 client/skeleton。
8. **单位扩容与 ERC-721 外部流通后置**：当前 `UnitCatalog` 只有 12 单位（`UnitCatalog.sol:12-139`）。story card 体感有限；但扩 60 单位/外部 NFT 流通不塞入 B3。

---

## 6. 与 roadmap WBS 的偏差（本文据当前代码校准）

- **新增 Lane P**：roadmap 没有单列 Router/Deploy/operator/config owner。本文把 P1-P5 抽成唯一基础设施 lane，防止 C/D/E 同改 Router、脚本、config。
- **Auth 事实修正**：roadmap 曾写 owner/operator 机制支持用户可收回（`docs/roadmap.md:36-38`、`:264-266`），但代码事实是全局 owner-only operator，无 per-agent 委托（`AgentRegistry.sol:19-24`、`:66-69`）。本文新增 Auth 决策门与条件 A3。
- **AgentRegistry 行号和模型已校正**：旧稿简化为 global mapping；当前代码还有单一 `operator`（`AgentRegistry.sol:19`）和 mapping（`:24`），`_isOperator` 同时认可二者和 owner（`:36-38`）。
- **部署 config 风险新增**：旧稿未指出 `frontend/config/gravity.json` 指向 mainnet、`agent-runner/config/gravity.toml` 指向 testnet、`just gravity-upgrade` 读前者的冲突；本文列为 P2/P3a 风险。
- **MCP 事件 ABI 漂移列为 D0b**：`chain.ts:44` 的 `HexClaimed` 不存在，`chain.ts:47` 的 `Harvested` 签名错误，且缺 `HexCaptured/HexRebelled`。
- **Arena shop 工具列为 D1b**：链上 `move/freeze/roll` 已有（`ArenaEngine.sol:347-403`），MCP 工具缺；旧 e2e 脚本已期待这些工具（`e2e-arena-tools.mjs:51-58`）。
- **F6 改为页面/组件工作，不是接 MCP**：前端已经 direct RPC 读取全部账本（`useGameEngine.ts:192-247`），所以 F6 不做后端接入。
- **前端 lane 重切**：E 只建新写链路和路由；F 独占既有 `useArenaEngine.ts`、`app/arena/page.tsx`、只读 store/arena 组件，避免同文件碰撞。
- **新增/保留任务**：保留 P1-P5、A1-A3、B1-B3、C1-C3、D0/D0b/D1/D1b/D2-D9、E1/E1b-a/E1b-b/E2-E9、F1-F9；未删除旧编号。F7/F8/F9、D0b、D1b、D9（MCP trace ABI/tool）、P lane 是本文明确化的遗漏任务。
- **旧行号漂移修正**：`writeWorldBible` 现为 `GameEngine.sol:1038-1059`；`writeChronicle` emit 在 `:987`；`ArenaCombat.eloUpdate` 精确行为号为 `contracts/src/ArenaCombat.sol:93-115`；`useArenaEngine` V3 fallback 在 `frontend/src/hooks/useArenaEngine.ts:171-218`。

---

## 7. 无法核实 / 留待确认

- **目标网络命名**：仓库 AGENTS 背景强调 Gravity Testnet；当前 `frontend/config/gravity.json` 是 mainnet，`agent-runner/config/gravity.toml` 是 testnet，`frontend/config/gravity-testnet.example.json` 又是另一个 testnet router。P2 前需人工确认 `gravity` 应指哪条链。
- **Auth 选 (a) 还是 (b)**：本文默认 (a) 全局 relay + off-chain flag；若要求用户链上可撤权，必须接受 A3 合约改动和 storage layout 风险。
- **relay 后端落点**：代码中尚无 relay 服务目录。D6 必须拍板归属，否则 E1b-b/D7 容易撞文件域。
- **PredictionMarket 派彩 cap 策略**：`MAX_ORE_POOL` 是否适用于市场派彩需产品/经济决策；C1/C2 不应擅自隐式吞派彩。
- **VRF vs commit-reveal**：B1 需要安全/成本决策；当前只确认 `prevrandao` 不足以承载真实价值。
