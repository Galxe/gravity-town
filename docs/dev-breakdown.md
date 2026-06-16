# Gravity Town · 开发任务分解（并行开发 / 防撞版）

> 目的：把「**demo 预览的 UX** + **roadmap 想要的功能**」翻译成一份**按文件域切分、可多人并行不撞**的开发计划，且**全部锚定当前真实代码状态**（`file:line`）。
>
> 关系：本文是 [`docs/roadmap.md`](roadmap.md) WBS 的**细化稿**——roadmap 给了 epic（E0–E7）、依赖、DoD、分工表与防撞规则；本文据**当前代码 + demo（[`demo/index.html`](../demo/index.html)）+ 用户故事（[`docs/demo-user-stories.md`](demo-user-stories.md)）**重新校准「什么已做 / 什么是 mock / 什么没做」，并把任务重排成**碰撞自由的 lane**。roadmap 已 stale 的地方在文末「与 roadmap WBS 的偏差」逐条标出。
>
> 命名约定：`E*.*` 复用 roadmap 的 epic/任务号；`US-*` 是 demo 用户故事号；`Lane P/A–F` 是本文新增的并行车道（按**文件域**切）。
>
> 角色：`SC`=合约 · `MCP`=工具层 · `FE`=前端 · `INFRA`=keeper/遥测/runner/运维 · `PLAT`=平台部署/Router/授权 · `DOC`=文档。

---

## 1. 现状快照（一表锚定，含 file:line）

| 领域 | DONE（已可用） | MOCK-ONLY（demo 里假的） | MISSING（要新建） |
|---|---|---|---|
| **合约 · 主世界** | hex/ore/建造/战斗/民心/incite/chronicle/圣典/三种 ledger 全在 `GameEngine.sol`；ore 钩子 `spendOre:471`/`refundOre:482`（**均 `onlyOperatorOrOwner`，`:471/:482`**，外部合约调用前必须先被 `AgentRegistry.addOperator` 授权，见 §Lane P）；身份放行 `canControlAgent`（owner 或 operator，`AgentRegistry.sol:45-48`） | — | **21 个主世界平衡参数全是编译期 `constant`**（`GameEngine.sol:25-45`；debate/chronicle 常量另在 `:48-59`），改一个数 = UUPS 升级；`_calcDecay:1173` 系数硬编码；**无 `AchievementUnlocked` 事件**（事件列表止于 `:139-160`，无成就事件；真实事件含 `AgentCreated/HexLost/HexCaptured/HexRebelled/Harvested(agentId,oreGained):142`） |
| **合约 · 预测市场** | parimutuel 雏形寄生在 debate 里：`resolveDebate:804` 注池/抽成/退款（`DEBATE_TAX_PCT=10` `:54`、`outcomeOverride` 人工裁定 `:822`） | demo `#/markets` 的 SELF_RESOLVING / ORACLE 两型、即时 `Resolve`、Oracle 10% rake 是纯前端（`demo/index.html:215-244`） | **独立 `PredictionMarket` 合约不存在**；**Router 无市场地址槽位/getter/setter**（`Router.sol:10-21` / `:86-108`）；现市场必须挂某 hex 并改其民心（`startDebate:710`），做不出「谁登顶 scoreboard」类解耦市场；自结算（合约读自身状态裁定）不存在 |
| **合约 · Arena/卡** | 卡库存 + 二级市场**已能用**：`mintCard:75`(onlyOperator)、`listCard:88`/`cancelListing:110`/`buyListed:118`（G 计价，走 `gTreasury.spendG:131`）；12 单位 `UnitCatalog.sol`；战斗确定性 `ArenaCombat.simulate:41`/`simulateWithTrace:54`；ELO `eloUpdate`；tier setter `setTierThresholds:217`/`setMatchmakingPeriod:573`（**参数化范式已存在**）；链上 shop `buy:274`/`placeCard:292`/`removeCard:320`/`move:347`/`freeze:379`/`roll:391` 全在 | demo 卡的 `variant/edition/provenance/story`、Roll 换卡、Share 链接 | **`Card` 无叙事元数据**（`CardLedger.sol:17` struct 仅 `id/unitType/ownerAgent/mintedAt`）；**无 `mintStoryCard`、无成就触发铸卡路径**（`mintCard` 仅 `buy()`/`bootstrap` 调用）；`ArenaCombat.Turn:30` 只记普攻步，`simulateWithTrace` 不吐 `AbilityEvent[]` |
| **合约 · 完整性** | — | — | **`ArenaEngine.sol:545` 匹配种子用 `block.prevrandao`，代码自带 TODO「prize pool 前换 VRF/commit-reveal」**（`:545-548`；同款 shop seed `:399`） |
| **MCP** | 主世界全套读写工具（`create_agent:20`/`harvest:132`/`build:142`/`raid:177`/读 ledger `read_memories:271`/`read_location:321`/`read_inbox:362`/`get_chronicle:545`/`read_world_bible:597` 等）；Arena 大部分（`arena_buy:630`/`arena_place_card:670`/`arena_remove_card:684`/`arena_list_inventory:697`/`arena_list_market:707`/`arena_submit:762`/`arena_deposit_g:644`/`arena_withdraw_g:657`）；**二级市场买卖工具已 DONE**：`arena_place_listing:721`/`arena_cancel_listing:735`/`arena_buy_listing:748`（E5 只需在其上做人类 UI，不重建后端）；oracle 预测 debate（`get_active_oracle_debate:491`）；chain 层有 `getCard`/`getOwnedCards`/`getActiveListings`/`buyListed` 等 CardLedger ABI（`chain.ts:166`+）、Arena 暴露 `simulateMatch`（`chain.ts:136`，非 `simulateWithTrace`） | — | **无独立 `create_market/bet/resolve_market/list_markets/get_market`**；**无 `arena_roll/arena_freeze/arena_move`**（链上 `roll:391/freeze:379/move:347` 已有，MCP 未暴露，`tools.ts` arena 起点 `:611`）；无市场结算 keeper、无成就监听铸卡 keeper（**已有 Arena 撮合/结算 keeper `keeper.mjs`**，`justfile:90`）；**文案漂移**：`tools.ts:316` 写 post `+10` 但 `POST_MORALE=5`（`GameEngine.sol:42`）；`tools.ts:530` 写 chronicle「10-minute cooldown」但 `CHRONICLE_COOLDOWN=300`=5 分钟（`:58`）；**事件 ABI 漂移**：`chain.ts:44` 有不存在的 `HexClaimed`、`chain.ts:47` 的 `Harvested(bytes32 hexKey,...)` 签名错误（真实 `Harvested(uint256 agentId, uint256 oreGained)` `GameEngine.sol:142`），且**缺 `HexCaptured/HexRebelled`**（`GameEngine.sol:150-151`，见 D0b） |
| **前端** | **纯只读**：两条真实路由 `app/page.tsx`（Phaser hex 地图）、`app/arena/page.tsx`（Arena 回放 + Agent Mind 面板）；**已用 ethers 直连 RPC 读链**：`useGameEngine.ts` 读 memories(`:192-197`)/location boards(`:199-203`)/inbox(`:205-209`)/chronicle(`:211-228`)/evaluations(`:230-236`)/world-bible(`:238-247`)，`useArenaEngine.ts` 读 ghost/match/sim/inventory；arena 页**复用 `useGameEngine()`** 把 memories+evaluations 灌入 store 供 `AgentMindPanel` 用（`arena/page.tsx:18`、`AgentMindPanel.tsx:29-30`）；i18n zh/en（`src/i18n`） | — | **零写链能力**：全仓**无 wagmi/viem/RainbowKit/privy/signer/sendTransaction**（grep 无命中）；无钱包连接、无 onboarding、无 `/markets` 路由、无卡画廊买卖 UI、无 My-Agent 页、无 Lore 页、无余额展示；**死代码** `frontend/src/chain/`（5 文件 abis/contracts/events/index/sync，**无任何 `from .../chain/` 引用**，已 grep 复核） |
| **demo** | `demo/index.html`（**2604 行**）端到端 mock 预览 6 路由（`#/ #/me #/markets #/arena #/lore #/onboard`），覆盖 US-A~F 全部故事；含 SELF_RESOLVING + ORACLE 两型市场（`:177/:215`） | 全部内存态：钱包/交易/对局/余额/provenance/Share 皆假，刷新即重置 | 它是**目标 UX 的规格说明**，本文所有 FE 任务即「把它做成真」 |
| **infra** | Arena keeper `keeper.mjs`（撮合 `runMatchmaking` + 结算 `settleMatch` 心跳）；agent-runner（**固定 26 角色，全 `enabled`**：25 个 `heartbeatMs=5000`、1 个 `=60000`，`accounts.json`；**外加全局 `loop_delay_ms` 默认 5min**，`gravity-mainnet.toml:29`） | — | 无**市场结算 / 成就铸卡** keeper（Arena keeper 已存在，须区分目录）、无遥测聚合、无多租户 runner、无 operator-relay 垫 gas、无计费/配额 |

> **节流真相（纠正旧稿「global 5min」）**：节流是**两层**——① 全局 `runner.loop_delay_ms`（`gravity-mainnet.toml:29` 默认 300000=5min）；② **per-account `heartbeatMs`**（`accounts.json` 多数角色 5s）。固定 26 角色属实，但不能概括为「全局 5min」。

