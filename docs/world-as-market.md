# Gravity Town World-as-Market 权威设计稿

> 路径约定：本文所有 `file:line` 以仓库根 `/mnt/data2/kenji/galxe/game` 为准；本文自身写在当前 demo 工作目录的 `docs/world-as-market.md`。
>
> 合并来源：本稿合并前两轮 Codex / subagent 对“独立 PredictionMarket + demo 落地”的拆分、`docs/dev-breakdown.md` 中 Lane P/A-F 的现状核校，以及 owner 已拍板的“机制脊柱 v2”。旧方向里 Lane C 只新增 `PredictionMarket` 的路径要作废，升级为中心 `World` 合约与“万物皆答题”。

## 1. 愿景与一句话核心循环

一句话核心循环：

> 世界合约把所有行为都抛成一道问题；agent 用 ore 或 G 作答/下注；合约按 MATH、STATE 或 ORACLE 结算，派发 ore/G、改写世界状态，并在中心金库积累到阈值时 seed 世界事件或新奖池。

设计愿景是“万物皆答题”：

- 挖矿、建造、攻击、辩论、预测市场、世界事件都统一成 `Question`。
- `difficulty` 是总旋钮：难度 0 是确定性 faucet 或低风险状态题；高难度是真预测市场、随机战斗或主观裁决。
- ore 是固定、无限、免费参与层；G 是稀缺价值层，承担预测市场计价、分层行动费、事件奖池与金库循环。
- 中心 `World` 合约是目标架构：唯一状态源、唯一 G 金库入口、唯一问题/市场流。当前代码现状仍是分立的 `GameEngine` + ledgers + Arena side-system：`GameEngine` 直接保存 hex/ore 等主世界状态（`contracts/src/GameEngine.sol:15-18`、`contracts/src/GameEngine.sol:63-83`）、debate+chronicle 存储（`contracts/src/GameEngine.sol:88-123`）、World Bible 存储（`contracts/src/GameEngine.sol:125-135`），三类 ledger 仍作为独立合约被 `GameEngine` 调用（`contracts/src/GameEngine.sol:7-10`、`contracts/src/GameEngine.sol:184-198`）。

现状事实必须诚实保留：

- `GameEngine` 现在直接暴露写入口：`harvest`（`contracts/src/GameEngine.sol:288-290`）、`build`（`contracts/src/GameEngine.sol:344-370`）、`attack`（`contracts/src/GameEngine.sol:375-447`）、`raid`（`contracts/src/GameEngine.sol:623-688`）、`startDebate/vote/resolve`（`contracts/src/GameEngine.sol:710-895`）。
- 当前“预测市场”只藏在 debate 内：debate 投票可下注 ore（`contracts/src/GameEngine.sol:103-112`、`contracts/src/GameEngine.sol:759-793`），结算时按支持/反对池派 ore，Oracle debate 还抽 10% ore tax（`contracts/src/GameEngine.sol:854-891`）。
- G 已在 `GTreasury` 中存在，但用途目前偏 Arena：`depositG` 是 on-ramp（`contracts/src/GTreasury.sol:100-107`），`spendG` 把 agent G 转成协议 surplus（`contracts/src/GTreasury.sol:109-122`），`creditG` 给 agent 记 G（`contracts/src/GTreasury.sol:124-130`）；Arena 买卡/roll 已调用 `spendG`（`contracts/src/ArenaEngine.sol:273-284`、`contracts/src/ArenaEngine.sol:390-400`）。
- Router 目前只到 `gTreasury/cardLedger`，没有 `world` 槽位；存储槽位见 `contracts/src/Router.sol:10-21`，setter 止于 `setCardLedger`（`contracts/src/Router.sol:45-53`），最新 getter 是 V3 九元组（`contracts/src/Router.sol:85-108`）。

## 2. 统一原语规格

### 2.1 Question 数据结构

目标 `World` 合约中的最小问题原语：

```solidity
enum QuestionKind { MATH, STATE, ORACLE }
enum Currency { NONE, ORE, G }
enum QuestionStatus { OPEN, LOCKED, RESOLVED, CANCELLED }

struct Question {
    uint256 id;
    QuestionKind kind;     // MATH | STATE | ORACLE
    uint16 difficulty;     // 0 = deterministic faucet; higher = more risk/value
    Currency currency;     // NONE for free/faucet; ORE for fixed reward; G for markets/fees
    uint256 stake;         // fixed stake, min stake, or per-answer fee depending on kind
    uint64 resolveAt;      // timestamp / round close time
    address resolver;      // module, oracle, keeper, or address(0) for self-checking
    bytes32 poolId;        // parimutuel pool / event pool / action bucket
    QuestionStatus status;
}
```

可选扩展字段不进入 v1 主 struct，放在 `metadataURI` / `questionData` / module storage 中：

- `bytes questionData`：MATH 的表达式 hash、STATE 的 action payload、ORACLE 的裁决规则。
- `uint256 feeG`：价值行动的 G 费；简单 difficulty 0 题默认为 0 或接近 0。
- `uint256 oreReward`：固定 ore 激励，不从池子扣。
- `uint256 prizePoolG`：G 市场或世界事件的奖池余额。

为什么必须统一：当前 `GameEngine` 把 ore 生产、建筑、战斗、debate、世界 bible 分散在同一大合约里，行为语义不统一；例如 `harvest` 是 permissionless（`contracts/src/GameEngine.sol:288-290`），`build` 由 `canControlAgent` gate（`contracts/src/GameEngine.sol:344-345`），`raid` 同样 gate（`contracts/src/GameEngine.sol:623-624`），debate 又把叙事、投票、下注和民心写入耦合在一起（`contracts/src/GameEngine.sol:710-793`、`contracts/src/GameEngine.sol:804-895`）。

### 2.2 生命周期

统一生命周期：

```text
create
  -> answer | bet
  -> lock/resolve
  -> payout
  -> optional world event trigger
```

具体语义：

1. `createQuestion`
   - `World` 或注册模块创建问题。
   - `kind` 决定结算来源，`difficulty` 决定奖励、fee、stake 与是否需要 RNG/Oracle。
   - `currency=G` 时，押注资金进入对应 G pool；`currency=ORE` 时只作为参与凭证或旧兼容，不作为长期预测市场计价。

2. `answer` / `bet`
   - `answer` 用于 MATH、STATE 的确定性或动作型问题：例如“收割当前 pending ore”“建造 mine”“选择进攻 payload”。
   - `bet` 用于 G parimutuel 市场：资金进入 `poolId`，不进入 agent ore pool。
   - 对真人 UX：按钮仍可叫 Harvest / Build / Raid / Bet World Cup；难度条和 AgentMind 揭示“这是一道难度 N 的题”。demo 目前已经保持真人语义，`MyAgent` 上仍是 Harvest/Build/Raid/Bet 按钮（`demo/index.html:1344-1357`）。

3. `resolve`
   - MATH：自校验，合约本身能验证答案。
   - STATE：读世界事实或执行状态机，如 harvest/build/attack/raid/debate tally。
   - ORACLE：指定 resolver 或裁决模块写入结果，含超时退款与争议路径。

4. `claimPayout`
   - ore 奖励固定发放并受 cap / score 降权约束。
   - G 市场按 parimutuel 或模块定义派彩；fee/tax/burn/event prize pool 都在 `World`/`GTreasury` 记账中可见。

### 2.3 三类结算的判定来源

| kind | 判定来源 | 示例 | 现状锚点 | v1 规则 |
|---|---|---|---|---|
| `MATH` | 合约自校验，纯函数或固定答案 | difficulty 0 faucet、简单算术、固定领取题 | 现 `harvest` 直接 lazy 计算 ore（`contracts/src/GameEngine.sol:293-337`） | 不需要外部 resolver；可直接 `answer` 后固定 ore reward |
| `STATE` | `World` 读自身状态或运行状态机 | build mine、attack/raid、scoreboard top、hex owner | `build` 扣 ore 改建筑（`contracts/src/GameEngine.sol:344-370`）；`attack/raid` 运行 Tullock 并改 hex（`contracts/src/GameEngine.sol:375-447`、`contracts/src/GameEngine.sol:623-688`）；`getScore` 当前公式是 hex*100 + ore + buildings*50（`contracts/src/GameEngine.sol:494-506`） | resolver 是 `World` 或注册 STATE module；高价值 STATE 结算要进入 RNG 分阶段 |
| `ORACLE` | 指定人/模块/多签/争议系统 | 世界杯冠军、主观联盟裁决、世界 bible 事件 | Oracle debate 现在由 oracle agent / operator 影响，`resolveDebate` 对 oracle 使用 `outcomeOverride`（`contracts/src/GameEngine.sol:804-827`），超时退款在 `expireDebate`（`contracts/src/GameEngine.sol:897-911`） | resolver 必须显式；必须有 `resolveAt + grace`、退款、争议/仲裁 OPEN 策略 |

