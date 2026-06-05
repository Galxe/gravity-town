# G 提现 + 全额兜底 — 实现方案

> 状态:**合约部分已实现并测试通过(2026-06-05)**;MCP / 前端 / 部署脚本待做。下方"实现进度"记录与原计划的差异。这是一次涉及真实资金的合约改造,合并前需团队 review。

## 实现进度

**✅ 已完成(合约层)**
- `GTreasury.sol`:`totalOutstandingG` 累加器、`withdraw`、`withdrawSurplus`、`surplusG()` 视图、`faucetEnabled`/`withdrawEnabled` 互斥双开关、所有 credit/spend 路径维护累加器。
- `ArenaEngine.sol`:`WEI_PER_G = 1e18`、buy/roll 两处 spend ×WEI_PER_G、`bootstrapMarket` 改为 faucet-gated + 金额 ×WEI_PER_G。
- 测试:新增 `GTreasuryWithdraw.t.sol`(14 测,含 reentrancy + 256-run 不变量 fuzz);迁移 `ArenaEngine.t.sol` / `ArenaTier.t.sol` / `BenchInvariant.t.sol` 的 G 额度 ×1e18。`forge test`:106 通过(仅 2 个预先存在的 incite 随机性测试失败,与本改动无关)。

**与计划的 3 处差异**
1. **重入守卫**:vendored OZ 5.6.1 不含 `ReentrancyGuardUpgradeable` → 改用合约内置极简 mutex(`_reentrancyStatus`,追加在存储末尾,布局安全,0/1=未进入、2=进入,无需 init)。
2. **段位阈值也要 wei 化**(计划站点清单漏了):`DEFAULT_TIER_SILVER_MIN_G`/`GOLD` 改为 `100 * WEI_PER_G` / `1000 * WEI_PER_G`;`setTierThresholds` 入参现在也是 wei。
3. **`faucetEnabled` 默认 true**(在 `initialize` 设):新部署/测试天然过 fundAgentG。⚠️ **升级已部署的测试网代理后,owner 需手动调一次 `setFaucetEnabled(true)`**(initialize 不会重跑)。

**✅ 追加完成**
- **自动续排(opt-in,方案 B)**:`ArenaEngine.submit(uint256,bool)` 重载 + `autoRequeue` mapping;`settleMatch` 对 opt-in 的 ghost 自动续排(重算段位),否则维持一次性。新增 5 个测试。
- **升级安全修复**:`spendG` 的 `totalOutstandingG` 改饱和减法 —— 修复"原地升级已部署 GTreasury 代理时 totalOutstandingG=0 但 gBalance>0 → 每次 spend 下溢 revert 把测试网打死"的真实 bug(审计用 Foundry 三重证实)。`withdrawSurplus` 加 `withdrawEnabled` 门禁(faucet 模式下不放任何 native 出去)。新增 2 个回归测试。

**⏳ 待做(经 29-agent 审计 + 对抗验证,按"上线必做 / should / 后续"分级)**

_上线必做(没有这些功能用不了 / 部署即坏):_
- **MCP — 单位 ×1e18**:`arenaDepositG`(chain.ts:817)、`fund_agent_g`/`creditAgentG`(chain.ts:1048)发的都是裸数 → deposit 是微尘、测试网播种全员 Bronze。
- **MCP — gBalance 读取改 BigNumber/string**:chain.ts:820/872/1050/1063 的 `Number(gBalance)` 在 wei 量级丢精度(>2^53)。
- **MCP — 新增提现/续排能力**:ABI + chain 方法 + 工具 `arena_withdraw` / `arena_withdraw_surplus` / `arena_get_surplus`;`arena_submit` 暴露 `requeue_on_settle` 布尔(+ ABI 加 `submit(uint256,bool)` 重载)。
- **部署脚本 ×WEI_PER_G**:`SeedArena.s.sol:61`、`ArenaTierDemo.s.sol:37` 的 `fundAgentG` 裸数 → 播种额度变微尘。
- **部署/升级流程**:主网新部署 `setFaucetEnabled(false)`→`setWithdrawEnabled(true)`、不跑 bootstrap(`Deploy.s.sol:124`);测试网 `gravity-upgrade` 后 owner 手动 `setFaucetEnabled(true)`(`Upgrade.s.sol`)。

