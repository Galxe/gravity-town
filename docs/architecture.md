# Gravity Town v2 · 架构（Architecture）

> **本文是 v2 的架构权威**——把「这个项目是怎么搭起来的、为什么这么搭」讲清楚。
> 配套：详细字段/公式见 [`game-design.md`](game-design.md)（工程规格）· 玩家视角见 [`game-design-ux.md`](game-design-ux.md)（看/做/感受）· 并行开工/lane/排期见 [`dev-plan.md`](dev-plan.md)（执行）。
> **本文是 v2 的架构权威。** 凡 `game-design.md` 或 `dev-plan.md` 的「改造旧合约 / 迁移旧世界」措辞与本文冲突，一律以本文的 greenfield 方案为准。

---

## 0. 一句话 + 为什么是 greenfield

**一句话：** Gravity Town v2 是一个链上 **Market → AP → Action** 游戏——你押游戏币 **G** 赌一个会被验证对错的未来，赢了才拿到**行动力 AP**（买不到、只能赢），再花 AP 去攻击/加固/回场、改写一张链上六边形地图；地图一变又长出新的可押事件。整套循环全部记在链上、由 LLM agent 自主驱动。

**部署方式 = 全新（greenfield），新赛季起：** v2 **不改造、也不迁移**任何 v1 合约——全部新部署一套自洽合约，旧的 `GameEngine` / `GTreasury` / `CardLedger` / `ArenaEngine` 原样继续服务 v1/arena，v2 一行都不写它们的状态。

**为什么 greenfield 而不是改造旧世界（关键判断）：**

- **核心合约两条路都得写。** Market 引擎、AP 账本、世界、RNG、结算——这 5 件是 v2 游戏的本体，无论改造还是全新都得从零写（greenfield 另加全新 `V2Treasury`/`V2Router` → MVP 净新增 = 7，见 §2/§3.4）。
- **「改造」只会**额外**叠上一笔迁移税，不会省事：** 改 `GTreasury` 的发奖/escrow/提现权限 + 连带修被它弄坏的 `CardLedger`/`ArenaEngine`、把旧地图快照导进新世界、给共享 `Router` 上 dual-read 兼容层……这些**全是 greenfield 不需要的**。（greenfield 仍要让三服务指向 `V2Router`，但那只是配置切换、非 dual-read 状态迁移，见 dev-plan §6。）
- **有的旧路根本走不通。** 想「让外部合约改 `GameEngine` 的地块归属」是不可能的：`GameEngine` 的 `hexes / agentHexKeys / hexCount` 是 `public` mapping，**只有 getter、没有外部 setter**，所有写入都锁在内部权限后。
- **结论：** greenfield **工作量更小、且架构更干净**（单一新世界自持状态、不和 v1 的 ore/arsenal/happiness 经济耦合），所以直接重写更合理。

> 唯一前提：v2 当**新赛季**起，玩家的 G/地盘**不从 v1 继承**（v2 的 G 从 v2 自己的入金/faucet 起，地图全新空开局）。v2 玩法本就是重构（连 ore 都砍了），这个前提通常成立。

---

## 1. 四层栈：世界怎么转起来

整个世界是一个**自我喂养的循环**，三层首尾相接，外加一个后续才挂上来的卡牌层：

```text
        ┌────────── 地图一变，长出新 Market，回到 ① ──────────┐
        │                                                       │
        ▼     ① Market            ② AP              ③ Action     │
   ┌─────────┐   押 G   ┌─────────┐  赢盘   ┌─────────┐  花 AP   │
   │ 押未来   │ ──赌──▶ │ 才发 AP  │ ──得──▶ │ 改地图   │ ────────┘
   │（可验证）│         │（只能赢） │         │（链上）  │
   └─────────┘         └─────────┘         └────┬────┘
                                                 ┊ 攻防小加成
                                            ┌────┴────┐
                                            ┊  卡牌    ┊ ← 后续(M6)，不在主循环
                                            └─────────┘
```

