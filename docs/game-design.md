# Gravity Town v2 精简游戏设计稿: Market -> Action

## 1. 一句话愿景

Gravity Town v2 是一个“用可验证预测市场赢行动权，再用行动权改写链上世界”的 on-chain AI 领土游戏。

## 2. 四层栈

```text
Layer 4  NFT 卡牌市场        复用 Arena/CardLedger, 卡牌作为攻防加成接入动作层, Post-MVP 只留接口草图
Layer 3  Action 行动层       花 AP 攻击邻接 hex, 或给己方 hex 加防御
Layer 2  Gambling/AP 层      赢市场获得 AP, 可能同时获得 G 奖励
Layer 1  Market 市场层       通用“可验证结局”预测市场, MVP 只做 MATH + STATE
```

核心闭环:

```text
开一个可验证市场
  -> agent 用 G 押注
  -> 市场结算, 赢方获得 AP
  -> agent 花 AP 攻击/防御 hex
  -> 链上世界状态改变
  -> 新状态又可以成为新的 STATE 市场
```

## 3. 两币模型与铁律不变量

### G

G 是稀缺价值币, 用于 on-ramp、市场押注、市场奖励、未来卡牌二级市场交易。现有 `GTreasury` 已有 agent 级 `gBalance` 账本, 见 `contracts/src/GTreasury.sol:21`。

现有 `GTreasury` 已区分测试网 faucet 与可提现模式, 并说明两者互斥, 见 `contracts/src/GTreasury.sol:9` 到 `contracts/src/GTreasury.sol:17`；模式开关在 `contracts/src/GTreasury.sol:74` 到 `contracts/src/GTreasury.sol:87`。v2 价值模式下必须关闭无限 mint 路径, 禁止把 faucet 当正式经济来源。

G payout 铁律:

1. 市场 G 奖励只能来自三类等额 backing: escrow 中的 losing stakes、预存补贴池、协议 surplus。
2. `GTreasury.creditG` 只能作为“把已背书 G 记到账户”的账本入口, 不能作为隐式 mint。
3. 任何 G 发放点在调用 `creditG` 前必须能指出等额 backing 来源, 并在市场/补贴/协议账本中扣减或锁定该来源。
4. `creditG` 当前只做 `onlyOperator` 校验并直接增加 `gBalance` 与 `totalOutstandingG`, 见 `contracts/src/GTreasury.sol:126` 到 `contracts/src/GTreasury.sol:129`；因此 backing 校验必须由市场合约或新增 treasury wrapper 显式完成。
5. **Treasury 层保留边界（必须封死，否则 backing 失效）**: 现有 `spendG` 会降低 `totalOutstandingG`（`contracts/src/GTreasury.sol:109`），押注进 escrow 的 native G 立刻表现为可提 surplus；而 `withdrawSurplus`/`surplusG` 只按 `balance - totalOutstandingG` 判断（`contracts/src/GTreasury.sol:151`）。结果是 owner/治理可能把市场 escrow/补贴池当 surplus 提走，随后 `creditG` 仍按内部账发放 → 等额 backing 落空。**M1 必须二选一**: (a) 在 Treasury 层引入 `reservedBackingG`（= 未结算市场 escrow + 补贴池），并把 `surplusG`/`withdrawSurplus` 改为 `balance - totalOutstandingG - reservedBackingG`; 或 (b) 市场 G 全部走新增 treasury wrapper 持有、不进 `GTreasury` 的 surplus 口径, wrapper 禁止提取未结算 escrow/补贴。两种都要保证: 任一时刻 `Treasury 可提 surplus ≤ native 余额 − 全部未结算市场 G 负债`。

G 的基础接口复用:

| 用途 | 现有接口 |
| --- | --- |
| 充值 | `depositG`, `contracts/src/GTreasury.sol:100` 到 `contracts/src/GTreasury.sol:107` |
| 押注/购买/消耗 | `spendG`, `contracts/src/GTreasury.sol:117` 到 `contracts/src/GTreasury.sol:122` |
| 已背书奖励/卖出收入 | `creditG`, `contracts/src/GTreasury.sol:124` 到 `contracts/src/GTreasury.sol:130`; 不得单独作为 mint 来源 |
| 提现 | `withdraw`, `contracts/src/GTreasury.sol:134` 到 `contracts/src/GTreasury.sol:146` |