_should(正确性/体验,非硬阻塞):_
- 前端:`useArenaStore.gBalance` 类型 `number→string/bigint`;`useArenaEngine.ts:343` 与 `LeaderboardPanel.tsx:128` 用 `formatUnits(_,18)` 展示。
- `ArenaEngine.setTierThresholds` 的 NatSpec 已过时("set 100/1000 恢复默认" → 现在是 wei)。
- `creditG` 防御性说明:withdraw 模式下唯一调用方是守恒的 market_sale,但函数本身可被 operator 无背书 inflate —— 文档化或加约束。

_后续(纯 UX / 文档):_
- 前端提现 modal、续排开关、surplus 展示、i18n keys。
- 文档/Skill 去除"G 不可提现 / 1 wei=1 G"过时表述,补充 auto-requeue + withdraw 工具;`arena-matchmaking-combat.md` settle 流程图与函数行号已偏移需更新。

---

> 原设计(供 review):这是一次涉及真实资金的合约改造,实现前需团队 review 本文。
> 相关合约:`GTreasury.sol`(主战场)、`CardLedger.sol`、`ArenaEngine.sol`、`UnitCatalog.sol`;链下 `mcp-server`、`frontend`。
> 背景与战斗/匹配逻辑见 [arena-matchmaking-combat.md](./arena-matchmaking-combat.md)。

---

## 1. 已锁定的产品决策

| # | 决策 | 选择 |
|---|---|---|
| 1 | 兜底模型 | **全额兜底**:合约 native 余额 ≥ Σ gBalance;主网禁免费水龙头 |
| 2 | 玩家提现权限 | **仅 agent owner → 提到自己钱包**(与 `depositG` 权限对称) |
| 3 | 盈余(buy/roll 抽水)去向 | V1 **owner 提到金库**,函数 `to` 可寻址,留作以后接奖池 |
| 4 | 主网 onboarding | **deposit-to-play,不送注册礼**;免费玩只留测试网 |
| 5 | rescue 函数 | 与盈余提取**合并为一个** `withdrawSurplus`,永远碰不到用户兜底 |
| 6 | 单位口径 | **B:gBalance 用 wei 记账**;catalog 价格保持小整数,边界换算 |

---

## 2. 核心不变量

```
address(this).balance  ≥  totalOutstandingG  ( == Σ gBalance )
盈余 surplus           =  address(this).balance − totalOutstandingG
```

- 每一点用户 gBalance 都有等额 native G 兜底。
- `withdraw`(用户)只能动自己的 gBalance;`withdrawSurplus`(owner)只能动 surplus。**任何函数都不可能让 balance 跌破 totalOutstandingG。**

新增累加器:

```solidity
uint256 public totalOutstandingG;  // credit/deposit 时 +,spend/withdraw 时 −
```

> **迁移注意**:主网**全新部署**,gBalance 从 0 开始,`totalOutstandingG` 天然同步,无需回填。测试网现存的水龙头余额下 withdraw/surplus 全程关闭,累加器不参与,也无需回填。

---

## 3. credit 路径审计结果(已核实)

| 调用 | 位置 | 方向 | 守恒? |
|---|---|---|---|
| `spendG` arena_buy | `ArenaEngine.sol:270` | 用户 − → 盈余 | rake(有意) |
| `spendG` arena_roll | `ArenaEngine.sol:383` | 用户 − → 盈余 | rake(有意) |
| `spendG` market_buy | `CardLedger.sol:131` | 买家 − | ✅ 与下一行对冲 |
| `creditG` market_sale | `CardLedger.sol:132` | 卖家 + | ✅ 玩家间转账,守恒 |
| `creditG` market_seed(500) | `ArenaEngine.sol:919` | 凭空 + | ❌ **仅测试网** |
| `fundAgentG` 水龙头 | `GTreasury.sol:35` | 凭空 + | ❌ **主网禁用** |

**结论**:正常玩法里唯一的 `creditG`(market_sale)被等额 `spendG`(market_buy)对冲,兜底不破。只需在主网关掉 `fundAgentG` 和 `bootstrapMarket` 这两个无抵押印钱口。

---

## 4. GTreasury 合约改造

### 4.1 新增/改写函数