| 层 | 是什么 | 产出 |
|----|--------|------|
| **① Market** | 世界唯一的价值来源：会被验证对错的预测盘。你押 G 赌「2h 后 Bob 还守得住 3 号地吗」 | 赢家分到输家押进来的 G |
| **② AP** | 赢盘才有的行动资格。**AP 只能赢、买不到、转不走、提不出** | AP（看得越准给越多） |
| **③ Action** | 花 AP 改写链上地图：攻击相邻地 / 加固己方地 / 0 地回场 | 世界变了，立刻长出新盘 |
| 卡牌（M6） | 挂在 ③ 上的攻防小加成，不进循环、不引第二种币 | 给攻防 +N |

**两条铁律**（全局最该记住的）：**(1) AP 只能赢来**——任何「用 G 买 AP」的路在合约层就不存在；**(2) 赢家一定拿得到**——赌池里的 G 锁着、协议碰不到，局一结束自动发给赢家。

---

## 2. 合约全景：组件、职责、关系

```text
图例：→ 运行期调用（调用者 → 被调用者）；⇢ 只读 view；［新］v2 新建／［复用］不改其 v1 语义。
V2Router［新］解析所有 v2 合约地址；旧 Router / GameEngine / GTreasury / CardLedger / Arena 一律不碰。

  玩家 ── 入金 depositG ─────────────────────────▶ V2Treasury［新］
                                                   （G 单一托管：reservedBackingG /
                              ┌── escrow + 发奖 creditG ──▶  escrow / cap / 多签提现）
                              │                                  ▲ 提现（治理：多签+timelock）
  ── Market 路径 ──           │
  玩家 ─ 开/押/claim ─▶ PredictionMarketEngine［新］（内嵌 QuestionRegistry）
                              │
                              ├─ settle: 问结果 ─▶ MarketSettlementResolver［新］
                              │                     （MATH 自校验 / STATE / ORACLE M7）
                              │                              ┊ ⇢ 读 V2World.checkpoints(eventId)
                              └─ creditFromMarket（发 AP, onlyMarket）─▶ APLedger［新］
                                                                          ▲
  ── Action 路径 ──                                                       │ spendForAction
  玩家 ─ attackWithAP ─▶ V2World［新］─────────────────────────────────────┘（花 AP, onlyWorld）
                              │  （hex=agentId / defense / capture / spawn / score /
                              │     唯一写 finalized checkpoint）
                              ├─ request/resolve ─▶ RNGProvider［新］（future-blockhash）
                              └─ 链接库 ─▶ HexGrid［新，库，不占地址槽 / 邻接·可逆键］

  AgentRegistry［复用，身份层］：agentId↔owner、createAgent —— 被 PME / V2World ⇢ 读身份
```

| 合约 | 职责 | 谁能写它 | 状态 |
|------|------|----------|------|
| **V2Router** | 解析全部 v2 合约地址（upgrade 时换实现不换地址） | lead/治理 | 🟢 新建（旧 Router 是 append-safe、本可复用；默认新建小 router 以彻底隔离 v1） |
| **AgentRegistry** | agent 身份：`agentId`（从 1 起）↔ owner 地址；`createAgent`；`isOperator` | 玩家（建号）；v2 合约只读 | ♻️ 复用（身份层；不碰其 v1 经济语义） |
| **V2Treasury** | G 的**单一托管**：`gBalance` 账本、`reservedBackingG`、市场 escrow 进出、`netTreasuryTakeG` cap、`onlyMarket creditG`、多签/timelock 提现 | 玩家（入金）/ only PME（发奖·escrow）/ 治理（提现） | 🟢 新建（**取代**改造 GTreasury） |
| **PredictionMarketEngine** | 开盘/押注/关盘/结算/claim；escrow + eligibility；**内嵌**模板白名单 + `trivial/difficulty` 派生（QuestionRegistry 不单列） | 玩家（开/押）；permissionless（settle） | 🟢 新建 |
| **MarketSettlementResolver** | 判定盘的对错：`MATH` 自校验 / `STATE` 读 `V2World.checkpoints(eventId)` / `ORACLE`(M7) | PME 调 | 🟢 新建 |
| **APLedger** | AP 余额；`creditFromMarket`（**唯一 mint 入口**，onlyMarket）；`spendForAction`（**唯一花**，onlyWorld）；trivial 多维 throttle | only PME（增）/ only V2World（减） | 🟢 新建 |
| **V2World** | hex 归属（**agentId**，0=neutral）、`hexDefense`、capture、spawn/respawn、`v2Score`、**唯一写 finalized checkpoint**；`attackWithAP/reinforceHex/returnFromElimination` | 玩家（花 AP 行动） | 🟢 新建 |
| **RNGProvider** | AP-gated 战斗随机数（**future-blockhash**） | V2World 调 | 🟢 新建 |
| **HexGrid** | 无状态几何库：`areAdjacent/toKey/fromKey/inBounds`（**可逆打包键**） | — | 🟢 新建（库，链接进 V2World，不占地址槽） |

