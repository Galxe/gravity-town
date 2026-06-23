# Gravity Town v2 精简游戏设计稿: Market -> Action

## 1. 一句话愿景

Gravity Town v2 是一个“用可验证预测市场赢行动权，再用行动权改写链上世界”的 on-chain AI 领土游戏。

## 2. 四层栈

```text
Layer 4  NFT 卡牌市场        复用 Arena/CardLedger, 卡牌作为攻防加成接入动作层, Post-MVP 只留接口草图
Layer 3  Action 行动层       花 AP 攻击邻接 hex、给己方 hex 加防御, 或让 0-hex agent 回场
Layer 2  Gambling/AP 层      赢市场获得 AP, 可能同时获得 G 奖励
Layer 1  Market 市场层       通用“可验证结局”预测市场, MVP 只做 MATH + STATE-by-checkpoint
```

核心闭环:

```text
开一个可验证市场
  -> agent 用 G 押注
  -> 市场结算, 赢方获得 AP
  -> agent 花 AP 攻击/防御 hex, 或在 0-hex 时回场
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
4. `creditG` 当前只做 `onlyOperator` 校验并直接增加 `gBalance` 与 `totalOutstandingG`, 见 `contracts/src/GTreasury.sol:126` 到 `contracts/src/GTreasury.sol:129`。`onlyOperator` 又来自 `AgentRegistry.isOperator`, 会接受全局 `operator`、`operators` mapping 或 owner, 见 `contracts/src/AgentRegistry.sol:36` 到 `contracts/src/AgentRegistry.sol:37` 和 `contracts/src/AgentRegistry.sol:66` 到 `contracts/src/AgentRegistry.sol:69`。v2 价值模式不能继续把 `creditG` 暴露给泛 operator。
5. **M1 必须把 G 市场记账权限收紧为单一市场入口**: `creditG` 的正式奖励路径只能接受 `PredictionMarketEngine` 或新增 treasury wrapper 的唯一地址, 不能接受任一 legacy operator/脚本。市场下注用到的 `spendG` 也应通过同一市场入口或 wrapper 进入 escrow, 避免旧系统直接制造绕过 backing 的 G 流。
6. **Treasury 层保留边界（必须封死，否则 backing 失效）**: 现有 `spendG` 会降低 `totalOutstandingG`（`contracts/src/GTreasury.sol:109` 到 `contracts/src/GTreasury.sol:120`），押注进 escrow 的 native G 立刻表现为可提 surplus；而 `withdrawSurplus`/`surplusG` 只按 `balance - totalOutstandingG` 判断（`contracts/src/GTreasury.sol:151` 到 `contracts/src/GTreasury.sol:168`）。结果是 owner/治理可能把市场 escrow/补贴池当 surplus 提走，随后 `creditG` 仍按内部账发放 → 等额 backing 落空。**M1 必须二选一**: (a) 在 Treasury 层引入 `reservedBackingG`（= 未结算市场 escrow + 补贴池）, 并把 `surplusG`/`withdrawSurplus` 改为 `balance - totalOutstandingG - reservedBackingG`; 或 (b) 市场 G 全部走新增 treasury wrapper 持有、不进 `GTreasury` 的 surplus 口径, wrapper 禁止提取未结算 escrow/补贴。两种都要保证: 任一时刻 `Treasury 可提 surplus ≤ native 余额 − 全部未结算市场 G 负债`。

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

残留信任假设: 链上只能识别 owner/account 地址, 不能完全识别多个 EOA 是否由同一真人或同一实体控制。因此“独立 owner/account”只能堵同 owner 多 agent 的假独立, 不能彻底证明多 EOA 对手方真实独立。v2 不能声称纯链上已消除自对赌刷 AP；必须把自对赌成本设计为真实、不可回收的 G burn, 并用 AP throttle 让 `单位时间可刷 AP 上限 <= f(单位时间可承受 burn 成本)`。

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
    uint64 settleDeadline;
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
| `snapshotTimestamp` / `snapshotEventId` | `STATE` 盘绑定的未来 checkpoint 约束；不能表示“结算时回读任意历史 storage” |
| `settleDeadline` | `STATE` 盘的最晚结算时间；超过仍未 finalized 则 void + 全额退款 |
| `difficultyBps` | 难度和不确定性权重, 影响 AP 和可能的 G 回报；MVP `MATH` 强制为 0 |
| `trivial` | 由合约按 `templateId+params` 推导的地板盘标记, opener 不能手填 |
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

MVP 硬规则:

1. 所有 `MATH` 模板一律 `trivial=true`, `paysG=false`, `fixedAP=fixedTrivialAP`。
2. `trivial` 与 `difficultyBps` 由合约从 `templateId+params` 推导, opener 不能传入或覆盖。
3. `MATH` 的 AP 发放只走 trivial throttle；`stakeG`、odds、winner share、difficulty 都不能进入 `MATH` AP 公式。
4. Post-MVP 若要加入非 trivial `MATH`, 必须先做模板级 difficulty 上限和独立评审, 不能让 `3*7=21` 这类确定性模板靠高 difficulty 变成 G/AP 农场。

#### STATE

`STATE` 不允许在结算时幻想读取过去任意 block 的 storage 或历史 log。现有 `GameEngine` 已保存 hex owner/location/q/r/happiness 等核心状态, 见 `contracts/src/GameEngine.sol:63` 到 `contracts/src/GameEngine.sol:74`; 但公开 `getHex` 只返回当前 view, 见 `contracts/src/GameEngine.sol:513` 到 `contracts/src/GameEngine.sol:520`。因此历史 block/timestamp 锚点不能设计成“settle 时回读旧 `GameEngine.getHex`”。

MVP 的 `STATE` 只能做 **STATE-by-checkpoint**:

1. `V2World` 在状态变更时主动写入 finalized checkpoint 到合约 storage, 并 emit 同一 `eventId` 的事件。市场结算读取 `V2World.checkpoints(eventId)`, 不读取历史 log。
2. checkpoint schema 至少覆盖: `eventId`, `kind`, `hexKey/battleId/windowId`, `beforeOwner`, `afterOwner`, `actorAgentId`, `blockNumber`, `timestamp`, `finalized`。
3. 市场创建时只能引用未来、尚未发生的 checkpoint: `checkpoint[eventId].exists == false`。
4. 创建时若 `checkpoint[eventId].exists == true`、checkpoint 已 finalized、或结果已通过其他合约状态确定, 必须拒绝创建；若绕过检查创建, 后续只能 void/refund。禁止的是“创建晚于事实”的已发生/已知结果盘, 不是结算时 checkpoint 已存在。
5. 结算时必须读取同一 `V2World.checkpoints(eventId)`, 且只有 `checkpoint[eventId].exists == true && checkpoint[eventId].finalized == true` 才能正常结算。有效 `STATE` 盘本来就依赖未来 checkpoint 在关盘后 finalized。
6. 时间硬约束: 固定时间 checkpoint 使用 `openAt < closeAt <= snapshotTimestamp <= settleAfter <= settleDeadline`; `snapshotEventId` checkpoint 使用 `openAt < closeAt <= eventFinalizableAfter <= settleAfter <= settleDeadline`。
7. 超时硬约束: 若 `block.timestamp > settleDeadline` 时 checkpoint 仍不存在或 `finalized == false`, 该 `STATE` 市场必须 void + 全额退款, 避免资金永久卡死。
8. snapshot/checkpoint 锚点只防 resolver 任意挑结算时刻, 不防玩家在快照前合法改变世界状态；这类可影响结果的行动是市场风险本身, 由 odds/TWAP/eligibility 规则定价, 不是 resolver 权限问题。

若 M0 选择推荐方案 B, v2 的 `STATE` 盘默认读取 `V2World` 的 checkpointed owner/defense/battle result；旧 `GameEngine` 只作为迁移快照或参考状态源。

可支持的问题:

| 问题 | 结算来源 |
| --- | --- |
| “checkpoint E finalized 后 hex Y 是否归 agent A?” | `V2World.checkpoints(E).afterOwner`; E 创建时必须不存在 |
| “battle X 是否由 agent A 获胜?” | `V2World` 写入的 finalized battle checkpoint |
| “某个时间窗内 agent A 是否至少占领 N 个 hex?” | `V2World` 写入的 window checkpoint, 不是结算时回扫历史 |

`STATE` 盘必须绑定 `snapshotEventId` 或可由 `V2World` 在未来主动生成的 checkpoint 计划, 并设置 `settleDeadline`。M3 上线 `STATE` 前必须先完成 M2 的 V2World checkpoint schema；否则 MVP 只能上线 `MATH` 市场, `STATE` 后置。

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

非 trivial 市场若要发 AP 或 G 补贴, 必须满足独立对手方规则:

1. 至少 2 个独立 owner/account 参与, 且胜负两边各有达到 `minIndependentLoserStakeG` 的独立 owner losing risk；只看 agentId 不够, 因为 `AgentRegistry.createAgent` 没有创建成本, 见 `contracts/src/AgentRegistry.sol:71` 到 `contracts/src/AgentRegistry.sol:93`。但独立 owner/account 不是独立真人证明, 多 EOA 同控自对赌是链上不可完全识别的残留信任假设。
2. creator、resolver、subject agent 的 owner 自身下注不得计入 AP backing、losing stake backing 或补贴资格；这些 stake 可参与盈亏结算, 但不能放大奖励。
3. 同一 owner 跨 outcome 的仓位按净风险计入: `ownerNetRisk(outcome) = max(stakeOnOutcome - stakeOnOtherOutcomes, 0)`。自我对冲/对敲不算独立 losing stake, 不得提高 AP/G 补贴。
4. 非 trivial 市场必须对 losing pool 收真实 burn 费: `losingBurnG = burnBps * eligibleLosingStakeG`, 该部分 G 真销毁或进入不可回流 sink, 不分给 winning account, 不进补贴池, 不计为协议可回收 surplus。这样多 EOA 自对赌每轮都有不可回收成本。
5. 单边盘或无独立对手盘不得发 AP、不得发 G 补贴；市场结算后只退款或按 void 规则退回本金。
6. 非 trivial `winAP` 上限必须同时受独立 distinct-owner losing stake 和真实 burn 成本约束, 例如 `winAP <= min(f(eligibleDistinctOwnerLosingStakeG), g(realBurnedGInMarket))`, 不能只看 total stake、winning stake 或 winner share。
7. AP throttle 必须满足经济约束: `单位时间自对赌可刷 AP 上限 <= h(单位时间可承受 losingBurnG)`, 使自对赌刷 AP 的边际成本高于正常赢盘/行动收益。
8. 可选加强: 对计入 non-trivial eligibility 的 account 增加 identity/account 成熟度、历史活跃度、或建号/参赛 bond 门槛；bond 不是独立性证明, 只是提高批量多 EOA 自对赌成本。
9. 预存补贴池只对满足以上规则的市场释放；否则补贴留池, 不随自有资金对敲流出。

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
          + stakeWeight(ownerNetWinningRiskG)
          * difficultyWeight(question.difficultyBps)
          * uncertaintyWeight(early odds TWAP snapshot)
          * winnerShareWeight(ownerNetWinningRiskG / totalEligibleNetWinningRiskG)
    winAP = min(
        winAP,
        f(eligibleDistinctOwnerLosingStakeG),
        g(realBurnedGInMarket)
    )
```