### AP

AP 是行动点, 只花在动作上, 不可自由转账, 不可提现, 不可用 G 直接购买。

AP 铁律:

1. AP 只能由“赢市场”产生。
2. AP 不允许通过 G 直接买入。
3. AP 不允许任意 operator 凭空 mint。
4. AP 不和 G 自由兑换。
5. G 是赌注和奖励载体, AP 是动作燃料。

旧版 ore 彻底删除。现有 `GameEngine` 的 ore 生产、build、spend hook 只作为旧实现背景, v2 MVP 不把 ore 接入新闭环。相关旧逻辑在 `contracts/src/GameEngine.sol:82` 到 `contracts/src/GameEngine.sol:83`, `contracts/src/GameEngine.sol:288` 到 `contracts/src/GameEngine.sol:337`, `contracts/src/GameEngine.sol:343` 到 `contracts/src/GameEngine.sol:367`, `contracts/src/GameEngine.sol:467` 到 `contracts/src/GameEngine.sol:488`。

## 4. Layer 1: 通用可验证预测市场

市场是唯一经济原语。任何可验证结局都能开盘, 但不可验证叙事不能开盘。

### Question

建议结构:

```solidity
enum QuestionKind {
    MATH,
    STATE
}

enum QuestionStatus {
    Draft,
    Open,
    Closed,
    Settled,
    Voided
}

struct Question {
    uint256 id;
    QuestionKind kind;
    bytes32 templateId;
    bytes params;
    string statement;
    uint8 outcomeCount;
    uint64 openAt;
    uint64 closeAt;
    uint64 settleAfter;
    uint64 snapshotBlock;
    uint64 snapshotTimestamp;
    bytes32 snapshotEventId;
    uint16 difficultyBps;
    bool trivial;
    address resolver;
    QuestionStatus status;
    uint8 outcome;
}
```

字段说明:

| 字段 | 说明 |
| --- | --- |
| `kind` | MVP 只允许 `MATH`, `STATE` 两类结算来源 |
| `templateId` | 限制问题模板, 避免任意字符串伪装成可验证问题 |
| `params` | 模板参数, 例如表达式、hexKey、battleId、外部赛事 id |
| `snapshotBlock` / `snapshotTimestamp` / `snapshotEventId` | `STATE` 盘必须绑定的结算快照锚点；至少选择一个非零/非空锚点, 禁止 resolver 任意挑结算时刻 |
| `difficultyBps` | 难度和不确定性权重, 影响 AP 和可能的 G 回报 |
| `trivial` | 难度约等于 0 的地板盘标记, 例如 `1+1=2` |
| `resolver` | 特殊 `STATE` 盘的结算合约/地址；MVP 不接外部 oracle |

### Market

建议结构:

```solidity
struct Market {
    uint256 id;
    uint256 questionId;
    uint256 totalStakeG;
    uint256 feeBps;
    uint256 minStakeG;
    uint256 maxStakeG;
    uint256 settledAt;
    bool paysAP;
    bool paysG;
}

struct Position {
    uint256 stakeG;
    bool claimed;
}

mapping(uint256 marketId => mapping(uint8 outcome => uint256 stakeG)) public outcomeStakeG;
mapping(uint256 marketId => mapping(uint256 agentId => mapping(uint8 outcome => Position))) public positions;
```

MVP 先做 binary outcome。多选盘保留结构, 但不作为第一版复杂度来源。

### 结算类型

#### MATH

`MATH` 是链上自校验题。MVP 只允许白名单模板, 例如:

| 模板 | 例子 | 结算方式 |
| --- | --- | --- |
| `ADD_EQ` | `1 + 1 = 2` | 合约按参数计算 |
| `MUL_EQ` | `3 * 7 = 21` | 合约按参数计算 |
| `CMP` | `a > b` | 合约按参数比较 |

`MATH` 的目标不是内容游戏, 而是提供可验证、低摩擦的 AP 地板。

#### STATE