---

## 2. 按文件域切分的并行车道（lane 内串行，lane 间并行）

> **防撞总则**（承接 roadmap §2.3 / §5）：
> 1. **`GameEngine.sol` 的存储改动是唯一序列化任务（Lane A 独占，先 land）**；其它 epic 一律不许往 GameEngine append storage。
> 2. **只 emit 新事件 / 新建独立合约 → 可并行**（不动既有存储布局）。
> 3. **每个 ledger/合约单一 owner**：`CardLedger`+`ArenaCombat`+`AbilityLib`+`ArenaEngine`→Lane B；`PredictionMarket`(新)→Lane C。
> 4. **新增 Lane P（Platform/Deploy）唯一拥有 `Router.sol` + 部署/升级脚本 + operator 授权 + 地址配置 + ABI 版本同步**——C/D/E **一律不得并发改这些基础设施文件**，跨 lane 的「注册新合约 / 授权 operator」请求都排队进 Lane P。
> 5. 前端拆三个 owner：**`/arena` 页骨架 + store + `useArenaEngine.ts`（Lane F 独占）**、**写链路/真人 UI 新子树（Lane E）**、**只读可视化/账本页面（Lane F）**——三者文件域必须互斥（见 §2.1 disjoint 表）。跨 lane 集成走 **props / 类型化 API**，不共改同一文件。
> 6. **`mcp-server/src/chain.ts` 与 `frontend/src/hooks/useArenaEngine.ts` 各只有一个 owner**：`chain.ts`→Lane D 独占（含所有地址/ABI/事件改动）；`useArenaEngine.ts`→Lane F 独占（含 Arena 读 + CardLedger ABI，`:53-59`/`:920`）。P 不改 `chain.ts`（P 只动 `frontend/config/*` + 独占的 `mcp-server/src/addressResolver.ts`，地址/ABI 改动以请求形式排队进 D）；E 不改 `useArenaEngine.ts`。

> **决策门 · Auth / Delegation（E3/E1b/E7/D7 的共同前置，须先拍板）**：demo `#/me` 的 AUTOPILOT「开/关委托、可收回」**不是当前合约能力**。核实：`AgentRegistry.operators` 是**全局** mapping（`AgentRegistry.sol:24`），`addOperator/removeOperator` 是 **`onlyOwner`**（`:67-68`，仅合约 owner 可调，**非 agent owner**），`canControlAgent`（`:45-48`）只认**全局 operator 或 agent owner**——**没有按 agent 的委托/撤权**。必须二选一：
> - **(a) 全局平台 operator + off-chain 用户开关（默认，轻量）**：平台用一个全局 operator/relay signer 代发受 `canControlAgent` gate 的写动作——即 `build`（`GameEngine.sol:344`）/`raid`（`:623`）（**注意 `harvest:289` 无权限控制、Anyone can call，不构成授权闭环的验收路径**）；「开/关 autopilot」是**链下**的 runner/relay 启停标志（DB flag + relay 拒发），**不是**链上用户可收回的委托。文档**不得**声称「链上可由用户 `addOperator/removeOperator` 收回」。relay signer 必须被 `AgentRegistry.addOperator` 授权（否则 `canControlAgent` `GameEngine.sol:173` 拒发 `build`/`raid`）——授权编排进 Lane P。
> - **(b) 给 `AgentRegistry` 加 per-agent delegation（新 SC 任务）**：新增 `delegate[agentId][addr]` 存储 + agent-owner 可调的 `delegate/undelegate` + 改 `canControlAgent`。这是 **Lane A 风格的单 owner 合约改动**（`AgentRegistry` 当前无独立 lane → 归 Lane A 或新开，含 **storage-layout 测试**，UUPS append 安全）。
>
> **本轮默认走 (a)**；选 (b) 则 E3 改为「调新 per-agent `delegate/undelegate`」并新增对应 SC 任务。**E3/E1b/E7/D7 的 DoD 全部 gate 在本决策之后**（见各任务依赖列）。

### 2.1 文件域归属表（**互斥确认**——同一文件只有一个 owner）

| Lane | owner 角色 | **独占文件域** | 关键互斥点 |
|---|---|---|---|
| **P** | PLAT·部署/授权 | `contracts/src/Router.sol`、`contracts/script/{Deploy,Upgrade}.s.sol`、`AgentRegistry.addOperator` 调用编排（含 **relay signer 授权**）、`frontend/config/*.json`、**`mcp-server/src/addressResolver.ts`（新，P 独占的地址解析层）**、ABI/版本同步**请求**（实施落 D） | **唯一**改 Router 槽位/getter 与部署脚本者；C/D/E 不碰；**P 不改 `chain.ts`**（地址/ABI 改动排队进 D） |
| **A** | SC·主世界 | `contracts/src/GameEngine.sol`（+ 若 Auth 决策走 (b)，则 `contracts/src/AgentRegistry.sol` per-agent delegation 也归 A 串行） | **唯一**允许改其存储/事件者 |
| **B** | SC·Arena | `contracts/src/{ArenaEngine,ArenaCombat,AbilityLib,CardLedger,UnitCatalog}.sol` | 不碰 Router（注册走 P） |
| **C** | SC·新合约 | `contracts/src/PredictionMarket.sol`（**新文件**）+ 其 interface | 不碰 Router/Deploy（注册+授权走 P）；只**读** GameEngine、经既有 `spendOre/refundOre` 钩子动 ore |
| **D** | MCP/INFRA | **`mcp-server/src/{tools,chain}.ts`（`chain.ts` 唯一 owner——所有地址/ABI/事件改动经 D，含 P 的同步请求）**、**新建** `mcp-server/scripts/keeper-market.mjs`/`keeper-achievement.mjs`（与现有 `keeper.mjs` 同目录但不同文件）、`telemetry/`（新）、`agent-runner/*` | 不碰 `frontend/config/*` 与 `mcp-server/src/addressResolver.ts`（地址配置/解析层走 P）；不碰现有 `keeper.mjs`（Arena 用） |
| **E** | FE·写链路 | **全新子树**：`frontend/src/hooks/wallet/*`、`frontend/src/lib/wallet/*`（写路径 lib + relay client）、`frontend/src/components/wallet/*`、`frontend/src/app/onboard/*`、`frontend/src/app/markets/*`、**`frontend/src/app/arena/market/*`（卡市人类 UI 子路由，E 独占——不碰 `app/arena/page.tsx`）**、**`frontend/src/app/me/page.tsx`（主壳，E 新建——`app/me/` 当前不存在）** | **禁止**编辑既有 `hooks/useGameEngine.ts`/`hooks/useArenaEngine.ts`/`app/arena/page.tsx`/`app/page.tsx`；读数据通过现有 hook 暴露的 store 或新 read hook；`app/me/page.tsx` **import** F 的 `components/ledger/*`，不编辑之 |
| **F** | FE·只读视图 | 既有 `frontend/src/{phaser,game,store}`、**`frontend/src/hooks/useArenaEngine.ts`（Arena 读 + CardLedger ABI，F 独占）**、`frontend/src/components/arena/*`（含 `ReplayCanvas.tsx`）、`app/arena/page.tsx`（**Arena 页骨架由 F 独占**）、**`app/page.tsx`（World 观众落地页，F 独占）+ `frontend/src/components/spectator/*`（新观众态只读组件）**、**新建只读页** `app/lore/*`、**`frontend/src/components/ledger/*`（`/me` 账本 + AgentMind 实时只读子组件，F 独占）** | **Arena 页 + store + `useArenaEngine.ts` 的唯一 owner**；E 不改 `app/arena/page.tsx`/`useArenaEngine.ts`；**F 不拥有 `app/me/*` 也不拥有 `app/arena/market/*`（卡市子路由归 E）** |

> **`/me` 路由的拆法（硬派单 owner，避免 E/F 撞）**：`app/me/` **当前不存在**，由 **E 新建**。`app/me/page.tsx` 主壳 + 写控件（AUTOPILOT 开关、SET GOAL、QUICK ACTIONS、Deposit G）**全部属 E**；账本只读子组件（chronicle/memory/inbox/world-bible 视图）属 **F，落在 `frontend/src/components/ledger/*`**（**不是** `app/me/*`），以独立组件文件导出、由 E 的主壳 `import` 拼装。规则：**`app/me/*` 唯一 owner = E**；**`components/ledger/*` 唯一 owner = F**；跨域只能 import 对方导出的组件，不能编辑对方文件。

### 2.2 跨 lane「注册/授权」请求（统一进 Lane P 排队）