trivial 盘必须走固定 AP 分支, `stakeWeight(stakeG)` 强制不参与计算。否则“确定性赢 + 押更多 G”会变成 G 买 AP, 违反 AP 不可购买铁律。

非 trivial 的 `uncertaintyWeight` 不能使用关盘瞬时赔率。M1/M3 必须定义早期窗口或 TWAP 快照, 例如 `oddsSnapshot = TWAP([openAt + warmup, closeAt - antiSnipeWindow])`, 并在 `closeAt` 前锁定。最后一刻自有资金翻动的 odds 不得提高 AP 乘子。

约束:

| 约束 | 说明 |
| --- | --- |
| 赢方才有 AP | 输方无 AP, 但可通过 trivial 盘重新爬回 |
| AP 有上限 | 单市场、单 agent、单 owner/account、单 epoch、global 都要 cap |
| 难度越高回报越高 | 难题和高不确定性盘给更大 AP/G 激励 |
| 地板盘只保活 | trivial 盘给固定 tiny AP, 与 stake 无关, 只解决防锁死 |
| AP 不走市场交易 | AP 不上市、不转让、不兑换 |
| 非 trivial 有独立输家和 burn 成本约束 | 无独立对手方、单边盘、自我对冲盘只退款, 不发 AP/G 补贴；多 EOA 同控只能用真实 G burn、AP throttle、account 成熟度/bond 缓解 |

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