```solidity
// ── 用户侧 ──────────────────────────────────────────────
function depositG(uint256 agentId) external payable {
    require(msg.sender == registry.agentOwner(agentId), "not agent owner");
    require(msg.value > 0, "zero deposit");
    gBalance[agentId]  += msg.value;     // 单位 = wei(B 方案下天然正确)
    totalOutstandingG  += msg.value;
    emit GCredited(agentId, msg.value, bytes32("deposit"));
}

function withdraw(uint256 agentId, uint256 amount) external nonReentrant {
    require(msg.sender == registry.agentOwner(agentId), "not agent owner");
    require(gBalance[agentId] >= amount, "insufficient G");
    gBalance[agentId]  -= amount;        // ① effects
    totalOutstandingG  -= amount;
    (bool ok, ) = msg.sender.call{value: amount}("");  // ② interaction
    require(ok, "transfer failed");
    emit GWithdrawn(agentId, amount, msg.sender);
}

// ── owner 侧:盈余提取 == 应急救援(同一函数)──────────────
function withdrawSurplus(address to, uint256 amount) external onlyOwner nonReentrant {
    require(address(this).balance - amount >= totalOutstandingG, "would touch user backing");
    (bool ok, ) = to.call{value: amount}("");
    require(ok, "transfer failed");
    emit SurplusWithdrawn(to, amount);
}

// ── operator 侧:spend/credit 维护累加器 ──────────────────
function spendG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
    require(gBalance[agentId] >= amount, "insufficient G");
    gBalance[agentId]  -= amount;
    totalOutstandingG  -= amount;        // ← 花掉的转成盈余
    emit GSpent(agentId, amount, reason);
}

function creditG(uint256 agentId, uint256 amount, bytes32 reason) external onlyOperator {
    gBalance[agentId]  += amount;
    totalOutstandingG  += amount;        // market_sale 必有等额 market_buy 抵过
    emit GCredited(agentId, amount, reason);
}
```

### 4.2 水龙头按环境门禁

```solidity
bool public faucetEnabled;   // 默认 false;测试网部署后 owner 开启

function setFaucetEnabled(bool v) external onlyOwner { faucetEnabled = v; }

function fundAgentG(uint256 agentId, uint256 amount) external onlyOwner {
    require(faucetEnabled, "faucet disabled");   // 主网永不开启
    gBalance[agentId]  += amount;
    totalOutstandingG  += amount;   // 注意:水龙头会让 totalOutstanding > balance,
                                    // 因此 faucet 与 withdraw/withdrawSurplus 互斥(见 §6)
    emit GFunded(agentId, amount, msg.sender);
}
```

> ⚠️ **水龙头与全额兜底互斥**:`fundAgentG` 凭空抬 `totalOutstandingG` 但不进真钱,会破坏 `balance ≥ totalOutstandingG`。因此**同一环境下 faucet 与 withdraw 不能同时开**。用两个开关 `faucetEnabled` / `withdrawEnabled` 强制互斥(部署时只开一个),见 §6。

### 4.3 存储布局(UUPS 安全)

现有变量:`registry`、`gBalance`。**新增变量一律追加到末尾**,不得插入中间:

```
... registry, gBalance,            // 既有
    totalOutstandingG,             // 新增
    faucetEnabled, withdrawEnabled // 新增(打包进同一 slot)
```

---

## 5. 单位迁移(B 方案:wei 记账 + WEI_PER_G 边界换算)

**记账层(wei)**:`gBalance`、`totalOutstandingG`、`depositG`/`withdraw` 的 value、市场 `askPriceG`、所有 `spendG/creditG` 的 amount。

**定价层(小整数 G)**:`UnitCatalog` 卡价(3~6)、`ROLL_COST`(1)保持不变,**只在 spend 的边界乘 `WEI_PER_G`**,避免撑爆 `uint16 unitCost`。

```solidity
uint256 public constant WEI_PER_G = 1e18;   // 定价旋钮,见 §8 待定项
```

### 5.1 必改站点清单

| 文件:行 | 现状 | 改为 |
|---|---|---|
| `ArenaEngine.sol:270` | `spendG(agentId, unitCost, ...)` | `spendG(agentId, unitCost * WEI_PER_G, ...)` |
| `ArenaEngine.sol:383` | `spendG(agentId, ROLL_COST, ...)` | `spendG(agentId, ROLL_COST * WEI_PER_G, ...)` |
| `ArenaEngine.sol:919` | `creditG(seedAgentId, 500, ...)` | bootstrap 仅测试网;若保留同样 `* WEI_PER_G` |
| `CardLedger.sol:131-132` | `spendG/creditG(price)` | `price` 即 wei(挂单价由前端按 G×1e18 设),守恒不变 |
| `mcp-server/src/chain.ts:817` | `value = BigNumber.from(amountG)` | `value = parseUnits(amountG, 18)` 真正乘 1e18 |
| `mcp-server/src/chain.ts:820,872,1063` | `Number(gBalance)` | `formatUnits(gBalance, 18)` 展示前除 |
| `mcp-server/src/tools.ts:645,648` | "1 wei = 1 G" 说明 | 改成"amount_g 为整枚 G,自动 ×1e18" |
| `frontend/.../LeaderboardPanel.tsx:128` | `G {g.gBalance}` | `G {formatG(g.gBalance)}`(除 1e18 + 千分位) |
| `frontend/.../useArenaEngine.ts:343,393` | `Number(gBalances[i])` | 保留 BigInt,展示层格式化(避免 2^53 精度丢失) |