`STATE` 读取链上世界状态。现有 `GameEngine` 已保存 hex owner/location/q/r/happiness 等核心状态, 见 `contracts/src/GameEngine.sol:63` 到 `contracts/src/GameEngine.sol:74`；公开 `getHex` 返回 owner、坐标、建筑、储备、happiness 等字段, 见 `contracts/src/GameEngine.sol:513` 到 `contracts/src/GameEngine.sol:520`。若 M0 选择推荐方案 B, v2 的 STATE 盘默认读取 `V2World` 的 owner/defense/battle result；旧 `GameEngine` 只作为迁移快照或参考状态源。

可支持的问题:

| 问题 | 结算来源 |
| --- | --- |
| “settle 时 hex Y 是否归 agent A?” | `V2World.getHex(hexKey).ownerId`; 旧世界迁移期才读 `GameEngine.getHex(hexKey).ownerId` |
| “battle X 是否由 agent A 获胜?” | `V2World` 记录的 battle result 事件 |
| “某个时间窗内 agent A 是否至少占领 N 个 hex?” | `V2World` 状态快照或 battle/capture 事件 |

`STATE` 盘必须绑定 `snapshotBlock`、`snapshotTimestamp` 或 `snapshotEventId` 之一, 避免结算人挑时间。基于 battle result 的盘优先绑定 action 事件 id；基于 owner/hex count 的盘优先绑定固定 block 或固定 timestamp 对应的状态快照。

#### ORACLE

`ORACLE` 是外部可验证结局, 如世界杯冠军。ORACLE 信任模型是安全边界, 不是普通参数；本稿默认 Post-MVP 后置, MVP 不允许创建或结算 ORACLE 盘, 只保留接口草图供后续评审:

```solidity
interface IMarketOracle {
    function resolve(bytes32 templateId, bytes calldata params) external returns (uint8 outcome);
}
```

如果未来把 ORACLE 提前进 MVP, 必须在 M0/M2 前定稿单 oracle、多签 oracle、optimistic oracle、challenge window 或外部 attestation 的信任模型、挑战流程和失败处理；否则不能上线可结算 ORACLE 盘。

### G 押注

押注统一用 G。市场合约通过 `GTreasury.spendG` 扣除下注额, 将下注额记入市场 escrow；结算时只有在等额 backing 来源已确定并扣减后, 才能通过 `GTreasury.creditG` 发放 G 奖励。合法来源只包括 losing stakes、预存补贴池、协议 surplus。若本盘只发 AP, G 可以留在 escrow 后按规则退还、进入协议 surplus、或作为后续已背书奖池, 但不能用 `creditG` 凭空扩张 `totalOutstandingG`。

### Trivial 盘硬规则

难度为 0 或接近 0 的 trivial 盘是 AP 地板和防锁死机制, 不是刷点入口。

硬规则:

1. trivial 盘可免门槛或极低门槛, 但默认 `paysG=false`。
2. trivial 盘 AP 固定为 `fixedTrivialAP`, 与 `stakeG`、odds、winner share、difficulty 全部无关。
3. trivial 盘若允许押 G, 必须设置独立 `maxStakeG_trivial` dust cap；押注额不得影响 AP。
4. trivial 盘必须有 agent / owner(account) / epoch / global 多维 AP 上限, 不能只做 per-agent cap。
5. 同模板同参数不能无限重复计奖。
6. 免费建号会放大 sybil 风险: 旧 `GameEngine.createAgent` 会自动占 7 个 hex, 见 `contracts/src/GameEngine.sol:232` 到 `contracts/src/GameEngine.sol:261`; `AgentRegistry.createAgent` 没有 G 成本, 见 `contracts/src/AgentRegistry.sol:71` 到 `contracts/src/AgentRegistry.sol:81`。v2 必须用 owner/account/epoch/global cap 抗 sybil, 或引入 agent 创建 bond/成本。

节流约束用符号先写死, 数值后置:

```text
A_min              = minAttackAP
T_unit             = fixedTrivialAP
T_agent_epoch      = 单 agent 每 epoch trivial AP 上限
T_owner_epoch      = 单 owner/account 每 epoch trivial AP 上限
T_global_epoch     = 全局每 epoch trivial AP 上限
N_active_owner     = epoch 内活跃 owner/account 数
E_min, E_max       = 输家靠 trivial 盘攒够一次最小攻击的期望 epoch 下界/上界

T_unit <= T_agent_epoch <= T_owner_epoch
T_agent_epoch <= alpha_agent * A_min
A_min / E_max <= T_owner_epoch <= A_min / E_min
ceil(A_min / T_owner_epoch) in [E_min, E_max]
T_global_epoch <= alpha_global * N_active_owner * A_min
T_global_epoch <= beta * AP_burned_by_attacks_prev_epoch + bootstrapTrivialAP
```

含义: `T_owner_epoch` 决定输家 comeback 时间, 上界防止一两个 epoch 白嫖攻击, 下界避免输家永远爬不回；`T_global_epoch` 同时受活跃账户数和上一 epoch 行动燃烧约束, 防 AP 通胀。

如果没有以上节流, 所有人都会无限刷 `1+1=2`, AP 会通胀并摧毁行动层成本。

## 5. Layer 2: 赢市场 -> AP

AP 发放只发生在市场结算后, 且只发给赢方已押注 position。

公式方向:

```text
if question.trivial:
    winAP = fixedTrivialAP
else:
    winAP = baseWinAP
          + stakeWeight(stakeG)
          * difficultyWeight(question.difficultyBps)
          * uncertaintyWeight(market odds at close)
          * winnerShareWeight(agent winning stake / total winning stake)
```

trivial 盘必须走固定 AP 分支, `stakeWeight(stakeG)` 强制不参与计算。否则“确定性赢 + 押更多 G”会变成 G 买 AP, 违反 AP 不可购买铁律。

约束:

| 约束 | 说明 |
| --- | --- |
| 赢方才有 AP | 输方无 AP, 但可通过 trivial 盘重新爬回 |
| AP 有上限 | 单市场、单 agent、单 owner/account、单 epoch、global 都要 cap |
| 难度越高回报越高 | 难题和高不确定性盘给更大 AP/G 激励 |
| 地板盘只保活 | trivial 盘给固定 tiny AP, 与 stake 无关, 只解决防锁死 |
| AP 不走市场交易 | AP 不上市、不转让、不兑换 |

建议新增 `APLedger`:

```solidity
contract APLedger {
    mapping(uint256 agentId => uint256 balance) public apBalance;
    mapping(uint256 agentId => mapping(uint64 epoch => uint256 earnedAP)) public earnedInEpoch;
    mapping(address owner => mapping(uint64 epoch => uint256 trivialEarnedAP)) public ownerTrivialEarnedInEpoch;
    mapping(uint64 epoch => uint256 trivialEarnedAP) public globalTrivialEarnedInEpoch;

    function creditFromMarket(uint256 agentId, uint256 amount, uint256 marketId) external onlyMarket;
    function spendForAction(uint256 agentId, uint256 amount, bytes32 action) external onlyAction;
}
```

`creditFromMarket` 是唯一 AP 增发入口。`spendForAction` 是动作层唯一扣 AP 入口, `onlyAction` 只授予 `V2World` 或 M0 选定的 action adapter。

## 6. Layer 3: AP-gated 行动层

MVP 只做两个动作: 攻击、加地块防御。建造、采集、debate、chronicle 等旧动作不进 v2 MVP 主循环。

### 动作 A: 攻击邻接 hex

目标: 花 N AP 对邻接 hex 发起 Tullock 概率竞赛。

建议接口:

```solidity
function attackWithAP(
    uint256 agentId,
    bytes32 fromHexKey,
    bytes32 targetHexKey,
    uint256 apSpend
) external returns (bool success);
```

规则:

1. `fromHexKey` 必须属于 attacker。
2. `targetHexKey` 必须邻接 `fromHexKey`。这是 v2 新规则, 必须新增 public/library 级 `HexGrid.areAdjacent(q1,r1,q2,r2)` 校验。
3. `targetHexKey` 不能属于 attacker。
4. `apSpend >= minAttackAP`。
5. 先从 `APLedger` 扣 AP, 再通过 M0 选定的 RNG 方案结算。
6. 攻击成功则 target hex owner 改为 attacker。
7. 攻击成功后 `hexDefense[targetHexKey]` 清零, 不继承旧 owner 的防御投入。
8. 攻击失败则 defender 保留 hex, 可获得防御 morale 或防御值调整。
9. 禁止使用 `block.prevrandao` 直接决定有经济价值的攻防结果；MVP 必须在 M0 选定 VRF 或 commit-reveal, M4 才能实现攻击。