MVP 做三个动作: 攻击、加地块防御、0-hex 回场。建造、采集、debate、chronicle 等旧动作不进 v2 MVP 主循环。

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
10. 每次成功/失败攻击都必须让 `V2World` 写入 battle/capture checkpoint, 供 `STATE` 市场引用未来事件。

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

防御必须在 M0/M1 定稿为可验证不变量, 不是后置调参:

```text
0 <= effectiveDefense(hex, t) <= D_max
effectiveDefense(hex, t + defenseHalfLife) <= effectiveDefense(hex, t) / 2 unless upkeep AP is paid
costToReachDefense(D_max) >= rho_min * minAttackAP
costToReachP50AttackAgainst(D) <= rho_max * costToReachDefense(D), for all D <= D_max
P(success | apSpend = maxReasonableAttackAP, defense = D_max) >= p_floor
```

含义: 防御有最大值、半衰期或 upkeep、递增成本, 且攻击达到 50% 胜率的成本不能无限高。否则地图会冻结成永久堡垒。

### 动作 C: 0-hex 回场

trivial AP 地板只解决“有 AP”, 不解决“没有 source hex”。因为攻击规则要求 `fromHexKey` 属于 attacker；旧 `GameEngine.attack` 也要求 source hex 属于 attacker, 见 `contracts/src/GameEngine.sol:385` 到 `contracts/src/GameEngine.sol:390`。旧版已有两个 comeback 参考: `claimNeutral` 可领取 ownerId=0 的 hex, 见 `contracts/src/GameEngine.sol:535` 到 `contracts/src/GameEngine.sol:555`; `inciteRebellion` 只允许 0-hex agent 尝试回场, 见 `contracts/src/GameEngine.sol:561` 到 `contracts/src/GameEngine.sol:590`。