**依赖排序（score 结算的 G 市场）**：凡用 `score` 结算的 G 市场（如「scoreboard top」STATE 样例），**必须排在 score 给 ore 降权（§3.1 score v1，对应 A4）上线之后才能上线**。当前 `getScore = hexes*100 + ore + buildings*50`（`contracts/src/GameEngine.sol:494-506`）线性吃满 ore，免费 ore 会经 score 间接污染 G 结算；不先降权就上 score-based G 市场，等于让无限免费 ore 决定真人 G 派彩。这是硬前置，不是建议。

## 3. 双币经济

### 3.1 ore：固定无限参与激励

ore 的定位：

- 固定、无限、免费 engagement 层。
- 通过答题或基础动作得到，不从奖池扣。
- 必须有 sink：建造、攻击、维护、民心/衰减、旧兼容动作。
- 计分必须降权，不能像当前公式那样线性吃满 ore。

现状：

- `orePool` 是 agent 级池（`contracts/src/GameEngine.sol:82-83`）。
- 初始 agent 获得 200 ore（`contracts/src/GameEngine.sol:261-263`）。
- harvest 把所有 hex 产出汇入 ore pool，并受 `MAX_ORE_POOL=1000` 限制（`contracts/src/GameEngine.sol:25-30`、`contracts/src/GameEngine.sol:293-310`）。
- build 消耗 ore：mine 50、arsenal 100（`contracts/src/GameEngine.sol:27-28`、`contracts/src/GameEngine.sol:344-370`）。
- attack/raid 消耗 arsenal 与 ore，成功偷取 defender 30% ore（`contracts/src/GameEngine.sol:375-447`、`contracts/src/GameEngine.sol:623-688`）。
- 当前 score 是 `hexes*100 + ore + buildings*50`（`contracts/src/GameEngine.sol:494-506`），demo 也复制了这个公式（`demo/index.html:163-164`、`demo/index.html:937-940`）。

建议 score v1：

```text
score =
  territoryScore
  + buildingScore
  + reputationScore
  + accuracyScore
  + oreScore

territoryScore = hexCount * 100
buildingScore  = activeBuildings * 50
reputationScore = max(0, chronicleScore) * 25
accuracyScore = answeredResolvedCount == 0 ? 0 : floor(100 * correctAnswers / answeredResolvedCount)
oreScore = min(200, floor(sqrt(orePool) * 10))
```

理由：保留领地/建筑主轴，把 ore 从线性爆分改成 sqrt 或封顶。当前 `MAX_ORE_POOL=1000` 虽然有 cap（`contracts/src/GameEngine.sol:26`），但线性 score 仍让免费 faucet 过度影响排名；owner 已拍板 ore 必须降权。

### 3.2 G：稀缺价值层

G 的定位：

1. 预测市场计价：高难度预测市场用 G parimutuel，不再用 ore 做价值押注。
2. 分层行动费：价值行动付 G 给中心 `World` 金库；简单挖矿题 difficulty 0 默认 0 费或近 0 费。
3. on-ramp：`depositG` 由 agent owner 存入 native G（`contracts/src/GTreasury.sol:100-107`）。
4. 金库 seed 事件：协议 surplus / eventPrizePool 达阈值后，World 触发矿潮、boss、世界杯奖池等世界事件。

G 侧的两条硬不变量（与 §4 的 ore→G 不变量并列，不可破）：

- **硬不变量 H1：G 市场池无 cap。** G parimutuel 派彩、auction 分配、event prize pool 派发**绝不能套用任何 ORE 池 / `MAX_ORE_POOL` / `ORE_POOL_CAP` 之类的 cap clamp**。现 demo 的 `resolveMarket` 把派彩 clamp 到 `ORE_POOL_CAP=1000` 并把溢出标 `wasted`（`demo/index.html:575-584`，常量 `demo/index.html:143`），这是 ore-native 行为；G 路径下任何 clamp 都会静默吞掉真人派彩，必须禁止。
- **硬不变量 H2：金库会计闭合。** `creditG`/`spendG` 与 escrow / eventPrizePool 的记账必须满足 §6.3 的会计不变量；market/event 资金不得被当成 surplus 提走（细节见 §6.3）。

可持续性假设（默认 A 不能悬空）：金库 seed 世界事件用的 G **只能来自「价值层 action fee + 市场 rake + on-ramp `depositG` 注入」**，绝不来自裸 mint（呼应 §4 ore→G 不变量）。在默认 A（简单挖矿 difficulty 0 题 `feeG=0`，见 §11 第 1 条与 §10.3）下，金库 G 的唯一 inflow 就是这三项。因此**下限条件：单位时间 G inflow（fee + rake + on-ramp）≥ 事件 seed outflow 时才触发世界事件；不足则事件延后或缩水（按已积累的 `eventPrizePoolG` 余额封顶），不得为了触发事件而透支或 mint G**。这条把「金库 seed 所有世界事件」（§3.2 第 4 条 / §5.2）与「difficulty 0 题零费」（§11 第 1 条 / §10.3）之间的缺口显式钉死。

现状：

- `GTreasury` 已维护 `gBalance` 和 `totalOutstandingG`（`contracts/src/GTreasury.sol:21-30`）。
- `spendG` 扣 agent G 并降低 outstanding，余额变成 protocol surplus（`contracts/src/GTreasury.sol:109-122`）。
- `creditG(market_sale)` 当前唯一真实调用方是 `CardLedger.buyListed`（`contracts/src/CardLedger.sol:131-132`）：买家 `spendG(...,"market_buy")` 与卖家 `creditG(...,"market_sale")` 等额成对，`totalOutstandingG` 跨这笔撮合净额不变——这印证「creditG 守恒对卡牌二级市场成立、对 `bootstrapMarket` 的裸 mint 不成立」。
- `surplusG` 当前按 native balance 减 outstanding 计算（`contracts/src/GTreasury.sol:165-169`）。
- Arena 已有 G 消费：买卡用 `arena_buy` 工具（`mcp-server/src/tools.ts:630-641`）并在合约中 `spendG(..., "arena_buy")`（`contracts/src/ArenaEngine.sol:283`）；roll 用 `spendG(..., "arena_roll")`（`contracts/src/ArenaEngine.sol:396`）。
- MCP 已有 `arena_get_treasury` 只读工具，能看 surplus/outstanding/mode（`mcp-server/src/tools.ts:822-830`、`mcp-server/src/chain.ts:1099-1115`）。

### 3.3 两币流向图

```text
G value layer
------------
on-ramp depositG
  -> player G balance
      -> bet G into market pool
          -> payout G to winners
      -> pay action fee to World
          -> World / GTreasury protocol surplus
              -> protocolBurn
              -> eventPrizePool
                  -> seed world event / market prize pool

ore engagement layer
--------------------
answer question / faucet / harvest
  -> fixed ore reward
      -> ore sinks: build / attack / maintenance / morale / legacy compatibility
      -> score contribution: sqrt or capped, never linear dominant
```

## 4. ore -> G 单向不变量

不可破不变量：

> ore 永远不能兑换 G。唯一允许跨向是 G -> ore，即付 G 参与行动、完成题或触发 faucet 后得到固定 ore。若要做 ore -> G，只能通过供给封顶拍卖，且 auction G 来源必须是预先封顶的 eventPrizePool 或 protocol allocation，不得由 burn ore 临时 mint。

### 4.1 强制方式

不变量针对的是 *无 backing 的 G mint*：凭空 `+=` 出新 G 余额而无等额 native 入金或等额 G 扣减的路径才被禁；由等额 spend 守恒触发的撮合 credit 不在禁止之列。