| 发起 lane | 需要 P 做的事 | 阻塞的下游 |
|---|---|---|
| C（PredictionMarket） | ① `Router` 加 `predictionMarket` 槽位 + getter/setter；② `Deploy.s.sol`/`Upgrade.s.sol` 部署其 proxy 并 `Router.setPredictionMarket(...)`；③ **`AgentRegistry.addOperator(predictionMarket)`**（否则 `spendOre/refundOre` revert「not authorized」）；④ MCP/前端地址解析 | **D1（市场 MCP 工具）/ E4（真人下注）闭环** |
| D（market/achievement keeper） | keeper 私钥：**market 结算 `resolve` 已定为 permissionless（C2）→ D2 仅需 gas，无需授权**；铸卡 `mintStoryCard` 走 CardLedger operator → P 授权 keeper 或复用 Arena operator（D3 需 P4） | D3（D2 不再依 P4） |
| **E1b（operator-relay signer）** | **`AgentRegistry.addOperator(relaySigner)`**（**gate 在 §2 Auth/Delegation 决策**）：若走 (a) 全局 operator，则 relay signer 必须被授权为全局 operator，否则它代发受 gate 的 `build`/`raid`（`GameEngine.sol:344/623`）会被 `canControlAgent`（`:173`）拒（`harvest:289` 无 gate，不能用于验证授权）；若走 (b) per-agent delegation，则改为「用户对 relay signer `delegate`」、relay 无需全局 operator。**撤权路径**：(a) `removeOperator(relaySigner)`，(b) 用户 `undelegate` | **E1b-b（relay 实现）/ E2 gasless / E7 接管** |

---