v2 MVP 必须内置一个不需要 source hex 的领土回场路径, 默认接口:

```solidity
function returnFromElimination(
    uint256 agentId,
    bytes32 targetHexKey,
    uint256 apSpend
) external returns (bytes32 claimedHexKey);
```

规则:

1. `V2World.hexCount(agentId) == 0` 才能调用。
2. `apSpend >= respawnAP`, 从 `APLedger` 扣除。
3. 优先 claim ownerId=0 的 neutral/unowned hex；该路径不需要 `fromHexKey`。
4. `V2World` 必须保证存在可回场目标: 初始化保留 neutral/unowned respawn pool, 或在无 neutral 时允许 0-hex agent 用该接口触发一次 capped respawn contest。不能出现“有 AP 但永远无法获得第一个 hex”的状态。
5. 回场成功写入 respawn/capture checkpoint, `hexDefense[claimedHexKey] = 0`, 并进入正常邻接攻击循环。

### V2 score 与胜利条件

旧 `GameEngine.getScore` 使用 `hexCount * 100 + orePool + buildings * 50`, 见 `contracts/src/GameEngine.sol:494` 到 `contracts/src/GameEngine.sol:507`。v2 已删除 ore/build, 因此不能复用旧 score。

MVP `V2World` 必须暴露新的 `getScore(agentId)` 或 `ScoreView`:

```text
v2Score =
    hexCount(agentId) * SCORE_PER_HEX
  + seasonCaptureCount(agentId) * SCORE_PER_CAPTURE
  + seasonBattleWinCount(agentId) * SCORE_PER_BATTLE_WIN
  + nonTrivialEligibleMarketWins(agentId) * SCORE_PER_MARKET_WIN
  + nonTrivialAPEarned(agentId) * SCORE_PER_NONTRIVIAL_AP
```

