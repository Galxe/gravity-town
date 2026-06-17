# Gravity Town · World-as-Market 开发任务分解（可执行工单版）

> 机制权威源 = `docs/world-as-market.md`；本文是其执行车道/工单细化。
>
> 目的：把 owner 已拍板的 **World-as-Market（万物皆答题 + 双币）** 机制落成一份按文件域切分、可多人并行 review 的执行工单。旧 ore-based、独立 `PredictionMarket`、分立入口扩展计划正式作废；本文保留旧文档的“功能点 / 现状&缺口(file:line) / 子任务拆分 / 验收标准(命令→期望)”格式。
>
> 路径约定：所有 `file:line` 以仓库根 `/mnt/data2/kenji/galxe/game` 为准；行号已按当前 PR #76 工作树重新核实。
>
> 角色：`SC`=合约 · `MCP`=工具层 · `FE`=前端 · `INFRA`=keeper/runner/遥测 · `PLAT`=部署/Router/授权 · `DOC`=文档/决策。

---

## 1. 现状快照（一表锚定，含 file:line）

| 领域 | DONE（已可用） | MOCK / LEGACY | MISSING / GAP（World-as-Market 要补） |
|---|---|---|---|
| **目标架构 vs 当前架构** | 目标是统一 `World` 合约：唯一问题/市场流、唯一 G 金库入口、统一 `Question` 状态机。现状仍是分立 `GameEngine` + ledgers + Arena：`GameEngine` 持有 registry/ledger 引用（`contracts/src/GameEngine.sol:15-18`）、hex/ore storage（`contracts/src/GameEngine.sol:63-83`）、debate storage（`contracts/src/GameEngine.sol:88-112`）、chronicle/world bible storage（`contracts/src/GameEngine.sol:114-135`）。 | 旧 dev-breakdown 的独立 `PredictionMarket` 路线作废；现有“市场”只是 `GameEngine` debate 的 ore betting。 | 新建中心 `World` / `IWorldQuestion` / extension registry；把 harvest/build/raid/debate 等动作包装为 `Question`，并逐步冻结旧 `GameEngine` 直写入口。 |
| **主世界入口** | `createAgent` 自动 7 hex + 200 ore（`contracts/src/GameEngine.sol:231-264`）；`harvest` permissionless（`contracts/src/GameEngine.sol:288-290`）；`build` 受 `canControlAgent` gate（`contracts/src/GameEngine.sol:344-345`）；`attack`/`raid` 直写世界状态（`contracts/src/GameEngine.sol:375-448`、`contracts/src/GameEngine.sol:622-695`）；`inciteRebellion` 0 hex comeback（`contracts/src/GameEngine.sol:563-615`）。 | demo quick actions 仍是内存态 Harvest/Build/Raid/Bet（`demo/index.html:1344-1357`）。 | `World.answer_question` 接管基础动作；旧 `harvest/build/attack/raid/incite/startDebate/vote/resolve` 外部直写在 MCP/runner 切流后 freeze。 |
| **双币经济** | ore 已存在：`orePool`（`contracts/src/GameEngine.sol:82-83`）、`MAX_ORE_POOL=1000`（`contracts/src/GameEngine.sol:26`）、build sink 50/100 ore（`contracts/src/GameEngine.sol:27-28`、`contracts/src/GameEngine.sol:354-361`）。G 已存在于 `GTreasury.gBalance`/`totalOutstandingG`（`contracts/src/GTreasury.sol:21-30`）；`depositG` 由 agent owner 充值（`contracts/src/GTreasury.sol:100-107`）；Arena buy/roll 消耗 G（`contracts/src/ArenaEngine.sol:273-284`、`contracts/src/ArenaEngine.sol:390-400`）。 | debate 下注仍用 ore，赢家 payout 会 clamp 到 `MAX_ORE_POOL`（`contracts/src/GameEngine.sol:858-881`）；demo market 也把 payout clamp 到 `ORE_POOL_CAP`（`demo/index.html:575-584`）。 | G 才是价值层：prediction/world markets 用 G pool，**G 池无 cap**；ore 只做免费 engagement/faucet/sink，禁止 ore->G 裸兑换。 |
| **G 金库会计** | `spendG` 扣 agent G 并降低 `totalOutstandingG`，让 native 余额成为 surplus（`contracts/src/GTreasury.sol:117-122`）；`creditG` 仍是 operator-only 裸 credit（`contracts/src/GTreasury.sol:126-130`）；`surplusG` 只按 `balance - totalOutstandingG`（`contracts/src/GTreasury.sol:165-169`）。`CardLedger.buyListed` 是守恒撮合：买家 `spendG(market_buy)` + 卖家 `creditG(market_sale)`（`contracts/src/CardLedger.sol:118-132`）。 | `ArenaEngine.bootstrapMarket` 在 faucet 模式下 `creditG(seedAgentId, 500 G, "market_seed")`，是 testnet unbacked seed 先例（`contracts/src/ArenaEngine.sol:755-767`）。 | 新增 escrow/eventPrizePool/protocolBurn 拆账；`surplusG`/`withdrawSurplus` 必须排除 escrow 与 event pool；`creditG` reason/调用方收紧，保留 `market_sale` 守恒路径。 |
| **授权 / per-agent delegation** | `AgentRegistry` 有单一 `operator`（`contracts/src/AgentRegistry.sol:19`）、全局 `operators`（`contracts/src/AgentRegistry.sol:24`）、`_isOperator = operator || operators || owner()`（`contracts/src/AgentRegistry.sol:36-38`）；`canControlAgent` 认全局 operator 或 agent owner（`contracts/src/AgentRegistry.sol:45-48`）。`GameEngine` 也复刻了 owner/operator gate（`contracts/src/GameEngine.sol:164-178`）。 | 旧文档把 per-agent delegation 写成“仅 Auth 选 b 才做”的条件任务。 | **A3 升级为强制前置**：`World.answer/bet` 不能因为 World 是全局 operator 就替任意 agent 花 G 或改状态；必须有 agent owner / scoped delegate / permit 校验。 |
| **RNG** | `attack` 用 `block.prevrandao`（`contracts/src/GameEngine.sol:413-415`）；`inciteRebellion` 用 `prevrandao` 50%（`contracts/src/GameEngine.sol:575-579`）；`raid` 用 `prevrandao`（`contracts/src/GameEngine.sol:661-665`）；Arena roll 用 `prevrandao`（`contracts/src/ArenaEngine.sol:398-400`）；Arena matchmaking TODO 已承认可 grind（`contracts/src/ArenaEngine.sol:545-548`）。 | 低价值 demo 可保留 deterministic/mock，但不能承载 G 市场或 event prize。 | Lane B 升级为全局 randomness service：覆盖 World money-staked STATE question、旧 GameEngine attack/raid/incite 迁移路径、Arena roll/matchmaking。 |
| **Router / deploy / config** | Router storage 到 `cardLedger`（`contracts/src/Router.sol:10-21`），setter 止于 `setCardLedger`（`contracts/src/Router.sol:53`），最新 getter 是 V3 九元组（`contracts/src/Router.sol:86-108`）。Deploy 已部署 Router/GameEngine/GTreasury/CardLedger/ArenaEngine 并授权（`contracts/script/Deploy.s.sol:26-122`）。Upgrade 可 backfill/upgrade GTreasury/CardLedger/Arena（`contracts/script/Upgrade.s.sol:107-185`）。 | 旧 P lane 的 `predictionMarket` 槽位全部作废。`just gravity-upgrade` 仍用 `frontend/config/gravity.json` 的 mainnet router，却打 testnet RPC（`justfile:47-53`、`frontend/config/gravity.json:1-7`）。 | P lane 改为 `world` 槽位 + `getAddressesV4()`；部署 `World` proxy、module registry、GTreasury wiring、World 授权；修 config/upgrade chain mismatch。 |
| **MCP / runner** | MCP 主世界工具直调旧合约：`harvest/build/attack/raid`（`mcp-server/src/tools.ts:131-192`，chain 实现 `mcp-server/src/chain.ts:415-490`），`claim_neutral/incite_rebellion`（`mcp-server/src/tools.ts:197-219`，chain 实现 `mcp-server/src/chain.ts:493-500`）；debate 工具是事实上的 ore 市场 API（`mcp-server/src/tools.ts:401-470`，chain 实现 `mcp-server/src/chain.ts:620-664`）；`arena_get_treasury` 只看 Arena surplus/outstanding（`mcp-server/src/tools.ts:822-830`、`mcp-server/src/chain.ts:1099-1115`）。agent-runner 每轮通过 MCP 收集 `get_my_hexes/get_active_oracle_debate/arena_get_state`（`agent-runner/src/mcp.ts:86-99`），selfTools 默认注入旧主世界动作（`agent-runner/src/mcp.ts:118-122`）和旧 debate 动作（`agent-runner/src/mcp.ts:123`）。 | `start_debate/vote_debate/resolve_debate` 仍是 ore betting 文案；Oracle timer 仍围绕旧 debate（`agent-runner/src/orchestrator.ts:125-158`）。 | D lane 重命名为 `answer_question/bet_question/resolve_question/get_treasury/get_world_events`；保留旧工具 alias 但内部切 World。冻结旧直写会打断现有 debate、harvest/build/attack/raid/claim/incite 工具和 agent-runner 自主循环，必须先切流。 |
| **前端 / demo** | 真实前端只有 `/` 与 `/arena`，均只读（`frontend/src/app/page.tsx:11-23`、`frontend/src/app/arena/page.tsx:13-51`）；`useGameEngine` 只解析 Router V1 `getAddresses` 并读 `GameEngine.getScore/orePool/getHex`（`frontend/src/hooks/useGameEngine.ts:13-51`、`frontend/src/hooks/useGameEngine.ts:104-150`）；`useArenaEngine` 解析 V3/V2/V1（`frontend/src/hooks/useArenaEngine.ts:12-21`、`frontend/src/hooks/useArenaEngine.ts:171-213`）。`frontend/package.json` 只有 `ethers/lucide/next/phaser/zustand` 等（`frontend/package.json:11-19`），未引入 wallet SDK。 | demo markets 仍是 ore parimutuel：seed markets（`demo/index.html:176-231`）、payout math（`demo/index.html:234-253`）、resolve clamp（`demo/index.html:559-588`）、下注按钮显示 ore（`demo/index.html:1708-1908`）；landing featured markets（`demo/index.html:955-965`）。 | E lane 只做钱包连接，不做 email 登录；E4 把 market stake 从 ore 改 G；E6 做 G 充值/余额；F7 前端 resolver 加 world；F8 改 Featured Questions + World Treasury meter。 |
| **score** | 合约 `getScore = hexes*100 + ore + buildings*50`（`contracts/src/GameEngine.sol:494-506`）；MCP scoreboard 直接读 `getScore`（`mcp-server/src/chain.ts:458-469`）；真实前端也读 `gameEngine.getScore`（`frontend/src/hooks/useGameEngine.ts:139-150`）；demo 复制同公式（`demo/index.html:163-164`、`demo/index.html:937-950`）。 | 旧 score 可被免费 ore 间接污染。 | A4 必须把 score 改为领地/建筑/声誉/答题准确率为主，ore 取 `sqrt` 或封顶；**凡用 score 结算的 G 市场必须等 score 降权后才能上线**。 |

---

## 2. 按文件域切分的并行车道（lane 内串行，lane 间按依赖并行）

> 防撞总则：
> 1. `World` 新合约、`IWorldQuestion`、extension registry、World 测试归 Lane C；`Router`/部署脚本/config 归 Lane P；`GameEngine.sol` 与 `AgentRegistry.sol` 迁移/freeze/score 归 Lane A；`mcp-server/src/{tools,chain}.ts` 与 agent-runner 归 Lane D；真实前端写链归 Lane E；既有只读前端/Phaser/Arena page 归 Lane F。
> 2. `GTreasury.sol` 的 World 会计补账归 Lane C4；`CardLedger.sol` 的二级市场守恒路径归 Lane B 保持；P 只做部署/wiring，不改 treasury 会计。
> 3. 全局 RNG 的服务接口归 Lane B；Arena call-site 修改归 B；GameEngine/World 战斗调用 RNG 的实际接入分别落 A2/C3，按 B 的接口验收，不允许多人并行改同一 hunk。
> 4. 旧 `PredictionMarket` 文件、`predictionMarket` Router 槽位、ore market 独立合约任务全部作废；只可在 D/E 中作为兼容 alias 或 legacy 文案出现。
> 5. `legacyWritesFrozen` 打开前必须满足：A3 delegation/permit 可用、C2/C3/C4/C6/C7 World 入口与 G 会计可用、D1/D4 MCP alias 与 agent-runner 切流完成、C5 migration checklist 通过、P2/P3a/F7 地址解析完成。

