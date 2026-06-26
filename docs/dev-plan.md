# Gravity Town v2 · 并行开发与执行计划（PM 视角）

> 配套工程稿: [`docs/game-design.md`](game-design.md)（合约/结构/不变量权威定义）· 玩家视角: [`docs/game-design-ux.md`](game-design-ux.md)。本文**不重写合约规格**，只把 §10 线性的 M0–M7 转成可并行的 lane / 依赖 / 节奏。**一律以 game-design.md 为准；不走 PR#76（`feat/ux-demo-roadmap`）已废弃的「万物皆答题」方向**（那是设计方向、不是会泄进代码的分支，无需 CI 守）。真正要挡在 v2 lane 之外的是**旧 v1 GameEngine 的范畴**（ore/build/arsenal/happiness/raid）——只能作 v1 参考、不可作 v2 实现（见 §8 v1 旧 scope 越界扫描）。

---

## 0. TL;DR（30 秒版）

> ### ✅ 架构已定稿（无 GATE 0）
> **旧稿的「13 项 M0 决策签字门」已删除**——那些项已 research 定稿为 §3 已定架构（World=B、commit-reveal RNG、`reservedBackingG`=(a)、QuestionRegistry 内嵌、Router 14 槽…）。**接口（§4）即刻可冻、lane 即刻可并行**，不再等任何签字。仅剩 §12 数值与 M7 ORACLE 信任模型待 owner，均**不阻塞**冻接口（§3.5）。

- **关键路径（全串行 ~13.5 周；并行后净 ~10–11 周、最好 ~9 周到可玩 MVP——架构已定稿、省去旧 1.5w 决策门；并行主要把 L-C/L-D 叠到骨干上、并非砍半，详见 §10）**：`接口冻结(1w) → [L-A 财库 ∥ L-C 世界 ∥ L-D RNG] → L-B MATH(随 L-A) → C1 冻结后 L-B STATE(顺序,1w) → L-E 行动汇流 → L-I 集成切换`。逐 lane 周数与 PERT 见 §10。
- **唯一并行总开关 = 接口冻结**；冻结的前置 = **采纳 §3 已定架构**（已 research 定稿，无签字门）。
- **能最早 demo 的薄片 = MATH-only**（P1），不依赖 STATE / V2World checkpoint，先转起来。
- **承重护栏 = L-T**：接口冻结当天起常驻，`contracts/test/WorldInvariants.t.sol`（6 项 property test）+ CI 门禁所有 lane 合并，不变量红则不准 merge。
- **三个硬汇流点**：①STATE ⟂ V2World.checkpoint（M2→M3，**注意 L-B STATE 顺序等 L-C，非并行**）②L-E ⟂ AP.spend+Hex邻接+RNG（P1 mock/P2 real）（M3→M4，**注意：STATE 市场读 L-E 写的 checkpoint，是 L-E 的下游而非上游**）③L-I feature-flag 软切（M4→M5，**翻 flag 须 L-T 6/6 ∧ P2 gate ∧ M4.5 审计 ∧ 迁移快照校验全绿**）。
- **仅剩需 owner 拍板的**：§12 数值 + M7 ORACLE 信任模型（§3.5），**均不阻塞冻接口**；架构决策（World/RNG/财库/市场/Router）已在 §3 定稿。
- **6 个必须先落地的执行工件**（详见 §1.工件清单）：`/contracts/src/interfaces/` 6 个 MVP 接口（QuestionRegistry 内嵌、不单列）+ `HexGrid.sol` + `Mock*`、`/contracts/test/WorldInvariants.t.sol`、`/lane-PLAN.md`、`/docs/gates.md`、`/docs/§12-values.md`、Router V3→V4 扩展（14 槽）+ setter。无这 6 件，本文只是路线图、不是可执行部署规格。

---

## 1. 这份文档是什么 / 怎么读

工程稿 §10 把里程碑写成一条线性链（M0→M1→…→M7）。但其中很多模块**没有真实依赖**，只是被排成了一串。本文把它拆成**可并行的 lane**：采纳 §3 已定架构、冻结接口，然后多人/多 agent 各占一条 lane 同时开工，最后按垂直切片合龙到可玩 MVP。读者是项目 lead、工程师和并行 coding agent——你只需要知道**什么能并行、什么顺序、怎么推到能 demo**。合约字段细节一律回查 game-design.md，不在这里复述。

**阅读顺序建议**：§0 TL;DR → §2 一眼看懂图 → §3 已定架构 → §5 lane 总表（认领 lane）→ §7 切片（看怎么合龙）。其余按需查。

**六个落地工件（本文之外、但本文强约束——无则 gate 是空壳）**：

| # | 工件路径 | 内容 | 谁建/何时 |
|---|---|---|---|
| 1 | `/contracts/src/interfaces/` + `/contracts/src/libraries/HexGrid.sol` + `Mock*` | 6 个 MVP `I*.sol`（QuestionRegistry 内嵌、不单列）+ `HexGrid` library + 3 个确定性 Mock（§4 清单） | lead，冻结后 3 天内 |
| 2 | `/contracts/test/WorldInvariants.t.sol` | 6 项 property test 骨架（§8 不变量 #1–#6 映射）；CI `forge test --match-contract WorldInvariants` | L-T owner，冻结日 +1d |
| 3 | `/lane-PLAN.md`（或 CONTRIBUTING.md） | worktree 命名 regex、文件归属矩阵、合并次序、接口冻结/只读协议、Mock↔real 同步规约、feature-flag SOP、Router 维护 SOP（§9） | lead，冻结前 |
| 4 | `/docs/gates.md` | P1/P2/P3 DoD 可执行清单（§7） + M4.5 审计 gate；挂 GitHub milestones | lead，M1 前 |
| 5 | `/docs/§12-values.md` | OPEN 数值：列 `参数 / 影响 / 决定期限 / 占位(local-only) / owner / 日期`（§12）；CI linter 检测硬编码非默认值 | lead，M1 前 |
| 6 | `Router.sol` V3→V4 扩展 | 5 个 net-new address 槽（V4=14）+ 公共 getter + `getAddressesV4()` + setter（§3.4 / §4 Router 段） | lead，随接口冻结 |

**CI gate 总览（必须机械化，非「文档纪律」）**：
- (a) 改动 §3 已定架构（冻结的 interface/struct、Router 槽、财库权限模型 `creditG`/`reservedBackingG`、RNG 选型、World=B 边界）但无对应 ADR（§9）→ block + 评论；
- (b) `forge test --match-contract WorldInvariants` 红 → block；
- (c) L-B STATE 代码引用 `IWorldCheckpoint` 而 C1 未打 `frozen` tag → reject；
- (d) **v1 旧 scope 越界 grep**（ore/build/arsenal/happiness/raid，限 v2 新合约/服务目录、diff 新增行、`// V1-REF:` 标注豁免）命中 → block + 评论；
- (e) Mock 与 real 跑同一测试套件验行为一致，返回类型不一致 → fail；
- (f) `feat/lane-F-*`/`feat/lane-O-*` 在 M5 集成 tag 前 push → auto-reject；
- (g) §12 硬编码非默认值 → warn。

---

## 2. 一眼看懂：怎么并行

核心解法一句话：**采纳 §3 已定架构 → 冻结 struct/event/interface → N 条 lane 各自对着 ABI + mock 并行 → 垂直切片合龙跑通闭环。**

接口一旦冻结，每条 lane 都对着稳定的 ABI 和 mock/stub 编码，互不踩；这才是「真并行 + 合并安全」的前提，而不是嘴上并行、合并时炸。

**★ 解锁链（一行看懂关键路径，注意 STATE 是顺序非并行）**：
`§3 已定架构 →[MUST FREEZE,1w]→ 接口冻结 → (🔴L-A 财库 ⇒ 🔴L-B MATH) ∥ (🔴L-C V2World ⇒ C1冻结 ⇒ 🔴L-B STATE 顺序1w) ∥ (🟡L-D RNG) → 🔴L-E 行动[⟂AP.spend+Hex+RNG（P1mock/P2real）] → 🔴L-I 集成[⟂真实切换,带4重门]`
🔴 = MVP 关键路径（卡它就卡 demo） · 🟡 = 支撑/旁挂（不卡关键路径）