1. `World` 不提供 `convertOreToG`、`burnOreForG`、`claimGFromOre`。
2. 所有能增加 agent G 的路径必须过审计清单（G 入口侧）：
   - `GTreasury.depositG`：agent owner 付 native value，增加 `gBalance` 与 `totalOutstandingG`（`contracts/src/GTreasury.sol:100-107`）。
   - `GTreasury.fundAgentG`：testnet faucet，owner-only 且 `faucetEnabled` gate（`contracts/src/GTreasury.sol:91-98`）。
   - `GTreasury.creditG`：operator-only，当前无 reason allowlist，必须收紧为 World-only 或 allowlisted module-only（`contracts/src/GTreasury.sol:124-130`）。
   - `ArenaEngine.bootstrapMarket` 当前在 testnet faucet 模式下调用 `creditG(seedAgentId, 500 G, "market_seed")`（`contracts/src/ArenaEngine.sol:756-766`），是「凭空 mint 500 G」的先例；迁移后应改为 `World.seedEventPool` 或显式 testnet-only seed，不应成为任意模块 mint G 的先例。
   - MCP `creditAgentG` 已刻意调用 faucet-gated `fundAgentG`，不用裸 `creditG`（`mcp-server/src/chain.ts:1081-1088`）；这条约束要保留。
3. 「无限 ore」侧的真实 mint 面（全在 `GameEngine`）必须点名审计，**World 化后这些 ore-mint 函数绝不能成为任何 `creditG` 的触发器**：
   - `harvest` / `_harvestAll` / `_harvestHex`：lazy 产出新 ore 入 `orePool`（`contracts/src/GameEngine.sol:288-337`）。
   - capture 偷 ore：attack 成功把 defender 30% ore 转给攻击者（`contracts/src/GameEngine.sol:424-427`），raid 同样（`contracts/src/GameEngine.sol:671-674`）。
   - debate 派彩 + oracle 10% ore tax：`resolveDebate` 向赢家/oracle 增 ore（`contracts/src/GameEngine.sol:858-891`）。
   - incite respawn：翻盘成功给 200 ore（`orePool[agentId] = STARTING_ORE`，`contracts/src/GameEngine.sol:604`）。
4. `creditG` reason 必须枚举化并记录：
   - `deposit` 不走 `creditG`，继续走 payable `depositG`。
   - `market_sale`：**白名单允许**——这是卡牌二级市场撮合 credit，由等额 `market_buy` spend 守恒触发（`contracts/src/CardLedger.sol:118-132`），不是凭空 mint，故不受 ore→G 不变量约束。收紧 `creditG` 时必须保留这条，否则会误杀现有卡牌二级市场。
   - `market_payout`：只允许由 `World` 对 locked pool 派彩。
   - `event_reward`：只允许由 `World` 对预先 funded eventPrizePool 派发。
   - `refund`：只允许返还已 escrow 的 G。
   - 禁止 `ore_burn`、`ore_exchange`、`score_reward`，以及未守恒的 `market_seed` 裸 mint 等 reason。
5. 合约测试必须断言：
   - 任意 ore burn / spend / build / attack / harvest 路径不会调用 `creditG`。
   - 上述 ore-mint 函数（harvest / capture / debate payout / incite respawn）执行后 `gBalance` 与 `totalOutstandingG` 不变。
   - `World` 之外地址调用 `creditG` 失败（`market_sale` 走 CardLedger 这一已授权 operator 路径不受影响）。
   - auction 分配 G 的总额小于等于 auction 创建时锁定的 `supplyCapG`。

### 4.2 唯一例外：供给封顶拍卖

允许的 ore -> G 例外只有“供给封顶拍卖”：

- 创建 auction 时先锁定固定 `auctionSupplyG`，来源是 protocol surplus 分配或 owner seed，不是烧 ore 后 mint。
- **拍卖 G 必须先从已有 backing 的池子（`eventPrizePoolG` / surplus）实扣并转入 auction escrow**，再由结算从该 escrow 派发；**不得用裸 `creditG` 凭空 mint**（`creditG` 是无 backing 的纯 `+=`，`contracts/src/GTreasury.sol:126-130`；`bootstrapMarket` 的「凭空 mint 500 G」即反面先例，`contracts/src/ArenaEngine.sol:766`）。即 `auctionSupplyG ≤` 转入时实扣的 backed 池余额，全程不新增 G 总供应。
- “owner seed”必须限定为 native-backed deposit 或 locked allocation（已实扣进 escrow 的 G），**不得**用 faucet 模式的 `fundAgentG`（`contracts/src/GTreasury.sol:91-98`）或 `bootstrapMarket→creditG`（`contracts/src/ArenaEngine.sol:766`）那种 unbacked G 充当 seed。
- 玩家用 ore 出价，赢家按排名/比例分得这批已存在 G。
- 未中标 ore 是否 burn、refund 或进 sink 是经济参数；但 G 总供应不因 ore 出价增加。

## 5. 可扩展事件 / 市场

### 5.1 注册式扩展接口

`World` 只内置统一 `Question`、G escrow、treasury accounting、permission 与 settlement hooks；具体题型由注册模块扩展：

```solidity
interface IWorldExtension {
    function extensionId() external view returns (bytes32);
    function supportsKind(uint8 kind) external view returns (bool);

    function validateQuestion(bytes calldata data) external view returns (bool);
    function quoteFeeG(bytes calldata data, uint16 difficulty) external view returns (uint256);
    function resolve(uint256 questionId, bytes calldata data) external returns (bytes32 outcome);
}

interface IWorldExtensionRegistry {
    event ExtensionRegistered(bytes32 indexed extensionId, address indexed module, bool enabled);
    function registerExtension(bytes32 extensionId, address module) external;
    function setExtensionEnabled(bytes32 extensionId, bool enabled) external;
}
```

注册约束：

- `MATH` extension 不得读取外部 mutable state。
- `STATE` extension 只能通过 `World` 暴露的状态接口读写，不能绕回旧 `GameEngine` 直写入口。
- `ORACLE` extension 必须声明 resolver、grace、refund、dispute 参数。
- 所有 G pool 都在 `World` / `GTreasury` 记账，module 不直接 custody G。

### 5.2 demo 样例

1. 世界杯冠军 ORACLE 市场
   - `kind=ORACLE`，`currency=G`，`difficulty=900`。
   - resolver 是 owner 指定 oracle / multisig。
   - 用户下注“冠军队”，G 进入 parimutuel pool。
   - 超时未裁决则可退款；争议期 OPEN。

2. 矿潮 Ore Rush
   - `kind=STATE`，`currency=NONE` 或低额 G fee，`difficulty=100`。
   - 触发条件：World treasury 的 eventPrizePool 达阈值。
   - 效果：一段时间内特定 ring/hex 的 difficulty 0 ore faucet 奖励提高，或 mine 产出 multiplier 提高。
   - 现状映射：`GameEngine` 现在 mine 产出由 `BASE_ORE_PER_SEC` 与 `ORE_PER_MINE_PER_SEC` 常量决定（`contracts/src/GameEngine.sol:29-30`、`contracts/src/GameEngine.sol:320-334`），迁移后这类参数应从 World event modifier 读取。

3. Boss 入侵
   - `kind=STATE` + staged RNG，`currency=G` 可选行动费，`difficulty=700`。
   - 玩家回答/下注“出兵、防守、补给”；World lock 后用 VRF/commit-reveal 决定 boss 行动，按贡献派 event prize pool。
   - 现状映射：attack/raid 当前直接用 `block.prevrandao` 做随机数（`contracts/src/GameEngine.sol:414`、`contracts/src/GameEngine.sol:663`），高价值 boss 必须迁到分阶段 RNG。

## 6. 中心 World 合约接口草案