### 2.1 文件域归属表（互斥确认）

| Lane | owner 角色 | 独占文件域 | 关键互斥点 |
|---|---|---|---|
| **P** | PLAT·部署/授权 | `contracts/src/Router.sol`、`contracts/script/{Deploy,Upgrade}.s.sol`、`frontend/config/*.json`、新建 `mcp-server/src/addressResolver.ts`、部署/运维文档 | 唯一改 Router slot/getter、部署 World proxy、World/module/GTreasury wiring；不改 `mcp-server/src/chain.ts` |
| **A** | SC·主世界迁移 | `contracts/src/GameEngine.sol`、`contracts/src/AgentRegistry.sol`、`contracts/test/GameEngine*.t.sol`、`contracts/test/AgentRegistry*.t.sol` | 唯一改 legacy 写入口、freeze flag、score、per-agent delegation；不实现 World question storage |
| **B** | SC·全局 RNG / Arena trace | 新建 `contracts/src/Randomness*.sol`；`contracts/src/{ArenaEngine,ArenaCombat,AbilityLib,CardLedger,UnitCatalog}.sol`；Arena/RNG 测试 | 不改 Router/Deploy；GameEngine/World 只通过 B 定义接口接 RNG |
| **C** | SC·World Core | 新建 `contracts/src/{IWorldQuestion,World,WorldExtensionRegistry,World*Module}.sol`、`contracts/test/World*.t.sol`；`contracts/src/GTreasury.sol` 的 escrow/burn/eventPool 会计补账 | C4 可改 GTreasury；不改 Router/Deploy；不直接拥有 MCP/FE；调用 GameEngine legacy adapter 需等 A |
| **D** | MCP/INFRA | `mcp-server/src/{tools,chain}.ts`、`mcp-server/scripts/{keeper-question,keeper-treasury,*.mjs}`、`agent-runner/*`、`telemetry/` | `chain.ts` 唯一 owner；不改 frontend config；负责旧工具 alias、runner 切流、遥测 |
| **E** | FE·写链路 | 新建 `frontend/src/hooks/wallet/*`、`frontend/src/lib/wallet/*`、`frontend/src/components/wallet/*`、`frontend/src/app/{onboard,me,markets}/*`、`frontend/src/app/arena/market/*` | 钱包连接/tx 三态/G deposit/Question bet UI；不做 email 登录；不改 F 的 Arena replay 核心 |
| **F** | FE·只读视图 | 既有 `frontend/src/{phaser,game,store}`、`frontend/src/hooks/{useGameEngine,useArenaEngine}.ts`、`frontend/src/chain/*`、`frontend/src/components/arena/*`、`frontend/src/app/{page,arena/page}.tsx`、新建 `frontend/src/components/{spectator,ledger,world}/*` | F7 resolver、F8 landing/treasury meter、F2/F3 replay；不拥有 wallet write hooks |

### 2.2 跨 lane 注册/授权请求

| 发起 lane | 需要 P/A/C/D 做的事 | 阻塞下游 |
|---|---|---|
| C（World Core） | P1/P2 给 Router 加 `world` 并部署 proxy；P2 把 World/module registry/GTreasury wiring 成可调用；A3 提供 scoped delegation/permit；C4 收紧 G accounting。 | D1、E4、F7、C2-C8 上链验收 |
| A（legacy freeze） | D1/D4 先把 MCP/agent-runner 从旧直写切到 World alias；C5 提供 freeze migration checklist。 | A5 freeze 开关 |
| B（全局 RNG） | C3/A2 调用 B 的 randomness service；D9 暴露 trace；F2/F3 等 D9。 | C3、A2、F2、F3 |
| D（question/treasury keeper） | P3a resolver 能拿到 world；C1/C4 有 due questions / treasury threshold view。 | D2、F8 treasury ticker |
| E/F（前端） | F7 先支持 Router V4 world；E4 下注必须走 A3/C4 权限与 G escrow；E6 用 GTreasury deposit。 | E4、E6、F8 |

---

### Lane P · 平台集成 / 部署 / 地址发现

#### P1 · Router `world` 槽位与 `getAddressesV4()` [PLAT/SC | `Router.sol` | 依赖无 | maps-to world-as-market §6.2/§8.2]

**功能点（交付什么）**
- 用户可见：MCP、前端、keeper 都能从 Router 发现中心 `World` 地址。
- 技术交付物：在 `cardLedger` 后 append `address public world;`；新增 `setWorld(address)`；新增 `getAddressesV4()`，返回 V3 九项 + world，共 10 项；旧 `getAddresses`/V2/V3 ABI 不变。

**现状 & 缺口（file:line 锚定）**
- 已有：Router storage 止于 `cardLedger`（`contracts/src/Router.sol:10-21`）；setter 止于 `setCardLedger`（`contracts/src/Router.sol:53`）；V3 getter 返回九项（`contracts/src/Router.sol:86-108`）。
- 已有：旧 getter 注释明确不要扩签名（`contracts/src/Router.sol:55-57`）。
- 缺：无 `world` 槽位、setter、V4 getter、storage append 测试。

**子任务拆分（有序，可独立提交）**
1. 在 `Router.sol` append `address public world;`，不得插入旧槽位中间。
2. 新增 `setWorld(address)`，owner-only，与现 setter 风格一致。
3. 新增 `getAddressesV4()`：返回 `(registry, agentLedger, locationLedger, inboxLedger, gameEngine, evaluationLedger, arenaEngine, gTreasury, cardLedger, world)`。
4. 补 Router ABI/storage 测试：旧 getter decode 长度、V4 tuple 顺序、升级后旧槽位不漂移。
5. 在 P3a/F7/D1 的接口说明同步 `getAddressesV4()` 定名与顺序。

**验收标准（命令 + 期望结果）**
- [ ] 命令：`cd contracts && forge test --match-test test_RouterV4KeepsLegacyGetters -vv` → 期望：`getAddresses`/V2/V3 返回值与升级前兼容，V4 返回第 10 项 `world`。
- [ ] 命令：`cd contracts && forge test --match-test test_RouterStorageAppendWorld -vv` → 期望：升级后既有 `registry/gameEngine/arenaEngine/gTreasury/cardLedger` 未漂移，新 `world` 可 set/get。

#### P2 · 部署 World proxy + module registry + GTreasury wiring [PLAT/SC | `Deploy.s.sol`,`Upgrade.s.sol` | 依赖 P1,C1,C4,A3 | maps-to world-as-market §8.2]

**功能点**
- 用户可见：本地/测试网升级后有真实 `World` 合约承载 `Question`、G market、faucet、world events。
- 技术交付物：部署 `World` implementation + UUPS proxy；部署/初始化 module registry；`Router.setWorld(worldProxy)`；把 World/registry 连接到 `GTreasury` 的 onlyWorld/allowlist 入口；授权 World 调 legacy adapter（但不授予无限替任意 agent 花 G 的权限）。

**现状 & 缺口**
- 已有：Deploy 部署 registry/ledgers/GameEngine/GTreasury/CardLedger/ArenaEngine/Router，并 set Arena/G/Card slot（`contracts/script/Deploy.s.sol:26-122`）。
- 已有：Upgrade 可 backfill GTreasury/CardLedger/Arena，并给 CardLedger/Arena 授权（`contracts/script/Upgrade.s.sol:107-185`）。
- 缺：脚本无 `World` import/deploy/upgrade；无 module registry；无 `Router.setWorld`；无 GTreasury World-only wiring；`just gravity-upgrade` 仍有 mainnet router + testnet RPC mismatch（`justfile:47-53`、`frontend/config/gravity.json:1-7`）。

**子任务拆分**
1. 在 Deploy fresh 路径部署 `World`、registry/modules，初始化时传入 Router/registry/GameEngine/GTreasury。
2. 在 Upgrade 路径检测 `router.world()` 或 `getAddressesV4()`；为空则部署 proxy，非空则 upgrade implementation；两条路径都不重置 question/treasury state。
3. wiring：`Router.setWorld(worldProxy)`；`GTreasury.setWorld(worldProxy)` 或 `allowModule(worldProxy,true)`；CardLedger `market_sale` 守恒路径不得被误杀。
4. 授权：若 World 需要 legacy adapter 调 `GameEngine.build/raid`，只允许 World adapter 路径；真人/agent G 下注仍必须走 A3 scoped delegation/permit 或 agent owner 校验。
5. 增加部署日志与 idempotency：重复 upgrade 不重置 World/module registry/treasury pools。
6. 修正 Gravity testnet/mainnet config 选择，避免 `gravity-upgrade` 链/地址错配。