```
                         ┌─────────────────────────────┐
                         │  §3 已定架构 (research 定稿)  │   ← World=B / RNG=commit-reveal
                         │  无 GATE 0、无逐项签字        │   ← 采纳即可，改架构走 ADR(§9)
                         │  仅 §12 数值 / M7 ORACLE 待定 │   ← 二者不阻塞冻接口
                         └──────────────┬──────────────┘
                                  [MUST FREEZE, 1w]
                         ┌──────────────▼──────────────┐
                         │  接口冻结 (contract-first)    │   ← 并行总开关 (owner: lead)
                         │  /contracts/src/interfaces/   │
                         │  I*.sol + HexGrid.sol + Mock* │
                         │  + Router V3→V4 + 7 setter    │
                         └──────────────┬──────────────┘
            ┌──────────────┬────────────┼────────────┬──────────────┐
            ▼              ▼            ▼            ▼              ▼
      ┌──────────┐   ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
      │🔴L-A 财库│   │🔴L-B 市场│  │🟡L-D    │  │🔴L-C 世界│  │🟡L-T 测试│
      │ Treasury │   │ MATH→AP  │  │ RNG     │  │ V2World  │  │ 不变量   │
      │ 安全层   │   │ (经济)   │  │ Provider│  │ +Hex     │  │ (常驻)   │
      │ ~2w      │   │ MATH~1.5w│  │mock@M2末│  │ ~2.5w    │  │ Day1起   │
      └────┬─────┘   └────┬─────┘  │real@M4  │  └────┬─────┘  └────┬─────┘
           │ L-A完成才接  │        └────┬────┘       │             │
           └─────────────▶│             │     ①C1[IWorldCheckpoint]│
              MATH 可先跑  │             │      冻结(M2中旬)→        │ 门禁贯穿所有 lane
                          │             │      ┌──────▼──────┐      │
        ①STATE 非并行!    │             │      │🔴L-B STATE  │◀─────┘
        L-B STATE 顺序等  └────────────┐│      │ 顺序 ~1w    │
        C1 冻结后才 1w 起   ┌──────────▼▼──────▼──────────────┐
                          │ 🔴L-E AP-gated 行动              │
                          │  attack/reinforce/respawn        │
                          │  ②⟂ AP.spend+Hex邻接+RNG         │
                          │   (STATE 读 L-E 写的 ckpt=下游)   │
                          └────────────┬─────────────────────┘
                                       ▼
                          ┌──────────────────────────────────┐
                          │ 🔴L-I 集成 (MCP+runner+FE)         │
                          │ ③feature-flag 软切到新栈           │
                          │  翻 flag 须: L-T 6/6 ∧ P2 gate ∧   │
                          │  M4.5 审计 ∧ 迁移快照校验 全绿     │
                          └────────────┬─────────────────────┘
                                       ▼
              ┌──────────── Post-MVP (M5 集成 tag 后才解锁) ─────────┐
              │  🟡L-F 卡牌(M6)            🟡L-O ORACLE(M7)          │
              │  CI: feat/lane-F|O-* 在 M5 tag 前 push → auto-reject │
              └──────────────────────────────────────────────────────┘
```

**§2 自含速查表（4 行看清真并行/碰撞，全表见 §5）**：

| Lane | Deps（谁卡它） | Unblocks（它放开谁） | Est. |
|---|---|---|---|
| 🔴L-A 财库 | 仅 §3.2 财库（已定） | L-B payout backing | ~2w |
| 🔴L-C V2World | 仅 §3.1 World/Hex/RNG（已定） | C1→L-B STATE、L-E hex | ~2.5w |
| 🔴L-B MATH/STATE | L-A（payout）；**STATE 硬等 L-C C1** | AP credit → L-E 有 AP 花（STATE 市场则消费 L-E 的 checkpoint） | 1.5w+1w |
| 🔴L-E 行动 | L-C hex/邻接 + APLedger.spend + L-D RNG（P1mock/P2real）**三齐** | L-I 真实切换；写 checkpoint 喂 STATE 市场 | ~2w |

**图例（合并为一处）**：`⟂` = 硬汇流/同步点（上游不齐则等）；🔴 关键路径；🟡 旁挂并行。三个 `⟂`：
- **① STATE ⟂ V2World.ckpt（M2→M3）**：L-C 先冻 `IWorldCheckpoint.sol`（C1）→ L-B STATE 分支才可测/合并。**L-B STATE 不与 L-A/L-C 并行，是 C1 之后顺序 1w。**
- **② L-E ⟂ APLedger.spend + Hex邻接 + RNG（P1 mock / P2 real）（M3→M4）**。**方向勿反：L-E 的 `attackWithAP` 写 battle/capture checkpoint，STATE 市场读它——STATE 是 L-E 的下游消费者，不是 L-E 的前置。**
- **③ L-I ⟂ 真实栈（M4→M5）**：翻 flag 须 4 重门全绿（见 §6 join③）。

> **依赖无环（DAG）已核 —— 两张图分开看**：(1) **运行期合约调用图**单向——`APLedger.creditFromMarket` **只**由 `PredictionMarketEngine` 调、`spendForAction` **只**由 `V2World` 调（方案 B 无 APActionAdapter；Market 永不调 spend、V2World 永不调 credit）。(2) **lane 构建/排期图**无环的关键 = **L-B STATE 对着 `MockV2World` 的确定性 checkpoint 开发**（不依赖 L-E 的实时产出），故 L-E↔STATE 的运行期数据依赖不构成构建回边；按 §9 合并次序（C1 封板 → L-B STATE → L-E）做一次拓扑序即无环。

---

## 3. 已定架构（取代旧「M0 决策门」）

> **旧稿这里是一张 13 行「逐项签字才能开工」的 M0 决策表——已删除。** 那些项**不是**真正悬而未决的业务抉择，全部能靠读真实合约 + game-design 直接定稿（已 research，依据见下）。**核心原则 = 架构干净**：单一新世界 `V2World` 自持状态、不碰旧 `GameEngine` 内部、单一发奖入口、桶隔离财库、最小合约面。**没有 GATE 0、没有逐项签字——架构既定，接口（§4）即刻可冻、lane 即刻可并行。** 仅剩 §12 数值与 M7 ORACLE 信任模型待 owner，二者都**不阻塞**结构/冻接口（§3.5）。要改下面任一架构决策，走一次 ADR（§9），不走签字门。

### 3.1 世界 / Hex / RNG