### 6.1 Solidity interface 骨架

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWorldQuestion {
    enum QuestionKind { MATH, STATE, ORACLE }
    enum Currency { NONE, ORE, G }
    enum QuestionStatus { OPEN, LOCKED, RESOLVED, CANCELLED }

    struct Question {
        uint256 id;
        QuestionKind kind;
        uint16 difficulty;
        Currency currency;
        uint256 stake;
        uint64 resolveAt;
        address resolver;
        bytes32 poolId;
        QuestionStatus status;
    }

    event QuestionCreated(
        uint256 indexed questionId,
        QuestionKind indexed kind,
        Currency currency,
        uint16 difficulty,
        bytes32 indexed poolId,
        uint64 resolveAt,
        address resolver
    );

    event QuestionAnswered(
        uint256 indexed questionId,
        uint256 indexed agentId,
        address indexed actor,
        bytes32 answerHash,
        uint256 stake,
        Currency currency
    );

    event QuestionLocked(
        uint256 indexed questionId,
        bytes32 stateSnapshotHash,
        uint64 lockedAt
    );

    event QuestionResolved(
        uint256 indexed questionId,
        bytes32 outcome,
        uint256 payoutPool,
        bool cancelled
    );

    event WorldEventTriggered(
        bytes32 indexed eventId,
        uint256 indexed sourceQuestionId,
        uint256 prizePoolG,
        bytes data
    );

    function createQuestion(
        QuestionKind kind,
        uint16 difficulty,
        Currency currency,
        uint256 stake,
        uint64 resolveAt,
        address resolver,
        bytes32 poolId,
        bytes calldata questionData
    ) external returns (uint256 questionId);

    function answer(
        uint256 questionId,
        uint256 agentId,
        bytes32 answerHash,
        bytes calldata answerData
    ) external payable;

    function bet(
        uint256 questionId,
        uint256 agentId,
        bytes32 outcome,
        uint256 amountG,
        uint256 maxFeeG,
        bytes calldata permitOrSig
    ) external payable;

    /// @notice Freeze a question's contested state before RNG finalize. Snapshots
    ///         target/source owner, arsenal counts, agent location, cooldown into
    ///         stateSnapshotHash; OPEN -> LOCKED. RNG/resolve must read the snapshot,
    ///         not live state. Required for any money-staked STATE question.
    function lock(uint256 questionId, bytes calldata lockData) external;

    function resolve(uint256 questionId, bytes calldata resolutionData) external;

    function claimPayout(uint256 questionId, uint256 agentId) external returns (uint256 orePaid, uint256 gPaid);

    function getQuestion(uint256 questionId) external view returns (Question memory);

    function treasury() external view returns (
        address gTreasury,
        uint256 protocolSurplusG,
        uint256 protocolBurnG,
        uint256 eventPrizePoolG
    );
}
```

接口原则：

- `answer` / `bet` 必须自己校验 `agentId` 控制权，不能因 `World` 是全局 operator 就替任意 agent 花钱。旧 C1 方案已指出这个坑：一旦市场被 `AgentRegistry.addOperator` 授权，若复用 operator 判断会放行任意 caller；`AgentRegistry` 现有 `canControlAgent` 是 modifier，不是可外部传 caller 的函数（`contracts/src/AgentRegistry.sol:45-48`、`docs/dev-breakdown.md:320-340`）。
- 注意 `_isOperator` 实为 `addr == operator || operators[addr] || addr == owner()`（`contracts/src/AgentRegistry.sol:36-38`），**合约 owner 也恒过 gate**。所以 `canControlAgent` 不只是「全局 operator 或 agent owner」，还包含「合约 owner」；收紧校验时必须把「owner 也恒过 `canControlAgent`」一并考虑——这正是 dev-breakdown C1 所警告「market 自己是 operator 则 modifier 恒真」的同源坑（owner/operator 任一恒真都会放行任意 caller 替他人花钱）。
- `bet` 的 G custody 优先用 EIP-712 permit / escrow，而不是让 World 无限 operator 花 agent G。当前 `GTreasury.spendG` 是 operator-only（`contracts/src/GTreasury.sol:117-122`），这在 World 统一后风险更大。
- `treasury()` 必须把 `protocolSurplusG`、`protocolBurnG`、`eventPrizePoolG` 拆开，不能只返回旧 `surplusG`。

### 6.2 Router 增 world 槽位

Router 目标：

- 在 `cardLedger` 后 append `address public world;`。
- 新增 `setWorld(address)`。
- 新增 `getAddressesV4()`（**定名 `getAddressesV4()`，续 V1/V2/V3 阶梯，不用 `getAddressesVWorld()`**），返回 V3 九项 + world，共 10 项。
- 不扩展旧 `getAddresses` / V2 / V3，保持 ABI 兼容。现有 Router 注释已明确旧 getter 不要扩签名（`contracts/src/Router.sol:55-57`）。
- **对接同步**：MCP resolver 依赖确定的 ABI 字符串（`mcp-server/src/chain.ts:90-97` 的 `ROUTER_ABI` 与 V3/V2/V1 解析阶梯），需在 `ROUTER_ABI` 加 `getAddressesV4` 串并把解析阶梯前置到 V4；前端 F7 的 Router resolver 同步加 V4 tuple。`getAddressesV4()` 这个名字一旦定下，D（MCP）/F7（前端）必须用同名。

现状锚点：

- 当前 Router 槽位止于 `cardLedger`（`contracts/src/Router.sol:10-21`）。
- setter 止于 `setCardLedger`（`contracts/src/Router.sol:45-53`）。
- V3 getter 返回 registry/ledgers/game/evaluation/arena/gTreasury/cardLedger（`contracts/src/Router.sol:85-108`）。
- `mcp-server/src/chain.ts` 当前只解析 Router V3/V2/V1（`mcp-server/src/chain.ts:90-97`、`mcp-server/src/chain.ts:260-298`），D lane 需要同步 resolver。

### 6.3 GTreasury 复用与补账

复用：

- 保留 `depositG` / `withdraw` 的 backing invariant（`contracts/src/GTreasury.sol:100-107`、`contracts/src/GTreasury.sol:134-146`）。
- 保留 `spendG` 作为“agent G -> protocol surplus”的动作费底座（`contracts/src/GTreasury.sol:109-122`）。
- 保留 `surplusG` view 作为旧兼容（`contracts/src/GTreasury.sol:165-169`）。

必须补：

- `uint256 public protocolBurnG;`
- `uint256 public eventPrizePoolG;`
- `event ProtocolBurnAccounted(uint256 amountG, bytes32 reason);`
- `event EventPrizePoolFunded(bytes32 indexed eventId, uint256 amountG);`
- `function allocateSurplus(uint256 burnG, uint256 eventPoolG, bytes32 reason) external onlyWorld;`
- `function escrowG(agentId, amountG, questionId)` / `releaseEscrowG` / `payoutEscrowG`，或 `World` 内部账本，但不能让 module 直接 `creditG`。

会计不变量（必须随 escrow/eventPrizePool 一起落地，否则市场/事件资金会被当 surplus 提走）：

- **会计不变量 A1：`nativeBalance >= totalOutstandingG + escrowG + eventPrizePoolG + protocolBurn 暂存`。** 当前 `spendG` 会降 `totalOutstandingG`，使被花掉的 native 余额变成 surplus（`contracts/src/GTreasury.sol:117-122`）；`withdrawSurplus`/`surplusG` 把 `surplusG = balance - totalOutstandingG` 全部视为可提（`contracts/src/GTreasury.sol:151-169`）。一旦把 G market/event 资金留在合约里，这些资金会落进 `surplusG` 被 owner 提走。
- **会计不变量 A2：`surplusG`/`withdrawSurplus` 必须排除 `escrowG + eventPrizePoolG`（及 protocolBurn 暂存）。** 即改为 `surplusG = balance - totalOutstandingG - escrowG - eventPrizePoolG - protocolBurnPending`，否则市场/事件奖池会被当 surplus 提走，违反 §3.2 的硬不变量 H2。

注意：当前 `creditG` 是 operator-only 裸入口（`contracts/src/GTreasury.sol:124-130`），统一 World 后必须收紧为 World-only 或 module allowlist（卡牌二级市场的 `market_sale` 守恒 credit 经 CardLedger 这一已授权 operator 路径放行，见 §4.1），否则任何全局 operator 都能新增 G 余额。MCP 当前 admin faucet 已选择 `fundAgentG` 而不是裸 `creditG`（`mcp-server/src/chain.ts:1081-1088`），这是正确方向。

### 6.4 AgentRegistry 补 per-agent delegation / permit

现状：

- `AgentRegistry` 有单一 `operator`（`contracts/src/AgentRegistry.sol:19`）和全局 `operators` mapping（`contracts/src/AgentRegistry.sol:24`）。
- `addOperator/removeOperator` 是 owner-only 全局权限（`contracts/src/AgentRegistry.sol:66-69`）。
- `canControlAgent` 只认全局 operator 或 `agentOwner[agentId]`（`contracts/src/AgentRegistry.sol:45-48`）。
- `docs/dev-breakdown.md` 已把 per-agent delegation 作为条件任务 A3（`docs/dev-breakdown.md:39-43`、`docs/dev-breakdown.md:215`）。

目标：

- `mapping(uint256 => mapping(address => Delegation)) public agentDelegates;`
- `delegateAgent(agentId, delegate, scope, expiresAt)`：owner 调用。
- `revokeAgent(agentId, delegate)`：owner 调用。
- `permitAgentAction(agentId, actionHash, deadline, sig)`：EIP-712 单动作授权。
- `isAgentDelegate(agentId, actor, scope)` view，供 `World.answer/bet` 校验。

默认落地建议：优先 per-action permit + scoped delegation，少用全局 operator。全局 operator 仍可保留给 keeper / emergency / local testnet，但不应成为真人 G 押注和 World 行动的长期授权模型。

### 6.5 现有合约 file:line 对照

| 目标能力 | 当前落点 | 迁移含义 |
|---|---|---|
| 主世界状态 | `GameEngine` 持有 registry/ledgers 引用（`contracts/src/GameEngine.sol:15-18`）、hex/ore/debate storage（`contracts/src/GameEngine.sol:63-112`） | `World` 接管新状态源；旧 `GameEngine` 变 legacy facade 或迁移模块 |
| ore faucet | `harvest` + `_harvestAll`（`contracts/src/GameEngine.sol:288-310`） | 包成 difficulty 0 MATH/STATE question |
| ore sink | `build` 扣 50/100 ore（`contracts/src/GameEngine.sol:344-370`），attack/raid 扣 ore（`contracts/src/GameEngine.sol:406-407`、`contracts/src/GameEngine.sol:655-656`） | sink 保留，但入口从 `World.answer` 进入 |
| RNG | attack/raid/incite 使用 `block.prevrandao`（`contracts/src/GameEngine.sol:414`、`contracts/src/GameEngine.sol:577`、`contracts/src/GameEngine.sol:663`），Arena roll/matchmaking 也用 `prevrandao`（roll seed `contracts/src/ArenaEngine.sol:399`、matchmaking shuffle `contracts/src/ArenaEngine.sol:548`） | 高价值 question 必须 lock -> finalize RNG -> resolve |
| G treasury | `depositG/spendG/creditG/surplusG`（`contracts/src/GTreasury.sol:100-130`、`contracts/src/GTreasury.sol:165-169`） | 复用底座，补 burn/event pool/escrow 账 |
| Router | V3 到 `cardLedger`（`contracts/src/Router.sol:85-108`） | P lane 改为 world 槽位 |
| MCP 工具 | 主世界 `harvest/build/raid`（`mcp-server/src/tools.ts:131-190`），debate 工具（`mcp-server/src/tools.ts:401-470`），G treasury 工具（`mcp-server/src/tools.ts:822-830`） | D lane 改为 `answer_question/get_treasury/get_world_events` |
| demo | `StoreProvider` 只有 markets/positions 等（`demo/index.html:454-496`、`demo/index.html:590-603`） | 增加 questions/worldTreasury/worldEvents |

## 7. 迁移路径（分期）

每期都必须能独立 land；不要一次性重写全部主世界。

### Phase 0：只加 World skeleton + Router slot，不接管行为

交付：

- 新建 `World` / `IWorldQuestion`，只支持创建只读 mock question 和 treasury view。
- Router append `world` 槽位；旧 getter 不变。
- MCP / demo 可读 `get_question/get_treasury`，但旧动作仍走 `GameEngine`。

验收方向：

- 旧 `harvest/build/raid/debate` 测试全部不变。
- Router legacy getter decode 不变，V4 能读 world。
- `World.treasury()` 能读 `GTreasury.surplusG()` 兼容旧账（`contracts/src/GTreasury.sol:165-169`）。

### Phase 1：harvest/build 平滑包装成 difficulty 0 MATH/STATE faucet

映射：

- `harvest(agentId)` -> `createQuestion(kind=MATH|STATE,difficulty=0,currency=ORE,stake=0)` -> `answer` -> 固定 ore reward / lazy harvest credit。
- `build(agentId, hexKey, buildingType)` -> `answer` 一个 STATE action，仍扣 ore sink。

现状锚点：

- `harvest` permissionless，任何人可直接调（`contracts/src/GameEngine.sol:288-290`），World adapter 包装不需要额外授权。
- `_harvestAll` 计算产出并 cap 到 1000（`contracts/src/GameEngine.sol:293-310`）。
- `build` 由 `canControlAgent` gate（`contracts/src/GameEngine.sol:344-345`）：World 要替 agent 调 `build` 必须先成为该 agent 的合法控制者（全局 operator，或走新 per-agent delegation / permit），否则 `build` 直接 revert。

DoD：

- 用户可继续点 Harvest / Build，不感知题结构。
- 事件改发 `QuestionAnswered` + legacy `Harvested/Built` 可选兼容。
- difficulty 0 默认零 G 费；OPEN：基础 ore 循环是否完全免费见 §11。
- **授权前置（必须先满足才能接管 build）**：World 已被授权控制目标 agent（全局 operator 或 per-agent delegation/permit，见 §6.4 / §10.2）；否则包装后的 `build` 会因 `canControlAgent` revert。`harvest` permissionless 无此前置，可注明。

### Phase 2：attack/raid 重写为分阶段 RNG 结算

映射：

```text
create/answer attack question
  -> commit payload and escrow ore/G fee
  -> lock at resolveAt  (snapshot contested state)
  -> finalize RNG via VRF or commit-reveal
  -> resolve STATE battle (against the snapshot)
  -> payout / capture / morale