Tullock 方向:

```text
attackPower  = apSpend + situationalBonus
defensePower = hexDefense[targetHexKey] + baseDefense
P(success)   = attackPower / (attackPower + defensePower)
```

当前 MVP 不接卡牌 bonus；Layer 4 上线时再把 `attackCardBonus/defenseCardBonus` 加回公式。

现有 `GameEngine` 可参考但不能由外部 adapter 直接复用的逻辑:

| 复用点 | 现有源码 |
| --- | --- |
| hex owner/location/q/r/happiness 旧状态结构 | `contracts/src/GameEngine.sol:63` 到 `contracts/src/GameEngine.sol:74` |
| agent 初始占 7 hex 的创建流程 | `contracts/src/GameEngine.sol:232` 到 `contracts/src/GameEngine.sol:265` |
| 旧 attack 入口和控制权检查 | `contracts/src/GameEngine.sol:373` 到 `contracts/src/GameEngine.sol:381` |
| 旧 location/cooldown 模型 | `contracts/src/GameEngine.sol:393` 到 `contracts/src/GameEngine.sol:398`; 旧规则要求 agent 已在目标 hex location, 不是邻接攻击 |
| Tullock power 和成功判定参考 | `contracts/src/GameEngine.sol:409` 到 `contracts/src/GameEngine.sol:418`; 随机数部分使用 `block.prevrandao`, v2 不能沿用 |
| 成功后迁移 owner、更新 hexCount、写事件的内部写入顺序 | `contracts/src/GameEngine.sol:419` 到 `contracts/src/GameEngine.sol:448`; 只能作为参考, 不能由 adapter 外部改这些 mapping |
| `raid` 的“一步移动+攻击”参考实现 | `contracts/src/GameEngine.sol:622` 到 `contracts/src/GameEngine.sol:695` |
| 旧 hex 邻居计算 | `_getNeighbor` 是 internal, 见 `contracts/src/GameEngine.sol:1079` 到 `contracts/src/GameEngine.sol:1085`; v2 需要 public/library 级邻接校验 |

重要改造点:

现有 `GameEngine.attack` 不能原样作为 v2 攻击入口, 因为它消耗 arsenal 和 ore, 见 `contracts/src/GameEngine.sol:401` 到 `contracts/src/GameEngine.sol:407`；现有防御也来自 `target.arsenalCount * DEFENSE_PER_ARSENAL`, 见 `contracts/src/GameEngine.sol:31`, `contracts/src/GameEngine.sol:69`, `contracts/src/GameEngine.sol:410`。更关键的是 `hexes`、`agentHexKeys`、`hexCount` 是 `GameEngine` 内部状态, 旧 capture 只在 `GameEngine` 内部写入, 见 `contracts/src/GameEngine.sol:419` 到 `contracts/src/GameEngine.sol:448` 和 `contracts/src/GameEngine.sol:622` 到 `contracts/src/GameEngine.sol:695`；外部 adapter 不能“复制 capture 逻辑”去直接改 owner/hexCount。

M0 必须二选一确定 World 边界:

| 方案 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| A. 升级旧 `GameEngine` | 暴露 AP-gated capture hook, 由 `GameEngine` 自己内部写 `hexes/agentHexKeys/hexCount`, adapter 只扣 AP 和传入结算结果 | 不复制世界状态, 老前端/MCP 可少迁移 | UUPS 存储和权限风险更高, v1 ore/arsenal/happiness 与 v2 AP/defense 强耦合 |
| B. 新 `V2World` 自持状态 | 新合约持有 v2 hex owner、defense、battle result、capture 事件；旧 `GameEngine` 只作 Tullock/地图/迁移参考或抽出成 library | 边界干净, 不需要外部写旧内部 mapping, 邻接/RNG/defense 规则可独立成型 | 需要迁移 UI/MCP 读取源, 若要继承旧世界需一次性导入快照 |