> **不碰清单（greenfield 边界）：** `GameEngine` / `GTreasury` / `CardLedger` / `ArenaEngine` / 旧 `Router`——v2 不写它们的状态、不迁移它们的余额、不在 PR 里改它们（除非 v1 自身 bug）。它们继续服务 v1 与 arena 侧游戏。

---

## 3. 一个完整循环（数据流）

```text
 1. 入金        玩家把 native 充进 V2Treasury → 记 gBalance[agentId]（按 agentId 记账，入金边界 address→agentId 经 AgentRegistry；v2 自己的 G、新赛季）
 2. 开盘        PredictionMarketEngine.open(question)  // MATH 模板自校验 / STATE 绑定未来 checkpoint
 3. 押注        玩家 bet(marketId, outcome, stakeG)
                 → V2Treasury escrow：totalOutstandingG -= stake; reservedBackingG += stake（不漏进可提 surplus）
 4. 关盘        到 closeAt，停止接注；odds 早期窗口/TWAP 已快照（防 anti-snipe）
 5. 结算        settle(marketId)（permissionless，到期后任何人/runner 可触发）
                 → MarketSettlementResolver 判对错：
                    · MATH  → 链上自校验
                    · STATE → 读 V2World.checkpoints(eventId)，要求 exists && finalized
 6. 发奖        对每个赢家仓位：
                 → APLedger.creditFromMarket(agentId, winAP)   // AP 唯一 mint，越难给越多
                 → V2Treasury.creditG(agentId, payout)         // 经济余额按 agentId 记账；有等额具名 backing 才发；输家 burn 进不可回流 sink
 7. 行动        V2World.attackWithAP(agentId, fromHex, targetHex, apSpend)
                 → APLedger.spendForAction(commit 时即扣 AP)   // 杜绝「免费试」
                 → RNGProvider: commit(记 commitBlock) → k 块后任何人 resolve（permissionless）：
                   seed = keccak(blockhash(commitBlock+k), …) → 胜=capture / 负=没收 AP；
                   未结算→expire 也没收 AP（不退）→ 放弃≡判负，无免费 re-roll
                 → 胜：capture，hexDefense 清零，写 battle/capture checkpoint
 8. 长出新盘    地图变了 → 这块新地的归属成了下一个「STATE 盘」可押的未来事件 → 回到 2
```

**方向要点（别记反）：** 是 **V2World 写 checkpoint → STATE 盘读它**。Action 是 Market 的上游生产者；Market 不驱动 Action。

---

## 4. 关键架构决策（已定，带依据）

这些原本是「待定」，已通过读真实合约 + `game-design.md` 定稿（逐条依据见下；执行/lane 见 `dev-plan.md`，其财库/Router 段以本文 greenfield 为准）：