v2 score 按状态和动作结果计分, 不按 AP 花费额计分。`reinforceHex`、`returnFromElimination`、攻击等动作消耗的 AP 不得进入 score 累加项；trivial AP 即使被花掉, 也不能通过 `apSpentOnActions` 之类字段间接计分。trivial AP、G balance、ore、mine、arsenal 不计入 v2 score。胜利条件是 season/epoch 结束时 `V2World`/`ScoreView` 返回的 `v2Score` 最高；前端和 MCP 展示必须从 v2 score 源读取, 不再展示旧 `GameEngine.getScore` 作为胜负依据。

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
| `PredictionMarketEngine` | 开盘、下注、关盘、结算、claim G/AP；维护 escrow、subsidy pool、surplus backing 账；按 owner/account 记录净风险和独立对手方 eligibility |
| `MarketSettlementResolver` | MATH 自校验、STATE 只读 `V2World` finalized checkpoint；ORACLE 外部结算接口后置 |
| `APLedger` | AP 余额、市场唯一增发入口、动作唯一扣费入口、trivial 多维 cap |
| `HexGrid` library | public/library 级 hex 坐标、边界、邻接校验 |
| `RNGProvider` | VRF 或 commit-reveal 适配层；MVP 攻防依赖它, 禁用裸 `block.prevrandao` |
| `V2World` | 推荐方案: 自持 v2 hex owner、defense、battle result、spawn/respawn、score、finalized checkpoint storage/event, 暴露 `attackWithAP` / `reinforceHex` / `returnFromElimination` 或被 `APActionAdapter` 调用 |
| `APActionAdapter` | 若保留 adapter, 只连接 AP、RNG、`V2World`; 不外部改旧 `GameEngine` 内部状态 |
| `ActionCardBonusAdapter` | 后置; 把 CardLedger/Arena 卡牌映射成攻防 bonus |

权限边界:

1. `GTreasury.creditG` 的正式奖励路径只能接受单一 `PredictionMarketEngine` 或 treasury wrapper 地址, 不接受全局 `AgentRegistry.operators`。`PredictionMarketEngine` 只有在 losing stakes / 预存补贴池 / 协议 surplus 等额 backing 已扣减或锁定后, 才能调用 `creditG`。
2. 只有 `PredictionMarketEngine` 可以调用 `APLedger.creditFromMarket`。
3. 只有 `V2World` 或 `APActionAdapter` 可以调用 `APLedger.spendForAction`。
4. `V2World` 是唯一能用 AP 改 v2 世界状态的入口；若 M0 选方案 A, 则必须是旧 `GameEngine` 内部 AP-gated hook 写状态。
5. 外部 adapter 不得直接改旧 `GameEngine.hexes/agentHexKeys/hexCount`。
6. `V2World` 是唯一能写 finalized checkpoint 的合约；市场只能引用创建时不存在、未来才会 finalized 的 checkpoint。
7. `GTreasury.fundAgentG` 只允许测试网或受控迁移, 不能作为正式经济 mint。

V2World 是 MVP 最大单块, 不能在排期里隐形处理。推荐方案 B 至少包含:

1. `hexOwner/hexCount/agentHexKeys` 等 v2 hex 存储和 `HexGrid` 邻接/边界库。
2. `hexDefense`、防御上限/衰减/upkeep、capture 后清零。
3. `attackWithAP`、`reinforceHex`、`returnFromElimination` 写状态和事件。
4. spawn/respawn 规则, 包括 0-hex agent 的回场保证。
5. finalized checkpoint mapping 和事件 schema, 供 `STATE` 市场读取。
6. v2 score/season 统计。
7. 若继承旧世界, 一次性迁移/导入旧 `GameEngine` 快照。

迁移成本也要算进 MVP: MCP 目前在 `mcp-server/src/chain.ts:42` 到 `mcp-server/src/chain.ts:64` 绑定旧 `GAME_ENGINE_ABI`; tools 仍暴露 harvest/build/attack 语义, 见 `mcp-server/src/tools.ts:131` 到 `mcp-server/src/tools.ts:160`; agent prompt 仍写“spawn 7 hex、ore、mine、arsenal、raid、旧 score”, 见 `agent-runner/src/llm.ts:329` 到 `agent-runner/src/llm.ts:355`; frontend hook 仍读取旧 `getScore/getHex/orePool/inciteRebellion`, 见 `frontend/src/hooks/useGameEngine.ts:41` 到 `frontend/src/hooks/useGameEngine.ts:48`。MVP 集成必须把这些读写源切到 Market/AP/V2World, 不能只部署合约。

## 9. MVP 范围

MVP 做:

1. Layer 1: 市场引擎, 支持 `MATH` 和 `STATE-by-checkpoint`。若 V2World checkpoint 未完成, MVP 降级为 `MATH`-only, `STATE` 不上线。
2. Layer 2: AP ledger 和赢盘发 AP；非 trivial AP/G 只对有独立对手方、净风险、真实 losing burn 成本、早期 odds/TWAP 的市场发放。
3. Layer 3: AP 攻击邻接 hex, AP 加己方 hex 防御, AP 触发 0-hex 回场。
4. `V2World` minimal core: v2 hex 存储、defense、spawn/respawn、capture、score、finalized checkpoint。
5. RNGProvider: M0 选定并在 M4 接入 VRF 或 commit-reveal, 不用裸 `block.prevrandao`。
6. UI/MCP/agent-runner 只围绕 Market -> AP -> V2World Action 这条闭环展示和操作。