- **World = 方案 B（`V2World` 自持状态）——被逼出来的、不是偏好。** 旧 `GameEngine` 的 `hexes/agentHexKeys/hexCount` 是 `public` mapping（**只有 getter、无外部 setter**，`GameEngine.sol:76-78`），所有写入都 internal 且锁在 `canControlAgent` 后（capture `:429-437`）。所以方案 A（外部 adapter 改 GameEngine 内部状态）**根本无法实现**，除非往 GameEngine 里加特权 hook、把 v2 AP/defense 与 v1 ore/arsenal/happiness 挤进同一 UUPS proxy（存储/权限耦合）。**故 B**：`V2World` 自持 hex owner/defense/capture/checkpoint/score；旧 `GameEngine` 只作参考；唯一抽出的是无状态几何 `HexGrid` 库。**无 `APActionAdapter`**（动作直接在 `V2World` 内）。
- **`V2World` schema（定稿）**：`hexOwner`=`agentId`(uint256，`0`=neutral，无碰撞——agentId 从 1 起 `AgentRegistry.sol:61/:81`)；`hexDefense`（上限/衰减/**capture 清零**，`game-design.md:424/486`）；spawn/respawn allocator（复用 `_findEmptyCluster` 螺旋 `GameEngine.sol:1089`，但**必须保证 0-hex agent 永能再落脚**——保留 neutral/respawn 池或 capped 回场赛）；`checkpoints` mapping 按 `bytes32 eventId`；`v2Score(agentId)`（`game-design.md:531-537`，**花掉的 AP 不计分**）。数值（`D_max/halflife/p_floor/SCORE_PER_*`）→ §12。
- **`HexGrid` = public library**（`areAdjacent/toKey/fromKey/inBounds/hexDist/neighbor`）。⚠️ **关键改造**：旧 `toKey` 是单向 keccak（`GameEngine.sol:207`，无 `fromKey`），而 `attackWithAP(fromHexKey,targetHexKey)` 传的是 key——无法从 key 反推 `(q,r)` 做邻接校验。**故改用可逆打包键**（如 `bytes32(uint256(uint32(q))<<32 | uint32(r))`），支持 `fromKey` + 按 key 邻接。半径：代码实为 `MAP_RADIUS=100`（`GameEngine.sol:37`，**非 CLAUDE.md 旧说的 4**）；半径**值**→ §12。
- **RNG = commit-reveal（定稿，藏在 `RNGProvider` 接口后）。** 全仓**无任何 VRF/oracle 随机源**（grep 无 chainlink/VRF/entropy/…），现状全是可 grind 的 `block.prevrandao`（`GameEngine.sol:414`、`ArenaEngine.sol:548`，后者 `:545` 自带 TODO「上线前换 VRF/commit-reveal」）。Gravity 是新链、无现成 VRF coordinator，引 Chainlink 会加外部依赖/LINK 资助——违背自包含方向。**故 commit-reveal**：`attackWithAP` 先扣押 AP + 记 `commitBlock` → `k` 块后用 `keccak(blockhash(commitBlock+k), requestId, …)` 作种 → 超时（blockhash 256 块窗）任何人可 `resolveExpired` **退还已扣 AP**。接口不变，将来 Gravity 有 VRF 直接换 adapter。

### 3.2 财库与经济（#4/#5/#5b 是**一坨耦合改造**，一起落 L-A、不可拆）

> 现状 `GTreasury` **没有**任何 backing 机制（grep `reservedBackingG/protocolTreasuryG/netTreasuryTakeG` 全空），且 `spendG` 会 `totalOutstandingG -= amount`（`GTreasury.sol:120`）——下注一进 escrow 就从「欠款」变成可提 surplus。故下面三项必须一起改、否则 (a) 的简单 surplus 公式是错的。

- **#5b `reservedBackingG` = 方案 (a)（定稿）**：`GTreasury` 加 `reservedBackingG`（追加在 `_reentrancyStatus` 后保 UUPS 布局），`surplusG = balance − totalOutstandingG − reservedBackingG`（改 `:166-169`/`:158`）。**但必须配新的「市场专用」记账入口**（escrow：`totalOutstandingG-=stake; reservedBackingG+=stake`；payout：反向；burn：`reservedBackingG-=burn` 进不可回流 sink），**不能走现有 `spendG`**。`frozenG[cardId]`（M6）同样并入这套 `owed`。
- **#5 `creditG` 单一入口（定稿）**：现状 `creditG` 是泛 `onlyOperator`（`GTreasury.sol:126`→`AgentRegistry.sol:36-38`，任何 operator/owner 都能 mint G）。改为：正式发奖只认单一不可变 `marketEngine` 地址（`onlyMarket`）；二级卖方收款走独立 `SECONDARY_CARD_TRANSFER` 白名单（守恒 `buyerSpendG==sellerCreditG+secondaryTaxG+secondaryBurnG`）。**连带迁移**：`CardLedger.buyListed`(`:132`) 与 `ArenaEngine.bootstrapMarket`(`:766`) 现走的就是那扇泛门、锁紧后会 revert，须改走二级入口或 faucet-only。
- **#4 backing 来源/顺序（定稿）**：losing stakes → 预存补贴池 → 已拨入 surplus；creditG 前必有等额具名 backing（顺序逻辑在 `PredictionMarketEngine` 结算里、不在 GTreasury）。比例/补贴释放条件 → §12/owner。
- **净抽水 cap（定稿）**：`netTreasuryTakeG(epoch)` 累加器 + `checkNetTakeCapAndEnforce()`（超 `treasuryTakeCapBps` 拒绝/source-neutral 回流，burn 永不回流）。**连带**：现状 `withdrawSurplus` 是 `onlyOwner` 后门（`:151`，无 epoch 记账无 cap）——必须换成多签/timelock + `TreasuryUse` 枚举的受限支出（**这是当前代码与定稿架构最大的一处分歧**）。`ProtocolTreasuryAccounting` 并入 `GTreasury`（不另起合约/槽）。

### 3.3 市场 / 结算 / AP（#3/#7/#8/#11）

- **#3 STATE checkpoint = 采纳 game-design §4 原文**（`exists==false` 创建、`finalized` 结算、时间序、超时 void+refund、只 `V2World` 写、键 `bytes32 eventId`=`Question.snapshotEventId`）。`eventId` 派生定为 `keccak256(abi.encode(kind, hexKey|battleId|windowId, seq))`（创建者与 `V2World` 可独立算出同一未来键）。无悬念。
- **#7 eligibility / #8 anti-snipe = 结构采纳 §4/§5 原文**（≥2 独立 owner、真实 `losingBurnG`、单边/自对冲只退款、AP throttle 锚 `realBurnedGInMarket`；TWAP `[openAt+warmup, closeAt−antiSnipeWindow]`、close 瞬时 odds 不进公式）。只有常数 → §12。
- **#11 QuestionRegistry = 内嵌（定稿）**：模板白名单 + `trivial/difficulty` 派生**内嵌进 `PredictionMarketEngine`**（MVP 只 3 个 MATH 模板、全强制 trivial；派生本就必须在 create 路径里跑）。**不建独立合约、不占 Router 槽**。抽出缝：内部 `_templateConfig/_deriveTrivialAndDifficulty` 边界 + `Question` 已存裸 `templateId/params`（registry-agnostic），M7/非 trivial 治理上线时可无痛抽成独立 `QuestionRegistry`。

### 3.4 合约面与 Router（定稿）

- **MVP 净新增合约 = 5 个，全进 Router V4**：`PredictionMarketEngine`、`MarketSettlementResolver`、`APLedger`、`V2World`、`RNGProvider`。`HexGrid`=**库**（不占槽）；`QuestionRegistry`=内嵌（不存在）；`ProtocolTreasuryAccounting`=并入 `GTreasury`（#5b=(a)，不占新槽）；**无 `APActionAdapter`**（方案 B）。
- **Router V3→V4**：现有 9 槽（`getAddressesV3()`，`Router.sol:10-21`）+ 5 net-new = **14 槽**，加 `getAddressesV4()`；dual-read（flag=off 读 V3、on 读 V4）。可选预留 M6 卡牌 3 槽避免日后 V5 churn。

### 3.5 仅剩的真·待定（**不阻塞**冻接口/结构）

- **§12 数值**（`fixedTrivialAP`/各 cap/`taxBps·burnBps·treasuryTakeCapBps`/`D_max·p_floor`/`minAttackAP`/半径值/`warmup·antiSnipeWindow`/`SCORE_PER_*`）——经 setter 治理注入；约束式已锁、只缺常数。
- **M7 ORACLE 信任模型**（单签/多签/optimistic/attestation + 挑战窗 + 失败恢复）——deferred-not-cut，独立评审通过后才上线，**只 gate M7、不 gate MVP**。
- **M6 卡牌**：`cardTaxShareBps` 是否计入 `netTreasuryTakeG`（或视作已返还 NFT backing）——M6 细节，不阻塞 M1。

---

## 4. 并行的总开关：接口冻结（contract-first）

采纳 §3 已定架构后，第一件并行工作不是写实现，而是**冻结接口**。

**冻结 owner 与流程（不可省，否则「冻结」名存实亡）**：
- **接口冻结 owner = lead（唯一定稿人）**。`interface I*.sol`、`HexGrid.sol` 与 `Router` 只此一人可提交；这些路径写入 `CODEOWNERS`，PR 须 lead review。
- **流程**：采纳 §3 已定架构后，lead 在 **3 天内**于 `/contracts/src/interfaces/` 起草全部接口 + mock → 各 lane 48h 内 review → lead 批准/驳回改动 → **封板日（freeze-board date）= 冻结启动 +1w，写进 PR/tag**。
- **封板后规则**：接口文件**只读**，任何 struct/签名改动须 lead + PM 双签经 review/approval；lane 开发期间不得擅改。

**冻结工件清单（freeze 后第一周内交付，不等 M1 实现）**——目录与文件须真实落地：

`/contracts/src/interfaces/`（6 个 net-new MVP I*.sol；QuestionRegistry 内嵌 PME、不单列；财库扩展在 GTreasury、非新合约）：
- `IPredictionMarketEngine.sol`（内嵌模板白名单 + `_deriveTrivialAndDifficulty`，§3.3）
- `IMarketSettlementResolver.sol`
- `IAPLedger.sol`
- `IV2World.sol` + **`IWorldCheckpoint.sol`（checkpoint 读接口须最先冻结 = C1，见 §6 join①；进 CODEOWNERS，L-C/L-T 双 review）**
- `IRNGProvider.sol`（commit-reveal，§3.1）
- 财库扩展（**并入 `GTreasury` 接口、非新合约**）：`onlyMarket creditG` / `reservedBackingG` / `surplusG` 改写 / `netTreasuryTakeG` cap / `SECONDARY_CARD_TRANSFER`（§3.2）
- （Post-MVP 预留）`ICardMintEngine.sol` / `ISecondaryCardMarket.sol` / `IActionCardBonusAdapter.sol`

`/contracts/src/libraries/`：
- `HexGrid.sol`（library，非 interface：`areAdjacent(q1,r1,q2,r2)`/`toKey`/`fromKey`/边界）

`Mock*`（确定性、可被 L-I/L-E 直接调；**返回类型须与 real bit-identical**，CI 强制同套测试，见下）：
- `MockV2World`：固定 10 hex / 5 owner，邻接判定真实，`attackWithAP` 恒成功，吐确定性 checkpoint。
- `MockAPLedger`：账户恒有 100 AP 可花，`creditFromMarket/spendForAction` 记账但不校验。
- `MockRNG`：给定 seed 返回确定 bool，带完整 request/reveal/timeout/refund 签名。

**`IWorldCheckpoint` 字段须封板锁死（L-C 不可 add-only，L-E 据此读）**——形如：
```solidity
interface IWorldCheckpoint {
    struct CheckpointData {
        bytes32 eventId;       // = Question.snapshotEventId（game-design §4 为 bytes32，键类型必须一致）
        uint8   kind;          // battle / capture / respawn / window
        bytes32 hexKey;
        uint256 battleId;
        uint256 windowId;
        uint256 beforeOwner;   // agentId（v2 hex 按 agentId 归属，0 = neutral；见 #2 / §6 v2Score）
        uint256 afterOwner;    // agentId（STATE 盘「hex 归 agent A?」直接读此字段）
        uint256 actorAgentId;  // 动作 agent 的 agentId
        uint256 blockNumber;
        uint256 timestamp;
        bool    finalized;
    }
    function getCheckpoint(bytes32 eventId) external view returns (CheckpointData memory);
}
```
字段权威对齐 game-design §4/§8；**类型约定：`eventId` 是 `bytes32`（= `Question.snapshotEventId`，STATE 盘绑定键）；hex 归属/动作者字段（`beforeOwner/afterOwner/actorAgentId`）都是 `uint256` agentId（v2 hex 按 agentId 归属、`0`=neutral，故 STATE 盘「hex 归 agent A?」直接读 `afterOwner`；钱包 `address` 只在经济层 §3 出现、世界层不用）**；**`beforeOwner/afterOwner/finalized` 为必含项**。L-C 若漏 `actorAgentId/battleId/windowId` 或类型写错 → L-E 读不到/读错 → 静默失败，故清单+类型一次锁定、不得后补。本接口须同时落 `/contracts/test/interfaces/` 与 `MockV2World`。

**其余冻结对象字段口径**（字段权威在 game-design.md，这里只列冻结清单）：

- **Question / Market / Position**（§4）：`QuestionKind/Status`、`Question` struct（含 `templateId/params/snapshot*/settleDeadline/trivial/resolver`）、`Market`/`Position`、`outcomeStakeG`/`positions` mapping。**字段须标 `[MATH+STATE]` vs `[STATE-only]`**（用 game-design §4 的真实字段名，如 `Question.kind:[MATH+STATE]`、`Question.snapshotEventId:[STATE-only]`，勿造 spec 不存在的字段），让 L-B 的 MATH stub 可省略 STATE 字段、后续合并不撞。**trivial 路径须含 `trivial:bool` 字段并强制「`trivial=true` ⇒ winAP=`fixedTrivialAP`（§12 全局参数，非 per-question 字段）∧ 无 G payout」（不留 OPEN）。**
- **APLedger**（§5）：`apBalance`、`earnedInEpoch`、`ownerTrivialEarnedInEpoch`、`globalTrivialEarnedInEpoch`、`creditFromMarket(onlyMarket)`、`spendForAction(onlyAction)`。
- **V2World 动作 + checkpoint**（§6/§8）：`attackWithAP/reinforceHex/returnFromElimination` 签名、`hexDefense`、`checkpoints(eventId)`（schema 见上 `IWorldCheckpoint`）、`getScore/ScoreView`、battle/capture/respawn/window 事件。
- **HexGrid library**：`areAdjacent(q1,r1,q2,r2)`、`toKey/fromKey`、边界检查。
- **RNGProvider**：request/reveal/timeout 接口 + 退款语义。
- **Treasury 记账口径**：`reservedBackingG`/wrapper 二选一落地（§3#5b）、`TreasuryUse` 枚举、`netTreasuryTakeG(epoch)` 累加器签名、`creditG` 权限边界。**`netTreasuryTakeG` cap 强制为 L-A 必交项（非可选）**：累加器 + `checkNetTakeCapAndEnforce()`（cap 比较 + 超 cap 拒绝/强制 source-neutral 回流）+ 由 L-T property #5 测试。
- **Router 扩展（V3→V4，随冻结一并完成，不等 M4，仅加地址槽+setter，无需实现）**：
  - 基线：`Router.sol`（V3，`getAddressesV3()`）**已含** 9 槽（`registry/agentLedger/locationLedger/inboxLedger/gameEngine/evaluationLedger/arenaEngine/gTreasury/cardLedger`），**缺下列全部 net-new**。
  - 新增 **5 个 net-new 槽**：`PredictionMarketEngine/APLedger/V2World/MarketSettlementResolver/RNGProvider`（`HexGrid`=库不占槽；`QuestionRegistry`=内嵌不存在；`ProtocolTreasuryAccounting`=并入 GTreasury 不占新槽；Post-MVP 可预留 `CardMintEngine/SecondaryCardMarket/ActionCardBonusAdapter`）补 address 槽 + getter + setter + `getAddressesV4()`（V4=14 槽）。
  - 向后兼容 = **dual-read（已定，见 §6/§9）**：flag=off 读 V3 getter、flag=on 读 `getAddressesV4()`；SOP 入 `/lane-PLAN.md`。
  - **漏了 = M5 翻 flag 读到 V3 旧址 → MCP 调错 APLedger/V2World/RNG → 生产静默 0-day。**

**Mock 与真实接口同套测试（防漂移，CI 强制）**：Mock 测试文件须**import 并跑与 real 合约同一测试套件**（非另写一套），用 `forge test --match-contract` 强制返回类型一致（mock 返 struct、real 返 tuple 这类漂移直接 fail）。`/lane-PLAN.md` 写明：「Mock ABI 须与 real bit-identical，不同步则 CI 失败」。L-C 改 World 接口时 lead 同步更新 mock。**每条 lane 对着 interface + mock 编码**，真实实现到位时无缝替换——这就是并行真正成立、合并不打架的机制。

**Mock→real 测试 harness 模式（M1 start 前定，写进 CONTRIBUTING.md）**：Foundry 无 JUnit 的 `@ParameterizedTest`——改用**抽象基测试合约**（abstract `*BaseTest` 写断言、`MockXxxTest`/`RealXxxTest` 各自 `setUp()` 注入 mock 与 real 实现，跑同一批 test 函数体），验证两套实现的**行为一致**（不止返回类型）；状态初始化差异显式处理（mock 给固定 10 hex；real 走 spawn allocator 初始化等量 hex）；标注哪些测试 both-run、哪些 real-only（如真实 RNG VRF 回调）。

---

## 5. 并行工作流 · Lanes

每条 lane = 一个人 / 一个 coding agent 能独占的 workstream。**每条 lane 一个 git worktree**，分支命名 `feat/lane-<X>-<name>`（如 `feat/lane-A-treasury`），对着只读的 `interface I*.sol` + mock 编码。Owner（主/备）须在 `/lane-PLAN.md` 填**真实人/agent 名**，非占位。MVP = M0–M5；Post-MVP = M6/M7。worktree/合并 SOP 见 §9。

🔴 = MVP 关键路径 · 🟡 = 旁挂/Post-MVP。

**(a) 快速扫描表（Lane | Owner | Est. | Deps）**：

| Lane | Owner（主/备） | Est. | Deps（谁卡它） |
|---|---|---|---|
| 🔴 L-A 财库安全层 | ☐ 主 / ☐ 备 | ~2w | §3.2 财库已定（无合约依赖，可最先动） |
| 🔴 L-B 市场+结算+AP | ☐ 主 / ☐ 备 | MATH ~1.5w + STATE ~1w | §3.3 市场已定；L-A（escrow/payout）；**STATE 硬等 L-C C1（join①）** |
| 🔴 L-C 世界+Hex | ☐ 主 / ☐ 备 | ~2.5w | §3.1 已定（World=B；可选旧快照导入） |
| 🟡 L-D RNG Provider | ☐ 主 / ☐ 备 | mock ~1w + real ~1.5w | §3.1 RNG=commit-reveal（独立；M4 才被 L-E 接入） |
| 🔴 L-E AP-gated 行动层 | ☐ 主 / ☐ 备 | ~2w（P1 薄片可早起，full 卡 real RNG） | **L-C hex/邻接 + APLedger.spend + L-D RNG（P1mock/P2real）三齐（join②）；STATE 市场是 L-E 下游、非前置** |
| 🔴 L-I 集成面 | ☐ 主 / ☐ 备（stub→real，1–2 人） | stub 持续 + 切换 ~2w | Market/AP/V2World 部署可调用；翻 flag 须 4 重门（join③） |
| 🟡 L-T 测试/不变量护栏 | ☐ **专属 QA/security**（须填真实名，不借 dev lane） | 常驻 | Day 1（接口冻结即起） |
| 🟡 L-F 卡牌 [M6] | ☐ 主 / ☐ 备 | ~2–3w | **M5 集成 tag 后**；L-A `netTreasuryTakeG`/`cardTaxShareBps`；成就白名单（§12 OPEN） |
| 🟡 L-O ORACLE [M7] | ☐ 主 / ☐ 备 + ☐ security | ~2–3w | **M4.5 信任模型签字 + 独立评审后**；M6 之后 |

**(b) 交付物与说明（按 lane）**：

- **🔴 L-A 财库安全层** — 模块：`GTreasury` 权限收紧 + `ProtocolTreasuryAccounting`（`reservedBackingG`/wrapper、`TreasuryUse`、`netTreasuryTakeG` cap、burn/sink 口径）。交付：收紧的 `creditG`/`surplusG`、**`netTreasuryTakeG` 累加器 + `checkNetTakeCapAndEnforce()` 超 cap 拒绝/回流（必交，非可选，L-T #5 测）**、可查询 backing 边界 + 自带 escrow 不变量测试。并行安全：✅ 独立，可最先动。
- **🔴 L-B 市场+结算+AP经济** — 模块：`PredictionMarketEngine`（内嵌模板白名单）、`MarketSettlementResolver`、`APLedger`、odds TWAP 快照。交付：**M1 = MATH 盘开/押/关/结算 + binary settlement + `trivial=true` 强制 + `fixedAP=fixedTrivialAP` + AP `creditFromMarket` + throttle 测试**；**STATE 分支 M3 交付**（M1 可先码 STATE 骨架但**不测不 merge**，gate 在 C1 封板 + M3）。**结算触发（owner=L-B）：MVP `settle()` 设为 permissionless——题到期 / `settleDeadline` 后任何人或 agent-runner 可触发结算并发奖；keeper（M5.5）只做存活监控 + 超时 void+refund 兜底，不是唯一结算者（见 §10/§11）。** 并行安全：⚠️ MATH 段独立先跑；**STATE 段顺序等 L-C C1，非并行**。
- **🔴 L-C 世界+Hex** — 模块：`V2World`、`HexGrid` lib、spawn/respawn allocator、`hexDefense`、checkpoint 写入 + finalized gate、`v2Score`、（若继承旧世界）一次性快照导入 + 校验。交付：v2 hex 存储 + 邻接库 + 防御 + **checkpoint mapping（含 `IWorldCheckpoint` 全字段）** + score；**C1 = checkpoint event/mapping schema + `IWorldCheckpoint` 须最先交付并 M2 中旬冻结（见 §10 子里程碑 M2.a）**。并行安全：✅ 与 L-A/L-B 完全并行。
- **🟡 L-D RNG Provider** — 模块：`RNGProvider`（VRF 或 commit-reveal）+ timeout/退款。交付：**M2 末交可用 mock RNG**（给 seed 返确定 bool，部署 testnet，带完整 request/reveal/timeout/refund 签名）供 L-E/P1；**M4 起前交真实实现**。**criticality 澄清：mock 晚交 → 卡 P1（硬 deadline）；real 晚交 → 卡 P2/L-E（非 MVP-P1 关键路径）。** 并行安全：✅ 独立。
- **🔴 L-E AP-gated 行动层** — 模块：`V2World` 内部 hooks（方案 B，§3.1）：`attackWithAP/reinforceHex/returnFromElimination`、Tullock 结算、capture+checkpoint 写入。交付：三动作可调用 + 防御清零 + battle/capture/respawn checkpoint。并行安全：⚠️ 汇流点，**三上游（L-C hex/邻接 + APLedger.spend + L-D RNG）就绪即可整合**；P1 薄片用 mock RNG 即可跑通 attack/capture（不等 real RNG、更不等 L-B STATE——STATE 市场读 L-E 写的 checkpoint、是 L-E 的下游）；full 版本卡 real RNG（P2）。
- **🔴 L-I 集成面** — 模块：`mcp-server/chain.ts`+`tools.ts`（换 ABI、退役 ore/build、加 market/AP/hex 工具）、`agent-runner/llm.ts`（prompt 重写：邻接攻击/AP-only/删 ore-arsenal-happiness）、`frontend/useGameEngine.ts`（读 V2World.getScore/Market/APLedger）。**L-I 还须在 M0+1w 起搭 stub 实现**（Market/AP/V2World 工具硬编码返回 + `useGameEngine` hook，带 `TODO §M5 real impl` 注释），让前端 M1–M4 对着 stub 并行迭代 UI。交付：三处经统一 feature-flag 翻到新闭环，无旧 ore/score 残留。并行安全：⚠️ stub 阶段并行；**真实切换 = 翻 flag，须 L-T 6/6 ∧ P2 gate ∧ M4.5 审计 ∧ 迁移快照校验全绿（join③）**。
- **🟡 L-T 测试/不变量护栏** — 模块：`contracts/test/WorldInvariants.t.sol`（6 项 property test）+ **MATH/STATE 闭环集成/e2e 测试**（attack 转移所有权+清零防御、void/refund 真退、AP 只发赢家、TWAP 正确）+ CI 门禁 + v1 旧 scope 越界扫描。交付：6 项 property test（接口冻结 day1 起 stub）+ 闭环 e2e 套件 + merge gate + v1 scope grep + §12 linter；见 §8。并行安全：✅ 常驻贯穿全程。
- **🟡 L-F 卡牌 [M6]** — 模块：`CardMintEngine`（公库出资/白板自冻、`frozenG[cardId]`）、`SecondaryCardMarket`（tax/burn 分流）、`ActionCardBonusAdapter`。交付：两条铸造路径 + 二级守恒（`sellerCreditG+secondaryTaxG+secondaryBurnG==buyerSpendG`）+ 攻防 bonus hook（不消耗卡）。并行安全：✅ 独立但晚启；**CI: `feat/lane-F-*` 在 M5 集成 tag 前 push → auto-reject**。
- **🟡 L-O ORACLE [M7]** — 模块：ORACLE 信任模型文档 + resolver 接口 + challenge/attestation + 失败恢复。交付：`IMarketOracle` 实现 + 挑战流程。并行安全：✅ 最后；**待 M4.5 信任模型签字 + 独立安全评审；CI: `feat/lane-O-*` 在 M5 tag 前 push → auto-reject**。

---

## 6. 依赖图与关键路径

**关键路径（决定 MVP 何时能玩）**：
`接口冻结(1w) → L-A 财库(M1) → L-B MATH(随 L-A) → L-C V2World ⇒ C1冻结 ⇒ L-B STATE(顺序1w) → L-E AP-gated 行动(M4) → L-I 集成(M5)`。**全串行约 13.5 周；并行后净关键路径 ~10–11 周（最好 ~9 周）**——架构已定、省去旧 1.5w 决策门；并行收益主要来自把 L-C(2.5w) 与 L-D 叠到骨干上、**并非砍半**（`L-A→L-B MATH→L-B STATE→L-E→M4.5→L-I` 这条骨干本就串行；逐 lane PERT 见 §10）。

三个硬汇流点（join），其余皆可并行。**每个 join 标注「谁等谁、何时齐」**：

1. **join① STATE 市场 ⟂ V2World checkpoint（M2 → M3 硬阻塞，且 L-B STATE 非并行）**
   STATE 盘结算分支必须读 `V2World.checkpoints(eventId)`。**严格次序**：(1) L-C **先**交付 `C1 = checkpoint event/mapping schema + IWorldCheckpoint 读接口`（**M2 中旬冻结 = 子里程碑 M2.a**）→ (2) lead 封板该接口 → (3) **只有此后** L-B 才能写并测 STATE 分支（顺序 ~1w，**不与 L-A/L-C 并行**）。**CI 门禁**：PR 触碰 STATE resolver 代码且 `IWorldCheckpoint.sol` 未打 `frozen` tag → reject（带提示信息）。**MATH 段不受此限，可先发（M1）。**

   **M1 scope 澄清（消歧）**：M1 **只交付 MATH-only**——L-B 的 STATE 分支允许 M1 内先码骨架但**不测、不 merge**，STATE 的测试与上线 **gate 在 M2.a checkpoint ABI 封板 + M3 完成**。即 game-design §9「V2World checkpoint 未完成则降级 MATH-only」是**默认兜底，非可选**。DoD：`L-B.MATH` 在 M1 完成；`L-B.STATE` 在 M3 完成。

2. **join② AP-gated 行动 ⟂ APLedger.spend + Hex邻接 + RNG（M3 → M4 硬阻塞）**
   `attackWithAP` 必须先 `APLedger.spendForAction` 再走 `RNGProvider` 结算。**L-E 真正起跑线 = APLedger.spend ✓ + Hex邻接（HexGrid + L-C hex）✓ + RNG ✓ 三齐**；RNG 在 P1 用 mock 即可起跑 attack/capture 薄片，full L-E 卡 **real RNG（P2/M4）**。**方向澄清（勿反）**：L-E 的 `attackWithAP` **写** battle/capture checkpoint、STATE 市场**读**它——STATE 是 L-E 的**下游消费者**、**不是** L-E 的前置；故 L-E 不等 L-B STATE 结算逻辑（P1 已证：STATE 关闭、mock RNG 就能跑通 attack→capture）。**硬期限**：L-D **M2 末**交 mock RNG（确定性 seed，L-E 据此搭非 RNG 骨架 + 测试），**M4 起前**交真实 RNG（L-E 据此写 `resolveWithRNG`）。L-D 延期 = L-E 静默滑期，故 L-D 这两个交付期是硬 deadline。

3. **join③ 集成 ⟂ 真实栈（M4 → M5，翻 flag 须 4 重门全绿）**
   L-I 真实切换要 Market/AP/V2World 全部可调用。**软切换机制 = 统一 feature-flag**（见下「feature-flag 定义」）。**硬 gate：feature-flag 只能在 (L-T 6/6 不变量绿) ∧ (P2 gate 过 = STATE + 三动作 live + 真实 RNG 工作) ∧ (M4.5 审计 checkpoint 过) ∧ (数据迁移快照校验通过) 全部满足后翻转。** 否则 MCP 带 stub-era 假设调真实合约 → 生产静默 0-day。**MCP 可对 stub 先调**，让前端在 M1/M2 并行迭代 UI，不必干等。

**feature-flag 定义（L-I 三处同源，消除 stale-state；落 `/lane-PLAN.md`）**：
- **单一源**：一个 flag `GT_V2_ENABLED`，**默认存 `.env.{network}`（推荐，零新增合约成本；owner=lead，随 `/lane-PLAN.md` 定稿）**——若改用链上 SettingsRegistry 需另排一条合约 lane + Router 槽（当前未计入估时，慎选）；`mcp-server` / `agent-runner` / `frontend` **三处启动时读同一源（不轮询）**，各自在用旧/新 ABI 前检查；CI 校验三处读同一 key。
- **Router 配合**：dual-read——flag=off 读 V3 getter，flag=on 读 `getAddressesV4()`（§4 Router 段）。
- **软切换 SOP**：(a) 部署新合约 + 填 Router V4 槽 → (b) 翻 flag → (c) 冒烟校验三服务都已翻 → (d) 1 个 epoch 无回归则下线旧 ABI 路径。
- **回滚**：翻回 flag 即回旧栈，不重部署合约；切后新建的 test market 须手工数据修复。
- **stub→real 数据语义**：question ledger / G 余额 / treasury 池**保留**；test agent / test market 切换时**重置**。
- **「迁移快照校验通过」门的可执行 DoD（join③ 第 4 门，须与其它三门对等，owner=L-I+L-T 双签）**：(1) 切前对**保留集**（question ledger、各 agent G 余额、treasury `surplusG/reservedBackingG/protocolTreasuryG`、未结算市场 outstanding）打链上快照 `S0`；(2) 切后对同一集合打 `S1`；(3) 断言 `S1==S0`（保留集逐项相等）∧ 重置集（test agent/market）已清空 ∧ Router V4 槽全部指向新合约且三服务 `getAddressesV4()` 读到一致；(4) 任一项不等 → 不准翻 flag、回滚。**若 #2「世界继承」=Y，快照集追加 v1→v2 hex 所有权一致性校验。**

**可以 EARLY ship 的薄片**：**MATH-only 切片**——L-A + L-B(MATH 段) + L-C(hex+respawn) + L-D(mock 起) + L-E(attack) 就能跑通「押数学题 → 赢 AP → 攻击邻接 → 夺地」，**不需要 STATE**（§9 工程稿明确 MVP 可降级 MATH-only）。**MATH-only 是 V2World 滑期时的默认兜底路径，不是可选优化。** 这让闭环在 STATE 之前就先转起来、先 demo。

---

## 7. 分阶段推进 · 垂直切片（DoD 落 `/docs/gates.md`，挂 GitHub milestones）

每个阶段以一个**可 demo 的薄片**收尾（不是「某合约写完」，而是「这条线能点通」）。**每个 gate 给可执行 DoD 清单**：

- **P1 — MATH 闭环薄片**（M0+M1+M2+M4 的 MATH 子集）
  端到端：押 MATH 盘 → 赢 trivial AP → `attackWithAP` 打邻接 hex → 夺地，胜负只看占地。**MATH-only，STATE 关闭。**
  **P1 特性矩阵**：Market（MATH ✓ / STATE ✗ / ORACLE ✗）｜AP（仅 trivial 空投 `fixedAP=fixedTrivialAP`，eligibility 不校验）｜V2World（hex+owner 可读、`attackWithAP` 带 **mock RNG** ✓、capture 结算 trivial AP ✓、**含简化 respawn：0 AP 回中立 hex、无 RNG**，避免「无 respawn 则被淘汰者出不来」的鸡生蛋）｜Defense（dummy、无 upkeep）。
  **P1 的 RNG = mock + 确定性 seed（可重复攻击）**：L-D 须在 **P1 start（M2 末，§6 join②）前交 mock RNG**；**真实 RNG 是 P2/M4 的 blocker，不是 P1 gate**——故关键路径上的「M4 真实 RNG」不被 P1 提前。
  **P1 gate DoD（可勾选）**：(1) 创 10 个 agent；(2) 各能向 MATH 盘押 20G；(3) **`settle()`（permissionless，题到期后任何人 / agent-runner 可触发）结算并发 `fixedTrivialAP`**；(4) agent 能 `attackWithAP`（mock RNG）打邻接 hex；(5) capture 成功；(6) 新 owner 进 checkpoint log；(7) L-T 6 项不变量中 4 项核心绿。
- **P2 — STATE 盘 + 完整三动作**（M2 全量 + M2.a 子里程碑 + M3 + M4 全量）
  V2World checkpoint finalize → 开 STATE 盘（「hex Y 是否归 A」「battle X 谁赢」）；`reinforceHex` 防御 + `returnFromElimination`（完整版，带 AP gate）齐活；非 trivial eligibility/odds 快照生效；**真实 RNG（VRF/commit-reveal）接入**。闭环「地图变化→开成新市场」合龙。
  **P2 gate DoD**：checkpoint 写入并 finalize、STATE 盘正确结算、reinforce/完整 respawn 可用、eligibility/odds 快照生效、真实 RNG 上线、**L-T 6/6 绿**。
- **P3 — 集成打磨**（M5）
  MCP/agent-runner/frontend 经 feature-flag **翻**到 `可下注市场 → 我的 G 仓位 → claim AP → 我的 AP → 可攻击/防御/回场`；删尽 ore/build/raid/happiness/旧 score prompt 与 UI。AI agent 能自主跑闭环。
  **P3 gate DoD**：4 重门（L-T 6/6 ∧ P2 ∧ M4.5 审计 ∧ 迁移快照）已过 → 三处 flag 全翻、UI 无旧 ore/旧 score 残留、AI agent 自主跑通一整圈闭环、可回滚验证过。
- **P4 — Post-MVP**（M6→M7）
  M6 卡牌（公库出资/白板自冻、二级 tax/burn、攻防 bonus）；M7 ORACLE（信任模型评审通过后上线第三类盘）。**两者均待 M5 集成 tag 后启动实现。**

阶段 ↔ 里程碑：P1≈M0–M2+M4(MATH) ｜ P2≈M2–M4(全) ｜ P3≈M5 ｜ P4≈M6–M7。

---

## 8. 测试与不变量护栏（独立 lane，常驻）

L-T 从接口冻结当天起独立运行，由**专属 QA/security owner**（不借 dev lane，须在 `/lane-PLAN.md` 填真实名）负责。若误阻塞合法 PR，escalate 至 lead 24h 内裁决。

**CI 门禁（明确何时跑、什么挡 merge）**：所有 lane 的 PR 必须通过 `forge test --match-contract WorldInvariants` + property test。**红 = 自动 block merge 直到绿**；**每次 push 到 dev 分支即跑**（非 nightly、非手动）。骨架文件 `contracts/test/WorldInvariants.t.sol` 在接口冻结后 **day 1** 建起（6 项 property test 先 stub，每项断言映射到下列不变量），每条 lane 交付须自带本 lane 不变量测试（L-A escrow 不变量、L-B throttle、L-C defense cap……）。

**join① 门禁（机械化）**：CI/git hook 检测「PR 触碰 STATE resolver 文件」且「`/contracts/src/interfaces/IWorldCheckpoint.sol` 未打 `frozen` tag」→ reject 并提示「L-C C1 未封板，L-B STATE 不得合并」。

**Post-MVP lane 抢跑门禁**：`feat/lane-F-*` / `feat/lane-O-*` 在 `M5-integration` tag 合入 main 前 push → auto-reject；解锁通知在 `feat/lane-I-integration` 合入 main 次日发出。

**v1 旧 scope 越界扫描门禁**（防的是**旧 v1 GameEngine 机制**混入 v2 主循环；与已废弃的 PR#76「万物皆答题」是两回事——后者是设计方向、不会泄进代码的分支，**无需也无法**用 CI grep 守，故本门禁不再以「PR#76」命名）：L-T CI 对 **diff 中、且落在 v2 新合约/服务目录（如 `contracts/src/v2/**`、`mcp-server/**`、`frontend/**`）** 的**新增行** grep `ore` / `build` / `arsenal` / `happiness` / `raid`，命中即**自动评论「检测到 v1 旧 scope 混入 v2 实现——只能作 v1 reference，不可作 v2 impl」并 block**。**豁免**：(1) 合法删除/迁移代码（正是 L-I「删 ore/build/raid prompt」要做的）用 `// V1-REF:` 行内标注，linter 跳过；(2) `/reference`、test fixtures、文档目录整体排除；豁免清单写进 `/lane-PLAN.md`。**scope 限 diff 新增行，非全仓扫描。**

**§12 OPEN 数值 linter**：每个 §12 open param 在合约 stub 内须带 `/// TODO §12(x): set via owner governance, not hard-code` 注释；CI linter 对硬编码非默认值告警；`/docs/§12-values.md` 跟踪表挂 owner/期限（见 §12）。

覆盖 §3 承重不变量（每项一组 property test，CI 断言示例）：

1. **赌池排除 surplus**：任一时刻 `协议可提 ≤ native 余额 − 全部未结算市场 G 负债 − reservedBackingG − frozenG`；owner/治理无法把 escrow/补贴当 surplus 提走。`assert(withdrawableSurplus <= balance - totalOutstandingG - reservedBackingG - frozenG)`。
2. **creditG 等额 backing**：每次 `creditG` 前都能指出已扣减/锁定的等额具名来源；无 backing 的 payout 被拒；`creditG` 仅单一 `PredictionMarketEngine`/wrapper 可调（泛 operator 被拒）。
3. **AP 只能赢来**：AP 仅经 `creditFromMarket` 增发；不可买、不可泛 operator mint、不可与 G 自由兑换；`spendForAction` 仅 `V2World` 可调（方案 B）。
4. **防御不变量**：`0 ≤ effectiveDefense ≤ D_max`、半衰期/upkeep、`P(success|maxAttackAP, D_max) ≥ p_floor`、capture 后清零。
5. **净抽水 cap**：`assert(netTreasuryTakeG[epoch] <= treasuryTakeCapBps × grossPlayerPaidG)`，超 cap 拒绝或强制 source-neutral 回流；burn 永不回流。
6. **trivial throttle / 非 trivial eligibility**：单边/自对冲盘只退款不发 AP/G；`trivial=true ⇒ fixedAP=fixedTrivialAP ∧ 无 G payout`；trivial 多维 cap（agent/owner/epoch/global）；AP throttle 锚 `realBurnedGInMarket`（非 tax/refund）。

数值未定（§12）不挡：测试写成参数化断言，对约束式而非具体常数。

---

## 9. 分工 · worktree · 合并（落地为 `/lane-PLAN.md` / CONTRIBUTING.md）

本节内容须落入项目根 **`/lane-PLAN.md`（或 CONTRIBUTING.md）**，作为并行隔离单一事实源（SOP）。内容须含：(1) worktree 命名 regex；(2) 文件归属矩阵；(3) 合并次序；(4) 接口冻结/只读协议；(5) Mock↔real 同步规约；(6) feature-flag SOP；(7) Router V3→V4 维护 SOP。

- **lead（接口 owner）+ ☐ lead-备（deputy，须填真实名）**：采纳架构(§3)、主笔接口冻结、维护 Router setter（V3→V4 dual-read）、守三个 join 点、L-C 改 World 接口时同步 mock。接口冻结**定稿权归 lead 一人**，但 deputy 共担 Router / mock-sync / join 仲裁，避免单点。`/contracts/src/interfaces/`、`HexGrid.sol`、`Router.sol` 写入 `CODEOWNERS`。**⚠️ lead 是关键路径上最集中的单点**（架构采纳、唯一「并行总开关」冻结、Router、三 join 全过 lead）——故 (1) 必须配 deputy；(2) 接口变更周转 SLA ≤ 24h（超时 escalate）；(3) §10 PERT 须把 lead 的冻结/join/mock-sync 当**共享资源**计，不可假设 lead 同时还全职背一条 lane。
- **每条 lane 一主一备，须填真实人/agent 名**（§5 已留签字位，禁占位）：L-A 财库、L-C V2World、L-D RNG 三条**接口冻结后即可同时开工**；L-B MATH 随 L-A，**L-B STATE 顺序等 C1**；L-E 由 L-C 或 L-B 的 owner 在三上游（AP.spend+Hex+RNG）就绪后接手汇流；L-I 由前端/集成同学在 stub 上提前起步；L-T 由一名专属 QA/security 同学常驻。
- **worktree-per-lane 命名规约（regex `feat/lane-[A-Z]-[a-z-]+`）**：`feat/lane-A-treasury`、`feat/lane-B-market`、`feat/lane-C-world`、`feat/lane-D-rng`、`feat/lane-E-action`、`feat/lane-I-integration`、`feat/lane-T-invariants`、`feat/lane-F-cards`、`feat/lane-O-oracle`。对着冻结的 `interface I*.sol` + mock 编码，互不踩文件。
- **文件归属矩阵（哪条 lane 碰哪些路径，详表入 `/lane-PLAN.md`）**：L-A→`GTreasury`（含 `reservedBackingG`/`netTreasuryTakeG` 记账）；L-B→`PredictionMarketEngine`（内嵌模板）/`MarketSettlementResolver`/`APLedger`；L-C→`V2World/HexGrid`；L-D→`RNGProvider`；L-E→`V2World` action hooks（方案 B 无 `APActionAdapter`）；L-I→`mcp-server/agent-runner/frontend`；L-T→`contracts/test/`。`interfaces/`+`Router.sol` 仅 lead。
- **接口只读约束**：`/contracts/src/interfaces/I*.sol`、`/contracts/src/libraries/HexGrid.sol`、`Router.sol` **仅 lead 可改**（封板后经 lead+PM 双签 review）；任何 lane PR 触碰这些文件即被 L-T gate + CODEOWNERS 拦下。
- **合并次序 SOP**：`L-A → L-B(MATH，依赖 A payout) → L-C/L-D(并行) → C1 封板 → L-B(STATE) → L-E(依赖 L-C hex+AP.spend+RNG 三者；STATE 在其下游) → L-I(最后)`；L-T 全程旁挂、门禁每次合并；L-F/L-O 在 M5 tag 后。合并冲突面≈接口文件，故只读约束把冲突压到最小。
- **contract-first 防冲突**：lane 之间只通过 interface 交互，禁止跨 lane 直接引用对方内部状态（尤其禁止外部改 `GameEngine`/`V2World` 内部 mapping，§8 权限边界）。
- **最小并行起步阵型（约 4–5 人 = 3 dev 并行 + 1 专属 QA(L-T) + 1 lead/deputy）**：L-A、L-C、L-D 立即并行 → L-B MATH 接 L-A → C1 后 L-B STATE → L-E 汇流 → L-I 收尾；L-T 全程旁挂。**人手 < 4 则并行退化为串行、净期回到 ~13.5 周（见 §11 风险行）；§10 的 ~10–11 周以此阵型为前提。**

---

## 10. 推进节奏与闸门

PM cadence——**先锁什么、何时开闸**：

1. `采纳 §3 已定架构（research 已定，无签字门）`
2. `接口冻结（开并行总闸，封板 M0+1w）`
3. `lane swarm（L-A/L-C/L-D 同步开工，L-B MATH 随 L-A）`
4. **M2.a 子里程碑：L-C 交付 C1（`IWorldCheckpoint` 封板）→ L-B STATE 解锁**
5. **P1 切片 gate（MATH 闭环 demo，RNG=mock + L-T 4/6 绿，DoD §7）**
6. `join①②：L-B STATE + L-E 汇流 + L-D 真实 RNG`
7. **P2 切片 gate（STATE + 三动作 + 真实 RNG，L-T 6/6）**
8. **M4.5 审计 checkpoint（部署前安全评审，含 ORACLE 信任模型 1 页签字；gate：signoff 后才批 M5 merge）**
9. `M5 集成 checkpoint（feature-flag 4 重门全绿后三处同切，无旧 score 残留）`
10. **P3 demo gate（AI 跑通闭环 + 可回滚）**
11. **M5.5 testnet 部署 + keeper 接入 + 性能调优（~2w）→ M5.7 mainnet 部署**
12. `Post-MVP：L-F → L-O`

每个 gate 必过 L-T 不变量；每次 join 前做一次集成冒烟。

**逐 lane 估时与关键路径（PERT 粗算）**：

| Lane | 估时 | 窗口 | 备注 |
|---|---|---|---|
| 采纳已定架构 | 0（已 research，§3） | M0 | 无 GATE 0；直接进接口冻结 |
| 接口冻结 | 1w | M0 | lead 3 天内交 I*.sol + mock + Router V4 |
| L-A 财库 | ~2w | M1 | 最先动，关键路径头节点 |
| L-C V2World | ~2.5w | M2 | **STATE 的硬 blocker**，C1=M2.a 中旬冻 |
| L-B MATH | ~1.5w | M1 | 随 L-A（与 L-C 并行） |
| L-B STATE | ~1w | M3 | **顺序：C1 封板后才起，非并行** |
| L-D mock RNG | ~1w | M2 末 | 硬 deadline（供 P1） |
| L-D real RNG | ~1.5w | M3–M4 | 硬 deadline（供 P2/L-E，非 P1 关键路径） |
| L-E 行动 | ~2w | M4 | 三上游齐才整合（real RNG 在 P2 路径上） |
| L-I 集成 | ~2w | M5 | feature-flag 软切（4 重门） |
| M4.5 审计 | ~1w lead-time（**内审**；价值合约多模块建议追加**外审**，时长/预算另议，勿假设 1w 内审即足） | M4→M5 间 | gate：signoff 后才批 M5 merge；executor=[内审 owner + 可选外审]、scope=全部 value-bearing 合约 + 1 页 ORACLE 信任模型 |
| M5.5 部署/调优 | ~2w | P3 后 | testnet→mainnet，非 lane 并行但卡发布 |

- **全串行关键路径**（无任何并行，逐段相加；架构已定、无 M0 决策段）= 冻结 1 + L-A 2 + L-C 2.5 + L-B MATH 1.5 + L-B STATE 1 + L-D real 1.5 + L-E 2 + L-I 2 = **13.5 周**（含 M4.5 审计 1w 则全程 **14.5 周**，与下方并行数同口径比较）。
- **并行后净关键路径**（forward pass，每段只计一次，含 M4.5 审计门）：架构已定、**无 M0 决策段**——前段只剩 冻结 1 → 此后 L-A/L-C/L-D 并行起跑；**串行骨干** = L-A 2 → L-B MATH 1.5 → L-B STATE 1（C1 后；C1 在 L-C 中旬即出、不卡 STATE 起步）→ L-E 2 → M4.5 审计 1 → L-I 2 = 9.5，叠加前段 1 ≈ **10.5 周**；**最好 ~9 周**（L-B MATH 对着 `MockTreasury` 与 L-A 并行开发、省下串行的 1.5w）。L-C(2.5w) 与骨干前段并行、L-D real(1.5w) 在 M4 前就绪，二者均不另加净路径——**并行省的是 L-C/L-D 的串行段，不是把总长砍半**（同口径：全程串行 14.5 周 → 并行 10.5 周）。（注：骨干里 `L-B STATE → L-E` 是同一 owner 接手的**资源序、非数据依赖**——L-E 不读 STATE，见 §6 join②；若配专属 L-E owner，净路径可压到 ~9w。）部署期（M5.5–5.7，~2w，含 keeper 接入 + 性能调优 perf budget）另计，不在可玩 MVP 净路径内但卡正式发布。

**Lane ↔ M0–M7 映射**（`●`=主力实现 ｜`◐`=支撑/join/stub ｜`—`=空闲）：

| Lane | M0 | M1 | M2 | M2.a | M3 | M4 | M4.5 | M5 | M6 | M7 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 🔴L-A 财库 | §3.2 | ● | — | — | — | — | ◐audit | — | ◐(cap供M6) | — | 最先动，~2w |
| 🔴L-B 市场+AP | §3.3 | ●MATH+trivialAP | ◐等C1 | ◐STATE解锁 | ●STATE+非trivialAP | — | ◐audit | ◐ | — | — | MATH+trivial AP 先发(P1 需)；**STATE/非trivial AP 顺序等 C1** |
| 🔴L-C V2World | §3.1 | — | ● | ●C1冻 | — | — | ◐audit | — | — | — | C1 须 M2.a 中旬冻 |
| 🟡L-D RNG | §3.1 | (可实现) | ◐mock交付 | — | — | ●真实接入 | — | — | — | — | mock@M2末(供P1,旁挂) / **real@M4 实为 MVP(P2) 关键路径段**；🟡 仅标 mock |
| 🔴L-E 行动 | — | — | ◐mock骨架 | — | — | ●实现 | ◐audit | — | — | — | join② 三齐才整合 |
| 🔴L-I 集成 | — | ◐stub | ◐stub | — | — | ◐建flag | — | ●flag切换 | — | — | feature-flag 软切（4 重门） |
| 🟡L-T 测试 | (起) | ● | ● | ●守join① | ● | ● | ● | ● | ● | ● | 常驻门禁 + v1 scope 扫描 |
| 🟡L-F 卡牌 | — | (接口可早启) | — | — | — | — | — | — | ●Post | — | 实现待 M5 tag 后；deps L-A `netTreasuryTakeG` |
| 🟡L-O ORACLE | (deferred登记) | — | — | — | — | — | ◐信任模型签字 | — | — | ●Post | 需独立评审；M6 后 |

---

## 11. 风险与未决

| 风险 | 影响 | 缓解 |
|---|---|---|
| **架构决策被某 lane 私自改走老路** | §3 已定架构（World=B / RNG=commit-reveal / 财库权限 / Router）被绕过，破坏「干净」前提 | 改 §3 架构须走 ADR（§9）；CI gate (a)：改架构无 ADR → block；`interfaces/`+`Router.sol`+财库权限模型只 lead 可改（CODEOWNERS） |
| **Router V3 缺 net-new 槽 + 合约全 0 实现** | Router(V3) 已含 9 槽但**缺市场/AP/世界/RNG 等 net-new**；lane day-1 找不到 `IAPLedger` 从哪 import；M5 flag 翻转读 V3 旧址 → 调错合约 0-day | 冻结期 lead 头 3 天交 `/contracts/src/interfaces/I*.sol`+`HexGrid.sol`+`Mock*`+**Router V3→V4 扩展(槽+setter+getAddressesV4，dual-read 策略)**，不等 M1 实现（§4） |
| **L-B STATE 误标并行（旧稿）** | 净周期被低估 1–2 周；STATE owner 不知 C1 何时好 | §6 join① + §10 PERT 已修正为顺序：C1(M2.a)→L-B STATE(1w)；净路径修正为 ~10–11w（最好 ~9w）；M2.a 子里程碑显式登记 |
| **L-E↔STATE 依赖方向写反（旧稿把 STATE 列为 L-E 前置）** | L-E 被过度串行化、与 P1 薄片自相矛盾 | §2/§5/§6 join② 已改正：L-E 上游 = AP.spend+Hex+RNG **三齐**；STATE 市场读 L-E 写的 checkpoint、是 L-E 的下游、非前置 |
| **lead 单点瓶颈（无 deputy、未计工时）** | 架构采纳 / 冻结 / Router / 三 join 全过 lead，lead 病/忙则整条关键路径停摆 | §9 已补：必配 lead-deputy 共担 Router/mock-sync/join 仲裁；接口变更 SLA ≤24h；§10 PERT 把 lead 当共享资源计、不假设 lead 还全职背 lane |
| **人手不足 → 并行退化为串行** | < 4 人时净期从 ~10–11w 退回 ~13.5w（含审计 14.5w），并行承诺落空 | §9 阵型明确 4–5 人前提（3 dev + QA + lead/deputy）；招不齐则按串行 ~13.5w 排期、不对外承诺 10–11w |
| **RNG 超时/退款规则** | commit-reveal 的 reveal/timeout/refund 规则没定，L-E 无法实现攻防 | RNG=commit-reveal 已定（§3.1），仅需定 reveal 窗口/超时/退款；L-D **M2 末交 mock、M4 起交真实**（硬 deadline，§6 join②）；**mock 晚→卡 P1；real 晚→卡 P2，非 P1 关键路径** |
| **feature-flag 提前翻（join③）** | L-T/L-E 未绿即翻 → MCP 带 stub 假设调真实合约 → 生产 0-day | 翻 flag 硬 gate = L-T 6/6 ∧ P2 ∧ M4.5 审计 ∧ 迁移快照 全绿（§6 join③）；单源三服务启动读、可回滚 |
| **Mock≠real ABI 漂移** | L-I 对 mock 编码，flag 翻后真实返回类型不符即崩 | CI 强制 mock 与 real 跑同套测试、返回类型 bit-identical（§4），不同步则 fail |
| **MCP/frontend 迁移成本**（L-I 三处同切） | 旧 `GAME_ENGINE_ABI`/ore/旧 score prompt 散落 chain.ts/tools.ts/llm.ts/useGameEngine.ts | M0+1w 起搭 stub 让前端并行迭代；M5 经统一 feature-flag 逐处翻 + 校验 + 可回滚（§6） |
| **§12 OPEN 数值未定** | `fixedTrivialAP`/各 cap/`taxBps/burnBps`/`minAttackAP` 等待 owner；dev 可能硬编码偷跑 | **不阻塞结构**：约束式与 struct 先锁，数值参数化注入设 setter，stub 带 `TODO §12` 注释 + CI linter 告警；`/docs/§12-values.md` 挂 owner+期限；L-T 测约束不测常数 |
| **多 EOA 同控残留信任** | 「独立 owner」无法链上证明真人独立，自对赌刷 AP 不能纯链上消除 | 设计层接受为残留假设：真实 `losingBurnG` + AP throttle 锚 `realBurnedGInMarket` + 可选 account 成熟度/bond；不声称已消除 |
| **STATE 依赖 V2World checkpoint**（M2→M3） | L-C 慢则 STATE 盘上不了 | MATH-only 先发（P1 不阻塞）作**默认兜底**；STATE 作 P2 合龙项；CI 门禁 L-B STATE 代码等 C1 封板 tag（§6 join①/§8） |
| **成就卡定向铸造自肥漏**（M6/CARVE-OUT） | 成就可刷则公库出资稀有卡变自肥 | Post-MVP；上线前必须定稿抗 sybil/抗刷成就白名单（§12 OPEN），不进 MVP；L-F 待 M5 tag 后启动 |
| **Post-MVP lane 抢跑** | L-F/L-O 若 M5 前并行实现，撞主集成 crunch | §5/§8 CI: `feat/lane-F|O-*` 在 M5 tag 前 push → auto-reject；不进 MVP 关键路径 |
| **安全审计未排期** | UUPS 代理 + 多模块接线无审计 checkpoint，部署即风险 | **M4.5 插部署前安全评审 checkpoint（§10），signoff 后才批 M5 merge**；含 ORACLE 信任模型 1 页签字 |
| **部署阶段缺失（testnet→staging→mainnet）** | 2–3 周隐藏工作未计入 | §10 补 M5.5 testnet 部署 + keeper + 性能调优(~2w) → M5.7 mainnet；非 lane 并行但卡发布 |
| **代理/升级复杂度** | UUPS World proxy + module registry + GTreasury 接线，升级易破存储布局 | 文档化代理升级路径 + storage-layout 兼容测试，纳入 L-T 回归 |
| **stub→real 切换数据语义** | 切换时哪些状态保留/重置不明，易丢账本或重置 G | 明确：question ledger / G 余额 / treasury 池**保留**；test agent / test market 切换时**重置**；**切前快照校验有可执行 DoD（§6 join③ 第 4 门：S0/S1 保留集逐项相等 + 重置集清空 + Router V4 指向校验，L-I+L-T 双签）** |
| **结算执行者归属 + keeper 存活/超时** | P1/P2 demo 需盘能结算，但 keeper 排 M5.5（demo 之后）、无 lane 拥有；且题到期 keeper 离线则市场卡死 | **MVP `settle()` permissionless**（owner=L-B），demo 期 agent-runner 兜底触发、不依赖 M5.5 keeper；keeper 上线后做 SLA/监控 + 超时 `settleDeadline` → 自动 void+refund 兜底；测 keeper 失效路径（§5/§7/§10） |
| **QA 仅 6 不变量、闭环功能正确性靠人工 demo** | 核心闭环（所有权转移/清零防御/退款/AP 只发赢家/TWAP）缺自动化 e2e | L-T 增 **MATH/STATE 闭环集成/e2e 套件**（§5/§8）；M5.5 加 perf budget；M4.5 审计定 executor/scope（§10） |

---

## 12. OPEN 数值参数跟踪（落地为 `/docs/§12-values.md`）

§12 数值不阻塞结构（struct/约束先锁），但须挂 owner + 决定期限，防有人先提交硬编码默认值。**本地测试可用占位默认（local-only，非生产）**；合约 stub 内每参数带 `/// TODO §12(x): set via owner governance, not hard-code`，CI linter 对硬编码非默认值告警。

| 参数 | 影响 | 决定期限 | 测试占位（local-only） | owner/日期 |
|---|---|---|---|---|
| `fixedTrivialAP` (T_unit) | trivial 单题 AP | M1 | 10 | ☐ ____ / ____ |
| `T_agent_epoch / T_owner_epoch / T_global_epoch` | trivial 多维 cap | M1 | 宽松值 | ☐ ____ / ____ |
| `E_min / E_max` | comeback 期望区间 | M1 | 占位 | ☐ ____ / ____ |
| `minAttackAP` | 最小攻击 AP | M2 | 1 | ☐ ____ / ____ |
| `D_max / defenseHalfLife / upkeep` | 防御曲线 | **M0（结构相关，须先锁约束）** | — | ☐ ____ / ____ |
| `p_floor` | 满 AP 攻击成功下限 | **M0** | — | ☐ ____ / ____ |
| `treasuryTakeCapBps` | 净抽水上限 | M1 | 例 1000 (10%) | ☐ ____ / ____ |
| `taxBps / burnBps` | 税/销毁分流 | M1 | 例 200 / 100 | ☐ ____ / ____ |
| `minIndependentLoserStakeG` | eligibility 门槛 | M1 | 占位 | ☐ ____ / ____ |
| `warmup / antiSnipeWindow` | odds 快照窗口 | M1 | 占位 | ☐ ____ / ____ |
| `cardTaxShareBps / blankCardMintLockG` | 卡牌铸造（Post） | M6 | — | ☐ ____ / ____ |
| `secondaryTaxBps / secondaryBurnBps` | 二级税/销毁（Post） | M6 | — | ☐ ____ / ____ |

每参数须接 setter/getter，初值走治理设置而非硬编码常量。