### Lane P · 平台集成 / 部署 / 授权（**唯一 owner**：Router + 脚本 + operator 授权 + 地址配置）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD（完成判定） | maps-to |
|---|---|---|---|---|---|---|
| **P1** | `Router` 加 `predictionMarket` 槽位（**append，UUPS 安全**）+ `setPredictionMarket`/`getAddressesV4` getter；保持 `getAddresses`/V2/V3 签名不变（`Router.sol:55-108` 现状） | PLAT/SC | Router.sol | C1（接口定稿确定要注册的合约名） | 新槽位 append 在 `cardLedger` 之后；旧 getter 不变；含 storage-layout 测试 | 新增（roadmap 未列） |
| **P2** | `Deploy.s.sol` + `Upgrade.s.sol` 增部署 `PredictionMarket` proxy、`Router.setPredictionMarket(...)`、**`registry.addOperator(predictionMarket)`**（仿 `Deploy.s.sol:98/118` 现有 operator 授权范式） | PLAT/SC | Deploy.s.sol, Upgrade.s.sol | P1, C2（合约可部署） | `just gravity-upgrade` 后链上 Router 解析到市场地址 + registry `isOperator(market)==true`；含部署冒烟 | 新增 |
| **P3a** | 地址配置 + MCP 地址解析层（**P 只动自己的文件**）：`frontend/config/*.json`、**`mcp-server/src/addressResolver.ts`（P 独占）**——写入 V4 市场地址槽位。**P 不碰前端 Router getter 阶梯**（它在 F 独占的 `useArenaEngine.ts:171`，V4 探测接入归 F 的 **F7**） | PLAT/MCP | frontend/config/*, mcp-server/src/addressResolver.ts | P2 | config 含市场地址；`addressResolver.ts` 能解析到市场地址；un-upgraded Router 不抛错 | 新增 |
| **P4** | keeper operator 授权编排：**仅为 achievement 铸卡 keeper（D3）私钥 `addOperator`（铸卡 `mintStoryCard` 需 CardLedger operator）**；market 结算 keeper（D2）因 `resolve` permissionless（C2）**不在 P4 范围**（仅需 gas）；写入运维文档 | PLAT/INFRA | Deploy/Upgrade 脚本 + 运维 doc | P2, B3（确定铸卡入口） | 铸卡 keeper 私钥权限明确、可撤（`removeOperator`）；并发/撤权测试见 D3 DoD；market keeper 无需授权 | 新增 |
| **P5** | **relay signer 授权编排（gate 在 §2 Auth/Delegation 决策）**：若走 (a)，对 E1b 的平台 relay signer `AgentRegistry.addOperator(relaySigner)`（否则它代发受 gate 的 `build`/`raid` 被 `canControlAgent` `GameEngine.sol:173` 拒）+ 撤权 `removeOperator`；若走 (b)，relay 不需全局 operator，改由用户 `delegate`，P5 仅记录、不授权。**`AgentRegistry.addOperator` 独立于 PredictionMarket 部署可调（`AgentRegistry.sol:67`，owner-only、全局）→ P5 不依 P2** | PLAT/INFRA | Deploy/Upgrade 脚本 + 运维 doc | **Auth/Delegation 决策**（§2）+ relay signer 地址/运维脚本权限（**不依 P2**） | (a)：链上 `isOperator(relaySigner)==true`，撤权后 relay 代发 revert（用 `build`/`raid` 验）；(b)：无全局授权、per-agent 路径联通；与 E1b-b 对接 | 新增（codex round-2：relay signer gate） |

> Lane P 是**基础设施序列化点**。任何「改 Router / 改部署脚本 / 加 operator / 改地址配置」都只能从 P 走，C/D/E 提需求、P 实施——这是杜绝「C 和 E 同时改 Router/config 撞车」的核心。

---

### Lane A · 主世界合约（GameEngine 唯一 owner，存储改动序列化，**先 land**）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD（完成判定） | maps-to |
|---|---|---|---|---|---|---|
| **A1** | 21 个主世界平衡参数 `constant`→owner 可写 storage + 批量 setter；`_calcDecay:1173` 系数挪进 storage（参数在 `:25-45`，decay/chronicle 在 `:48-59`） | SC | GameEngine.sol | — | 参数可热改无需重部署；旧测试全过 + **新增 storage-layout 测试**（UUPS append 安全）；仿 `ArenaEngine.setTierThresholds:217` 范式 | roadmap **E2.1** |
| **A2** | GameEngine 在三类里程碑 `emit AchievementUnlocked(agentId, achievementTag)`（写圣典 `writeWorldBible:1038` / 0 格翻盘占领 / 声望破阈，破阈点在 `writeChronicle:961` 重算分处 `:987` 旁）—**只加事件，不动存储**；**事件须带 `achievementTag` 以支持 keeper 去重**（见 D3） | SC | GameEngine.sol | A1 先 land（同文件串行） | 三类里程碑正确 fire 且携带 `(agentId, achievementTag)`；可被 keeper(D) 监听；无存储布局变更 | roadmap **E3.2** · US-E5（provenance 上游） |

> **A3（条件任务，仅当 §2 Auth/Delegation 决策选 (b)）**：给 `AgentRegistry.sol` 加 per-agent delegation——`mapping(uint256=>mapping(address=>bool)) delegated`（**append 在 `ownerAgentIds` 之后 `:30`，UUPS 安全**）+ agent-owner 可调的 `delegate(agentId,addr)/undelegate(...)` + 改 `canControlAgent`（`:45-48`）加 `|| delegated[agentId][msg.sender]`。DoD：agent owner 可授权/撤权单个第三方代控该 agent；含 **storage-layout 测试**；旧测试全过。**本轮默认 (a) → A3 不开**；若开，归 Lane A（与 A1/A2 串行，因同碰 `AgentRegistry`/`GameEngine` 合约族审查），gate E3/E1b-b/E7/D7。
>
> A1 与 A2 同改 `GameEngine.sol`，**必须串行（A1→A2）**，但整条 Lane A 与 P/B/C/D/E/F 并行。
> **去重风险（codex）**：`writeChronicle` 现仅重算分 + emit `ChronicleWritten:987`，无破阈状态位。A2 只 emit 事件 → **exactly-once 铸卡的去重责任落在 keeper（D3）按 `(agent, achievementTag)` 幂等**，或后续在合约加阈值状态位（本轮选 keeper 去重，写进 D3 DoD）。

---

### Lane B · Arena 合约（ArenaCombat/AbilityLib/CardLedger 单一 owner）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD | maps-to |
|---|---|---|---|---|---|---|
| **B1**（gate） | **RNG 硬化**：`ArenaEngine.sol:545` 匹配种子 `prevrandao`→VRF/commit-reveal（连带 `:399` shop seed 评估） | SC | ArenaEngine.sol | — | 同块种子不可预测/不可 grind；**确定性回放仍成立**（`simulate` 结果可复算）；含测试 | roadmap **E0.1** |
| **B2**（gate） | `simulateWithTrace:54` 增吐 `AbilityEvent[]`（SUMMON/BUFF/DAMAGE/DEATH_TRIGGER/ON_START）。**不是「把现有队列吐出来」**：`AbilityLib` 的 FIFO 队列只存 packed `side\|slot\|trigger`（`AbilityLib.sol:74-105`），**不是现成的 `AbilityEvent`**；且 `_resolveOne/_applyEffect` 是 **private**。B2 须 **instrument/refactor effect application**（在 `processAbility:105` 解算/应用效果处采集 trigger→effect→target→delta），组装成 `AbilityEvent[]`；**`simulate()` 结算路径不动** | SC | ArenaCombat.sol, AbilityLib.sol | — | trace 含**按序**能力事件（含 effect/target/delta，非仅 side/slot/trigger）；确定性测试全过；`Turn:30` 仍兼容旧回放 | roadmap **E4.1** · US-E4/E5 |
| **B3** | `CardLedger.Card` 加叙事元数据位（`variant/edition/originAgent/achievementTag/mintedReason`，**append `struct Card:17` 之后，UUPS 安全**）+ `mintStoryCard(...)`（onlyOperator，供成就 keeper 调） | SC | CardLedger.sol | — | 故事卡带元数据铸造；**二级市场 `listCard:88`/`cancelListing:110`/`buyListed:118` 不受影响**；含 layout 测试；**事件 schema DoD：`mintStoryCard` 必须 emit `StoryCardMinted(cardId,ownerAgent,achievementTag,...)`**（区别于普通 `CardMinted(cardId,ownerAgent,unitType)`），使 E8 通知能识别成就铸卡、D4/F5 能从事件读 provenance 元数据 | roadmap **E3.1** · US-E3/E5 |

> B1/B2/B3 改不同文件（ArenaEngine / ArenaCombat+AbilityLib / CardLedger），lane 内可进一步并行，但同属 Arena owner，建议串行 B1→B2→B3 避免审查冲突。第一刀：B2 先吐 SUMMON+BUFF（视觉差最大）。**注册新合约不涉及**——B 全程不碰 Router/Deploy。

---

### Lane C · 预测市场（全新独立合约，零碰 GameEngine 存储；**注册/授权依赖 Lane P**）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD | maps-to |
|---|---|---|---|---|---|---|
| **C1** | 设计 `PredictionMarket` interface：`market{question,outcomes[],resolveAt,type}`，`type∈{SELF_RESOLVING,ORACLE}`，**`currency` 可插拔参数（v1 仅 `ORE`）**；明确「需被 `AgentRegistry.addOperator` 授权才能调 `spendOre/refundOre`」写进接口注释 | SC | (设计稿 + interface) | — | 一页设计稿 + interface 定稿；明确 `MAX_ORE_POOL=1000` 派彩 cap 处置（见 §5）；**列出对 Lane P 的注册/授权需求清单** | roadmap **E1.1** · US-D1 |
| **C2** | 自结算市场合约 create/bet/resolve：**只读 GameEngine 状态**（`getScore/hexCount/ownerId`）裁定，注池/抽成/退款逻辑参照 `resolveDebate:804`，通过已有 `spendOre:471/refundOre:482` 钩子动 ore。**自结算型 `resolve` 设为 permissionless（任何人可在 `resolveAt` 后触发，合约读自身/GameEngine 状态裁定，无 operator gate）**——这样 D2 keeper 只需 gas、无需被授权 | SC | PredictionMarket.sol | C1 | 「X 在 T 是否拥有 hex Y」**自动正确结算**，含测试；**`resolve` permissionless（任意 caller 在到期后可触发，无权限 revert）**；**前置 gate：必须经 P2 `addOperator(market)` 后 `spendOre` 才不 revert**（单测里 mock 授权，集成测试走 P2）；**事件 schema DoD：必须 emit `MarketCreated(marketId,...)` / `BetPlaced(marketId,bettor,outcome,amount)` / `MarketResolved(marketId,winningOutcome)`**——这是 D2 keeper、E8 通知、D5 遥测的命名事件源，需 C2 定稿签名 | roadmap **E1.2** · US-D1/D3/D4 |
| **C3** | Oracle 主观市场 + 过期全额退款 + 10% rake（对齐 demo `ORACLE_RAKE_PCT=10`，`demo:239`） | SC | PredictionMarket.sol | C2 | 主观题人工裁定、超时全退、losing pool 10% rake 给 Oracle，含测试；**事件 schema DoD：超时退款路径必须 emit `MarketRefunded(marketId,...)`**（供 E8 通知 + D5 遥测区分 resolved vs refunded） | roadmap **E1.3** · US-D1（mkt-201 联盟外交） |

> Lane C 是**新文件**，只读 GameEngine、经既有钩子动 ore → 与 Lane A 存储改动**零冲突**。但**部署 + Router 注册 + operator 授权属 Lane P（P1/P2）**，C 不自行改 Router/Deploy。**关键依赖链：C1 → P1 → C2 →（集成需 P2 授权）→ D1 → E4**。

---

### Lane D · MCP / keeper / 遥测 / autopilot（mcp-server + 新 keeper + runner）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD | maps-to |
|---|---|---|---|---|---|---|
| **D0** | 修文案漂移：`tools.ts:316` post `+10`→`+5`（`POST_MORALE=5`）、`tools.ts:530` chronicle「10-minute」→「5-minute」（`CHRONICLE_COOLDOWN=300`） | MCP | mcp-server/src/tools.ts | — | 文案与合约一致（good-first） | roadmap **E5.5** |
| **D0b** | 修 `chain.ts` 事件 ABI 漂移：**①删不存在的 `HexClaimed`（`chain.ts:44`）；②`Harvested` 签名改 `(uint256 agentId, uint256 oreGained)`（`chain.ts:47`→对齐 `GameEngine.sol:142`，现错为 `(bytes32 hexKey, uint256 oreGained)`）；③新增缺失的 `HexCaptured(uint256 indexed newOwner, bytes32 indexed hexKey, uint256 indexed oldOwner)` + `HexRebelled(bytes32 indexed hexKey, uint256 indexed oldOwner)`（对齐 `GameEngine.sol:150-151`，`chain.ts` 当前完全缺这两个 ABI）** | MCP | mcp-server/src/chain.ts | — | ABI 与链上一致（含 `HexCaptured/HexRebelled`）；**D5 遥测的领地周转/捕获指标事件源依赖这两个新增 ABI——D0b 是 D5 的硬前置** | 新增（阻塞 D5） |
| **D1** | MCP 市场工具 `create_market/bet/resolve_market/list_markets/get_market`（chain.ts 加 PredictionMarket ABI） | MCP | mcp-server/src/{tools,chain}.ts | **实现起步**：C1（接口）+ P3a（MCP 地址解析就绪）<br>**e2e DoD 依赖**：C2 + P2（含 `addOperator(market)`）+ P3a | **工具实现**可在 C1+P3a 就起步（mock/本地）；**e2e DoD（agent 自主建市 + 下注闭环）必须依 C2（合约可结算）+ P2（部署 + `addOperator(market)`，否则 `spendOre` revert）+ P3a（地址解析）**——三者全绿才算闭环，否则下注 revert | roadmap **E1.4** · US-D1/D3 |
| **D1b** | 补 MCP Arena shop 工具 `arena_roll`/`arena_freeze`/`arena_move`（链上 `roll:391`/`freeze:379`/`move:347` 已存在，仅缺 MCP 暴露；chain.ts 加对应 ABI） | MCP | mcp-server/src/{tools,chain}.ts | — | 三个工具可调，e2e：roll 换 shop、freeze 锁位、move 调序；**为 demo `#/arena` 的 Shop/Roll 提供真实后端** | 新增（demo Shop/Roll 落地） |
| **D2** | keeper：监听到期市场 → 自动 `resolve`（自结算型）；**新文件 `keeper-market.mjs`，与 Arena `keeper.mjs` 同目录不同文件**。**`resolve` 由 C2 设为 permissionless → keeper 私钥仅需 gas、无需 operator 授权**（不依 P4） | INFRA | mcp-server/scripts/keeper-market.mjs（新） | C2（**resolve permissionless**）, **P3a** | 到期 SELF_RESOLVING 市场在 ≤1 tick 内被自动 `resolve`；**keeper 私钥无需 `addOperator`（仅 gas）**；**DoD 验收命令**：`NETWORK=gravity node scripts/keeper-market.mjs ONCE=1` 后 `get_market` 显示 resolved + 派彩到账 | roadmap **E1.6** · US-D4 |
| **D3** | keeper：监听 `AchievementUnlocked`（A2）→ 调 `mintStoryCard`（B3）；**按 `(agentId, achievementTag)` 幂等去重**（持久化 seen-set，避免重铸） | INFRA | mcp-server/scripts/keeper-achievement.mjs（新） | A2, B3, **P4（keeper operator 授权）** | 「写圣典→自动得故事卡」端到端；**exactly-once DoD**：同一 `(agent,tag)` 重放事件**不**二次铸卡（测试：重启 keeper / 重发事件，链上卡数不变）；revoke 测试：`removeOperator(keeper)` 后铸卡 revert | roadmap **E3.3** · US-E5 |
| **D4** | MCP `arena_list_inventory` 等回传**卡元数据**（variant/originAgent/achievementTag/mintedReason），**供 MCP/agent 侧消费**（**非 F5**——前端走 direct RPC 自读，见 F5） | MCP | mcp-server/src/{tools,chain}.ts | B3 | 背包工具返回稀有度/来历字段（非 mock）；**服务对象 = LLM agent / MCP 客户端**，前端 provenance 不经此路径 | roadmap **E3.4** · US-E5 |
| **D5** | 遥测脚本：链上事件→策略分布/财富基尼/淘汰复活率/领地周转 | INFRA | telemetry/（新） | **D0b**（ABI 修复） | **事件源清单**：`AttackResult`/`HexCaptured`/`HexRebelled`/`HexLost`/`DebateResolved`/`Harvested(agentId,oreGained)`；**指标公式**：基尼=Σ\|ore_i−ore_j\|/(2n·Σore)、复活率=respawns/eliminations、领地周转=captures_per_hour；产出**一张 dashboard 或带表头 CSV**（列：metric,window,value,computedAt） | roadmap **E2.2** |
| **D6** | autopilot 计费/gas + **operator-relay 决策稿**（LLM：自带 key/买额度/免费档限流；gas：relay 垫付 vs 用户付）——**仅决策稿，relay 服务实现见 E1b** | 架构/INFRA | (决策稿) | — | 一页决策稿（gate E1b relay 实现 + E7.2） | roadmap **E7.1** · US-B1/C-line |
| **D7** | agent-runner 多租户化：按用户 agent 动态加载/委托/限流（现固定 26 角色 + 全局 `loop_delay_ms` + per-account `heartbeatMs`） | INFRA | agent-runner/* | D6 | **可验收 DoD**：动态注册 2 个用户 agent 后，runner 在不重启下驱动它们各完成 1 个 cycle；每租户独立限流（per-tenant heartbeat 生效）；**并发测试命令**：脚本注册 N=3 agent 并发跑 1min，无串户、无共享限流穿透 | roadmap **E7.2** · US-C1 |
| **D8** | gas/LLM 计量与配额（超额停跑、可充值） | INFRA | agent-runner/*, keeper/ | D6 | 超额停跑、可充值续 | roadmap **E7.4** |

---

### Lane E · 前端写链路 + 真人 UI（**全新子树**，E1 是所有真人功能地基；不碰既有 hooks/页面）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD（具体 route/按钮/交易态/错误态） | maps-to |
|---|---|---|---|---|---|---|
| **E1**（gate） | **钱包连接 + 写链路基座**：嵌入式钱包/社交登录（Privy/Dynamic 类）+ wagmi/viem，**新建 `hooks/wallet/*` + `lib/wallet/*` + `components/wallet/*`**（不改 `useGameEngine/useArenaEngine`） | FE | frontend/src/{hooks/wallet,lib/wallet,components/wallet}（新） | — | 真人登录后能调用一个 agent 写动作（用 `build` 或 `raid` 验——它们经 `canControlAgent`，真正证明签名者有权控该 agent；`harvest` 无 gate 不算）成功；**tx 三态**（pending/confirmed/failed）有 UI；钱包未连/链错有错误态 | roadmap **E6.1** · US-A4→B1 |
| **E1b-a**（M0） | **operator-relay skeleton**：relay client 接口桩 + 后端 endpoint 骨架（路由/鉴权中间件/限流中间件占位），**不接真实 signer**——纯结构，可与 E1 并行铺底 | FE/INFRA | lib/wallet/relay-client + 后端 relay endpoint 骨架 | — | `POST /relay` 骨架返回 stub；鉴权/限流中间件挂载点就位；**不依赖 D6/Auth 决策** | roadmap **E7.1/E7.2**（拆分） |
| **E1b-b**（gate） | **operator-relay 实现（真实代发）**：接真实平台 relay signer 代发受 `canControlAgent` gate 的 `build`/`raid` + 鉴权（签名校验/会话）+ 限流 + 撤权 | FE/INFRA | lib/wallet/relay-client + 后端 relay endpoint | **D6（决策稿）+ §2 Auth/Delegation 决策 + P5（relay signer 授权）** | **可验收**：① `POST /relay` 鉴权后代发 **`build` 或 `raid` 成功**（relay signer 已被 `addOperator`，否则 `canControlAgent` `GameEngine.sol:173` 拒；**不用 `harvest:289` 验——它无 gate，成功只证明「能发交易」，不证明授权生效**）；② 限流命中返回 429；③ **撤权语义拆两层**：**(a-用户级) 暂停/收回 = 链下 flag（relay/DB），命中后该用户请求被拒（401/403）**——`AgentRegistry` 无 per-user 撤权能力；**(a-平台级) `removeOperator(relaySigner)` = owner-only 全局 kill switch**（撤后**所有**用户的 `build`/`raid` 代发 revert，非单用户）；(b) 走用户 `undelegate`；**并发/撤权测试命令**：脚本并发 20 请求验限流 + 链下 flag 撤后 401 + 全局 `removeOperator` 后 `build`/`raid` 代发 revert | roadmap **E7.1/E7.2** · US-B1/C-line（gasless） |
| **E2** | Agent 创建/onboarding 流（连钱包→`createAgent(name,personality,…)`→命名/性格/原型）。对应 demo `#/onboard` 4 步 | FE/MCP | frontend/src/app/onboard/*（新） | E1（gasless 路径再依 **E1b-b**） | 真人从零拥有一个 agent（领 7 格 + 200 ore）；4 步流可前进/回退；createAgent 失败有错误态 | roadmap **E6.2** · US-B1 |
| **E3** | autopilot 开/关控件（对应 demo `#/me` AUTOPILOT 大开关，子组件挂在 E 的 `app/me` 主壳）。**语义 gate 在 §2 Auth/Delegation 决策**：**(a)（默认）**=链下 runner/relay 启停标志（DB flag + relay 拒发），**不调** `addOperator/removeOperator`（那是 `onlyOwner` 全局，非用户可调，`AgentRegistry.sol:67-68`）；**(b)**=调新 per-agent `delegate/undelegate`（A3） | FE | frontend/src/components/wallet/AutopilotToggle | E1 + **§2 Auth/Delegation 决策**（决定开关语义；走 (b) 还依赖 A3） | (a)：开关切换链下 autopilot 标志、relay 据此启停代发，UI 显示当前态（链下读）；(b)：开关调链上 `delegate/undelegate`，回读 per-agent 委托态，切换有 tx 态。**文档不得声称「用户链上 `addOperator/removeOperator` 可收回」**（合约不支持） | roadmap **E6.3** · US-C2 |
| **E4** | 预测市场前端完整 UX：市场流 / 详情(世界上下文+AI brief) / 下注弹层(赔率+派彩预估+parimutuel 说明) / 持仓 / 结算凭证。对应 demo `#/markets` US-D1~D4，**含 SELF_RESOLVING + ORACLE 两型**（对齐 demo:215） | FE | frontend/src/app/markets/*（新） | **E1 + D1 + C2**；**Oracle 全功能再依赖 C3/D（oracle 工具）** | 端到端下注 + 看结算 + 凭证；具体路由 `/markets`、`/markets/[id]`；下注按钮 tx 三态；押对/押错凭证页 | roadmap **E6.4** · US-D1~D4 |
| **E5** | 卡牌画廊 + provenance 故事 + 二级市场买卖 **UI（仅前端人类界面——后端工具已 DONE）**。对应 demo `#/arena` CARD MARKET/COLLECTION US-E3/E5。**文件域决策：归 E，落新子路由 `app/arena/market/*`（E 独占）**——不改 F 的 `app/arena/page.tsx`；F 的 arena 页若要入口仅放跳转链接。**后端不重建**：MCP 二级市场工具 `arena_place_listing`/`arena_cancel_listing`/`arena_buy_listing` **已存在**（`tools.ts:721/735/748`，DONE），E5 只在其上做人类 UI；写链直接走 `buyListed→gTreasury.spendG`（`CardLedger.sol:131`） | FE | frontend/src/components/wallet/CardMarket + **app/arena/market/*（E 独占新子路由）** | **E1 + E6（G 余额）**；provenance 显示依赖 B3 + F5（卡详情元数据）；买卖后端工具 **已 DONE（`tools.ts:721/735/748`）** | 真人能浏览/买卖卡、看 provenance；list/buy/cancel 各有 tx 态；G 不足有错误态 | roadmap **E6.5** · US-E3/E5 |
| **E6** | G 充值 on-ramp（`depositG`）+ 余额(G/ore)展示。对应 demo `Deposit G` US-E1 | FE/MCP | frontend/src/components/wallet/DepositG | E1 | 真人能充 G 并看到余额（读 `gTreasury.gBalance` + `orePool`）；deposit tx 三态 | roadmap **E6.6** · US-E1 |
| **E7** | 真人「喂目标 / 接管 / 暂停」控制面。对应 demo `#/me` SET GOAL + QUICK ACTIONS US-C2/C3 | FE/MCP | frontend/src/components/wallet/AgentControls（挂 `app/me` 主壳） | E3, D7（**两者都 gate 在 §2 Auth/Delegation 决策**：接管/代发走 relay → 依 E1b-b + P5；暂停语义同 E3 的 (a)/(b)） | 真人能设目标、暂停、手动接管一回合；每动作有结果反馈 | roadmap **E7.3** · US-C2/C3 |
| **E8** | 通知（结算/派彩/被超价/成就铸卡） | FE/INFRA | frontend/src/components/wallet/Notifications | **C2（`MarketResolved`）+ C3（`MarketRefunded`）+ B3（`StoryCardMinted`）的命名事件 DoD 就绪** + `CardLedger` 现有买卖事件 | **可验收**：监听 `MarketResolved`(C2)/`MarketRefunded`(C3)/`StoryCardMinted`(B3 成就铸卡，区别于普通 `CardMinted`)/`ListedCardBought`(`CardLedger`)→toast+列表；**事件源清单**写在组件头注释；点通知跳对应页 | roadmap **E6.7** · US-D4/E |
| **E9** | 移动端响应式 + i18n 收口（已有 zh/en） | FE | frontend/src/app/{onboard,markets,me} + i18n | — | **可验收**：`/onboard`、`/markets`、`/me` 在 **375×812（iPhone X）视口**无横向滚动、关键按钮可点；i18n 两语种无缺键 | roadmap **E6.9** |

---

### Lane F · 前端只读可视化 + 账本/Lore 页（既有子树 + 新只读页；**Arena 页 + store 唯一 owner**）

| ID | 标题 | 角色 | 文件域 | 依赖 | DoD | maps-to |
|---|---|---|---|---|---|---|
| **F1** | 删死代码 `frontend/src/chain/`（5 文件，grep 复核无引用） | FE | frontend/src/chain | — | 无引用、构建通过 | roadmap **E5.6** |
| **F2** | `ReplayCanvas` 把能力事件插在攻击步间演（召唤淡入 / buff 跳字 / 死亡连锁高亮） | FE | frontend/src/components/arena, phaser | **B2 + D（trace 经 `simulateMatch`/新 trace 工具回传）** | 能看出「Wraith 死→召唤 3/3」连锁；回放仍确定性 | roadmap **E4.2** · US-E4 |
| **F3** | BattleLog 能力事件旁白（可选） | FE | frontend/src/components/arena | B2 | 日志逐条可读 | roadmap **E4.3** · US-E4 |
| **F4** | 战斗回放分享链接 / 片段导出（demo Share 当前是 mock toast，`demo:2515`） | FE | frontend/src/components/arena | （回放就绪） | 一局可分享/导出；生成可访问链接 | roadmap **E6.8** · US-E4 |
| **F5** | 卡详情弹窗展示真实元数据（variant/provenance/能力 trigger→effect→target）；对齐 12 单位 | FE | frontend/src/components/arena/UnitCard + 详情弹窗 + **`hooks/useArenaEngine.ts`（F 独占）/ `store/useArenaStore.ts` 的 ABI/types 扩展** | **B3（链上 Card 元数据 + `StoryCardMinted`）+ F 自有 `useArenaEngine`/`useArenaStore` ABI/types**（前端是 **direct RPC 读**，`useArenaEngine.ts:55`，**不经 MCP**——所以 **不依赖 D4**；D4 只服务 MCP/agent 侧） | 背包/卡详情显示真出处与能力（非 mock），数据经 F 自己在 `useArenaEngine` 扩展的 CardLedger ABI（`:55-59`）直读链上 B3 字段 | roadmap **E3.4** · US-E5 |
| **F6** | **My-Agent / Lore / 账本只读页**（chronicle/memory/bulletin/inbox/world-bible）——**构建在现有 direct-RPC 读之上**：复用 `useGameEngine.ts` 已经在读的 memories(`:192`)/location(`:199`)/inbox(`:205`)/chronicle(`:211`)/evaluations(`:230`)/world-bible(`:238`) 与 store；新建 `app/lore` 页 + `app/me` 的账本子组件，**不是接 MCP** | FE | frontend/src/app/lore（新）+ components/ledger（新只读组件）+ store | （**现有 direct-RPC 读已存在**） | `/lore` 页渲染 world-bible + chronicle 排行；`app/me` 账本子组件渲染该 agent 的 memory/inbox/bulletin/eval——**全部来自现有 `useGameStore` 数据，零后端新工作** | roadmap **E6 身份层** · US-F1~F5 |
| **F7** | **前端 Router getter 阶梯加 V4 探测**（拆自旧 P3）：在 F 独占的 `useArenaEngine.ts:171` 现有 V3→V2→V1 fallback 阶梯顶部加 `getAddressesV4()` 探测，解出 PredictionMarket 地址；un-upgraded Router（无 V4）安全回落到 V3。**P 不碰此文件**（P 侧地址解析在 P3a 的 `addressResolver.ts`） | FE | frontend/src/hooks/useArenaEngine.ts（F 独占） | **P1（V4 getter 上链）** | `getAddressesV4` 成功时解出市场地址；旧 Router 不抛错、回落 V3；与 P3a 的 config 对齐 | 新增（codex round-3：P3 拆分） |
| **F8** | **World 观众态落地页**（demo US-A1~A3，覆盖现有 `app/page.tsx:14` 仅 PhaserMap+Sidebar+HUD 之外的观众转化层）：Hero（标语 + 开户/See-how-AI-thinks 双 CTA）、LIVE DRAMA 跑马灯、SCOREBOARD、FEATURED MARKETS 迷你卡（点击跳 `/markets`）、AGENTMIND · LIVE DECISION LOG（real-AI-thinking 钩子，US-A2 平滑滚动锚点）。**read-only**，复用 `useGameStore` 的 scoreboard/memory/evaluation 数据 + F9 的 AgentMind 流；市场迷你卡读真实市场（D1/C2 就绪后）、未就绪时占位 | FE | frontend/src/app/page.tsx + frontend/src/components/spectator/*（新只读组件，F 独占） | （现有 direct-RPC 读）；FEATURED MARKETS 真实数据再依 **D1/C2** | `SPECTATOR MODE · no wallet needed` 落地页渲染 hero+drama+scoreboard+featured markets+AGENTMIND log；市场卡跳 `/markets`；See-how-AI-thinks 锚点滚动到 AgentMind；无登录可看 | 新增（codex round-3：World 观众态缺任务） |
| **F9** | **`/me` 实时 AgentMind / status 读面板**（demo US-C1）：进 My Agent 即见 AGENTMIND 实时思考/行为流（spawn + 开局推理 + autopilot 开时新增的 harvest/build/scan/post 行为）、余额（ORE /1000、G）与建筑数随行为**联动更新**。**read 组件**，落 `components/ledger/*`（F 独占），由 **E 的 `app/me` 主壳 import**（遵 §2.1 `/me` 拆法：壳=E、读子组件=F）；复用现有 `useGameEngine` 的 memory/evaluation direct-RPC 读（同 `AgentMindPanel.tsx` 范式）+ agent stats 轮询 | FE | frontend/src/components/ledger/AgentMindLive（F 独占，E 主壳 import） | （现有 direct-RPC 读）；写控件态由 E3/E7 提供 | 进 `/me` 即见非空 AgentMind 流；autopilot 开时面板随链上新 memory/stats 增量刷新（ore/buildings 联动）；纯读、不写链 | 新增（codex round-3：/me AgentMind 缺任务） |

> **纠正旧稿 F6**：前端**已经用 ethers 直连 RPC** 读全部 5 类账本（`useGameEngine.ts:192/199/205/211/230/238`），arena 页已复用 `useGameEngine()` 给 `AgentMindPanel` 喂 memories+evaluations（`arena/page.tsx:18`、`AgentMindPanel.tsx:29`）。所以 F6 不是「接 MCP 读路径」，而是**在现有 direct-RPC 数据上补 My-Agent / Lore / 账本页面**——成本最低的一块，但工作量在「建页面/组件」而非「接数据源」。

---

## 3. 并行计划（lane × milestone 矩阵，零文件域碰撞）

> M0 = 解锁/使能（铺底，全并行）；M1 = 第一批竖切（端到端可演）；M2 = 闭环。

| Lane \ 里程碑 | **M0 · 解锁** | **M1 · 竖切** | **M2 · 闭环** |
|---|---|---|---|
| **P**（平台/部署） | **P5**（relay signer 授权，仅依 Auth 决策 + relay signer 地址/运维权限，**不依 P2**） | **P1**（Router 市场槽位）、**P2**（部署+授权脚本） | **P3a**（config+`addressResolver.ts` 地址同步）、**P4**（keeper 授权） |
| **A**（GameEngine） | **A1**（参数 storage 化，**先 land**） | **A2**（成就事件 + tag）、**A3**（per-agent delegation，**仅当 Auth 决策选 (b)**） | — |
| **B**（Arena 合约） | **B1**（RNG）、**B2**（trace 吐能力事件） | **B3**（Card 元数据 + mintStoryCard） | — |
| **C**（市场新合约） | **C1**（interface 设计 + 列授权需求） | **C2**（自结算市场，集成需 P2） | **C3**（Oracle + 退款 + rake） |
| **D**（MCP/INFRA） | **D0**（文案）、**D0b**（事件 ABI 修复）、**D1b**（arena shop 工具）、**D6**（决策稿）、**D5**（遥测，依 D0b） | **D1**（市场工具，依 P3a）、**D4**（卡元数据工具）、**D7**（多租户 runner） | **D2**（结算 keeper）、**D3**（成就铸卡 keeper，去重）、**D8**（计量配额） |
| **E**（FE 写链路） | **E1**（钱包/写链路地基）、**E1b-a**（relay skeleton） | **E2/E3**（onboarding + autopilot 开关，E3 依 Auth 决策）、**E1b-b**（relay 实现，依 D6+Auth 决策+P5）、**E4**（市场 UX，依 D1+C2） | **E5**（卡市 UI）、**E6/E8/E9**（充值/通知/移动端）、**E7**（喂目标/接管，依 Auth 决策） |
| **F**（FE 只读） | **F1**（删死代码）、**F6**（My-Agent/Lore/账本页，依现有 direct-RPC 读）、**F8**（World 观众落地页）、**F9**（`/me` 实时 AgentMind 面板） | **F2**（能力回放，依 B2）、**F4**（分享导出）、**F7**（前端 V4 resolver，依 P1） | **F3**（旁白）、**F5**（卡详情真元数据，依 **B3 + F 自有 `useArenaEngine`/`useArenaStore` types**，**不依赖 D4**） |

### 关键路径（corrected critical path）

```
市场竖切（最长链，含部署授权 gate）：
  C1 ─► P1（Router 槽位）─► C2（自结算合约）─► P2（部署+addOperator(market)）
                                                     │
                                P3a（地址/ABI 同步）─┤
                                                     ▼
                                                 D1（市场 MCP 工具）─► E4（市场前端 UX）
                                                                          ▲
  E1（钱包/写链路地基）────────────────────────────────────────────────────┘
  E1b-a（relay skeleton, M0 并行）；E1b-b（relay 实现）依 D6 + Auth决策 + P5 ── gate gasless onboarding（E2 等）

Auth/Delegation 决策（§2，M0 拍板）──┬─► E3（autopilot 开关语义）
                                     ├─► E1b-b / P5（relay signer 授权）
                                     ├─► E7（接管/暂停）、D7（多租户委托）
                                     └─►〔若选 (b)〕A3（per-agent delegation 合约）

Oracle 全功能支链：  C2 ─► C3（Oracle+rake）─► D（oracle 工具/已有 oracle debate）─► E4 的 Oracle 切片
成就铸卡支链：       A1 ─► A2（带 tag）；B3 ─► P4（授权）─► D3（去重铸卡 keeper）
能力回放支链：       B2 ─► D（trace 工具）─► F2
```

- **最长链 = 市场竖切**：`C1→P1→C2→P2→(P3a)→D1→E4`。**纠正旧稿 `C1→C2→D1→E4`**：漏了 **P1（Router 槽位）/ P2（部署 + `addOperator(market)`）/ P3a（地址同步）** 三个平台 gate——没有 operator 授权，`spendOre/refundOre` 直接 revert，下注闭环跑不通。
- **E1 是隐形关键路径**：gate `E2~E9` 所有真人写操作，必须 M0 拿下；**E1b-b（relay 实现）** gate gasless onboarding，且自身 gate 在 **D6 决策稿 + §2 Auth/Delegation 决策 + P5（relay signer 授权）**。
- **Auth/Delegation 决策是新的隐形 gate**：M0 必须拍板 (a)/(b)，否则 E3/E1b-b/E7/D7（+ 若选 (b) 还有 A3 合约任务）按错误前提开工。
- **支链**：`B2→F2`（能力回放）、`A2+B3+P4→D3`（成就铸卡，含去重）、`C3→E4-Oracle`（Oracle 市场全功能）。
- **可立即并行、零阻塞**：A1、B1、C1、D0、D0b、D1b、D5、D6、E1、**E1b-a（skeleton）**、**P5（仅依 Auth 决策，不依 P2）**、F1、F6、**F8（World 观众落地，featured-markets 真实数据后补）**、**F9（/me 实时 AgentMind）**——M0 一次性全开。（**E1b-b 不在此列**——它依 D6+Auth 决策+P5；Auth 决策本身也应 M0 优先拍板）

---

## 4. Make-the-demo-real 映射（诚实标注合约/部署前置）

| demo 预览的功能 | demo 锚点（US / 路由） | 让它变真的任务 | 阻塞依赖（诚实标注） |
|---|---|---|---|
| World 观众落地页（Hero / LIVE DRAMA / SCOREBOARD / FEATURED MARKETS / AGENTMIND log + Spectator CTA） | US-A1~A3 · `#/` | **F8**（观众落地页，read-only；FEATURED MARKETS 真实数据再依 D1/C2） | 真实 `/` 现仅 PhaserMap+Sidebar+HUD（`app/page.tsx:14`）——观众转化层（hero/featured markets/AI-thought 钩子/spectator CTA）**缺任务**，F8 补；scoreboard/AgentMind 复用现有 direct-RPC 读，市场卡待 D1/C2 |
| 钱包 onboarding（社交登录/嵌入式钱包/gasless） | US-A4/B1 · `#/onboard` | **E1 → E1b-a/E1b-b（relay）→ E2** | 合约**已支持全局 operator 代发**（`canControlAgent` `GameEngine.sol:173` 认全局 operator）；**但无 per-agent 委托**——gasless 走「全局 relay signer 经 `addOperator` 授权（P5）」(a) 或新增 per-agent delegation (b)，见 §2 Auth/Delegation 决策；纯前端 + **真实 relay 服务**（E1b-b，非决策稿） |
| autopilot / 喂目标 / 接管开关 + **实时 AgentMind/status 面板** | US-C1/C2 · `#/me` | E3、E7、**D7**（多租户 runner）；**F9**（`/me` 实时 AgentMind/余额/建筑联动只读面板，US-C1 啊哈瞬间） | 受 D6 计费决策 + **§2 Auth/Delegation 决策** gate；**autopilot 开关 (a) 默认是链下 runner/relay 启停标志，非链上用户可收回的委托**（`addOperator/removeOperator` 是 `onlyOwner`，`AgentRegistry.sol:67-68`）；runner 现固定 26 角色需多租户化；**F9 read 面板**复用现有 direct-RPC memory/eval 读（同 `AgentMindPanel.tsx` 范式），E 主壳 import |
| 预测市场（下注/赔率/持仓/结算/凭证） | US-D1~D4 · `#/markets` | **C1→P1→C2→P2→D1→E4**（Oracle 切片再加 C3） | **合约 + 部署前置硬依赖**：现无 `PredictionMarket`、Router 无槽位、market 未授权为 operator；现市场绑 hex/民心做不出解耦题 |
| 账本视图（声誉/记忆/公告板/私信/圣典） | US-F1~F5 · `#/me`/`#/lore` | **F6**（在**现有 direct-RPC 读**上补页面） | **几乎无后端阻塞**：前端**已直连 RPC 读全部 5 类账本**（`useGameEngine.ts:192/199/205/211/230/238`）；F6 工作量在「建 My-Agent/Lore 页面与组件」 |
| Arena 收藏 / 组阵 / 买卖 / **Shop·Roll·Freeze·Move** | US-E0~E3 · `#/arena` | **E5**（买卖 UI only，落 `app/arena/market/*`，+ E6 充值）；**D1b**（补 `arena_roll/freeze/move` MCP 工具）；卡库存/二级市场合约**已可用**（`CardLedger.sol:88-131`），链上 shop `roll:391/freeze:379/move:347` **已存在**；**二级市场 MCP 工具 `arena_place_listing/cancel_listing/buy_listing` 已 DONE（`tools.ts:721/735/748`）** | 主要前端写路径 + E1 + **D1b 补 MCP 工具**；买卖后端（合约 + MCP 工具）**全已就绪**，E5 仅缺人类 UI；shop 逻辑**已在链上** |
| 能力可视化（召唤/buff/死亡连锁回放） | US-E4 · `#/arena` BATTLE REPLAY | **B2（合约先吐 AbilityEvent[]）→ D（trace 工具）→ F2/F3** | **不能只「wire up」**：`ArenaCombat.Turn:30` 现只记普攻步——**B2 是硬 gate** |
| provenance 故事卡 | US-E5 · 卡详情弹窗 | **B3→F5**（前端 direct RPC 自读，F5 = B3 + F 自有 `useArenaEngine`/`useArenaStore` types，**不经 D4**）；**D4** 另服务 MCP/agent 侧（D4 ← B3）；铸卡触发 = **A2→P4→D3（去重）** | **不能只「wire up」**：链上 `Card:17` 仅 4 字段，provenance 真缺位 — demo 弹窗已自标 MOCK |
| 战斗回放分享/导出 | US-E4 · Share 按钮 | **F4** | 现 Share 是 mock toast（`demo:2515`）；纯前端 |

---

## 5. 风险 / 待决（review 时拍板）

1. **PredictionMarket 部署/授权链路是真人下注的硬前置**（Lane P / codex Top-1）：`spendOre:471`/`refundOre:482` 均 `onlyOperatorOrOwner`，新市场合约**必须经 `AgentRegistry.addOperator(market)`（Deploy/Upgrade 脚本，仿 `Deploy.s.sol:98/118`）**才能动 ore；Router 还需加槽位（`Router.sol` 现止于 `cardLedger:21`）。这条链漏一环，D1/E4 闭环全断。✅ **已拍板：自结算型 `resolve` 设为 permissionless**（C2），故 market keeper（D2）仅需 gas、无需 operator 授权（不依 P4）。
2. **RNG 硬化是真实价值的硬前置**（B1/roadmap E0.1）：`ArenaEngine.sol:545` `prevrandao` 可 grind，代码自带 TODO（`:545-548`）。市场/卡挂真实价值后，可操纵种子 + 人工裁定从「demo 瑕疵」升级为「可被薅的金融漏洞」。自结算市场（C2 读链上事实）能绕开预测这一半，但 **Arena 匹配仍需 VRF/commit-reveal**。🔵 VRF vs commit-reveal 未定。
3. **预测市场货币 ore vs G**：roadmap 已拍板 **v1 用 ore，`currency` 做成可插拔参数，G 后置**。C1 设计务必把 `currency` 留成市场创建参数，避免日后重写结算引擎。
4. **`MAX_ORE_POOL=1000` 派彩 cap**（`GameEngine.sol:26`）：会**静默吞派彩**，demo 已暴露此 bug（US-D4 押对却弹 lost）。🔵 市场派彩需**豁免此 cap** 还是接受截断？C2/C3 必须显式处理。
5. **成就铸卡 exactly-once**（A2/D3/codex）：`writeChronicle:987` 仅 emit `ChronicleWritten`，无破阈状态位。本轮选 **keeper 按 `(agent, achievementTag)` 幂等去重**（D3），不在合约加状态位；若后续要强一致，再评估合约阈值状态。A2 的 `AchievementUnlocked` **必须带 `achievementTag`** 才能去重。
6. **autopilot 计费/gas + 委托模型（D6/E1b/Auth 决策/roadmap E7.1）**：N 个用户 agent 线性增长 LLM + gas；现 runner 固定 26 角色 + 全局 `loop_delay_ms` + per-account `heartbeatMs` 是天花板。operator-relay（**E1b-b 真实实现**，非决策稿）同解 gasless 上手 + autopilot，但平台需被信任执行 + 垫 gas（靠 G 抽成回收）。**M0 出决策稿（D6）+ 拍板 §2 Auth/Delegation (a)/(b)；M0 起 skeleton（E1b-a），M1 实现服务（E1b-b）**。🔵 **委托模型未决**：当前 `AgentRegistry` 只有**全局** `onlyOwner` operator（`:24/:67-68`），**无 per-agent 委托**——(a) 全局 relay signer + 链下开关 vs (b) 加 per-agent delegation 合约（A3，含 storage-layout 测试），M0 必须拍板，否则 E3/E1b-b/E7/D7 按错误前提开工。
7. **provenance 体感依赖单位扩容**：现仅 12 单位（`UnitCatalog.sol`），叙事卡 variant 收藏空间薄。roadmap 建议**单开「12→60 单位」epic**，不塞进 B3。🔵 谁长期负责未定。
8. **ERC-721 外部可流通后置**（roadmap E3.5）：被「RNG 完整性 + 单位扩容」gate，不进本轮。

---

## 6. 与 roadmap WBS 的偏差（本文据当前代码校准的点）

- **新增 Lane P（平台/部署/授权）**：roadmap 未单列。codex 指出 PredictionMarket 漏了 Router 注册 + operator 授权 + 部署脚本 gate（`Router.sol:10-21`、`AgentRegistry.addOperator:67`、`Deploy.s.sol:98/118`）——本文抽出 Lane P 作为**唯一基础设施 owner**，杜绝 C/D/E 并发改 Router/脚本/config。
- **frontend lane 重切，文件域 disjoint（§2.1）**：旧稿 E/F 会撞 `app/arena/page.tsx`、`hooks/`。现状：**E = 全新 wallet/write 子树**（不改 `useGameEngine/useArenaEngine`）、**F = `/arena` 页 + store + `hooks/useArenaEngine.ts`（Arena 读 + CardLedger ABI，`:53-59`/`:920`）+ 只读组件 + 新 Lore 页的唯一 owner**；`/me` 路由（**当前不存在，E 新建**）按「`app/me/*` 全归 E、账本子组件落 `components/ledger/*` 归 F、E 主壳 import F 组件」拆，保证一文件一 owner。
- **`mcp-server/src/chain.ts` 硬派给 D 独占（codex round-2）**：旧稿 P3「ABI/版本同步」与 D0b/D1/D1b/D4 都改 `chain.ts` → 撞车。现状：**`chain.ts` 唯一 owner = D**；P 改地址改在 `frontend/config/*` + **新增 P 独占的 `mcp-server/src/addressResolver.ts`**（**P3a**），任何 `chain.ts` 的 ABI/地址同步以请求形式排队进 D。
- **P3 拆分（codex round-3）**：旧 P3 把「前端 Router getter 阶梯加 V4 探测」也塞给 P，但该阶梯在 **F 独占的 `useArenaEngine.ts:171`**（V3→V2→V1 fallback），P 改它会撞 F。现状拆成 **P3a（config + `mcp-server/src/addressResolver.ts`，P 独占）** 与 **F7（前端 `useArenaEngine.ts` 加 V4 探测，F 独占）**——P 只动自己的文件。
- **Auth/Delegation 是 false premise，已加决策门（codex round-2 Top-1）**：旧稿 E3 写「owner→operator 委托开关，调 `addOperator/removeOperator` 可收回」**不成立**——`AgentRegistry.operators` 是**全局** mapping（`:24`），`addOperator/removeOperator` 是 **`onlyOwner`**（`:67-68`，非 agent owner 可调），`canControlAgent`（`:45-48`）无 per-agent 委托。§2 新增 **Auth/Delegation 决策门**：(a) 全局 operator + 链下开关（默认）/ (b) 加 per-agent delegation 合约（A3）。E3/E1b-b/E7/D7（+ P5 relay signer 授权）全部 gate 在此决策之后。
- **F6 现状纠正**：roadmap/旧稿暗示「接 MCP 读路径」。实测前端**已用 ethers 直连 RPC 读全部 5 类账本**（`useGameEngine.ts:192/199/205/211/230/238`，arena 页已复用喂 `AgentMindPanel`）——F6 改为「在现有 direct-RPC 数据上补 My-Agent/Lore/账本页面」。
- **stale 事实已修**：demo 行数 **2604**（非 2004），ELO replay 逻辑锚 `demo:2488`（`settled` ref）+ `:2513`（Play 重置 `settled.current=false`，借 `C.ELO_WIN_DELTA` 重刷）；**已有 Arena keeper `keeper.mjs`**（`justfile:90`），缺的是**市场结算 / 成就铸卡** keeper；节流是**全局 `loop_delay_ms`（5min 默认）+ per-account `heartbeatMs`（多数 5s）**，非「全局 5min」；`chain.ts:166`+ 是 CardLedger ABI，MCP 暴露 `simulateMatch`（`:136`），非 `simulateWithTrace`；GameEngine 21 主世界常量在 `:25-45`，debate/chronicle 在 `:48-59`。
- **事件 ABI 漂移列为实任务（D0b，codex round-2 补全）**：`chain.ts:44` 的 `HexClaimed` 不存在（删）、`chain.ts:47` 的 `Harvested(bytes32...)` 签名错（改 `(uint256 agentId, uint256 oreGained)` `GameEngine.sol:142`）、**且 `chain.ts` 完全缺 `HexCaptured(uint256,bytes32,uint256)` + `HexRebelled(bytes32,uint256)`（`GameEngine.sol:150-151`，须新增）**——这是 **D5 遥测领地周转/捕获指标的硬前置**。
- **Arena Shop/Roll 落地（D1b）**：链上 `roll:391`/`freeze:379`/`move:347` 已存在，但 MCP `tools.ts` 未暴露（arena 工具止于 buy/place/remove/list/submit，`:611`+）——补 `arena_roll/freeze/move` 才能让 demo `#/arena` 的 Shop/Roll 变真。
- **roadmap E5.5/E5.6 仍成立**：文案漂移 `tools.ts:316/530`（D0）、死代码 `frontend/src/chain/`（F1，grep 复核无引用）确认未修/可删。
- **Arena 二级市场比 roadmap 措辞更「已可用」**：合约 `CardLedger.listCard:88/cancelListing:110/buyListed:118`（G 计价走 `gTreasury.spendG:131`）**加 MCP 工具 `arena_place_listing/cancel_listing/buy_listing`（`tools.ts:721/735/748`）端到端全已就绪**——E5 仅缺真人 UI + E1，**后端（合约 + MCP）不需重建**。
- **新增任务（codex round-3）**：**F7**（前端 Router V4 resolver，拆自旧 P3，归 F 独占 `useArenaEngine.ts:171`）、**F8**（World 观众态落地页，补 demo US-A1~A3 在旧稿映射中缺席的 hero/featured-markets/AI-thought 钩子/spectator CTA；真实 `/` 现仅 PhaserMap+Sidebar+HUD `app/page.tsx:14`）、**F9**（`/me` 实时 AgentMind/status 只读面板，补 demo US-C1 啊哈瞬间；read 组件落 `components/ledger/*`，E 主壳 import）。
- **参数化范式已存在**：`ArenaEngine.setTierThresholds:217/setMatchmakingPeriod:573` 真实存在，A1 有现成范式可抄。
- **demo 已知 bug 回灌为开发备注**：`demo:2488-2513` 的 ELO 可重复刷（回放 `settled` ref 被 Play 重置）是 demo-only mock 缺陷，真实现（F2/F4 接真实结算）天然规避——不单列任务，review 时提示。

---

## 7. 无法核实 / 留待确认

- **relay 后端落点（须定单一 owner）**：E1b 的 relay endpoint 放在哪个服务（独立 Node 服务 / mcp-server 扩展 / 新仓）未在代码中体现，需架构拍板（D6 决策稿覆盖）。**一旦拍板，该后端目录必须有唯一 owner**：若放 mcp-server 则归 D（与 `chain.ts` 同 lane）、若独立服务则归 E1b 的 FE/INFRA owner——不得 E/D 共改同一 relay 文件。本轮文件域表把 relay client（`lib/wallet/relay-client`）归 E，后端 endpoint 落点待此决策后补进表。
- **Auth/Delegation 决策本身**：本轮代码核实「无 per-agent 委托」属实（`AgentRegistry.sol:24/45-48/67-68`），但**选 (a) 还是 (b) 是产品/安全权衡**（平台信任 vs 用户自托管），需 owner 拍板——文档已把两条路径都写明并默认 (a)。
- **`eloUpdate` 精确行号**：旧稿写 `eloUpdate:93`，本轮在 `ArenaEngine.sol` 未二次定位精确行，ELO 逻辑存在属实但行号待 owner 复核。