推荐 B。v2 是 Market -> AP -> Action 的新闭环, 用独立 `V2World` 自持 hex/战斗状态更干净；旧 `GameEngine` 的 Tullock 数学和地图工具只作为参考或库, 不作为被 adapter 外部改写的状态容器。

### 动作 B: 加地块防御

目标: 花 AP 提升自己 hex 的防御值。

建议接口:

```solidity
function reinforceHex(
    uint256 agentId,
    bytes32 hexKey,
    uint256 apSpend
) external returns (uint256 newDefense);
```

规则:

1. `hexKey` 必须属于 agent。
2. 花费 `apSpend`。
3. 增加 `hexDefense[hexKey]`。
4. 防御值进入攻击的 `defensePower`。
5. 防御值必须有上限、衰减或递增成本, 防止永久龟缩。
6. hex 被 capture 后防御值清零；新 owner 不能继承旧 owner 的防御堆叠。

当前 `GameEngine.Hex` 没有独立 defense 字段, 只有 `arsenalCount` 和 happiness。若 M0 选择方案 A, 需要升级 `GameEngine` 增加 `defenseValue` 并由内部 capture hook 清零；若选择方案 B, `hexDefense` 属于 `V2World` 状态。MVP 推荐方案 B。

## 7. Layer 4: NFT 卡牌市场占位

本层后置, 不进入 MVP 实现。目标是复用现有 Arena/CardLedger 资产, 让卡牌作为动作层的攻防加成。

现有可复用基础:

| 模块 | 源码 |
| --- | --- |
| `CardLedger.Card` 和二级市场 `Listing` | `contracts/src/CardLedger.sol:15` 到 `contracts/src/CardLedger.sol:30` |
| mint card | `contracts/src/CardLedger.sol:75` 到 `contracts/src/CardLedger.sol:86` |
| list/cancel/buy listed card | `contracts/src/CardLedger.sol:88` 到 `contracts/src/CardLedger.sol:138` |
| Arena ghost bench/card slots | `contracts/src/ArenaEngine.sol:66` 到 `contracts/src/ArenaEngine.sol:76` |
| Arena 用 G buy card | `contracts/src/ArenaEngine.sol:273` 到 `contracts/src/ArenaEngine.sol:289` |
| place/remove/move card | `contracts/src/ArenaEngine.sol:291` 到 `contracts/src/ArenaEngine.sol:373` |
| deterministic combat sim/settle | `contracts/src/ArenaEngine.sol:614` 到 `contracts/src/ArenaEngine.sol:702`, `contracts/src/ArenaCombat.sol:40` 到 `contracts/src/ArenaCombat.sol:67` |
| unit stats/cost/ability | `contracts/src/UnitCatalog.sol:14` 到 `contracts/src/UnitCatalog.sol:149` |

占位接口:

```solidity
interface IActionCardBonus {
    function attackBonus(uint256 agentId, uint256[] calldata cardIds, bytes calldata context)
        external view returns (uint256);

    function defenseBonus(uint256 agentId, bytes32 hexKey, uint256[] calldata cardIds, bytes calldata context)
        external view returns (uint256);
}
```

MVP 的 Layer 3 接口不携带 `cardIds`。本层只保留 Post-MVP hook 草图, 不把卡牌强行接入攻击/防御数值；Layer 4 上线时再扩展动作接口或固定从空数组升级到真实 card set。

## 8. 合约映射

### 复用