- **世界自持（greenfield World）。** v2 的 hex/战斗/checkpoint 全在 `V2World` 内，**连旧 `GameEngine` 都不碰**（旧 `hexes/hexCount` 无外部 setter，本就改不了）。旧世界的 Tullock 数学、地图工具只作**参考或抽成库**。
- **hex 归属 = `agentId`（uint256，0=neutral）。** 因为 `hexCount(agentId)`、`v2Score(agentId)`、capture→attacker 的 agentId、STATE 盘「hex 是否归 agent A」都按 agent 粒度；钱包 `address` 只在经济层出现。
- **checkpoint 键 = `bytes32 eventId` = `Question.snapshotEventId`。** 创建时 `exists==false`（已存在即拒，杜绝「创建晚于事实」），结算时 `exists && finalized`，超时 void+refund，**只有 V2World 能写**。
- **RNG = commit + 未来区块哈希（future-blockhash；MVP 简化，藏在 `RNGProvider` 接口后，将来有 VRF 无缝换 adapter）。** 全链无现成 VRF，`block.prevrandao` 可被 grind，**禁止**直接定胜负。机制：`attackWithAP` 时**即扣押 AP** + 记 `commitBlock`（commit）→ `k` 块后 `seed = keccak(blockhash(commitBlock+k), requestId, …)`（种子由未来区块决定，commit 时不可知）。结算 **permissionless**：到点后任何人都能 `resolve` —— 胜=capture、负=AP 没收。**防 re-roll 的承重一条：未在窗口内结算 → `expire` 也没收 AP（绝不退还）。** 因为 seed 公开后胜负即可算，若「输了就不结算、等超时退款」就是免费 re-roll；令**放弃结算 ≡ 判负 ≡ 没收 AP**，攻击者拿不回 AP、grind 无利可图（赢则自己结算拿地，输则放任 expire 同样没收）。permissionless `resolve` + RNG-resolve keeper（**MVP 承重活性，不推迟到部署期**）只为**清掉**被放弃的 pending 占用，与防 re-roll 无关。接口 `request/resolve/expire`（**无秘密 reveal**）。**caveat：future-blockhash 有出块人偏置（小链尤甚）+ 极端 256 块全网停摆会误没收本可赢的 AP（罕见）——MVP 可接受，VRF 上线即除。** `k`/结算窗口是 §12 数值。
- **QuestionRegistry 内嵌 PredictionMarketEngine。** MVP 只 3 个 MATH 模板、派生本就在 create 路径里跑；不单列合约、不占地址槽，留好内部抽出缝（`Question` 已存裸 `templateId/params`），M7/治理上线时可无痛抽出。
- **V2Treasury 全新（不改 GTreasury）。** 单一 G 托管、`reservedBackingG` 从第一天就在、只有 market 能 `creditG`、提现走多签/timelock——避开旧 `GTreasury` 的泛 `onlyOperator` 发奖、`spendG` escrow 泄漏、`onlyOwner` 提现后门，也不弄坏 `CardLedger`/`ArenaEngine`。
- **HexGrid 可逆打包键。** 旧 `toKey` 是单向 keccak（无法从 key 反推坐标做邻接校验）；改用 `bytes32(uint256(uint32(q))<<32 | uint32(r))`，支持 `fromKey` + 按 key 判邻接。

---

## 5. 经济铁律 / 不变量（承重，L-T property test 守）

1. **AP 只能赢来。** AP 仅经 `APLedger.creditFromMarket` 增发；不可买、不可泛 operator mint、不可与 G 兑换；`spendForAction` 仅 `V2World` 可调。
2. **单一发奖入口。** 正式 `creditG` 只认单一 `PredictionMarketEngine`；二级卡牌卖方收款走独立 `SECONDARY_CARD_TRANSFER` 白名单（守恒）。
3. **creditG 等额 backing。** 每次发 G 前都能指出已扣减/锁定的等额具名来源（losing stakes → 预存补贴池 → 已拨入 surplus）；无 backing 的 payout 被拒。
4. **桶隔离。** 任一时刻 `可提 surplus ≤ 余额 − 全部未结算 G 负债 − reservedBackingG − frozenG`；escrow/补贴永不被当 surplus 提走。
5. **净抽水 cap。** `netTreasuryTakeG(epoch) ≤ treasuryTakeCapBps × grossPlayerPaidG`，超则拒绝或 source-neutral 回流；**burn 永不回流**。
6. **防御。** `0 ≤ effectiveDefense ≤ D_max`、随时间衰减、capture 后清零、满 AP 攻击成功率 `≥ p_floor`（守不死的地不存在）。
7. **eligibility。** 非 trivial 盘需 ≥2 独立 owner + 真实 `losingBurnG`，单边/自对冲只退款不发 AP/G，AP throttle 锚 `realBurnedGInMarket`；trivial 盘固定 AP + 多维 throttle（agent/owner/epoch/global）。