**验收标准**
- [ ] 命令：`just anvil-deploy && just anvil-upgrade` → 期望：Router V4 能解析 `world`，重复执行不重置 `nextQuestionId`/treasury pool。
- [ ] 命令：`cd contracts && forge test --match-test test_UpgradeDeploysWorldAndWiresTreasury -vv` → 期望：`router.world()!=0`，World 可读 GTreasury，非 World 调用 restricted treasury payout/escrow 入口 revert。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldWiringDoesNotBreakCardMarketSale -vv` → 期望：`CardLedger.buyListed` 的 `market_buy/market_sale` 守恒 credit 仍通过。

#### P3a · 地址配置与 MCP resolver 改为 `world` [PLAT/MCP | `frontend/config/*`,`addressResolver.ts` | 依赖 P1 | maps-to world-as-market §8.2]

**功能点**
- 用户可见：local/testnet/mainnet 的 MCP、keeper、前端能读同一套 Router 地址，不再手填 World。
- 技术交付物：新增/更新 `mcp-server/src/addressResolver.ts`，返回 `world` 字段；前端 config 只保留 router/network truth，不写死 module 地址。

**现状 & 缺口**
- 已有：MCP `ChainClient` 在 `chain.ts` 中直接解析 V3/V2/V1（`mcp-server/src/chain.ts:90-97`、`mcp-server/src/chain.ts:260-298`）。
- 已有：Arena keeper 自己读 `frontend/config/<NETWORK>.json` 并解析 Router V3/V2（`mcp-server/scripts/keeper.mjs:47-104`）。
- 缺：无共享 resolver；无 V4/world 字段；`frontend/config/gravity.json` 当前是 Gravity Mainnet（`frontend/config/gravity.json:1-7`），但部分 testnet recipes 复用它。

**子任务拆分**
1. 定义 `resolveAddresses({ network, rpcUrl, routerAddress })`：返回 registry/ledgers/game/arena/gTreasury/cardLedger/world。
2. resolver 优先 V4；V4 不存在则安全回落 V3/V2/V1，`world=null` 而不是抛错。
3. P 提供 resolver 与 config；D 后续在 `chain.ts` 中消费该 API（由 D 实施，P 不直接改 `chain.ts`）。
4. 增加 `gravity-testnet.json` 或明确 `APP_CONFIG`/`NETWORK` 选择，修正 upgrade/keeper 的链配置来源。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：`addressResolver.ts` 编译通过，未引入循环依赖。
- [ ] 命令：`cd mcp-server && NETWORK=localhost node scripts/check-address-resolver.mjs` → 期望：输出 `router/gameEngine/arenaEngine/cardLedger/gTreasury/world`；未升级 Router 时 `world:null` 且退出码 0。

#### P4 · World operator/role 运维与撤权 [PLAT/INFRA | 部署脚本/运维文档 | 依赖 P2,A3,C4 | maps-to 新增]

**功能点**
- 用户可见：World、question keeper、treasury keeper 的权限可审计、可撤回，不靠“全局 operator 永久能控制所有 agent”。
- 技术交付物：World/module roles、keeper signer roles、撤权/轮换文档；所有 role 都可 `cast call` 验证。

**现状 & 缺口**
- 已有：全局 operator 添加/删除是 owner-only（`contracts/src/AgentRegistry.sol:67-68`）；GTreasury `onlyOperator` 当前只问 `registry.isOperator(msg.sender)`（`contracts/src/GTreasury.sol:67-70`）。
- 缺：无 World-specific role；无 per-module treasury allowlist；无 keeper role 撤权脚本。

**子任务拆分**
1. 定义 role 清单：World proxy、question keeper、treasury keeper、emergency owner、多签/owner。
2. 把“可花 agent G”的能力与“可 resolve/keeper”的能力拆开，避免 keeper 拥有无限 agent spend。
3. 写运维文档：授权、撤权、轮换、疑似泄露处置、testnet faucet 与 mainnet withdraw mode 差异。
4. Forge 测试覆盖授权/撤权后 World/keeper 入口成功/失败。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_WorldRoleGrantRevokeBoundaries -vv` → 期望：撤权后 keeper 不能 resolve/allocate，World 仍可处理用户 permit/escrow。
- [ ] 命令：`WORLD_KEEPER_ADDRESS=0x... just anvil-upgrade` → 期望：日志列出 roles；`cast call` 验证角色为 true；撤权脚本后为 false。

---

### Lane A · 主世界迁移 / 授权 / legacy freeze

#### A0 · GameEngine legacy surface 与 adapter 规格 [SC/DOC | `GameEngine.sol` 设计/测试 | 依赖 C0 | maps-to world-as-market §7 Phase 4]

**功能点**
- 用户可见：旧世界状态平滑迁移，不丢 hex/ore/building/chronicle/bible。
- 技术交付物：列出所有 legacy 写入口、只读接口、事件兼容策略；定义 World 调 legacy adapter 的 allowlist 与 freeze 行为。

**现状 & 缺口**
- 已有写入口：`harvest`（`contracts/src/GameEngine.sol:288-290`）、`build`（`contracts/src/GameEngine.sol:344-367`）、`attack`（`contracts/src/GameEngine.sol:375-448`）、`spendOre`/`refundOre` hooks（`contracts/src/GameEngine.sol:471-487`）、`claimNeutral`（`contracts/src/GameEngine.sol:535-554`）、`inciteRebellion`（`contracts/src/GameEngine.sol:563-615`）、`raid`（`contracts/src/GameEngine.sol:622-695`）、debate（`contracts/src/GameEngine.sol:710-895`）。
- 已有只读接口：`getScore`（`contracts/src/GameEngine.sol:494-506`）、`getHex`（`contracts/src/GameEngine.sol:513-520`）、`getAgentHexKeys/getAllHexKeys`（`contracts/src/GameEngine.sol:522-527`）。
- 缺：无 `world` allowlist；无 `legacyWritesFrozen`；无 adapter error；无 freeze 影响清单。

**子任务拆分**
1. 写 legacy surface 设计：哪些函数最终由 World 包装，哪些保留只读，哪些废弃。
2. 定义 freeze 策略：外部用户直写 revert；`msg.sender==world` 或 Router 解析 World 的 adapter 调用可放行。
3. 明确事件兼容：是否继续 emit `Harvested/Built/AttackResult/DebateResolved`，或只 emit `Question*` + indexer adapter。
4. 补测试骨架：freeze 前行为等同旧合约；freeze 后旧用户直写 revert，World allowlist 不被挡。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_LegacySurfaceDocumentedAndFrozenErrorsReadable -vv` → 期望：所有旧写入口都有明确 freeze revert reason。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldAdapterAllowedWhileLegacyWritesFrozen -vv` → 期望：freeze 后非 World 调 `build/raid/debate` revert，World adapter 调用通过。

#### A1 · `harvest/build` 入口由 World 接管 [SC | `GameEngine.sol` adapter + tests | 依赖 C1,A3 | maps-to world-as-market §7 Phase 1]

**功能点**
- 用户可见：按钮仍叫 Harvest / Build mine，但链上实际变成 `answer_question`。
- 技术交付物：World difficulty 0/低难 STATE question 包装 `harvest/build`；legacy 入口可兼容一段时间，freeze 后只允许 World adapter。

**现状 & 缺口**
- 已有：`harvest` permissionless，调用 `_harvestAll`（`contracts/src/GameEngine.sol:288-306`）；`_harvestHex` 用 `BASE_ORE_PER_SEC`/`ORE_PER_MINE_PER_SEC` 计算 lazy 产出（`contracts/src/GameEngine.sol:313-337`）。
- 已有：`build` 受 `canControlAgent`，先 harvest，再扣 50/100 ore 并加 building（`contracts/src/GameEngine.sol:344-367`）。
- 缺：无 `QuestionAnswered`/difficulty/fee 记录；`build` 若由 World 代调会遇到 `canControlAgent`，必须先完成 A3/permit 或 World adapter allowlist。

**子任务拆分**
1. 定义 `harvest` action payload：agentId、target scope（all hexes）、expected reward/nonce/cooldown。
2. 定义 `build` action payload：agentId、hexKey、buildingType、ore sink、questionId。
3. Adapter 调用中保留旧 ore cap 行为，但不能触发任何 G credit。
4. `World.answer_question` 成功后 emit `QuestionAnswered`，可选兼容 emit `Harvested/Built`。
5. MCP/FE 接入前保留旧入口；D1/D4 切流后再由 A5 freeze。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_WorldAnswerHarvestMatchesLegacyHarvest -vv` → 期望：同一时间推进下，World harvest 与 legacy harvest 增加的 ore 一致，G balance/outstanding 不变。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldAnswerBuildConsumesOreAndEmitsQuestion -vv` → 期望：build mine 扣 50 ore、building +1、emit `QuestionAnswered`；未授权 caller 失败。

#### A2 · `attack/raid/incite` 入口由 World 分阶段接管 [SC | `GameEngine.sol` adapter + tests | 依赖 A0,A3,B1 | maps-to world-as-market §7 Phase 2]

**功能点**
- 用户可见：Raid 仍是一个动作，但真实结算变成 open/answer -> lock -> RNG finalize -> resolve。
- 技术交付物：旧 attack/raid/incite 的状态改写只由 World resolve 阶段执行；money-staked/G fee/event prize 路径不再单 tx live 读改。

**现状 & 缺口**
- 已有：`attack` 一次 tx 内检查位置/cooldown、扣资源、用 `prevrandao`、成功改 owner 并偷 30% ore（`contracts/src/GameEngine.sol:388-447`）。
- 已有：`raid` 一次 tx 内 auto-find best source、move agent、扣资源、`prevrandao`、改 owner（`contracts/src/GameEngine.sol:631-695`）。
- 已有：`inciteRebellion` 一次 tx 内 `prevrandao` 50%，成功可能 respawn 200 ore（`contracts/src/GameEngine.sol:563-615`）。
- 缺：无 lock snapshot、无 stale owner refund、无 staged RNG、无 G fee/escrow 的 battle accounting。

**子任务拆分**
1. 把旧 `attack/raid/incite` 写状态逻辑抽成 World-only adapter 或 internal library；直接外部入口保留 legacy/freeze gate。
2. 为 C3 `QuestionLocked` 提供 adapter 所需字段：target/source owner、arsenal、agent location、cooldown、defense、ore spend。
3. resolve 时若 target owner 已不是 lock 快照 owner，则取消/退款，不改 owner。
4. 低价值 legacy incite 可先通过 World STATE question 包装，money-staked 路径必须 B1 RNG。
5. 补回归：旧无 G 路径在 freeze 前仍可跑；World 路径有 staged 状态和 refund 分支。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_WorldRaidUsesLockedSnapshotNotLiveState -vv` → 期望：lock 后 live owner 改变时 question cancel/refund，不把 hex 判给攻击者。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldCombatDoesNotReadPrevrandaoInResolvePath -vv` → 期望：World combat resolve 使用 B1 randomness result，不在 resolve 阶段读取 `block.prevrandao`。

#### A3 · per-agent delegation / permit（强制前置，不再是条件任务） [SC | `AgentRegistry.sol` + gate 调整 | 依赖无 | maps-to world-as-market §6.4/§8.3]

**功能点**
- 用户可见：用户能只授权某个 agent 的某类动作（answer/bet/build/raid/runner），可撤销、可过期，不影响其他 agent。
- 技术交付物：scoped delegation + per-action permit；`World.answer/bet` 使用 agent owner / scoped delegate / permit 校验，不能复用全局 operator 恒真语义。

**现状 & 缺口**
- 已有：`AgentRegistry` 只有全局 operator/owner gate（`contracts/src/AgentRegistry.sol:19-24`、`contracts/src/AgentRegistry.sol:36-48`、`contracts/src/AgentRegistry.sol:67-68`）。
- 已有：`GameEngine.canControlAgent` 同样允许 global operator 或 contract owner 控制任意 agent（`contracts/src/GameEngine.sol:164-178`）。
- 缺：无 `agentDelegates`、无 scope/expiry、无 EIP-712 permit、无 `isAgentDelegate(agentId,actor,scope)` view。

**子任务拆分**
1. Append storage：`mapping(uint256 => mapping(address => Delegation)) agentDelegates`，Delegation 包含 scope bitmask 与 expiresAt。
2. 新增 `delegateAgent(agentId, delegate, scope, expiresAt)`、`revokeAgent`、`isAgentDelegate`。
3. 新增 `permitAgentAction(agentId, actionHash, deadline, sig)` 或在 World 中验签但 Registry 提供 domain/owner helper。
4. 更新 World 侧校验规范：`msg.sender == agentOwner(agentId)` 或 scoped delegate 或有效 permit；全局 operator 只允许 keeper/emergency，不默认可替用户下注。
5. 测 storage layout、scope、expiry、revoke、owner 变更/agent 删除边界。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_AgentScopedDelegateCanAnswerButNotBetWhenScopeMissing -vv` → 期望：scope 精确生效，过期/撤权后 revert。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldCannotUseGlobalOperatorToSpendArbitraryAgentG -vv` → 期望：World/keeper 即使是全局 operator，也不能绕过 agent owner/delegate/permit 替任意 agent 下注。

#### A4 · score 降权：领地/建筑/声誉/答题准确率为主，ore sqrt/封顶 [SC | `GameEngine.sol`/World score adapter | 依赖 C1 | maps-to world-as-market §3.1]

**功能点**
- 用户可见：排行榜不再被免费 ore 线性支配；G 市场若用 score 结算，使用抗 ore faucet 污染的新公式。
- 技术交付物：canonical score 迁到 World 或 ScoreModule；旧 `GameEngine.getScore` 走 adapter/兼容；MCP/FE scoreboard 切新公式。

**现状 & 缺口**
- 已有：`getScore` 当前返回 `hCount * 100 + orePool[agentId] + totalBuildings * 50`（`contracts/src/GameEngine.sol:494-506`）。
- 已有：MCP scoreboard 直接读旧 `gameEngine.getScore`（`mcp-server/src/chain.ts:458-469`）；前端直接读旧 `getScore`（`frontend/src/hooks/useGameEngine.ts:139-150`）；demo 也复制旧公式（`demo/index.html:163-164`、`demo/index.html:937-950`）。
- 缺：无 reputation/accuracy score；ore 未 sqrt/封顶；无“score-based G market 前置”保护。

**子任务拆分**
1. 定义 v1 公式：`territoryScore + buildingScore + reputationScore + accuracyScore + oreScore`，其中 `oreScore = min(200, floor(sqrt(orePool)*10))` 或 owner 拍板等价封顶。
2. `reputationScore` 读 chronicle score（`contracts/src/GameEngine.sol:116-123`）；`accuracyScore` 读 World question answer 统计（C1/D3）。
3. 在 World/ScoreModule 中提供 canonical `getScoreV2(agentId)`；旧 `GameEngine.getScore` 可保留 legacy 或迁到 adapter。
4. D/F 切 scoreboard 读新 score；demo 文案同步。
5. 加 guard：`create_question(kind=STATE,currency=G,score-based)` 在 score v2 未激活前 revert。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_ScoreOreIsSqrtOrCapped -vv` → 期望：ore 从 0 到 1000 的 score 增量不超过 cap，领地/建筑仍主导。
- [ ] 命令：`cd contracts && forge test --match-test test_ScoreBasedGMarketRequiresScoreV2 -vv` → 期望：未激活 score v2 时 score-based G question 创建失败；激活后使用新公式结算。

#### A5 · `legacyWritesFrozen` 冻结旧直写入口 [SC | `GameEngine.sol` | 依赖 A1,A2,A3,C5 | maps-to world-as-market §7 Phase 4]

**功能点**
- 用户可见：所有正式入口统一走 World；旧工具名可用但只是 alias。
- 技术交付物：`legacyWritesFrozen` flag；外部旧写入口 freeze 后 revert；World allowlist/adapter 不被挡；可读接口保持可用。

**现状 & 缺口**
- 已有：旧写入口仍公开：`harvest`（permissionless，`contracts/src/GameEngine.sol:288-290`）、`build`（`contracts/src/GameEngine.sol:344-367`）、`attack`（`contracts/src/GameEngine.sol:375-448`）、`spendOre`/`refundOre` hooks（`contracts/src/GameEngine.sol:471-487`）、`claimNeutral`（`contracts/src/GameEngine.sol:535-554`）、`inciteRebellion`（`contracts/src/GameEngine.sol:563-615`）、`raid`（`contracts/src/GameEngine.sol:622-695`）、debate lifecycle（`contracts/src/GameEngine.sol:710-911`）。
- 已有：MCP `harvest/build/attack/raid` 直接调用（`mcp-server/src/tools.ts:131-192`、`mcp-server/src/chain.ts:415-490`），`claim_neutral/incite_rebellion` 也直接调用旧合约（`mcp-server/src/tools.ts:197-219`、`mcp-server/src/chain.ts:493-500`）；debate 工具直接调用（`mcp-server/src/tools.ts:401-470`、`mcp-server/src/chain.ts:620-664`）。
- 缺：无 freeze flag；无 migration block number；无 World allowlist；无 D lane 切流验收；`harvest` 本身不走 `canControlAgent`，freeze 需要新增拦截 modifier，不能靠复用权限 gate。

**子任务拆分**
1. Append `bool public legacyWritesFrozen; address public world;` 或从 Router 解析 world（storage layout 审慎）。
2. 新增专用 freeze modifier（例如 `legacyWriteAllowed`）：freeze 后 `msg.sender != world` revert；只读接口不受影响；`harvest` 必须使用该新 modifier，不能改成 `canControlAgent`。
3. 覆盖所有旧写入口：`harvest/build/attack/raid/claimNeutral/inciteRebellion/startDebate/voteOnDebate/resolveDebate/expireDebate/spendOre/refundOre`；hooks 被 side systems 调用时也必须只允许 World/allowlist 路径。
4. Owner-only `setLegacyWritesFrozen(bool)`，emit `LegacyWritesFrozenSet(bool)`.
5. freeze 前脚本检查 C5 checklist：D4 已先完成 MCP 工具 alias、agent-runner selfTools、旧 debate timer -> question keeper 切流。
6. 编写 rollback 操作：短期可 unfreeze，长期由 owner 决策是否永久。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_LegacyWritesFrozenBlocksDirectHarvestBuildAttackRaidClaimInciteOreHooksDebate -vv` → 期望：freeze 后 direct `harvest/build/attack/raid/claimNeutral/inciteRebellion/spendOre/refundOre/startDebate/voteOnDebate/resolveDebate` 均 revert，错误可读；World allowlist/adapter 调用通过。
- [ ] 命令：`cd contracts && rg -n "legacyWriteAllowed|legacyWritesFrozen|function (harvest|build|attack|raid|claimNeutral|inciteRebellion|spendOre|refundOre|startDebate|voteOnDebate|resolveDebate)" src/GameEngine.sol` → 期望：所有旧写入口附近均有 freeze modifier/allowlist 覆盖；`harvest` 使用新增 freeze modifier，不新增 `canControlAgent`。
- [ ] 命令：`cd mcp-server && npm run build && rg -n "chain\\.(harvest|build|attack|raid|claimNeutral|inciteRebellion|startDebate|voteOnDebate|resolveDebate)\\(" src` → 期望：只剩 legacy alias 内部兼容分支，默认路径调用 World。

---

### Lane B · 全局 RNG / Arena trace

#### B1 · 全局 randomness service 覆盖 GameEngine + Arena [SC | `Randomness*.sol`,`ArenaEngine.sol`，A/C 接入 | 依赖 C1 | maps-to world-as-market §8.4]

**功能点**
- 用户可见：涉及 G stake、event prize、world combat、Arena prize 的随机不再靠可 grind 的 `prevrandao`。
- 技术交付物：VRF 或 commit-reveal randomness service；World STATE question、旧 GameEngine 迁移路径、Arena roll/matchmaking 统一接入。

**现状 & 缺口**
- 已有 `prevrandao` 使用：GameEngine attack（`contracts/src/GameEngine.sol:413-415`）、incite（`contracts/src/GameEngine.sol:575-579`）、raid（`contracts/src/GameEngine.sol:661-665`）；Arena roll（`contracts/src/ArenaEngine.sol:398-400`）；Arena matchmaking TODO（`contracts/src/ArenaEngine.sol:545-548`）。
- 缺：无 request/fulfill/timeout/refund；无 entropy consumer interface；无 commit liveness；无 tests 证明高价值路径不读 `prevrandao`。

**子任务拆分**
1. Owner 拍板 VRF / commit-reveal / 分层策略；默认写接口使两者可替换。
2. 新建 `IRandomnessService`：`requestEntropy(questionId, snapshotHash)`、`finalizeEntropy(requestId)`、`getEntropy(requestId)`、timeout/refund 状态。
3. Arena `roll` 和 `runMatchmaking` 改用 service 或 staged seed；低价值 local demo 可用 mock service。
4. C3 World combat lock 后请求 entropy；resolve 只读 finalized entropy。
5. A2 legacy GameEngine money-staked combat 迁移不再直接读 prevrandao；未迁旧入口在 freeze 前标 legacy/unsafe。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_GlobalRandomnessCoversWorldCombatAndArena -vv` → 期望：World combat、Arena roll、Arena matchmaking 都通过 randomness service/mock service 取 seed。
- [ ] 命令：`cd contracts && rg -n "block\\.prevrandao" src/GameEngine.sol src/ArenaEngine.sol src/World*.sol` → 期望：只允许 legacy/demo 注释或 mock 分支；money-staked/production 路径无直接读取。

#### B2 · Trace / replay 事件模型（阻塞 F2/F3，配合 D9） [SC | `ArenaCombat.sol`,`AbilityLib.sol`,World trace structs | 依赖 B1 | maps-to 新增]

**功能点**
- 用户可见：Arena 与 World staged combat 可回放，AgentMind/前端能展示“为什么赢/输/触发事件”。
- 技术交付物：统一 `TraceEvent`/`AbilityEvent`/`QuestionTrace` 结构；Arena combat trace 扩展；World question resolve 输出 trace hash/事件。

**现状 & 缺口**
- 已有：Arena `simulateWithTrace` 返回普攻 turn（`contracts/src/ArenaEngine.sol:614-624`），MCP `arena_simulate_match` 解码 turn（`mcp-server/src/tools.ts:931-939`、`mcp-server/src/chain.ts:993-1005`）。
- 已有：ArenaCombat turn 只有攻击方/防守 slot/damage/death（可从 `simulateMatch` ABI 看到，`frontend/src/hooks/useArenaEngine.ts:29-33`）。
- 缺：无 ability events、无 World question trace、无 D9 工具稳定 schema。

**子任务拆分**
1. 定义 trace schema：`questionId/matchId/stage/actor/target/effect/value/seedHash/snapshotHash`。
2. Arena ability 触发点 emit 或 view trace 中返回 `AbilityEvent[]`；不破坏旧 `Turn[]` 消费。
3. World C3 battle resolve 输出 trace events 或 trace hash，供 D9 拉取。
4. D9 负责 MCP 工具 schema；F2/F3 只在 D9 可用后接 UI。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_ArenaTraceIncludesAbilityEventsWithoutBreakingTurns -vv` → 期望：旧 turns 仍可解码，新 ability events 包含触发顺序。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldQuestionTraceAnchorsSnapshotAndEntropy -vv` → 期望：trace 包含 `questionId/stateSnapshotHash/entropyRequestId/outcome`。

---

### Lane C · World-as-Market Core（旧 Lane C 作废重建）

#### C0 · 机制规格 + 不变量落库 [SC/DOC | `docs/world-as-market.md` 对齐 + `WorldSpec.t.sol` | 依赖无 | maps-to world-as-market §8.1 C0]

**功能点**
- 用户可见：产品、合约、MCP、前端对“万物皆答题 + 双币”使用同一套规则。
- 技术交付物：`IWorldQuestion`/World spec 文档、invariant test skeleton、禁止 ore->G、G pool no cap、score 前置、freeze 前置全部写进测试或 CI 检查。

**现状 & 缺口**
- 已有权威设计：`docs/world-as-market.md` 定义核心循环与统一原语（`docs/world-as-market.md:7-26`、`docs/world-as-market.md:27-101`），Lane 重构骨架在 §8（`docs/world-as-market.md:592-675`）。
- 现状仍是分立 `GameEngine` + ledger + Arena，不存在 `World.sol`。
- 缺：无可执行 invariant tests；旧 dev-breakdown 仍有 ore market/PredictionMarket 残留（本次重写移除）。

**子任务拆分**
1. 新建 `contracts/src/IWorldQuestion.sol` interface 草案，与 `world-as-market` §6.1 字段/事件一致。
2. 新建 `contracts/test/WorldInvariants.t.sol` skeleton：ore->G 禁止、G pool no cap、treasury accounting、score-based G market guard、legacy freeze guard。
3. 写 `docs/world-core-spec.md` 或合约 NatSpec：明确 MATH/STATE/ORACLE、Currency、Status、fee/tax/payout 语义。
4. CI/grep 检查禁止新增 `convertOreToG/burnOreForG/claimGFromOre` 等入口。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-contract WorldInvariants -vv` → 期望：初始 skeleton 能编译并包含不变量断言。
- [ ] 命令：`rg -n "convertOreToG|burnOreForG|claimGFromOre" contracts/src docs/dev-breakdown.md` → 期望：除“禁止项说明”外无实现入口。

#### C1 · `IWorldQuestion` 状态机：OPEN/LOCKED/RESOLVED/CANCELLED + `QuestionLocked` [SC | `IWorldQuestion.sol`,`World.sol` | 依赖 C0,A3 | maps-to world-as-market §8.1 C1]

**功能点**
- 用户可见：任何动作/市场都有清晰状态；高价值 question 会锁定状态后再结算。
- 技术交付物：`Question` storage、`createQuestion/answer/bet/lock/resolve/claimPayout/getQuestion`；`QuestionCreated/Answered/Locked/Resolved/WorldEventTriggered` 事件。

**现状 & 缺口**
- 已有：GameEngine 入口各自有独立状态，debate 只有 `resolved/expired`（`contracts/src/GameEngine.sol:90-112`、`contracts/src/GameEngine.sol:897-911`）。
- 缺：无统一 status；无 `LOCKED`；无 `QuestionLocked(stateSnapshotHash,lockedAt)`；无 per-agent answer stats；无 scoped delegation 校验。

**子任务拆分**
1. 实现 `QuestionKind {MATH, STATE, ORACLE}`、`Currency {NONE, ORE, G}`、`QuestionStatus {OPEN, LOCKED, RESOLVED, CANCELLED}`。
2. `createQuestion` 写 storage 与 metadata hash；`answer` 仅用于 MATH/STATE；`bet` 仅用于 G/market pool。
3. `lock(questionId, lockData)`：OPEN -> LOCKED，写 `stateSnapshotHash`，emit `QuestionLocked`；MATH difficulty 0 可不 lock，money-staked STATE 必须 lock。
4. `resolve`：只能从 OPEN（纯 MATH）或 LOCKED（STATE/RNG/ORACLE）进入 RESOLVED/CANCELLED。
5. `claimPayout` 幂等；更新 answer accuracy counters，供 A4 score 使用。
6. `answer/bet` 校验 agent owner/scoped delegate/permit，不复用全局 operator 恒真语义（见 A3）。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_QuestionStateMachineRejectsInvalidTransitions -vv` → 期望：OPEN/LOCKED/RESOLVED/CANCELLED 转换严格；重复 resolve/claim 不重复付款。
- [ ] 命令：`cd contracts && forge test --match-test test_QuestionLockedEmitsSnapshotHash -vv` → 期望：money-staked STATE question 必须 lock，事件含非零 `stateSnapshotHash`。

#### C2 · MATH/STATE faucet 包装 `harvest/build` [SC | `World.sol`,World action module | 依赖 C1,A1,A3 | maps-to world-as-market §8.1 C2]

**功能点**
- 用户可见：Harvest/Build 仍是低摩擦动作，但链上记录为 difficulty 0/低难 question。
- 技术交付物：`answer_question` 能跑通 harvest/build；ore reward 固定/无限参与层；不收或低收 G fee；不得触发 G credit。

**现状 & 缺口**
- 已有：harvest lazy 产 ore 并 clamp 到 `MAX_ORE_POOL`（`contracts/src/GameEngine.sol:293-306`）；build 扣 ore 加 mine/arsenal（`contracts/src/GameEngine.sol:344-367`）。
- 缺：无 `Question` 包装、无 faucet rate 计数、无 answer accuracy、无 `msg.sender == agentOwner(agentId)` / delegate / permit 强校验。

**子任务拆分**
1. `createHarvestQuestion(agentId)` 或 implicit `answerHarvest(agentId)`：kind MATH/STATE、difficulty 0、currency ORE/NONE、feeG=0。
2. `answerBuild(agentId,hexKey,buildingType)`：kind STATE、difficulty 50、currency ORE、sink=50/100 ore。
3. 对真人直接 answer：默认要求 `msg.sender == registry.agentOwner(agentId)`；runner/relay 使用 A3 scoped delegate/permit。
4. 记录 faucet rate：agent/window/oreReward/questionId；D3 遥测消费。
5. 测试 ore mint/sink 后 `GTreasury.gBalance/totalOutstandingG/surplusG` 不变。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_HarvestBuildQuestionsDoNotChangeGAccounting -vv` → 期望：harvest/build 后 ore 变化正确，G balance/outstanding/surplus 不变。
- [ ] 命令：`cd contracts && forge test --match-test test_AnswerQuestionRequiresAgentOwnerOrDelegate -vv` → 期望：非 owner/非 delegate 无法 answer 他人 agent；owner 与有效 delegate 成功。

#### C3 · combat 分阶段 RNG + 状态锁定快照 [SC | `World.sol`,combat module | 依赖 C1,B1,A2 | maps-to world-as-market §8.1 C3]

**功能点**
- 用户可见：Raid/Attack 的结果可解释、可回放；G stake/event prize 不受 state drift 和 RNG grind 影响。
- 技术交付物：combat question open/answer -> lock snapshot -> finalize RNG -> resolve；snapshot 不读 live state 结算；stale owner refund。

**现状 & 缺口**
- 已有：`attack`/`raid` 都在单 tx 内扣资源、读取 live owner、防御、`prevrandao` 并改 owner（`contracts/src/GameEngine.sol:388-447`、`contracts/src/GameEngine.sol:631-695`）。
- 已有：`inciteRebellion` 使用 live happiness + 50% prevrandao（`contracts/src/GameEngine.sol:563-615`）。
- 缺：无 `lock` 快照；无 entropy request；无 target owner 变化退款；无 G escrow battle fee；无 trace。

**子任务拆分**
1. `answerCombat` 保存 payload：target/source、arsenalSpend、oreSpend、optional feeG、resolveAt。
2. `lockCombat` 快照 target/source owner、source arsenal、target defense/happiness、attacker location、cooldown、target owner、ore spend；emit `QuestionLocked`。
3. 调 B1 `requestEntropy(questionId,snapshotHash)`；entropy 未 finalized 时 resolve revert。
4. `resolveCombat` 只读 snapshot + entropy；若 live target owner != snapshot owner，则 CANCELLED/refund。
5. 成功/失败写 legacy world state via A2 adapter；emit `QuestionResolved` + trace。
6. incite 也进入 staged STATE question；低价值 comeback 可用 no-G mock entropy，但不能用于 G 市场。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_CombatQuestionRefundsWhenTargetOwnerChangesAfterLock -vv` → 期望：lock 后目标易主，question cancel，G/ore escrow 退回，不改 owner。
- [ ] 命令：`cd contracts && forge test --match-test test_CombatQuestionUsesSnapshotForTullock -vv` → 期望：resolve 用 lock 时 arsenal/defense/location/cooldown 快照，不受之后 live build/move 影响。

#### C4 · treasury + G 会计不变量（escrow/tax/burn/event pool） [SC | `World.sol`,`GTreasury.sol` | 依赖 C1 | maps-to world-as-market §8.1 C4]

**功能点**
- 用户可见：G stake、refund、payout、tax/burn/event pool 可见且不会被 owner surplus 提走。
- 技术交付物：G escrow/release/payout/refund 会计原语、protocolBurnG、eventPrizePoolG、World treasury view/events；`surplusG` 排除 escrow/event pool；parimutuel 规则本身落 C6。

**现状 & 缺口**
- 已有：`depositG`（`contracts/src/GTreasury.sol:100-107`）、`spendG`（`contracts/src/GTreasury.sol:117-122`）、`creditG`（`contracts/src/GTreasury.sol:126-130`）、`surplusG`（`contracts/src/GTreasury.sol:165-169`）。
- 已有风险：`surplusG = balance - totalOutstandingG` 未排除 future escrow/event pool（`contracts/src/GTreasury.sol:165-169`）；`withdrawSurplus` 同样只排 outstanding（`contracts/src/GTreasury.sol:151-159`）。
- 已有反例：demo G/market 目前是 ore-native clamp（`demo/index.html:575-584`）；GameEngine debate ore payout clamp 到 `MAX_ORE_POOL`（`contracts/src/GameEngine.sol:867-881`）。
- 缺：无 `escrowG/eventPrizePoolG/protocolBurnG`；无 World-only escrow/release/payout/refund 入口；无 `WorldTreasuryUpdated/EventPrizePoolFunded/ProtocolBurnAccounted` 事件；无 G pool no cap tests。

**子任务拆分**
1. 在 GTreasury append accounting：`escrowGTotal`、`eventPrizePoolG`、`protocolBurnG` 或等价拆账。
2. 增加 World-only `escrowG/releaseEscrowG/refundEscrowG/payoutG/fundEventPoolG` entrypoints；module 不直接 custody G。
3. `surplusG`/`withdrawSurplus` 改为排除 `escrowG + eventPrizePoolG + protocolBurnPending`。
4. C6/C7 只能通过 C4 会计原语移动 G；不得直接用 `creditG` 裸发 payout/refund。
5. tax/rake 拆分：protocol surplus、burn、event prize pool，emit 明细事件。
6. 收紧 `creditG` reason/caller：允许 deposit/faucet 既有路径、保留 CardLedger `market_sale` 守恒，World payout/refund/event reward 必须来自 escrow/funded pool。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_TreasuryEscrowReleasePayoutConservesG -vv` → 期望：escrow/release/payout/refund 后 `nativeBalance >= outstanding + escrow + eventPool + burnPending`，无裸增发。
- [ ] 命令：`cd contracts && forge test --match-test test_TreasurySurplusExcludesEscrowAndEventPool -vv` → 期望：escrow/event pool 不可被 `withdrawSurplus` 提走，会计满足 `nativeBalance >= outstanding + escrow + eventPool + burnPending`。
- [ ] 命令：`cd contracts && forge test --match-test test_OrePathsNeverCreditG -vv` → 期望：harvest/build/attack/debate/incite ore 变化不增加任何 agent G。

#### C5 · legacy 冻结迁移与兼容 alias checklist [SC/DOC | `World.sol`,migration tests | 依赖 D4,C2,C3,C4 | maps-to world-as-market §8.1 C5]

**功能点**
- 用户可见：旧入口名可继续用一段时间，但所有真实状态变更都走 World。
- 技术交付物：migration checklist、compatibility alias、freeze order、indexer/事件兼容、回滚策略；C5 只产出 freeze 前置清单，不打开 freeze。

**现状 & 缺口**
- 已有破坏面：MCP 旧动作直调 `GameEngine`（`mcp-server/src/tools.ts:131-219`）；旧 debate 工具是 ore 市场（`mcp-server/src/tools.ts:401-470`）；agent-runner selfTools 注入旧主世界动作（`agent-runner/src/mcp.ts:118-122`）。
- 缺：无迁移开关；无 alias 测试；无 “D4 已先切流，再允许 A5 freeze” gate。

**子任务拆分**
1. 定义阶段：Phase 0 skeleton、Phase 1 harvest/build、Phase 2 combat、Phase 3 debate/ORACLE、Phase 4 freeze。
2. alias 行为：`harvest/build/attack/raid/claim_neutral/incite_rebellion/start_debate/vote_debate/resolve_debate` 旧名在 D 层映射到 World question。
3. 事件兼容：indexer 可同时读 `QuestionResolved` 和 legacy `Built/AttackResult/DebateResolved`。
4. `legacyWritesFrozen` 打开前跑 checklist：P2/P3a、A3、C2/C3/C4、C6/C7 如涉及 G market/ORACLE、D1/D4、F7 通过；A5 只消费该 checklist。
5. 回滚：短期保留 owner unfreeze；长期 owner 可决定永久 freeze。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_LegacyMigrationChecklistBlocksFreezeWhenD4AliasesMissing -vv` → 期望：D4 alias/runner 切流或 World 入口缺失时不能启用 A5 freeze。
- [ ] 命令：`cd mcp-server && node scripts/e2e-world-legacy-alias.mjs http://127.0.0.1:3005/mcp` → 期望：旧工具名 `harvest/build/attack/raid/claim_neutral/incite_rebellion/start_debate` 返回 questionId/tx，链上默认路径为 World。

#### C6 · G parimutuel 通用市场模块（含 market type） [SC | `World.sol`,market module | 依赖 C1,C4,A3 | maps-to world-as-market §8.1 C6]

**功能点**
- 用户可见：任意 World Question 可开 G 计价市场，支持不同 market type，下注/结算/领取用统一流程。
- 技术交付物：`createQuestion` market config、`betG`/`resolveMarket`/`claimPayout`、market type enum、per-outcome pool/position、G parimutuel payout，无 ore cap。

**现状 & 缺口**
- 已有：旧 debate 下注扣 ore 并记录 support/oppose 池（`contracts/src/GameEngine.sol:746-798`），resolve 按 ore parimutuel 分配且 payout clamp 到 `MAX_ORE_POOL`（`contracts/src/GameEngine.sol:854-891`）。
- 已有：demo market payout 仍是 ore-native clamp（`demo/index.html:575-584`）。
- 已有：GTreasury 只有通用 `spendG/creditG`（`contracts/src/GTreasury.sol:117-130`），没有 question escrow/position。
- 缺：无 G market type、无 G escrow pool、无 per-outcome shares、无 idempotent `claimPayout`、无 score-based market guard。

**子任务拆分**
1. 定义 `MarketType`：至少覆盖 `BINARY`、`MULTI_OUTCOME`、`SCALAR` 或 owner 拍板的等价集合；写进 `Question.marketType`。
2. `createQuestion` 写 market config：currency 必须为 G、outcome schema、closeAt/resolveAt、resolver、metadataHash。
3. `betG(questionId,outcome,amountG)`：通过 C4 escrow 进入 question pool，记录 agent position，总池/分 outcome 池可查。
4. `resolveMarket(questionId,outcome)`：只读 resolved outcome 和 pool；扣 tax/rake 后按 parimutuel 计算可领 G，绝不套用 `MAX_ORE_POOL`/`ORE_POOL_CAP`。
5. `claimPayout` 幂等：重复 claim 不重复付款；输家 position 保留可索引但 payout 为 0。
6. score-based G market guard：A4 score v2 未激活时禁止创建 score-resolved G market。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_GParimutuelMarketCreateBetResolveClaim -vv` → 期望：创建、下注、resolve、claim 全流程守恒，赢家按 G pool 比例领取。
- [ ] 命令：`cd contracts && forge test --match-test test_GParimutuelSupportsMarketTypesAndRejectsOreStake -vv` → 期望：不同 `MarketType` 配置可读；G market 不接受 ore stake。
- [ ] 命令：`cd contracts && forge test --match-test test_GMarketPayoutHasNoOreCapClamp -vv` → 期望：大额 G pool 派彩完整到账，不受 1000 ore cap 影响。

#### C7 · ORACLE resolver + 超时退款 + 争议 [SC | `World.sol`,oracle module | 依赖 C1,C4,C6,A3 | maps-to world-as-market §8.1 C7]

**功能点**
- 用户可见：外部事实类问题有指定 resolver、超时退款和争议窗口；旧 oracle debate 迁到 G question。
- 技术交付物：ORACLE question fields、resolver role、resolve proof、timeout refund、dispute hook/status、keeper 可结算/退款。

**现状 & 缺口**
- 已有：oracle debate 由 `oracleAgentId` 决定时长（`contracts/src/GameEngine.sol:723-724`），投票要求 ore bet 且 oracle 不能投（`contracts/src/GameEngine.sol:763-767`），resolve 只有 operator 可传 outcome（`contracts/src/GameEngine.sol:801-814`）。
- 已有：`expireDebate` 超时退款只适用于旧 oracle debate（`contracts/src/GameEngine.sol:897-911`）。
- 已有：MCP `start_debate/vote_debate/resolve_debate` 文案和参数仍围绕 ore betting（`mcp-server/src/tools.ts:401-470`）。
- 缺：无 G escrow oracle market；无 resolver proof/dispute fields；无 timeout refund 与 dispute 对 C6 G pool 的统一状态机；无 keeper question flow。

**子任务拆分**
1. 扩展 ORACLE metadata：resolver、resolveDeadline、gracePeriod、disputeWindow、outcomeSchema、proofURI/hash。
2. `resolveOracle(questionId,outcome,proof)`：只能 resolver/keeper policy 允许者调用；resolve 后进入 C6 payout。
3. `timeoutRefund(questionId)`：deadline + grace 后任何人/keeper 可触发 CANCELLED，所有 G escrow 全额退款。
4. `openDispute/questionDisputed`：争议期内暂停 payout；owner/dao/resolver policy 决定维持、改判或退款。
5. D2 keeper 集成：due ORACLE 自动 resolve/refund；旧 `start_debate/vote_debate/resolve_debate` 只作为 alias。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_OracleResolverCanResolveGQuestionWithProof -vv` → 期望：合法 resolver 可带 proof resolve，非法 resolver revert。
- [ ] 命令：`cd contracts && forge test --match-test test_OracleTimeoutRefundsAllGAfterGrace -vv` → 期望：超时后 question 取消，所有 G escrow 原路退款，不能再 claim payout。
- [ ] 命令：`cd contracts && forge test --match-test test_OracleDisputePausesPayoutAndCanRefund -vv` → 期望：争议期间 claim revert，争议退款后所有 position 可退。

#### C8 · World event registry 注册式扩展 [SC | `World.sol`,`WorldExtensionRegistry.sol` | 依赖 C1,C4 | maps-to world-as-market §8.1 C8]

**功能点**
- 用户可见：矿潮、boss、treasury threshold 等世界事件可被注册、触发、查询，并能把 G 奖池接到问题流。
- 技术交付物：event type registry、trigger policy、active event storage、`WorldEventTriggered`、`get_world_events` 数据模型、module allowlist。

**现状 & 缺口**
- 已有：MCP `get_world` 只返回当前世界/hex 状态（`mcp-server/src/tools.ts:80-82`），`arena_get_treasury` 只读 Arena treasury（`mcp-server/src/tools.ts:822-830`）。
- 已有：Router 当前没有 `world` slot，storage 止于 `cardLedger`（`contracts/src/Router.sol:10-21`）。
- 缺：无 World event registry；无 treasury threshold -> event trigger；无 event prize pool 与 question linkage；无 `get_world_events` 稳定 schema。

**子任务拆分**
1. 新建 `WorldExtensionRegistry` 或 World 内 registry：`registerEventType(typeId,module,triggerPolicy,metadataHash)`。
2. `triggerWorldEvent(typeId,sourceQuestionId,prizePoolG,payloadHash)`：只允许 owner/registered module/treasury keeper policy；emit `WorldEventTriggered`。
3. active events storage/view：`getWorldEvent(eventId)`、`listWorldEvents(status,count)`，供 D1/F8 使用。
4. 与 C4 eventPrizePool 对接：触发事件时只从 funded event pool 分配，不得动 agent outstanding/escrow。
5. 样例事件：矿潮（faucet rate modifier）、boss/world raid（G prize seed）各做最小实现或 fixture。

**验收标准**
- [ ] 命令：`cd contracts && forge test --match-test test_WorldEventRegistryRegistersAndTriggersTreasuryEvent -vv` → 期望：注册事件类型后，treasury threshold 可触发 `WorldEventTriggered` 并被 view 查询。
- [ ] 命令：`cd contracts && forge test --match-test test_WorldEventPrizePoolAccountingCannotDrainEscrow -vv` → 期望：事件奖池只来自 funded pool，不能提走 agent G balance、question escrow 或 outstanding。
- [ ] 命令：`cd mcp-server && node scripts/e2e-world-events.mjs http://127.0.0.1:3005/mcp` → 期望：`get_world_events` 返回稳定 JSON schema，至少含 `eventId/type/status/sourceQuestionId/prizePoolG`。

---

### Lane D · MCP / keeper / runner / telemetry

#### D1 · World question MCP 工具与旧 market/debate alias [MCP | `tools.ts`,`chain.ts` | 依赖 P3a,C1,C2,C4,C6,C7,C8 | maps-to world-as-market §8.5]

**功能点**
- 用户可见：AI/用户用 `answer_question`、`bet_question`、`resolve_question`、`get_treasury`、`get_world_events` 操作世界；旧 `start_debate/vote_debate/resolve_debate` 不直接打旧合约。
- 技术交付物：World ABI、Router V4 resolver、question tools、G treasury tools、legacy alias、清晰错误。

**现状 & 缺口**
- 已有：`tools.ts` 注册工具入口（`mcp-server/src/tools.ts:10-20`），主世界旧工具（`mcp-server/src/tools.ts:131-192`），debate ore market 工具（`mcp-server/src/tools.ts:401-470`），Arena treasury 工具（`mcp-server/src/tools.ts:822-830`）。
- 已有：`chain.ts` Router ABI 只到 V3/V2/V1（`mcp-server/src/chain.ts:90-97`、`mcp-server/src/chain.ts:260-298`）。
- 缺：无 World ABI/contract；无 `answer_question/bet_question/resolve_question/claim_payout/get_treasury/get_world_events`；旧 `create_market/bet/resolve_market` 不应作为新主 API。

**子任务拆分**
1. `chain.ts` 增 `WORLD_ABI` 与 `requireWorld()`；Router resolver 优先 V4 world。
2. 注册工具：`create_question`、`answer_question`、`bet_question`、`resolve_question`、`claim_payout`、`get_question`、`list_questions`、`get_treasury`、`get_world_events`。
3. 旧别名：`create_market`/`bet`/`resolve_market` 若保留，仅转成 `create_question(kind=STATE|ORACLE,currency=G)`、`bet_question`、`resolve_question`；返回 deprecated warning。
4. `start_debate/vote_debate/resolve_debate` 保留同名 alias，但内部转 World ORACLE/STATE question；明确旧 ore betting 为 legacy，不扩展。
5. 错误处理：World 未部署、余额不足、未授权、question locked/resolved、G pool no cap。

**验收标准**
- [ ] 命令：`cd mcp-server && npm run build` → 期望：World ABI/tools 编译通过。
- [ ] 命令：`cd mcp-server && node scripts/e2e-world-question-tools.mjs http://127.0.0.1:3005/mcp` → 期望：`create_question -> answer_question -> resolve_question -> claim_payout -> get_treasury` 全链路通过；旧 `start_debate` 返回 questionId 且不直调 `GameEngine.startDebate`。

#### D2 · question / treasury keeper [INFRA | `keeper-question.mjs`,`keeper-treasury.mjs` | 依赖 D1,C1,C4,C7,C8,P3a | maps-to world-as-market §8.5]

**功能点**
- 用户可见：到期问题会被结算；treasury 达阈值会触发世界事件/奖池 seed。
- 技术交付物：替代旧 market keeper 的 question keeper；新增 treasury keeper；ONCE/loop 两种模式；可观测日志。

**现状 & 缺口**
- 已有：Arena keeper 独立脚本、env、ONCE、tick 模式（`mcp-server/scripts/keeper.mjs:1-33`、`mcp-server/scripts/keeper.mjs:47-104`、`mcp-server/scripts/keeper.mjs:106-140`）。
- 缺：无 question keeper；无 due questions list；无 treasury threshold scanner；旧 `predictionTimer` 还围绕 oracle debate（`agent-runner/src/orchestrator.ts:125-158`）。

**子任务拆分**
1. `keeper-question.mjs`：扫描 OPEN/LOCKED due questions，按 kind 调 resolve/lock/finalize；ORACLE 超时走 refund。
2. `keeper-treasury.mjs`：读取 `get_treasury`，当 `eventPrizePoolG >= threshold` 触发 `WorldEventTriggered` 或 seed 新 question。
3. Env 与 Arena keeper 对齐：`NETWORK/RPC_URL/ROUTER_ADDRESS/KEEPER_KEY/TICK_SECONDS/ONCE`。
4. agent-runner 删除/替换旧 prediction timer：从 active oracle debate 改 active questions/world events。

**验收标准**
- [ ] 命令：`cd mcp-server && NETWORK=localhost KEEPER_KEY=0xac0974... ONCE=1 node scripts/keeper-question.mjs` → 期望：到期 MATH/STATE/ORACLE question 被结算或退款，日志含 questionId/tx。
- [ ] 命令：`cd mcp-server && NETWORK=localhost KEEPER_KEY=0xac0974... ONCE=1 node scripts/keeper-treasury.mjs` → 期望：达到阈值时触发 World event，未达阈值不发 tx。

#### D3 · World telemetry：答题准确率 / G 税 / 金库 / faucet rate [INFRA | `telemetry/` | 依赖 D1,C1,C4,C6,A4 | maps-to world-as-market §8.5]

**功能点**
- 用户可见：运营能看世界是否健康：答题准确率、G rake/burn/event pool、faucet rate、score 污染风险。
- 技术交付物：event backfill、CSV/JSON 输出、固定公式测试。

**现状 & 缺口**
- 已有：仓库根无 `telemetry/` 目录（`find . -maxdepth 1 -type d -name telemetry` 无输出）；`arena_get_treasury` 只读 surplus/outstanding/mode（`mcp-server/src/chain.ts:1099-1115`）。
- 缺：无 question accuracy、G tax/burn/event pool、faucet rate、G pool no cap alert、score-v2 adoption 指标。

**子任务拆分**
1. 新建 `telemetry/collect.mjs`：按 block range 读取 `QuestionAnswered/Resolved/WorldEventTriggered/G*` 事件。
2. 指标：`answer_accuracy_by_agent`、`question_resolution_latency`、`g_tax_collected`、`protocol_burn_g`、`event_prize_pool_g`、`faucet_ore_per_hour`、`score_ore_share`。
3. 告警：G pool payout 被 cap/截断应为 impossible；surplus 小于 escrow/event pool invariant 失败报警。
4. 输出 CSV/JSON；D/F 可读用于 dashboard。

**验收标准**
- [ ] 命令：`cd telemetry && NETWORK=localhost node collect.mjs --from-block 0 --to-block latest --out out.csv` → 期望：生成列 `metric,window,value,computedAt`，至少含 `answer_accuracy,g_tax,event_prize_pool_g,faucet_ore_per_hour`。
- [ ] 命令：`cd telemetry && node test/formulas.test.mjs` → 期望：固定 fixture 的准确率、G 税、金库余额、faucet rate 与手算一致。

#### D4 · agent-runner 切到 World aliases，freeze 前不中断自主循环 [INFRA | `agent-runner/*`,`tools.ts` | 依赖 D1,C2,C3,C4,C6,C7,C8 | maps-to 新增]

**功能点**
- 用户可见：AI 仍能自主 harvest/build/raid/debate，但底层走 World；freeze 旧直写不会让 runner 停摆。
- 技术交付物：runner prompt/tools 默认注入切换；active oracle debate -> active questions；旧工具名 alias 过渡；D4 是 C5 checklist 与 A5 freeze 的前置，不反向依赖它们。

**现状 & 缺口**
- 已有：runner 每轮收集 `get_my_hexes/get_active_oracle_debate/arena_get_state`（`agent-runner/src/mcp.ts:86-99`）。
- 已有：selfTools 默认注入旧 `harvest/build/attack/raid/incite_rebellion/claim_neutral`（`agent-runner/src/mcp.ts:118-122`），旧 `start_debate/vote_debate` 紧随其后（`agent-runner/src/mcp.ts:123`）。
- 已有：orchestrator 启动旧 prediction timer 与 oracle designation（`agent-runner/src/orchestrator.ts:125-158`）。
- 缺：无 active questions/world events；无 World alias prompt；freeze 前无 smoke。

**子任务拆分**
1. `collectContext` 加 `list_questions/get_world_events/get_treasury`，替换/降级 `get_active_oracle_debate`。
2. `selfTools` 增 `answer_question/bet_question/resolve_question/claim_payout`；旧动作保留 alias 但描述为 legacy names。
3. Orchestrator prediction timer 改 question/event timer；Oracle role 逻辑改为 World resolver role。
4. Freeze 前跑 runner smoke：一轮可 harvest/build/raid/bet question，不出现 direct GameEngine revert。

**验收标准**
- [ ] 命令：`cd agent-runner && npm run build` → 期望：runner 编译通过，tool definitions 包含 World 工具。
- [ ] 命令：`cd agent-runner && npm run dev -- --config config/localhost.toml --once` → 期望：至少一个 enabled agent 能通过 World alias 完成一个 low-difficulty action；freeze 后不因旧直写 revert 停摆。

#### D5 · MCP 文案/ABI 漂移清理（顺手前置） [MCP | `tools.ts`,`chain.ts` | 依赖无 | maps-to hygiene]

**功能点**
- 用户可见：工具说明与合约事实一致，减少 AI 做错动作。
- 技术交付物：修旧文案与 ABI 漂移，避免 World 迁移时继承错误。

**现状 & 缺口**
- 已有漂移：`chain.ts` 仍声明不存在的 `HexClaimed`（`mcp-server/src/chain.ts:44`）与错误 `Harvested(bytes32,...)`（`mcp-server/src/chain.ts:47`），真实事件是 `Harvested(uint256,uint256)`、`HexCaptured/HexRebelled`（`contracts/src/GameEngine.sol:142`、`contracts/src/GameEngine.sol:150-151`）。
- 旧 debate 文案写 ore betting（`mcp-server/src/tools.ts:401-459`），迁移后应指向 G question/legacy。
- 缺：无 event ABI smoke。

**子任务拆分**
1. 修 GameEngine ABI 事件签名：去掉 `HexClaimed`，修 `Harvested`，补 `HexCaptured/HexRebelled`。
2. 更新 debate 工具说明：legacy alias；新市场用 G `bet_question`。
3. 增加 ABI parse smoke：从本地 receipt 解析 Harvested/HexCaptured/Question*。

**验收标准**
- [ ] 命令：`cd mcp-server && rg -n "HexClaimed|Harvested\\(bytes32|Bet ore with vote_debate" src` → 期望：无输出或仅 legacy/deprecated 注释。
- [ ] 命令：`cd mcp-server && npm run build` → 期望：ABI 与 tools 编译通过。

#### D9 · trace 工具：question / Arena replay [MCP | `tools.ts`,`chain.ts` | 依赖 B2,D1 | maps-to world-as-market §8.5]

**功能点**
- 用户可见：前端和 AI 可以解释每次 World combat/Arena match 的关键状态、RNG、能力触发。
- 技术交付物：`get_question_trace`、`arena_simulate_match` 扩展、`get_world_events` trace links；稳定 JSON schema。

**现状 & 缺口**
- 已有：`arena_simulate_match` 返回普攻 turns（`mcp-server/src/tools.ts:931-939`、`mcp-server/src/chain.ts:993-1005`）。
- 缺：无 World question trace 工具；无 ability events；F2/F3 无可靠 replay 数据源。

**子任务拆分**
1. `chain.ts` 增 World trace ABI：`getQuestionTrace(questionId)` 或 event backfill。
2. `tools.ts` 增 `get_question_trace`；扩展 `arena_simulate_match` 输出 `abilityEvents` 时兼容旧合约。
3. 新建 `scripts/e2e-world-trace.mjs` 与 `scripts/e2e-arena-trace.mjs`。
4. 输出 schema 文档：字段稳定，前端 F2/F3 依赖此 schema。

**验收标准**
- [ ] 命令：`cd mcp-server && node scripts/e2e-world-trace.mjs http://127.0.0.1:3005/mcp` → 期望：返回含 `questionId/stateSnapshotHash/outcome/events` 的 trace。
- [ ] 命令：`cd mcp-server && node scripts/e2e-arena-trace.mjs http://127.0.0.1:3005/mcp` → 期望：旧 turns 与新 ability events 均可解析；旧合约无 ability events 时不崩。

---

### Lane E · 真人写链路 / G 下注 UI

#### E1 · 钱包连接与写链路基座（不做 email 登录） [FE | wallet 新子树 | 依赖无 | maps-to roadmap E6.1]

**功能点**
- 用户可见：真人用钱包连接，选择自己拥有的 agent，发起 deposit/bet/answer。
- 技术交付物：wallet provider/hooks/tx state；外部钱包优先；明确不接 email/社交登录。

**现状 & 缺口**
- 已有：真实前端只读；`frontend/package.json` 依赖不含 wagmi/viem/Privy/RainbowKit（`frontend/package.json:11-19`）。
- 缺：无 wallet provider、account state、send tx、chain mismatch UI、owned agents selector。

**子任务拆分**
1. 选择 wallet provider（外部钱包或轻量 ethers signer）；只做钱包连接，不做 email 登录/embedded social login。
2. 新建 `useWalletAccount/useTxState/writeContract`。
3. 读取 `AgentRegistry.agentOwner`/owned agents，下注/answer 前要求选择自己拥有的 agent。
4. 错误态：未连接、链错误、非 agent owner、余额不足、question resolved/locked。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：wallet provider 和 tx hooks 编译通过。
- [ ] 命令：`cd frontend && rg -n "email|Privy|social login|magic link" src` → 期望：无 email/social login 实现；若出现只在“非目标”文案中。

#### E2 · 写链/relay 裁剪：只保留钱包/tx 三态，不承诺 gasless 全栈 [FE | wallet components/relay-client | 依赖 E1,A3 | maps-to roadmap E7 裁剪]

**功能点**
- 用户可见：按钮有 pending/confirmed/failed；若未来 relay 存在可切换，但当前不承诺完整 gasless 后端。
- 技术交付物：前端 relay client interface + self-send path；不在 E 中新建后端。

**现状 & 缺口**
- 已有：demo 文案声称 relay/no gas（`demo/index.html:1357`、`demo/index.html:1905-1908`），真实前端无写链。
- 缺：无 tx state UI；无 relay backend owner；无 A3 scoped delegation。

**子任务拆分**
1. `TxButton`/`TxToast`：pending/confirmed/failed/receipt link。
2. relay client 只定义接口；后端若落 `mcp-server` 归 D，若独立服务归新 owner。
3. 默认使用用户钱包直接调用；runner/relay 路径必须依赖 A3 scope/permit。
4. 文案去掉“no gas”承诺，除非实际 relay 可用。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：tx state components 编译通过。
- [ ] 命令：`cd frontend && rg -n "no gas|gasless|email login" src` → 期望：无未实现承诺；如保留需有 feature flag 或 disabled 文案。

#### E4 · Prediction Markets UI 改为 G Question betting [FE | `app/markets/*` | 依赖 E1,D1,C4,C6,C7,A3,F7 | maps-to world-as-market §8.6]

**功能点**
- 用户可见：`/markets` 可保留名称，但详情是 `Question`；真人用自己拥有的 agent 在 G pool 下注。
- 技术交付物：Question list/detail、G stake panel、World fee/tax/burn/event pool 可见、positions/receipts、agent owner 校验。

**现状 & 缺口**
- 已有 demo：Markets 文案是 “Bet your agent's ore”（`demo/index.html:1721-1727`）；下注校验 ore/min/max（`demo/index.html:1767-1789`）；pool/payout/按钮全用 ore（`demo/index.html:1850-1908`）。
- 缺：真实 `/markets` 不存在；无 G question API；无 owned agent/G balance check；无 G pool no cap UI；无 World Treasury fee display。

**子任务拆分**
1. 新建 `/markets` 和 `/markets/[id]`，数据源为 D1 `list_questions/get_question` 或 direct RPC。
2. Detail 抽象为 `QuestionModal`：kind/difficulty/currency/status/resolveAt/resolver/poolId。
3. `currency=G` 时 stake 显示 G；调用 `bet_question(agentId, questionId, outcome, amountG)`；余额读 `GTreasury.gBalance`。
4. 权限：只允许当前钱包拥有的 agent；若用 delegate/permit，UI 显示 scope/expiry。
5. G fee/tax/burn/event pool 明细显示；**不得做 G payout cap clamp**。
6. `currency=ORE/NONE` 的 MATH/STATE 题显示 fixed ore reward / ore sink / difficulty，不用 G betting panel。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：`/markets` 与 `/markets/[id]` 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：桌面 1440x900 和移动 375x812 可打开 question detail；G 下注 pending→confirmed；非 owner agent、G 不足、resolved question 均有明确错误。

#### E6 · G 充值 + 余额展示 [FE | DepositG UI | 依赖 E1,F7 | maps-to roadmap E6.6]

**功能点**
- 用户可见：用户可以给自己 agent 充值 G，并看到可用于 World betting/Arena 的余额。
- 技术交付物：DepositG form、balance card、withdraw mode 提示、treasury mode badge。

**现状 & 缺口**
- 已有：MCP 有 `arena_deposit_g`/`arena_withdraw_g` 工具（`mcp-server/src/tools.ts:643-667`），chain 用 `GTreasury.depositG/withdraw`（`mcp-server/src/chain.ts:841-857`）；合约 deposit 要求 `msg.sender == agentOwner(agentId)`（`contracts/src/GTreasury.sol:100-107`）。
- 缺：真实前端无 deposit/withdraw UI；G 余额只在 Arena read hook 间接显示。

**子任务拆分**
1. G balance hook：读 `GTreasury.gBalance(agentId)`、`faucetEnabled/withdrawEnabled/surplusG`。
2. Deposit form：输入 G 数量，调用 `depositG(agentId)` with value；只允许 owner agent。
3. Withdraw form（若 withdraw mode）：调用 `withdraw(agentId, amount)`；faucet mode 显示不可提。
4. 在 `/markets`、`/me`、Arena topbar 共用 G balance badge。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：DepositG/Balance components 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：连接钱包后可充值 G，余额刷新；非 owner agent 按钮 disabled 或交易前报错。

#### E7 · 手动操作事件 / US-C3 裁剪保留 [FE/DOC | docs/UI 文案 | 依赖 E2 | maps-to 裁剪]

**功能点**
- 用户可见：本轮不承诺“每个手动操作都上链成专用 UX 事件/US-C3”；手动动作只是 question/action receipt。
- 技术交付物：裁剪文档与 UI 文案，避免把 demo mock 的手动事件误认为链上已支持。

**现状 & 缺口**
- 已有 demo quick actions 是 mock/relay 文案（`demo/index.html:1344-1357`）。
- 缺：真实前端无手动操作事件流；World 会有 `QuestionAnswered/Resolved`，但不等于单独 US-C3 事件系统。

**子任务拆分**
1. 文案统一：手动 Harvest/Build/Raid 显示 question receipt，不新增“manual operation event”。
2. 若要通知，复用 D1/D9 的 question/world events。
3. 在 roadmap/dev docs 标明 US-C3 暂不做，避免 F/E 误建重复事件系统。

**验收标准**
- [ ] 命令：`cd frontend && rg -n "manual operation event|US-C3|manual event" src docs` → 期望：无未实现承诺；若出现仅在裁剪说明。
- [ ] 命令：`cd frontend && npm run build` → 期望：裁剪后无路由/组件断链。

---

### Lane F · 只读前端 / 观众态 / replay

#### F2 · Arena/World 能力回放视图（依赖 B2+D9） [FE | `components/arena/*`,`components/world/*` | 依赖 B2,D9 | maps-to replay]

**功能点**
- 用户可见：能看到 Arena match / World combat 的逐步回放、能力触发、结果原因。
- 技术交付物：Replay timeline component，消费 D9 trace schema。

**现状 & 缺口**
- 已有：Arena 页使用 `useArenaEngine` 拉 matches/simulations（`frontend/src/hooks/useArenaEngine.ts:118-230`）；`arena_simulate_match` 当前只有 turns。
- 缺：无 ability events；无 question trace；无 World replay component。

**子任务拆分**
1. 在 `ReplayCanvas/StagePanel` 等组件接入 D9 输出的 turns + abilityEvents。
2. 新建 World question trace panel，显示 snapshot、entropy、outcome、payout。
3. 无 D9 时 graceful fallback：显示基础 result，不渲染能力事件。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：Replay components 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：`/arena` 可展示旧 turns；有 D9 fixture 时展示 ability events；World question trace 可打开。

#### F3 · AgentMind / 决策回放接 World question trace [FE | `components/ledger/*`,`components/world/*` | 依赖 B2,D9,D4 | maps-to AgentMind]

**功能点**
- 用户可见：AgentMind 不只是文字流，还能引用具体 question/trace/treasury event。
- 技术交付物：AgentMind entry 支持 `questionId/traceId/worldEventId` 链接；从 D4 runner context 读取 active questions/events。

**现状 & 缺口**
- 已有：Arena 页复用 `useGameEngine` 给 AgentMind panel（`frontend/src/app/arena/page.tsx:15-18`、`frontend/src/components/arena/AgentMindPanel.tsx` 在现有组件树中）。
- 缺：无 question trace link；无 World event ticker；runner context 仍是旧 active oracle debate。

**子任务拆分**
1. 扩展 store entry shape：可选 `questionId/worldEventId/traceId`。
2. AgentMind UI 点击后打开 F2 trace panel 或 World event detail。
3. 兼容旧 ledger entries：无 trace 字段时仍按文本显示。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：AgentMind trace links 编译通过。
- [ ] 命令：`cd frontend && npm run test -- --runInBand AgentMindTrace` → 期望：旧 entry 与带 questionId 的 entry 都能渲染。

#### F7 · 前端 Router resolver 支持 V4 `world` [FE | `frontend/src/hooks/*`,`frontend/src/chain/*` | 依赖 P1 | maps-to world-as-market §8.2]

**功能点**
- 用户可见：前端无需手填 World 地址；旧 Router 未升级时不崩。
- 技术交付物：前端 resolver 统一解析 V4/V3/V2/V1；返回 world/gTreasury/cardLedger/arena/game。

**现状 & 缺口**
- 已有：`useGameEngine` 只用 V1 `getAddresses`（`frontend/src/hooks/useGameEngine.ts:13-15`、`frontend/src/hooks/useGameEngine.ts:104-114`）。
- 已有：`useArenaEngine` 有 V3/V2/V1 fallback，但没有 V4/world（`frontend/src/hooks/useArenaEngine.ts:12-21`、`frontend/src/hooks/useArenaEngine.ts:171-213`）。
- 已有：`frontend/src/chain/abis.ts` 的 Router ABI 甚至只有 5 个 address，与当前 Router V1 6-tuple 不一致（`frontend/src/chain/abis.ts:6-8`），`frontend/src/chain/contracts.ts` 解 5 项（`frontend/src/chain/contracts.ts:20-29`），且当前无 import 使用。
- 缺：无 shared resolver；无 world contract instance；无 V4 tuple 类型。

**子任务拆分**
1. 新建/重构 `frontend/src/chain/resolve.ts`：V4 -> V3 -> V2 -> V1 fallback。
2. 更新 `useGameEngine` 与 `useArenaEngine` 共用 resolver，避免重复 ABI。
3. 输出 `world` contract 与 `World` ABI read fragments：question/treasury/events/scoreV2。
4. 老 Router 未升级时 `world=null`，UI 隐藏 World-only panels 并提示 unavailable。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：resolver 类型编译通过。
- [ ] 命令：`cd frontend && npm run test -- RouterResolverV4` → 期望：V4 返回 world；V3/V2/V1 fallback 不 throw；旧 `frontend/src/chain/abis.ts` tuple 长度漂移被测试覆盖。

#### F8 · Featured Prediction Markets 改为问题流 + World Treasury meter [FE | `app/page.tsx`,`components/spectator/*` | 依赖 F7,D1,D3 | maps-to world-as-market §8.6]

**功能点**
- 用户可见：落地页展示 Featured Questions、World Treasury、World Events，而不是旧 ore prediction markets。
- 技术交付物：首页/观众态 question feed、treasury meter、events ticker、score v2 badge。

**现状 & 缺口**
- 已有：demo landing 展示 `FEATURED PREDICTION MARKETS`（`demo/index.html:955-965`）；scoreboard 文案仍是旧公式（`demo/index.html:937-950`）。
- 真实 `/` 当前是 hex map + Sidebar/HUD（`frontend/src/app/page.tsx:11-23`），没有 featured questions/treasury。
- 缺：无 World treasury meter、无 world events ticker、无 score v2 indicator。

**子任务拆分**
1. 新建 spectator band/panel：Featured Questions（open/locked/resolved）、World Treasury meter（surplus/eventPool/burn）、World Events ticker。
2. score 展示从旧 `getScore` 切 A4 score v2；若未激活，标 legacy，且隐藏 score-based G question CTA。
3. 移除/改写 “prediction markets” 文案为 “World Questions / World Markets”，但 `/markets` 路由名可保留。
4. 响应式：桌面与移动不遮挡地图/主 HUD。

**验收标准**
- [ ] 命令：`cd frontend && npm run build` → 期望：Featured Questions/Treasury meter 编译通过。
- [ ] 命令：`cd frontend && APP_CONFIG=localhost npm run dev -- -H 127.0.0.1 -p 3000` → 期望：1440x900 与 375x812 首页能看到 Featured Questions、World Treasury meter、World Events ticker；旧 featured prediction market 文案不再出现。

---

## 3. 并行矩阵 + 关键路径

### 3.1 并行矩阵

| 阶段 | 可并行 lane | 阻塞/串行点 | 退出条件 |
|---|---|---|---|
| Phase 0 · Skeleton | C0/C1、P1、A3、B1 interface、F7 resolver skeleton、D5 hygiene | P2 需 P1+C1；C2/C3 需 A3 | `World` interface 编译、Router V4 测试、delegation 测试、resolver fallback 测试通过 |
| Phase 1 · Faucet/Build | A1、C2、D1 基础 tools、E1/E2、E6 | A1 adapter 先于 C2；`build` World 接管必须等 A3；D1 需 P3a world 地址 | `answer_question` 可 harvest/build，G 会计不变，前端可充值 G |
| Phase 2 · Combat/RNG | B1、A2、C3、D9、F2 | A2 adapter 先于 C3；C3 必须 lock+entropy | World raid staged resolve；Arena/World money-staked 路径无 `prevrandao` |
| Phase 3 · G Markets/Oracle/Events | C4、C6、C7、C8、D1/D2、E4、F8、D3 | C4 treasury 原语先于 C6/C7；score-based G market 必须等 A4；ORACLE dispute/timeout 需 owner 拍板 | G pool 无 cap；treasury meter/events 可见；question keeper 可 resolve/refund |
| Phase 4 · Freeze | D4、C5、A5、P4 | 串行 D4 -> C5 -> A5；freeze 前必须 D4 runner 切流、D1 alias、F7 resolver、C2/C3/C4/C6/C7 全过 | legacy direct write revert；World adapter/alias 正常 |

### 3.2 关键路径（最短可上线顺序）

1. **P1 + C0/C1 + A3**：Router 有 world slot，World 有 question 状态机，agent 授权不再依赖全局 operator。
2. **P2/P3a + F7 + D1**：部署 World，MCP/前端能解析 world 并读/写 question。
3. **A1 -> C2 + E6**：基础 harvest/build adapter 先准备，再作为 difficulty 0/低难 question 跑通，G 充值可用。
4. **C4 -> C6/C7/C8 + E4 + D2/D3**：treasury accounting 先落地，再上线 G parimutuel、ORACLE refund/dispute、World events、keeper、遥测；G pool 无 cap。
5. **A4**：score 降权上线。**任何 score-based G 市场必须排在此之后**。
6. **B1 + A2 -> C3 + D9 + F2/F3**：GameEngine combat adapter 先准备，再接 World combat/RNG/trace 全链路。
7. **D4 -> C5 -> A5**：MCP/runner 完成 alias 切流，C5 checklist 通过后，A5 freeze legacy direct writes。

---

## 4. make-demo-real（World-as-Market 版）

1. **保留真人语义，替换链上原语**：demo 的 Harvest/Build/Raid/Bet 按钮可保留，但真实链路必须是 `answer_question` / `bet_question`。demo quick actions 现位于 `demo/index.html:1344-1357`；真实前端落 E/F，不直接复用 demo。
2. **Markets -> Questions**：demo `/markets` 现在是 ore parimutuel（`demo/index.html:1708-1908`）。真实 `/markets` 可保留路由名，但数据结构改为 `Question`，G market 只显示 G stake/payout，移除 ore cap clamp。
3. **World Treasury 可见**：首页/markets/my agent 都应能看到 `surplusG/eventPrizePoolG/protocolBurnG`；现真实前端没有该面板（`frontend/src/app/page.tsx:11-23`）。
4. **AgentMind 读 trace**：D9 + F2/F3 提供 question trace 后，AgentMind 的“为什么”从纯文本变成可点击证据。
5. **score 文案同步**：demo 和真实前端都不能再展示 `hexes×100 + ore + buildings×50` 作为正式公式；旧公式只可标 legacy（demo 当前 `demo/index.html:937-950`）。
6. **不新增 email login/gasless 后端承诺**：E1/E2 只做钱包连接、tx 三态和可选 relay client interface；完整 relay 后端需另设 owner。

---

## 5. 风险

1. **World 成为超级 operator 的风险**：当前 `_isOperator` 包含 contract owner，且 global operator 可控制任意 agent（`contracts/src/AgentRegistry.sol:36-48`）。若 World/keeper 复用该语义，任何 caller 都可能经 World 替他人花 G。A3 是硬前置。
2. **G 会计被 surplus 提走**：`surplusG` 当前未排 escrow/event pool（`contracts/src/GTreasury.sol:165-169`）。C4 未完成前，不能上线 G escrow market。
3. **G payout 被 ore cap 静默吞掉**：旧 debate/demo 都有 cap/clamp 行为（`contracts/src/GameEngine.sol:867-881`、`demo/index.html:575-584`）。C6/E4 必须断言 G pool 无 cap。
4. **state drift / RNG grind**：旧 attack/raid/incite/Arena 仍读 `prevrandao` 并 live 改状态。B1+C3 未完成前，不能把 G stake/event prize 绑到这些随机路径。
5. **freeze 破坏 agent-runner**：runner 默认工具仍含旧动作（`agent-runner/src/mcp.ts:118-122`），旧 debate 动作紧随其后（`agent-runner/src/mcp.ts:123`）。D4 未完成前打开 A5 会让自主循环停摆。
6. **score 污染 G 市场**：旧 score 线性吃 ore（`contracts/src/GameEngine.sol:494-506`）。A4 未完成前，scoreboard top 这类 G market 必须禁用。
7. **部署链/地址错配**：`just gravity-upgrade` 当前从 mainnet config 取 router 却打 testnet RPC（`justfile:47-53`、`frontend/config/gravity.json:1-7`）。P2/P3a 必须先修。

---

## 6. 与旧计划的偏差（明确作废/改写）

| 旧计划 | 新状态 |
|---|---|
| Lane C = 新建独立 `PredictionMarket.sol`，用 ore 下注 | **作废**。Lane C = `World` Core：C0..C8；G market 归 World；ore 只做 engagement/faucet/sink |
| Router `predictionMarket` 槽位 | **改为 `world` 槽位**；getter 定名 `getAddressesV4()`，返回 V3 九项 + world |
| A lane 重点是 GameEngine 参数 storage 化 | **改为 World 接管入口 + legacy freeze + score 降权**；参数 storage 化不是本次主线 |
| A3 per-agent delegation 是条件任务 | **强制前置**，否则 World/keeper 授权模型不安全 |
| B lane 只修 Arena RNG | **升级为全局 RNG**，覆盖 GameEngine attack/raid/incite + Arena roll/matchmaking + World combat |
| D1 `create_market/bet/resolve_market` | **改为 question tools**：`create_question/answer_question/bet_question/resolve_question/claim_payout/get_treasury/get_world_events`；旧名只可 alias |
| keeper-market | **改为 question keeper + treasury keeper** |
| E4 market 下注用 ore | **改为 G**；真人用自己拥有的 agent 在 G pool 下注；G pool 无 cap |
| F8 featured prediction markets | **改为 Featured Questions + World Treasury meter + World Events ticker** |
| score = hex*100 + ore + buildings*50 | **降权 ore**：领地/建筑/声誉/答题准确率为主，ore sqrt/封顶；score-based G market 等 A4 |
| E7 手动操作事件/US-C3 | **继续裁剪**，不做单独事件系统；用 Question receipt/trace 替代 |

---

## 7. 待确认（OPEN 给 owner）

1. **RNG 策略**：VRF、commit-reveal、keeper-seeded entropy，还是分层策略？B1 会先抽象接口，但 C3 上线前要定生产路径。
2. **G fee 分配比例**：World fee 中 protocol surplus / burn / eventPrizePool 的默认比例与可调权限。
3. **ORACLE 裁决模型**：单 resolver、多签、争议窗口、dispute bond、超时 grace；世界杯等旗舰 G market 上线前必须定。
4. **G escrow 放置**：GTreasury 内部 escrow 还是 World 内部账本 + GTreasury 受限 entrypoints。本文默认 C4 在 GTreasury 补账。
5. **score v2 落点**：World canonical score、GameEngine adapter，还是独立 ScoreModule。本文建议 World/ScoreModule canonical，GameEngine legacy 只读兼容。
6. **legacy freeze 时间**：C2/C3/C4/C6/C7、D1/D4、C5、F7、E4 达到什么稳定度后在 testnet/mainnet 开 A5。
7. **基础 ore loop 是否完全免费**：本文按 difficulty 0/Harvest feeG=0 写；若 owner 改成低额 G fee，需要同步 C2/E4/D3。
8. **`/markets` 命名**：路由是否继续叫 `/markets`。本文建议保留路由，内部文案改 “World Questions / World Markets”。