| 能力 | 复用合约 | 说明 |
| --- | --- | --- |
| 旧世界结构参考 | `GameEngine` | 参考 hex 数据结构、spawn、capture 内部写入顺序, 见 `contracts/src/GameEngine.sol:63` 到 `contracts/src/GameEngine.sol:79` 和 `contracts/src/GameEngine.sol:419` 到 `contracts/src/GameEngine.sol:448`; v2 adapter 不能外部改旧内部 mapping |
| Tullock 攻击数学参考 | `GameEngine` | 参考 power/success 方向, 见 `contracts/src/GameEngine.sol:409` 到 `contracts/src/GameEngine.sol:418`; 随机数不能沿用 `block.prevrandao` |
| 一步攻击参考 | `GameEngine.raid` | 仅参考 auto-move + attack 流程, 见 `contracts/src/GameEngine.sol:622` 到 `contracts/src/GameEngine.sol:695`; 不是 v2 邻接规则 |
| G 账本 | `GTreasury` | `gBalance`, `depositG`, `spendG`, `creditG`, `withdraw`; `creditG` 只记已背书 payout |
| 卡牌库存和二级市场 | `CardLedger` | 持久卡牌、listing、G 交易 |
| Arena 卡牌/战斗资产 | `ArenaEngine`, `ArenaCombat`, `UnitCatalog` | 后置作为动作 bonus 来源 |
| 地址发现 | `Router` | 已包含 `gameEngine`, `arenaEngine`, `gTreasury`, `cardLedger`, 见 `contracts/src/Router.sol:8` 到 `contracts/src/Router.sol:21` 和 `contracts/src/Router.sol:85` 到 `contracts/src/Router.sol:108` |

### 新建

| 新合约 | 职责 |
| --- | --- |
| `QuestionRegistry` 或并入 `PredictionMarketEngine` | 注册 MVP 的 MATH/STATE question 模板与参数；ORACLE 后置 |
| `PredictionMarketEngine` | 开盘、下注、关盘、结算、claim G/AP；维护 escrow、subsidy pool、surplus backing 账 |
| `MarketSettlementResolver` | MATH 自校验、STATE 按 snapshot 读链上；ORACLE 外部结算接口后置 |
| `APLedger` | AP 余额、市场唯一增发入口、动作唯一扣费入口、trivial 多维 cap |
| `HexGrid` library | public/library 级 hex 坐标、边界、邻接校验 |
| `RNGProvider` | VRF 或 commit-reveal 适配层；MVP 攻防依赖它, 禁用裸 `block.prevrandao` |
| `V2World` | 推荐方案: 自持 v2 hex owner、defense、battle result、capture 事件, 暴露 `attackWithAP` / `reinforceHex` 或被 `APActionAdapter` 调用 |
| `APActionAdapter` | 若保留 adapter, 只连接 AP、RNG、`V2World`; 不外部改旧 `GameEngine` 内部状态 |
| `ActionCardBonusAdapter` | 后置; 把 CardLedger/Arena 卡牌映射成攻防 bonus |

权限边界:

1. `PredictionMarketEngine` 可以调用 `GTreasury.spendG`; 只有在 losing stakes / 预存补贴池 / 协议 surplus 等额 backing 已扣减或锁定后, 才能调用 `GTreasury.creditG`。
2. 只有 `PredictionMarketEngine` 可以调用 `APLedger.creditFromMarket`。
3. 只有 `V2World` 或 `APActionAdapter` 可以调用 `APLedger.spendForAction`。
4. `V2World` 是唯一能用 AP 改 v2 世界状态的入口；若 M0 选方案 A, 则必须是旧 `GameEngine` 内部 AP-gated hook 写状态。
5. 外部 adapter 不得直接改旧 `GameEngine.hexes/agentHexKeys/hexCount`。
6. `GTreasury.fundAgentG` 只允许测试网或受控迁移, 不能作为正式经济 mint。

## 9. MVP 范围

MVP 做:

1. Layer 1: 市场引擎, 支持 `MATH`, `STATE`。`STATE` 必须绑定 snapshot block/timestamp/event id。
2. Layer 2: AP ledger 和赢盘发 AP。
3. Layer 3: AP 攻击邻接 hex, AP 加己方 hex 防御。
4. RNGProvider: M0 选定并在 M4 接入 VRF 或 commit-reveal, 不用裸 `block.prevrandao`。
5. UI/MCP 只围绕 Market -> AP -> Action 这条闭环展示。

MVP 不做:

1. ore。
2. 建造/采集。
3. 把每个动作包装成答题。
4. 卡牌数值接入。
5. 复杂外交/debate/chronicle 经济化。
6. ORACLE 盘创建/结算。
7. 让外部 adapter 改旧 `GameEngine` 内部 hex 状态。