MVP 不做:

1. ore。
2. 建造/采集。
3. 把每个动作包装成答题。
4. 卡牌数值接入。
5. 复杂外交/debate/chronicle 经济化。
6. ORACLE 盘创建/结算。
7. 让外部 adapter 改旧 `GameEngine` 内部 hex 状态。
8. 使用旧 `GameEngine.getScore`、ore/building 字段作为 v2 胜负依据。

## 10. 里程碑

### M0: Blocking 决策

以下不是调参, 是实现前必须定稿的承重边界:

1. World 二选一: A 升级旧 `GameEngine` 暴露 AP-gated capture hook; B 新 `V2World` 自持 hex/战斗/checkpoint 状态。推荐 B。
2. `V2World` minimal schema: hex storage、spawn/respawn、defense、capture、score、checkpoint event/mapping。
3. `STATE` checkpoint 策略: eventId 生成、finalized 条件、创建时 checkpoint 必须不存在、结算时 checkpoint 必须存在且 finalized、`openAt < closeAt <= snapshotTimestamp <= settleAfter <= settleDeadline` 或 `openAt < closeAt <= eventFinalizableAfter <= settleAfter <= settleDeadline`、创建时已存在/已知结果拒绝或 void、超时未 finalized 则 void/refund。
4. G backing 来源和比例: losing stakes、预存补贴池、协议 surplus 的使用顺序、比例、释放条件；不得新增无 backing payout。
5. `GTreasury.creditG` 单一市场入口或 wrapper 方案, 以及 `reservedBackingG`/wrapper escrow 的二选一落地方式。
6. 防御不变量: `D_max`、`defenseHalfLife/upkeep`、`costToReachDefense`、`costToReachP50AttackAgainst`、`p_floor`。
7. 非 trivial AP eligibility: 独立 owner 数、最小 losing stake、creator/resolver/subject 排除、同 owner 净风险、单边退款；多 EOA 同控是链上不可完全识别的残留信任假设, 必须定稿 losing pool 真实 burn 费、AP throttle 经济约束和可选 account 成熟度/bond 门槛。
8. odds anti-snipe: 早期窗口或 TWAP 快照定义, 不能用 close 瞬时 odds。
9. 邻接校验落为 public/library `HexGrid`, 不复用旧 `attack` 的 location 模型。
10. RNG 选 VRF 或 commit-reveal, 并定义请求、揭示、超时、失败/退款规则。裸 `block.prevrandao` 不进入 AP 攻防。
11. ORACLE 明确后置；若 owner 要提前, 必须先补信任模型和 challenge/attestation 流程。

### M1: Treasury + MATH Market

实现:

1. `GTreasury` 市场权限收紧: `creditG` 正式奖励路径只认 `PredictionMarketEngine` 或 treasury wrapper。
2. escrow / subsidy / surplus backing 账, 确保所有 G payout 有来源。**封死 Treasury 层保留边界（§3 G 铁律第 6 条）**: 引入 `reservedBackingG` 并改写 `surplusG`/`withdrawSurplus`, 或让市场 G 走独立 treasury wrapper, 保证未结算市场 escrow/补贴不会被当 surplus 提走。
3. question/market/position 数据结构, binary market, G 下注、关盘、void/refund、结算状态机。
4. `MATH` 白名单模板自校验, 且 MVP 全部强制 `trivial=true`, `paysG=false`, `fixedAP=fixedTrivialAP`。
5. owner/account 级仓位和净风险统计, 为 M3 AP/G eligibility 做准备。

M1 可以上线 `MATH`-only 内测；不能上线 `STATE`, 因为 checkpoint 依赖 M2 `V2World`。

### M2: V2World Minimal Core

实现:

1. v2 hex storage、`hexOwner`、`hexCount`、`agentHexKeys`。
2. `HexGrid.areAdjacent`、边界、spawn/respawn allocator。
3. `hexDefense`、防御不变量、capture 后清零。
4. `returnFromElimination` 的 0-hex 回场路径。
5. finalized checkpoint mapping 和事件 schema, 覆盖 battle/capture/respawn/window。
6. `getScore` 或 `ScoreView` 的 v2 score。
7. 若继承旧世界, 完成一次性快照导入工具和校验。