```

现状锚点：

- `attack` 当前一次 tx 内查位置/owner/cooldown → 扣 arsenal/ore → 立即 `prevrandao` RNG + 改 `target.ownerId`（`contracts/src/GameEngine.sol:388-447`）。
- `raid` 当前 live 选 bestSource、移动 agent，并一次 tx 内完成同样流程（`contracts/src/GameEngine.sol:631-688`）。
- `inciteRebellion` 当前也用 `prevrandao` 50%（`contracts/src/GameEngine.sol:563-606`）。

**状态锁定快照规格（必须随分阶段一起实现）**：把单 tx 流程拆成 open → lock → finalize → resolve 三段，并在 `lock` 这一步固化全部争用状态，避免「commit 与 resolve 之间状态漂移」：

1. open / answer：commit payload（target/source、arsenalSpend、oreSpend），escrow ore/G fee。
2. **lock（`IWorldQuestion.lock` + `QuestionLocked` 事件）**：快照 `target.ownerId`、`source.ownerId`、`source.arsenalCount`（raid 还要快照所选 bestSource）、攻击方 agent location（`registry.getAgent` 的 loc，对应现 `contracts/src/GameEngine.sol:393-394`）、`attackCooldown[agentId][targetHexKey]`（现 `:396-397`/`:650-651`），以及参战双方 arsenal/defense；OPEN → LOCKED。
3. finalize RNG：对 LOCKED 快照取随机（VRF / commit-reveal），不再读 live state。
4. resolve：用快照而非现场状态结算 Tullock。**必须处理「resolve 时目标所有权已变」**：若 `target.ownerId` 已不是 lock 时的快照 owner（已被他人夺取或已 rebel 成 neutral），则该 question 作废退款（escrow 全退、不改 owner），不能照旧把 hex 判给攻击者。

DoD：

- money-staked / G fee / event prize 的战斗不再直接依赖 `block.prevrandao`，且不再在单 tx 内 live 读改 owner。
- `lock` 已快照 target/source owner、arsenal、agent location、cooldown；resolve 读快照；目标所有权在 lock 后变更时走退款分支。
- 低价值本地 demo 可保留 deterministic mock，但真实合约路径必须 staged + locked。
- Arena RNG 同步进入全局 RNG 服务，不再只做 B lane 内局部修补。

### Phase 3：debate 迁成 ORACLE/STATE question

映射：

- 普通 debate：`kind=STATE`，结果来自投票 tally，可影响 happiness。
- Oracle debate：`kind=ORACLE`，resolver 是 oracle / owner / adjudication module；G market 使用 `bet`。
- 旧 ore debate 下注只作为 legacy mode，不再扩展。

现状锚点：

- debate storage 与 ore betting 绑在 `GameEngine` 内（`contracts/src/GameEngine.sol:88-112`）。
- Oracle debate duration / min-max / tax 都是常量（`contracts/src/GameEngine.sol:48-55`）。
- `resolveDebate` 同时改 happiness、结算 ore、oracle tax、退款（`contracts/src/GameEngine.sol:804-895`）。
- `expireDebate` 超时退款存在，但只适用于 oracle debate（`contracts/src/GameEngine.sol:897-911`）。

DoD：

- `start_debate/vote_debate/resolve_debate` 工具仍可保留 alias，但内部走 `create_question/answer_question/resolve_question`。
- ORACLE market 用 G 池，不用 ore 池。
- 超时退款和 dispute 字段写入 `Question`/module。

### Phase 4：旧 GameEngine 直写入口 legacy -> 冻结

策略：

- 新部署：`GameEngine` 不再暴露直接写入口给用户；只允许 `World` 调用 legacy adapter 或迁移后的内部库。
- 已部署 UUPS：加 `legacyWritesFrozen` storage flag；owner 逐步冻结 `harvest/build/attack/raid/debate` 外部直写，先在 MCP/agent-runner 切流后开启。
- **UUPS 升级只能 append flag，无法真正隐藏旧外部函数**：被冻结的函数仍在 ABI 里、仍可被调用，只是进入后 revert。因此 freeze 是「调用即 revert」而非「函数消失」。
- **统一 freeze 会连 World adapter 一起挡住**：`legacyWritesFrozen` 若简单地 gate 所有外部写，会把 `World` 经 legacy adapter 的合法调用也 revert。必须给 `world` 开 allowlist（freeze 后仍放行 `msg.sender == world`），或 Router 查询放行（adapter 调用前从 Router 解析 `world` 并比对）。注意现有 gate `canControlAgent`/`_isOperator` 只认 operator/owner（`contracts/src/GameEngine.sol:173-178`），不天然认 `world`，需显式补 world allowlist。
- 保留只读接口 `getHex/getWorld/getScore` 到新 World adapter，减少前端迁移风险。

现状锚点（真正受冻结影响的是 MCP + agent-runner，不是前端）：

- MCP 工具目前直接调用 `chain.harvest/build/attack/raid`（`mcp-server/src/tools.ts:131-192`）；冻结后这些工具直调链会 revert，**agent-runner 的自主循环随之停摆**（agent-runner 经 MCP 发这些动作）。
- 现真实前端是**纯只读、无写链**（`docs/dev-breakdown.md:22`），没有「前端切流」这回事；冻结的破坏面集中在 MCP server + agent-runner，必须先把这两条切到 World alias 再 freeze。
- demo 手动 quick actions 仍呈现 Harvest/Build/Raid（`demo/index.html:1244-1275`、`demo/index.html:1344-1357`），但 demo 是 mock，不直连链。

DoD：

- 旧直接写入口在 freeze 后 revert 且错误可读。
- `world` allowlist（或 Router 放行）已生效：freeze 后 `World` 经 legacy adapter 的调用不被误挡。
- MCP 工具 + agent-runner 自主循环已切到 World alias 后再开 freeze。
- World 入口覆盖所有原动作。
- 事件/索引/前端读路径保持兼容或有迁移 adapter。

## 8. 对 `docs/dev-breakdown.md` 的 Lane 重构骨架

本节是本设计稿驱动的 `docs/dev-breakdown.md` Lane 重构骨架。**重构前**，dev-breakdown 的 Lane C 是“预测市场（全新独立合约）”、文件域指向 `contracts/src/PredictionMarket.sol`，P lane 围绕 `predictionMarket` 槽位。**该重构现已落地于 dev-breakdown**（Lane C 已为 World-as-Market Core C0-C8、P 槽位已为 `world`），下文记录其骨架与文件域重写依据，便于追溯；具体工单以 `docs/dev-breakdown.md` 现状为准。

### 8.1 Lane C 作废并升级为 World-as-Market Core

旧：

- Lane C = `PredictionMarket` 新合约。
- C1-C3 = interface、自结算市场、Oracle 市场。
- D1/E4/F8 都接 `PredictionMarket`。

**文件域 owner 重写（不是「升级 Lane C」）**：原 dev-breakdown 里 Lane C 只独占新建 `contracts/src/PredictionMarket.sol` 与其 interface/test，**明确不碰 Router/Deploy/GameEngine，只读 GameEngine 经 `spendOre/refundOre` 钩子动 ore**（`docs/dev-breakdown.md:50`，即文件域表的 C 行）。新 C0..C8 含 G escrow、harvest/build adapter、G parimutuel、ORACLE refund/dispute、World event registry，会触碰 `GTreasury`/`GameEngine`/`Router`/MCP，**早已越出原 Lane C 的独占文件域**。因此这是对 dev-breakdown 文件域归属的**重写**：World Core 需要重新分配 `GTreasury`/`GameEngine`/`Router`/MCP 的 owner（与 P/A/D lane 重新对齐互斥），而非在旧 Lane C 边界内加任务。

新：

| 任务 | 名称 | DoD 方向 |
|---|---|---|
| C0 | 机制规格 + 不变量落库 | World spec 与 invariant skeleton 可编译；禁止 ore -> G、G pool no cap、score guard、freeze guard 都有测试锚点 |
| C1 | `IWorldQuestion` 状态机：OPEN/LOCKED/RESOLVED/CANCELLED + `QuestionLocked` | `Question` storage/events 可用；非法状态转换拒绝；money-staked STATE 必须 lock 并写 snapshot hash |
| C2 | MATH/STATE faucet 包装 `harvest/build` | `answer_question` 可跑通 harvest/build；ore mint/sink 不改 G accounting；agent owner/delegate/permit 校验生效 |
| C3 | combat 分阶段 RNG + 状态锁定快照 | attack/raid/incite 经 lock snapshot + entropy resolve；target owner drift 时 cancel/refund；trace 可回放 |
| C4 | treasury + G 会计不变量（escrow/tax/burn/event pool） | GTreasury 有 escrow/release/payout/refund 原语；surplus 排除 escrow/event pool；ore 路径不能 credit G |
| C5 | legacy 冻结迁移与兼容 alias checklist | D4 先切 MCP/runner alias；checklist 阻止过早 freeze；旧工具名默认映射 World |
| C6 | G parimutuel 通用市场模块（含 market type） | `create/betG/resolve/claimPayout` 用 G 计价；支持 market type；不接受 ore stake；G payout 无 ore cap |
| C7 | ORACLE resolver + 超时退款 + 争议 | resolver/proof、grace refund、dispute window/status 完整；超时可退全部 G escrow |
| C8 | World event registry 注册式扩展 | 事件类型可注册/触发/查询；treasury threshold 可触发 `WorldEventTriggered`；event prize pool 不动 agent escrow |

### 8.2 P 槽位：`predictionMarket` -> `world`

现 P lane 整条围绕 `predictionMarket` 槽位（P1 append slot + `getAddressesV4`，`docs/dev-breakdown.md:67-85`；P2 deploy/授权；P3a 地址解析；F7 前端 resolver）。替换范围要逐项改为 world，不只是改 P1 的 slot 名：

- **P1（slot/getter）**：append `world` 而非 `predictionMarket`；`setWorld` + `getAddressesV4()`（定名见 §6.2）返回 V3 九项 + world。
- **P2（部署/授权）**：deploy/upgrade 从 PredictionMarket proxy 改为 **World proxy + module registry + GTreasury wiring**（World 设为 `GTreasury` 的 onlyWorld/allowlisted module，并接 AgentRegistry delegation）。
- **P3a（地址解析）**：解析层从 `predictionMarket` 改为 `world`；MCP/前端的地址发现都指向 world。
- **F7（前端 resolver）**：前端 Router resolver 的 tuple/字段从 `predictionMarket` 改为 `world`，与 `getAddressesV4()` 对齐。
- `Router` 当前止于 cardLedger 的事实仍复用（`contracts/src/Router.sol:10-21`、`contracts/src/Router.sol:85-108`）。

### 8.3 A 核心：World 接管入口 + 冻结旧直写

- 当前 A lane 是 `GameEngine` 参数 storage 化、Achievement、可选 delegation（`docs/dev-breakdown.md:172-215`）。
- 新 A 核心改为：
  - A0：`GameEngine` legacy adapter 接口梳理。
  - A1：`harvest/build` World 入口接管。
  - A2：`attack/raid/incite` 分阶段接管。
  - A3：freeze legacy direct writes。
  - A4：score 公式迁移与 ore 降权。
- **原 dev-breakdown 的条件任务 A3（per-agent delegation，「仅 Auth 选 b 才做」，`docs/dev-breakdown.md:39-43`、`docs/dev-breakdown.md:215`）现升级为 World Core 强制前置**，不再是条件分支。理由：World 要替真人/agent 花 G 下注并执行 build/attack（`canControlAgent` gate，`contracts/src/GameEngine.sol:344-345`、`:173-178`），不能复用「全局 operator 即可控制任意 agent」的旧语义（见 §6.4 / §10.2 / 下文 #14）。delegation/permit 必须和 `AgentRegistry` 统一，排在 World 接管入口之前完成。

### 8.4 B 的 RNG 升级为全局

- 当前 B1 只写 Arena RNG 硬化（`docs/dev-breakdown.md:237`），但 GameEngine attack/raid/incite 也用 `prevrandao`（`contracts/src/GameEngine.sol:414`、`contracts/src/GameEngine.sol:577`、`contracts/src/GameEngine.sol:663`）。
- 新 B0 = 全局 randomness service：World STATE/ORACLE money-staked question、Arena matchmaking、Arena roll 都统一接入。
- Arena 现有 TODO 已明示 `prevrandao` 可 grind（`contracts/src/ArenaEngine.sol:545-548`）。

### 8.5 D 工具重命名

旧 D1 要做 `create_market/bet/resolve_market/list_markets/get_market`（`docs/dev-breakdown.md:413-431`）。

新 D 工具：

- `create_question`
- `answer_question`
- `bet_question`
- `resolve_question`
- `claim_payout`
- `get_question`
- `list_questions`
- `get_treasury`
- `get_world_events`

旧工具 alias：

- `create_market` -> `create_question(kind=STATE|ORACLE,currency=G)`
- `bet` -> `bet_question`
- `resolve_market` -> `resolve_question`

现状统一表述：MCP 中没有名为 `market` 的工具，但 `start_debate/vote_debate/resolve_debate`（`mcp-server/src/tools.ts:401-470`）**就是事实上的既有 ore 预测市场 API**——oracle debate 要求投票者押 ore，结算时赢家按支持/反对池分 losers 的 ore、oracle 抽 10% tax（`contracts/src/GameEngine.sol:854-891`）。因此这套重命名/迁移**会影响这个既有 ore 市场 API**，必须把 `start_debate/vote_debate/resolve_debate` 列为破坏面（与 §7 Phase 3「旧 ore debate 下注作 legacy」一致），而不是「无 market 工具、重命名不破坏 API」。迁移做法：保留这三个工具作 alias，内部转走 `create_question/answer_question/resolve_question`（见 §7 Phase 3 DoD）；ore debate 下注仅作 legacy mode，不再扩展，新 G 市场走 `bet_question`。

### 8.6 E4/F8：markets -> 问题流 + 金库 meter

- 当前 E4 是 `/markets` 前端 UX（`docs/dev-breakdown.md:741-762`）。
- 当前 F8 是观众态落地页 featured markets（`docs/dev-breakdown.md:1017-1036`）。
- 新 E4：`/questions` 或 `/markets` 仍可保留文案，但数据结构是 `Question`，详情页是 `QuestionModal`。
- 新 F8：Featured Markets 改成 Featured Questions + World Treasury meter + World Events ticker。
- demo 的现有落地页已展示 featured prediction markets（`demo/index.html:955-965`），可直接替换数据源和标题，不需要新增路由。

## 9. `demo/index.html` 改动清单

原则：六路由全保留，不新增路由。现有六个 hash route 是 World、My Agent、Markets、Arena、Lore、Onboard：TopBar 展示 World/My Agent/Markets/Arena/Lore（`demo/index.html:737-745`），Router 分发 `/onboard`、`/me`、`/markets`、`/arena`、`/lore`、`/`（`demo/index.html:2568-2578`）。

### 9.1 StoreProvider

现状：

- `StoreProvider` 定义路由、wallet、agent、ore/G、markets/positions、arena、ledger 等状态（`demo/index.html:454-496`）。
- context value 输出 `markets/positions/resolveMarket`，没有 questions/worldTreasury/worldEvents（`demo/index.html:590-603`）。
- seed markets 是旧 PredictionMarket 形状（`demo/index.html:176-231`）。

改动：

- 新增 `questions`：由旧 `seedMarkets()` 升级而来，字段改为 `id/kind/difficulty/currency/stake/resolveAt/resolver/poolId/status`。
- 新增 `worldTreasury`：`surplusG/protocolBurnG/eventPrizePoolG/nextTriggerAt/lastTriggeredEventId`。
- 新增 `worldEvents`：`[{id,type,title,triggeredAt,sourceQuestionId,prizePoolG,description}]`。
- `resolveMarket` 改名内部实现为 `resolveQuestion`，保留旧 `resolveMarket` alias 供现有按钮走通。

### 9.2 MarketDetail -> QuestionModal

现状：

- `Markets` 打开 `MarketDetail` modal（`demo/index.html:1714-1743`）。
- `MarketDetail` 只支持 YES/NO、ore stake、oracle fee、payout estimate（`demo/index.html:1747-1916`）。
- open positions/settled receipts 都以 ore 显示（`demo/index.html:1918-2005`）。

改动：

- 抽象为 `QuestionModal`：
  - Header 显示 `kind`、`difficulty`、`currency`、`status`。
  - `MATH/STATE` 显示 Answer card；`ORACLE` 或 high-difficulty STATE 显示 G bet panel。
  - `currency=G` 的池子显示 G，不再显示 ore 下注。
  - 保留真人文案“Market”作为 tab / route 名称，不新增 `/questions`。
- `MarketMiniCard` 继续可复用，但 `pool` 行从 ore 改为按 currency 显示（当前在 `demo/index.html:854-875`）。
- **不是只改显示**：`currency=G` 的市场，结算数学也要改成 G 路径——`settlePayout`/`estimatePayout`（`demo/index.html:240-253`）与 `poolYes/poolNo` 记账当前全是 ore-native，G 市场必须用 G 计价的池子，且**去掉 `ORE_POOL_CAP` clamp**（呼应 §3.2 硬不变量 H1）。

### 9.3 MyAgent quick actions -> 答题卡 + 难度条

现状：

- autopilot tick 模拟 harvest/build/scan/raid（`demo/index.html:1233-1248`）。
- 手动 quick actions 定义 `harvest/build/attack`（`demo/index.html:1252-1276`）。
- UI 直接显示 Harvest、Build mine、Raid、Bet（`demo/index.html:1344-1357`）。

改动：

- 保留按钮语义：Harvest、Build mine、Raid、Bet。
- 在 quick actions panel 内把每个按钮包装成 `QuestionActionCard`：
  - `Harvest`: `kind=MATH|STATE`、`difficulty=0`、`currency=ORE`、`G fee=0`。
  - `Build mine`: `kind=STATE`、`difficulty=50`、`currency=ORE`、`sink=50 ore`。
  - `Raid`: `kind=STATE`、`difficulty=600`、`currency=G/ORE mixed`、`requires RNG lock`。
  - `Bet`: 跳 Markets，但显示 `currency=G`。
- 增加难度条，不强制真人做算术弹窗，符合 owner 默认 UX。

### 9.4 payout 区增加 G 费 / 税可见

现状：

- modal payout 只展示 ore payout/profit（`demo/index.html:1882-1890`）。
- fee line 只有 oracle ore fee（`demo/index.html:1893-1900`）。
- 按钮文案是 `Place bet · N ore`（`demo/index.html:1905-1908`）。

改动：

- `currency=G` 时：
  - stake 显示 `G`。
  - `World fee`、`protocol tax`、`burn`、`event prize pool allocation` 拆开显示。
  - payout estimate 显示 `G payout` 与 `net after fee`。
  - **不是只改文案**：`resolveMarket` 当前把 parimutuel 派彩硬 clamp 到 `ORE_POOL_CAP=1000` 并把溢出标 `wasted`（`demo/index.html:575-584`，常量 `demo/index.html:143`）；G 市场必须改成 G 路径派彩并**移除该 cap clamp**，否则真人 G 派彩被静默吞掉（§3.2 硬不变量 H1）。`settlePayout`/`estimatePayout`（`demo/index.html:240-253`）也要走 G 计价池，不复用 ore 池记账。
- `currency=ORE` 时：
  - 显示 `fixed ore reward`、`ore sink`、`score weight`。
- settled receipts 增加 `feeG/taxG/burnG/eventPoolG`，对应 `World.treasury()`。

### 9.5 Landing / MyAgent 加 World Treasury meter + demo 捷径触发事件

现状：

- Landing 有 featured markets 和 AgentMind（`demo/index.html:890-990`）。
- MyAgent header 只有 ORE/G 余额（`demo/index.html:1301-1304`）。
- footer 说明 ore/G 但无 treasury（`demo/index.html:2586-2588`）。

改动：

- Landing hero 或 featured 区增加 `World Treasury meter`：
  - `surplusG`
  - `eventPrizePoolG`
  - `next event threshold`
  - `trigger event` demo shortcut
- demo shortcut 注入样例事件：
  - `World Cup Champion` ORACLE G market。
  - `Ore Rush` 矿潮 STATE event。
  - `Boss Invasion` STATE/RNG event。
- MyAgent header 在 ORE/G 下增加 `World Treasury` 小条，不改变现有 route。

### 9.6 Lore 加世界事件时间线

现状：

- Lore 只显示 World Bible chronicler、best score、chapters（`demo/index.html:1656-1705`）。
- World Bible mock 数据位于 `MOCK_WORLD_BIBLE`（`demo/index.html:430-443`）。

改动：

- 在 chapters 上方或下方增加 `WORLD EVENTS` timeline：
  - event id / type / source question / prize pool G / triggeredAt。
  - 支持从 Landing shortcut 触发后即时出现。
- World Bible 继续展示 canon history；事件 timeline 是 treasury-driven world events，不替代 bible。

## 10. 三个工程前置

### 10.1 RNG 硬化

现状：

- `GameEngine.attack` 用 `block.prevrandao` 混合 agent/target/time/资源后取随机（`contracts/src/GameEngine.sol:414-416`）。
- `inciteRebellion` 用 `block.prevrandao` 50%（`contracts/src/GameEngine.sol:577-579`）。
- `raid` 同样用 `block.prevrandao`（`contracts/src/GameEngine.sol:663-665`）。
- `ArenaEngine.roll` 用 `block.prevrandao` 生成 shop seed（`contracts/src/ArenaEngine.sol:399`）。
- `ArenaEngine.runMatchmaking` 明确 TODO：`prevrandao is grindable`，要换 VRF/commit-reveal（`contracts/src/ArenaEngine.sol:545-548`，shuffle seed 在 `:548`）。

改法方向：

- difficulty 0/低价值 question 可 deterministic 或 pseudo-random demo only。
- 任何 money-staked / G fee / eventPrizePool 相关 STATE question 必须分阶段：
  - open/commit
  - lock
  - finalize RNG
  - resolve
- owner 待拍：VRF vs commit-reveal。VRF 成本高但 UX 简；commit-reveal 成本低但需要 liveness/timeout/refund。

### 10.2 G 托管 / 授权

现状：

- `GTreasury.spendG` 只要求 `registry.isOperator(msg.sender)`（`contracts/src/GTreasury.sol:67-70`、`contracts/src/GTreasury.sol:117-122`）。
- `creditG` 也是 operator-only（`contracts/src/GTreasury.sol:124-130`）。
- `AgentRegistry` 只有全局 operator / operators 和 owner，没有 per-agent delegation（`contracts/src/AgentRegistry.sol:19-24`、`contracts/src/AgentRegistry.sol:45-48`、`contracts/src/AgentRegistry.sol:66-69`）。
- 关键：`canControlAgent` 走 `_isOperator(msg.sender) || msg.sender == agentOwner[agentId]`，而 `_isOperator = addr == operator || operators[addr] || addr == owner()`（`contracts/src/AgentRegistry.sol:36-38`、`:45-48`）——**合约 owner 也恒过 `canControlAgent`**。因此「全局 operator」之外，owner 同样能控制任意 agent；收紧 World 授权时必须把 owner 这条恒过路径一并约束，否则等同 §6.4 警告的「恒真 gate 放行任意 caller」。
- Arena 已经能作为授权系统直接花 G 买卡/roll（`contracts/src/ArenaEngine.sol:273-284`、`contracts/src/ArenaEngine.sol:390-400`）。

改法方向：

- 不让 `World` 成为可任意花所有 agent G 的无限 operator。
- 三选一或组合：
  - escrow：agent 主动把 G 存入 question escrow。
  - EIP-712 per-action permit：每次 bet/action 签授权，World 验签后扣款。
  - per-agent delegation：owner 给 World/runner 指定 scope 和 expiry。
- `answer/bet` 的 agent 控制权校验必须收紧为 agent owner / scoped delegate / permit，不复用“全局 operator 即可控制”的旧语义。

### 10.3 gas / relay

现状：

- `harvest` 任何人可 call（`contracts/src/GameEngine.sol:288-290`），这意味着基础 ore faucet 需要考虑谁付 gas。
- demo 文案承诺“no gas / relay”（`demo/index.html:915-918`、`demo/index.html:1905-1908`），但真实前端当前只有只读路由，`docs/dev-breakdown.md` 已指出真实前端无钱包/写链依赖（`docs/dev-breakdown.md:22`）。
- MCP 当前由 operator signer 发交易，工具直接调用链上动作（`mcp-server/src/tools.ts:131-190`）。

改法方向：

- 基础 ore reward 必须覆盖 gas，或由 relay/platform 垫付。
- 若采用 F2P 默认 A，difficulty 0 question 的 feeG 应为 0，但需要 anti-spam：cooldown、per-agent quota、batch/keeper、sponsored tx。
- 若采用 B“一切挖矿付 G”，gas/abuse 简化但新手层断裂；本稿不默认 B。

## 11. 风险 / 待 owner 决策

1. 基础 ore 循环是否全免费
   - 默认 A：简单答题/挖矿接近零 G 费，保住 F2P engagement；G 只在预测市场、premium/价值行动、event entry 咬。
   - 备选 B：一切挖矿都付 G；经济更硬，但 onboarding 和 AI 自主循环会变窄。
   - 本稿按 A 写。Phase 1 前需最终确认。

2. burn 形态
   - `GTreasury` 当前只有 surplus 概念（`contracts/src/GTreasury.sol:165-169`），没有 `protocolBurnG/eventPrizePoolG` 拆账。
   - OPEN：G fee 中 burn 与回流比例是固定参数、owner 可调参数，还是按事件类型配置。

3. score 公式落点
   - 当前合约和 demo 都是 `hexes*100 + ore + buildings*50`（`contracts/src/GameEngine.sol:494-506`、`demo/index.html:163-164`）。
   - OPEN：新公式落在 `World.getScore`、旧 `GameEngine.getScore` adapter，还是独立 ScoreModule。
   - 建议：World 作为 canonical score，GameEngine legacy 只读 adapter。

4. VRF vs commit-reveal
   - 当前 GameEngine/Arena 均用 `prevrandao`，Arena 已有 TODO（`contracts/src/ArenaEngine.sol:545-548`）。
   - OPEN：采用 VRF、commit-reveal、keeper-seeded entropy，还是分层策略。

5. ORACLE 裁决、超时退款、争议 —— **Phase 3 必须确定（不再长期 OPEN）**
   - 当前 oracle debate 有 `outcomeOverride` 与 `expireDebate` 退款（`contracts/src/GameEngine.sol:804-827`、`contracts/src/GameEngine.sol:897-911`），但没有争议、多 oracle、裁决 SLA。
   - 升级理由：世界杯冠军是旗舰 demo 市场，可信中立性是真人留存的核心信任点，不能把「谁裁决/争议/超时/bond」拖成长期 OPEN。因此在 Phase 3（debate 迁 ORACLE/STATE）随 G 市场一起**必须定稿**。
   - 默认草案（可被 owner 替换，但 Phase 3 前必须落一个具体值）：
     - resolver 角色：owner 指定的单一 `oracle` 角色地址（可后续换多签/token vote），在 `Question.resolver` 里显式写明，不留 `address(0)`。
     - grace 超时：`resolveAt + grace` 内 resolver 未裁决 → 自动进入**全额退款**（escrow 全退给下注方，不抽 rake），复用 `expireDebate` 退款语义。
     - 争议 hook：resolver 写入结果后开 `disputeWindow`；任何下注方可付 `disputeBondG` 发起争议，进入二级裁决（owner/多签），争议落败方 bond 罚没、胜方退 bond。bond 参数与二级裁决主体可调，但 hook 字段（`disputeWindow`/`disputeBondG`/二级 resolver）Phase 3 必须写进 `Question`/module。

6. World 与 GTreasury 的 custody 边界
   - OPEN：G escrow 放 `World` 内部账，还是扩 `GTreasury`。
   - 建议：`GTreasury` 保留 backing 与 agent balance；`World` 记录 question escrow 与 payout claims，最终通过受限 `GTreasury` entrypoints 结算。

7. legacy freeze 时间
   - 当前 MCP 和 demo 都还以旧动作命名：MCP `harvest/build/raid`（`mcp-server/src/tools.ts:131-190`），demo quick actions（`demo/index.html:1344-1357`）。
   - OPEN：何时对旧 GameEngine 外部写入口启用 `legacyWritesFrozen`；建议等 Phase 1/2/3 都有 World alias 后再冻结。

8. demo 命名
   - OPEN：UI 是否把 `/markets` 改文案为 Questions / World Markets。
   - 建议：路由保持 `/markets`，组件内部以 `QuestionModal` 抽象；真人仍看熟悉市场语义。