## 10. 里程碑

### M0: 合约边界确认

确定 World 边界和 RNG 边界:

1. World 二选一: A 升级旧 `GameEngine` 暴露 AP-gated capture hook; B 新 `V2World` 自持 hex/战斗状态。推荐 B。
2. 邻接校验落为 public/library `HexGrid`, 不复用旧 `attack` 的 location 模型。
3. RNG 选 VRF 或 commit-reveal, 并定义请求、揭示、超时、失败/退款规则。裸 `block.prevrandao` 不进入 AP 攻防。
4. ORACLE 明确后置；若 owner 要提前, 必须先补信任模型和 challenge/attestation 流程。

### M1: Market Engine

实现 question/market/position 数据结构, 支持 G 下注、关盘、结算状态机。先落地 binary market, 并实现 escrow / subsidy / surplus backing 账, 确保所有 G payout 有来源。**封死 Treasury 层保留边界（§3 G 铁律第 5 条）**: 引入 `reservedBackingG` 并改写 `surplusG`/`withdrawSurplus`, 或让市场 G 走独立 treasury wrapper, 保证未结算市场 escrow/补贴不会被当 surplus 提走。

### M2: Settlement

实现:

1. `MATH` 白名单模板自校验。
2. `STATE` 按 snapshot block/timestamp/event id 读取 `V2World` 状态和 battle result。
3. 不实现 ORACLE resolver；只保留 Post-MVP 接口草图。

### M3: AP Ledger

实现 AP 唯一 mint 路径: settled winning position -> AP。加入 per-market、per-agent、per-owner/account、per-epoch、global cap, 并硬编码 trivial throttle 约束式。

### M4: Action Adapter

实现 `attackWithAP` 和 `reinforceHex`。攻击使用 `HexGrid.areAdjacent`、AP/defense 输入、M0 选定 RNG、capture 后防御清零。若采用推荐方案 B, owner 迁移写入 `V2World`; 旧 `GameEngine` 只作参考/库。

### M5: Integration

MCP/frontend 展示:

```text
可下注市场 -> 我的 G 仓位 -> 结算可 claim AP -> 我的 AP -> 可攻击/可防御 hex
```

### M6: Post-MVP Cards

把 `CardLedger`/`ArenaEngine` 的卡牌作为攻防 bonus 接入 `V2World` 或 `APActionAdapter`, 再扩展动作接口携带 card set。

### M7: Post-MVP Oracle

在单独评审中确定 ORACLE 信任模型、challenge window、attestation 来源和失败处理后, 才能把 `ORACLE` 加回 `QuestionKind`。

## 11. 与旧 `feat/ux-demo-roadmap` 的关系

旧分支是“万物皆答题”。本版收窄为: 只有“赌”是 Question/Market, 攻击和防御是花 AP 的普通动作, 并砍掉 ore。这是更聚焦的重做。

## 12. OPEN 待 owner

1. trivial 盘具体节流数值: `fixedTrivialAP`、`T_agent_epoch`、`T_owner_epoch`、`T_global_epoch`、`E_min/E_max`、重复模板限流参数。约束式不可放松。
2. AP 公式常数: `baseWinAP`, 非 trivial 的 stake 权重、difficulty 权重、uncertainty 权重、单市场和单 epoch cap。
3. 动作成本: `minAttackAP`, 攻击 AP 到 attackPower 的换算, `reinforceHex` 成本曲线、防御上限和衰减。
4. G 奖励配置: 每类市场在 losing stakes / 预存补贴池 / 协议 surplus 三类 backing 中选择哪几类和比例；不得新增无 backing payout。
5. `STATE` 盘默认 snapshot 锚点选择策略: 固定 block、固定 timestamp、事件 id 的优先级。
6. M0 World 方案最终选择: 推荐 B 新 `V2World`; 若选 A, 必须给旧 `GameEngine` 增加 AP-gated internal capture hook。
7. Layer 4 卡牌接入时机和数值: 卡牌是否消耗、是否锁定在动作中、是否可同时用于 Arena 和领土战。
8. Post-MVP ORACLE: 信任模型、挑战窗口和 attestation 来源。MVP 不实现。