> 多 EOA 同控自对赌是链上不可完全识别的**残留信任假设**——靠真实 burn 成本 + AP throttle + 可选 account 成熟度/bond 缓解，不声称已根除。

---

## 6. 权限边界（谁能调谁）

| 被保护的动作 | 只允许 | 拒绝 |
|--------------|--------|------|
| `APLedger.creditFromMarket`（发 AP） | `PredictionMarketEngine` | 其它任何地址 |
| `APLedger.spendForAction`（花 AP） | `V2World` | Market、玩家直调 |
| `V2Treasury.creditG`（正式发奖） | `PredictionMarketEngine` | 泛 operator/owner |
| `V2Treasury` 二级卖方收款 | `SECONDARY_CARD_TRANSFER` 白名单 | 复用发奖路径 |
| `V2Treasury.withdrawSurplus`（提现） | 多签 + timelock，`TreasuryUse` 枚举限用途 | 单签 owner |
| 写 finalized checkpoint | `V2World` | Market、resolver、外部 adapter |

调用图**单向无环**：`creditFromMarket` 只被 Market 调、`spendForAction` 只被 World 调（Market 永不调 spend、World 永不调 credit），故不存在回边。

---

## 7. MVP 范围与后续

**MVP 做（M0–M5）：** Market 引擎（`MATH` + `STATE`-by-checkpoint）· AP 账本与发放 · 三个动作（攻击/加固/回场）· `V2World` minimal core · future-blockhash RNG · MCP/agent-runner/frontend 只围绕 Market→AP→Action 闭环。

**MVP 不做：** ore / 建造采集 / 把每个动作包装成答题 / 卡牌数值 / `ORACLE` 盘。

**后续：**
- **M6 卡牌**：公库（V2Treasury）出资铸成就稀有卡 / 玩家自冻 G 铸白板卡；攻防 bonus 挂在 Action 上；不引第二种币、不进主循环。**走全新 v2 卡牌合约（`CardMintEngine`/`SecondaryCardMarket`），不复用 §2 不碰清单里的 v1 `CardLedger`。**
- **M7 ORACLE**：三类盘的第三类（链外真实世界），**deferred-not-cut**——信任模型（单签/多签/optimistic/attestation + 挑战窗 + 失败恢复）独立评审通过后才开放。

---

## 8. 仅剩的真·待定（不阻塞架构/冻接口）

- **§12 数值**（`fixedTrivialAP`、各 cap、`taxBps/burnBps/treasuryTakeCapBps`、`D_max/p_floor`、`minAttackAP`、地图半径、`warmup/antiSnipeWindow`、`SCORE_PER_*`；数值章节在 `game-design.md` §12 / `dev-plan.md` §12）——约束式已锁，常数经 setter 治理注入。
- **M7 ORACLE 信任模型**——只 gate M7、不 gate MVP。

> **文档对齐：** `dev-plan.md` §3.2/§3.4/L-A/文件矩阵已据本文同步为 greenfield（V2Treasury / V2Router 全新、net-new 合约含二者、删 dual-read 与迁移快照门）；若发现残留「改造 GTreasury / Router V3→V4 / 迁移门」措辞，以本文为准并修正 `dev-plan`。
> 架构既定、合约边界既定，接口可立即冻结、lane 可立即并行（执行见 `dev-plan.md`）。要改本文任一架构决策，走一次 ADR，不走「逐项签字」门。