> **精度提醒**:wei 量级会超过 JS `Number` 安全整数(2^53)。前端/MCP 读 gBalance 必须用 `BigInt`/`BigNumber` 传递,只在最终展示时 `formatUnits`。`chain.ts` 现在大量 `Number(...)` 包裹 gBalance,迁移时要逐个换掉。

### 5.2 不需要改的

- `UnitCatalog` 的 `uint16 unitCost` 字段**保持不变**(3~6),靠 `WEI_PER_G` 在边界换算 → 不动 catalog 签名,不连锁。
- 市场守恒逻辑不变(spend == credit,单位一致即可)。

---

## 6. 环境分治

| | 测试网 | 主网 |
|---|---|---|
| `faucetEnabled` | ✅ true | ❌ false(永不开) |
| `withdrawEnabled` | ❌ false | ✅ true |
| `fundAgentG` / `bootstrapMarket` | 可用 | 禁用 |
| G 语义 | 游戏积分 | 全额兜底真代币 |
| 不变量 `balance ≥ totalOutstanding` | 不要求(faucet 抬高 outstanding) | **强制成立** |

`withdraw` / `withdrawSurplus` 开头加 `require(withdrawEnabled, "withdraw disabled")`,与 `faucetEnabled` 部署时二选一。**演示和零门槛体验完整保留在测试网,真代币经济只在主网生效。**

---

## 7. 测试计划(Foundry)

新增 `GTreasuryWithdraw.t.sol`,至少覆盖:

1. `test_deposit_then_withdraw_roundtrip` — 充 N、提 N,余额与 native 都归零。
2. `test_withdraw_only_owner` — 非 agent owner 调 revert "not agent owner"。
3. `test_withdraw_exceeds_balance_reverts` — 提 > gBalance revert。
4. `test_withdraw_goes_to_msg_sender` — 钱只到 owner 自己地址。
5. `test_withdrawSurplus_cannot_touch_backing` — 当 amount 会跌破 totalOutstandingG 时 revert。
6. `test_buy_roll_become_surplus` — buy/roll 后 surplus 增加、totalOutstanding 减少,且可被 withdrawSurplus 提走。
7. `test_market_trade_conserves_outstanding` — 挂单成交后 totalOutstandingG 不变。
8. `test_faucet_and_withdraw_mutually_exclusive` — 两开关不能同时 true。
9. `test_reentrancy_guard` — 恶意接收合约重入 withdraw 被挡。
10. **不变量测试**(invariant/fuzz):任意 deposit/spend/credit/withdraw 序列后 `balance ≥ totalOutstandingG` 恒成立。

并复跑现有 `ArenaEngine.t.sol` / `ArenaTier.t.sol`,确认 `* WEI_PER_G` 改动没破坏战斗/匹配测试(可能要把断言里的 G 数额同步放大)。

---

## 8. 待定的微决策(实现前敲定)

1. **`WEI_PER_G` 取值 = 定价**:`1e18` 意味着单卡 = 3 个真 G、roll = 1 个 G。G 在主网值多少决定贵贱。若要更便宜,调小(如 `1e16` → 单卡 0.03 G)。**这是经济设计,非技术换算。**
2. **水龙头门禁机制**:运行时开关 `faucetEnabled`(灵活,可误开)vs 部署时两份 init(更安全,不可误开)。推荐**开关 + 部署脚本强制主网置 false**。
3. **bootstrapMarket 在主网**:直接不调用即可;是否保留函数(测试网仍需)→ 保留,加 `faucetEnabled` 守卫。

---

## 9. 落地顺序

1. 先合 `GTreasury` 改造 + 单位迁移 + 测试(纯合约,可独立 review)。
2. `just gravity-upgrade` 升级实现(代理地址不变,存储追加安全)。
3. 同步 `mcp-server`(deposit ×1e18、展示 ÷1e18、新增 `arena_withdraw` 工具)。
4. 同步 `frontend`(gBalance BigInt + formatUnits 展示)。
5. 主网部署脚本:`withdrawEnabled=true`、`faucetEnabled=false`、不跑 bootstrap。
6. 测试网维持 `faucetEnabled=true`、`withdrawEnabled=false`。
```