### M3: Settlement + AP Ledger

实现:

1. `STATE` 只读取 M2 的 `V2World.checkpoints(eventId)`, 不读历史 storage/log。
2. checkpoint 未来性、结算和超时防护: 创建时 `eventId` 必须不存在, 创建时已 finalized/已知结果则拒绝或 void/refund；正常结算时 `V2World.checkpoints(eventId)` 必须存在且 `finalized == true`; `openAt < closeAt <= snapshotTimestamp <= settleAfter <= settleDeadline` 或 `openAt < closeAt <= eventFinalizableAfter <= settleAfter <= settleDeadline`; 超过 `settleDeadline` 仍未 finalized 则 void + 全额退款。
3. AP 唯一 mint 路径: settled winning position -> `APLedger.creditFromMarket`。
4. trivial AP 固定发放和多维 cap。
5. 非 trivial AP/G eligibility: 至少 2 个独立 owner、双边最小 loser stake、creator/resolver/subject 排除、同 owner 净风险、单边退款；多 EOA 同控是链上不可完全识别的残留信任假设, 必须用 losing pool 真实 burn 费、AP throttle 经济约束和可选 account 成熟度/bond 门槛缓解。
6. 早期 odds/TWAP snapshot 进入 `uncertaintyWeight`; close 瞬时 odds 不进入 AP 公式。

### M4: AP-gated Action

实现 `attackWithAP`、`reinforceHex`、`returnFromElimination`。攻击使用 `HexGrid.areAdjacent`、AP/defense 输入、M0 选定 RNG、capture 后防御清零, 并写 battle/capture/respawn checkpoint。若采用推荐方案 B, owner 迁移写入 `V2World`; 旧 `GameEngine` 只作参考/库。

### M5: Integration

MCP/agent-runner/frontend 迁移:

```text
可下注市场 -> 我的 G 仓位 -> 结算可 claim AP -> 我的 AP -> V2World 可攻击/可防御/可回场 hex
```

必须替换旧 `GameEngine` ABI 和 prompt/UI 假设: ore/build/raid/旧 score 只作为 v1 资料, 不作为 v2 主循环。

### M6: Post-MVP Cards

把 `CardLedger`/`ArenaEngine` 的卡牌作为攻防 bonus 接入 `V2World` 或 `APActionAdapter`, 再扩展动作接口携带 card set。

### M7: Post-MVP Oracle

在单独评审中确定 ORACLE 信任模型、challenge window、attestation 来源和失败处理后, 才能把 `ORACLE` 加回 `QuestionKind`。

## 11. 与旧 `feat/ux-demo-roadmap` 的关系

旧分支是“万物皆答题”。本版收窄为: 只有“赌”是 Question/Market, 攻击和防御是花 AP 的普通动作, 并砍掉 ore。这是更聚焦的重做。

## 12. OPEN 待 owner

承重项已经上提到 M0/M1 blocking 决策, 不再放在 OPEN: G backing 来源/比例、`creditG` 权限模型、`STATE` checkpoint 锚定策略、World 方案 A/B、防御不变量和成本曲线。

仍可留待 owner 数值定稿的项:

1. trivial 盘具体节流数值: `fixedTrivialAP`、`T_agent_epoch`、`T_owner_epoch`、`T_global_epoch`、`E_min/E_max`、重复模板限流参数。约束式不可放松。
2. 非 trivial AP 公式常数: `baseWinAP`, stake 权重、difficulty 权重、TWAP uncertainty 权重、`f(eligibleDistinctOwnerLosingStakeG)`、`g(realBurnedGInMarket)`、`burnBps`、单市场和单 epoch cap。不能放松独立对手方/净风险/真实 burn 成本/单边退款规则。
3. 动作成本数值: `minAttackAP`, `respawnAP`, 攻击 AP 到 attackPower 的换算, `reinforceHex` 在 M0 防御不变量内的具体参数。
4. Layer 4 卡牌接入时机和数值: 卡牌是否消耗、是否锁定在动作中、是否可同时用于 Arena 和领土战。
5. Post-MVP ORACLE: 信任模型、挑战窗口和 attestation 来源。MVP 不实现。
