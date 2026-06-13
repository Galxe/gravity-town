# Gravity Town 下一阶段规划（梳理稿）

> 目的：把四条主线拆成**可分派给单人**的任务，并给出一套任务管理方案，供团队 review。
> 状态：**梳理稿**。待拍板的决策用 🔵 标出；我的倾向用 ✅ 标出。Review 通过后再落成 GitHub issue。
> 一切机制描述**以合约代码为准**，已标注 `file:line`。

---

## 0. 一句话现状

四条主线里，**战斗可视化(#34)、NFT/双循环经济(#28/#46/#47)已有 issue**；真正没人覆盖的是**预测市场**、**大世界平衡**、**随机源完整性**、**仓库卫生**。所以新工作量集中在后四块，前两块是「复用并补拆解」。

**本轮新增的最大盲区是「外部真人用户 + 核心 UX」**（见 ★ 节）：四条主线都是功能，真正的产品脊柱是「真人拥有/驾驭自己的 AI agent」。它派生两条全新 epic——**E6 外部用户客户端**（钱包/写链路/UI，前端首次能写链）和 **E7 用户自营 agent autopilot**（INFRA 多租户）。E6.1（钱包+写链路）是所有真人功能的地基。

---

## ★ 外部用户与核心 UX（本轮新增；定义「为谁做」，建议先于第 1 节阅读）

> 本轮已拍板：外部真人**能运营自己的 agent**（最深一层）；**身份模型 = 真人拥有/控制一个 agent**（非裸钱包）。下面据此设计。

### 产品脊柱：拥有并驾驭一个活在链上的 AI agent

四条主线（市场/平衡/卡/可视化）都是**功能**；真正的外部产品脊柱是「**我的 agent**」——真人连钱包 → 创建 agent → 它（自动或手动）在世界里采矿、打仗、下注、买卡、铸故事卡，真人看它、喂目标、必要时接管。预测市场、卡牌、战斗都是这个 agent **做的事**，不是独立小程序。

### personas（其实是同一身份的不同深度）

| 角色 | 来干嘛 | 现状 |
|---|---|---|
| **Agent 主理人**（核心） | 拥有并驾驭自己的 AI agent 入世界 | 零（前端只读、无钱包、无创建流） |
| 预言家/赌徒（=主理人的一种玩法） | 用 agent 的 ore 在预测市场下注 | 零 |
| 收藏家/牌商（=主理人的一种玩法） | 用 G 收/卖卡（尤其故事 NFT） | 零（市场只有合约，无真人 UI） |
| 观众（最轻） | 看戏、看 agent「怎么想」 | 部分（hex 地图 + Arena 回放 + AgentMind 面板） |

### 身份模型：合约已支持，基本是前端工程

- `canControlAgent` 已放行 `msg.sender == registry.agentOwner(agentId)`（`CardLedger.sol:66-69`、GameEngine 同款）→ 真人钱包只要 own 某 agent，**直接签名即可调用所有动作**，只差前端「连钱包 + 发交易」。
- owner/operator 分离（`AgentRegistry.addOperator/removeOperator`）天然支持「真人 own、平台 operator 跑 autopilot」：真人始终拥有/可收回，平台被委托驱动。**这就是「自营 AI agent」的现成机制。**
- → 身份这块**几乎不用动合约**，是前端 + 极少调整。

### 货币（因「human-as-agent」确认，非反转）

真人通过**自己的 agent**玩，agent 占格就产 ore。故：**预测市场 → ore**（赌 agent 挣的 ore，自洽，保留 2.1 推荐）；**卡牌/Arena → G**（真人充原生代币 → GTreasury，现成）。**ore = 时间/技巧挣的（赌世界）；G = 真金白银（Arena 经济）。**

### ✅ 用户 agent = autopilot 还是手动？→ 决议：owner 战略家 / AI 执行者

| 选项 | 体验 | 代价 |
|---|---|---|
| **LLM autopilot + 真人喂目标/接管**（✅ 倾向） | 兑现「拥有一个自主 AI」的核心幻想；复用 agent-runner + operator 委托 | **每个用户 agent 都要 LLM 调用 + gas**——谁付钱/怎么限流是硬约束 |
| 真人纯手动点动作 | 退化成普通链游（前端只读→可写即可） | 丢掉「自主 AI」差异化 |
| 混合：默认 autopilot、可切手动 | 最灵活 | 实现最重 |

倾向 autopilot+steering，但它派生一条 INFRA 主线（见 E7）：用户 agent 的 LLM 计费与 gas。agent-runner 已支持 per-account LLM key/model，可走「用户自带 key / 买额度 / 免费档限流」；gas 走用户钱包或平台 relayer。

**✅ 决议（结合用户旅程）：不是二选一，是分工。** 用户 = **owner = 战略家**，做低频高杠杆决策（押哪个市场 / 定目标 / 何时开战 / 买哪张卡）；AI = **operator = 执行者**，跑高频琐事（harvest / build / 例行移动 / 路由）。复用现成 owner/operator 机制：用户 own，平台 operator 驱动。这同时回避「纯 autopilot 变看客」和「纯手动丢 AI 魔法」两个坑。**剩下未定的 🔵 只是计费/gas 模型（E7.1）。**

### 用户旅程（end-to-end）

两个嵌套 workflow：轻的「观众 → 赌徒」、深的「agent 主理人」；漏斗把前者导向后者。**每个动作都是一笔交易，魔鬼全在这。**

**Phase 0 · 到站（观众，零钱包）**：落地即看活的世界（hex 地图打仗 + leaderboard + 实时戏剧流）→ 钩子是 **AgentMind 面板**「看 AI 怎么想」→ 看到带赔率的预测市场 + 战斗回放 → CTA「生成你的 agent / 下注」。**看戏不要钱包，别在这一步竖墙。**

**Phase 1 · 上手（转化最难）**：① 连钱包——建议**嵌入式钱包 + 社交登录**（Privy/Dynamic 类），别用 MetaMask 劝退非 crypto 用户；② gas——L1 每个动作都要原生代币，**#1 UX 杀手**；③ `createAgent(name, personality, …)` 自动给 7 格 + 200 ore，**性格即 autopilot 的 LLM 系统提示**，平台可代发（合约无访问控制）。
> ⚠️ **关键洞察：operator-relay 同时解决 gasless 和 autopilot。** 平台 operator 替 agent 发所有交易、垫 gas → 用户钱包退化成纯「所有权钥匙」，几乎不签名/不用 gas（只有提现 G / 转移 agent 才需自签）。复用现成 `AgentRegistry` operator 机制，合约不大改。代价：平台被信任执行 + 垫 gas（靠 G 抽成回收，= E7.1）。

**Phase 2 · 第一次会话（啊哈）**：落到「我的 agent」面板 → **看自己 agent 自主决策 + 读它的 LLM 推理**（魔法瞬间：「我拥有一个替我打世界的 AI」）→ 「用 200 ore 下个注？」一键 skin-in-the-game（下注门槛 10-500 ore）→ 首次输赢推送 → 回流。**free-to-play 漏斗天然成立**：世界 + ore 下注全程不要钱，只有 Arena 买卡（G）是付费闸。

**Phase 3 · 持续循环**（详见下「各主线的外部 UX 流」）：看 / 喂目标 / **赌（ore，核心高频）** / 爬塔 Arena（G，付费）/ 收藏故事卡 / 社交外交。

**Phase 4 · 留存**：agent 累积 领地 + 声望(chronicle) + 卡收藏 + ELO + 一部链上传记；进阶 = 圣典作者 / 登顶 / 稀有收藏。**黏性 = 你养大的「活物」有持续链上身份，离开 = 抛弃投资。**

**前 5 分钟关键路径**：
```
落地看世界(0 钱包) → 生成 agent → 社交登录(嵌入式钱包) → 填名字+性格
→ 平台代发 createAgent(平台付 gas) → 7 格+200 ore → agent 开始 autopilot
→ 看它首个决策+推理(啊哈) → "用 200 ore 下注?" → 一键 → 走
→ 推送"你 agent 赢了 / 你押中了" → 回流
```

**这条旅程逼出的 4 条承重决策**：
1. ✅ autopilot 分工：**用户 = owner = 战略家**（低频高杠杆）/ **AI = operator = 执行者**（高频琐事）。
2. **operator-relay** 清零 gas/上手摩擦（见 Phase 1 ⚠️），是 E6 地基 + E7.1 的一部分。
3. autopilot **规模/成本是真天花板**：现 runner 固定 26 角色 + 全局 5min 限流，N 用户 agent 线性增长 → E7.2 多租户 + E7.1 计费是承重墙。
4. **两货币 UX 讲清**：ore = 游戏里挣的（赌世界，免费入口）/ G = 真钱买的（Arena，付费）。

### 核心 UX 闭环（看戏 → 看懂 → 押注 → 输赢 → 更上头）

围绕「我的 agent」展开，预测市场是「观众 → 参与者」的转化开关：

```
我的 agent     状态卡:领地/ore/G/ELO/当前在干嘛 + autopilot 开关 + 喂目标输入
发现市场       信息流,每个市场绑世界叙事 +赔率(池占比)+池子+倒计时+涉及 agent 头像/迷你地图
看懂           点开 → 相关世界状态 + 相关 agent 链上发言/记忆 + 一句 AI 摘要(差异化:市场背后是可读意图)
下注           用我的 agent 的 ore 选边/输额 → 派彩预估 + 「parimutuel:你的注会移动赔率」→ 签名
跟踪/结算      「我的持仓」+ 结算通知 + 凭证(展示是什么链上事实裁定了它)
```

### 各主线的外部 UX 流

- **预测市场**（核心）：市场流 / 详情(世界上下文) / 下注弹层(赔率+派彩预估) / 我的持仓 / 结算凭证。
- **战斗可视化**：回放可**分享链接 / 导出片段**（能力连锁=奇观=拉新），不只自己看。
- **卡牌**：收藏画廊 / 卡详情**主打 provenance 故事**(哪个 agent、因什么成就铸) / 市场浏览+一键买卖。
- **大世界**：AgentMind 面板做钩子(「看 AI 怎么想」是独有的) + 「谁在赢/最近有什么瓜」leaderboard+事件流。

### 功能需求（FR）

钱包连接(wagmi/viem/RainbowKit，前端首次具备写能力) · Agent 创建/onboarding(取名/性格/目标，非 crypto 用户引导) · owner→operator 委托开关(开/关 autopilot) · G 充值 on-ramp + 余额(G/ore)展示 · 手动动作 UI(若支持手动) · 预测市场完整 UX · 通知(结算/派彩/被超价/成就铸卡) · 战斗回放分享/导出 · 移动端响应式 + i18n(已有 zh/en)。

---

## 1. 四条主线（refined）

### ① 辩论 → 世界预测市场

**现状锚点**：`GameEngine.sol:710-895`。当前 `Debate` 把两种性质不同的东西缝在一起：

| | 普通辩论 | Oracle 辩论 |
|---|---|---|
| 本质 | 政治施压工具（票数 → hex 民心 ±，`:825,836,848`） | parimutuel 预测市场（注池、赢家瓜分输家、10% 抽成） |
| 结算 | 票数自动 | **operator 人工 `outcomeOverride`**（`:822`） |
| 绑定 | 必须站在某 hex 上、改该 hex 民心（`:716-721`） | 同样绑 hex + 民心 |
| 货币 | ore | ore |

**refine 核心**：不是「重做 debate」，是**把预测市场抽成独立 primitive**，摆脱三个拖累——
1. **与 hex/民心解耦**：现在做不出「谁登顶 scoreboard」「agent X 4h 后是否被打到 0 格」这类市场，因为每个 debate 必须挂在脚下 hex 并改其民心。
2. **链上自结算**：世界的好题目大半链上可验证（`ownerId / getScore / hexCount`）。让合约在 `resolveAt` 读自身状态裁定，**operator 消失**——这是「比 Polymarket 更强」而非抄它。
3. **保留 parimutuel，别上 AMM**：~26 个 agent，连续定价会缺流动性；注池更稳。偷 Polymarket 的是 UX（市场列表 / 概率% / 持仓），不是 AMM。

**分层形状**：
- **合约**：新增 `PredictionMarket` **独立合约**，结构化市场 `{question, outcomes[], resolveAt, type}`，`type ∈ {SELF_RESOLVING, ORACLE}`；注池/抽成/退款复用 `resolveDebate:854-892`；只读 GameEngine 状态、通过已有 `spendOre/refundOre` 钩子动 ore。
- **MCP**：`create_market / bet / resolve_market / list_markets / get_market`。
- **前端**：独立 `/markets` 页（现在前端**零** debate UI）。

**第一刀**：自结算 + 解耦 hex 的最小市场（题目限定「agent X 在 T 时刻是否拥有 hex Y」），ore 注池，UI 先列表页。普通辩论原样不动。

---

### ② 大世界平衡可调 + 遥测

**现状锚点**：`GameEngine.sol:20-59`——**21 个平衡参数全是编译期 `constant`**。改一个数 = 一次 UUPS 升级 + 重部署。**这才是平衡推不动的真因，不是某个数字错（数值已逐条核对全部正确）。**

**refine 核心**：这不是「主线」，是两个使能动作：
1. **关键 `constant` → owner 可写 storage + setter**（仿 `ArenaEngine.setTierThresholds/setMatchmakingPeriod` 已有范式）。`_calcDecay` 里硬编码的 `1 + hCount/3` 系数也要挪进 storage。
2. **遥测**：吃链上事件（`AttackResult/HexRebelled/DebateResolved/Harvested`）出策略分布 / 财富基尼 / 淘汰复活率 / 领地周转。**没数据的平衡是拍脑袋。**

**第一刀**：参数 storage 化 + 批量 setter + 事件聚合脚本。**之后平衡从「发版工程」降级成「调表格」。**

---

### ③ 叙事卡 / NFT 经济

**现状锚点**：`CardLedger.sol:17-22`——`Card = {id, unitType, ownerAgent, mintedAt}`，**零叙事元数据**；`mintCard:75` 只被 `buy()` 和 `bootstrapMarket` 调用，**无成就触发路径**；但二级市场（list/cancel/buy，G 计价，`:88-139`）**已经能用**。

**refine 核心**：#28 的战略大奖是**双循环经济**（种田党用主世界成就铸卡 → 卖给爬塔党），不是「套 ERC-721」。真正缺的最小件**不需要 ERC-721**：
1. `Card` 加叙事元数据位：`variant / edition / originAgent / achievementTag / mintedReason`（append，UUPS 安全）+ `mintStoryCard`。
2. GameEngine 在里程碑（写圣典 / 0 格翻盘占领 / 声望破阈）**emit `AchievementUnlocked`**（只加事件，不改存储）。
3. keeper 监听事件 → 调 `mintStoryCard`。
4. ERC-721（#46）后置，被「RNG 完整性 + 单位扩容」gate。

> ⚠️ **前置依赖**：现仅 12 个单位，收藏空间太薄。叙事卡 variant 的体感价值依赖**单位先做多**（60 单位矩阵）——这是独立的设计重活，建议单开 epic，别塞进本条。

**第一刀**：`Card` 加元数据 + `mintStoryCard` + GameEngine 在 `writeWorldBible` 成功时 emit 成就事件，打通「写圣典 → 自动得一张带故事的特殊卡」。

---

### ④ 战斗能力可视化

**现状锚点**：`ArenaCombat.sol:30-36` 的 `Turn = {attackerSide, attackerSlot, defenderSlot, damage, defenderDied}`——**只记普通攻击步**。已确认：召唤、buff、`ON_HURT/ON_DEATH`、`ON_START` 全在 `AbilityLib` 事件队列里，**没进 trace**；`initialStats:71` 只把 `ON_START` 结果烤进「初始属性」。

**refine 核心**：「更好地可视化能力」**有一个合约层硬依赖**——trace 不吐能力事件，前端就没数据画。这是最易被低估的点。

**分层形状**：
- **合约（gate 项）**：`simulateWithTrace:54` 增吐 `AbilityEvent[]`（SUMMON/BUFF/DAMAGE/DEATH_TRIGGER/ON_START），从 AbilityLib 队列 emit；`simulate()`（结算）不动。
- **前端**：`ReplayCanvas` 把能力事件插在攻击步之间演（召唤淡入 / buff 跳字 / 死亡连锁高亮）。

**第一刀**：合约先吐 SUMMON + BUFF 两类（视觉差异最大），前端先接这两个动画。

---

## 2. 关键决策

### 2.1 🔵 预测市场用 ore 还是 G？　✅ 倾向：**v1 用 ore，货币做成可插拔参数，G 后置**

| | ore | G |
|---|---|---|
| 它是什么 | 世界内政治/策略工具，和建设、打仗抢同一份稀缺资源 | 真实金融产品（主网真钱赌 AI 世界结局） |
| **流动性** | agent 占格就在产，**天然有** | 需逐个充值 treasury，否则空池 |
| 完整性门槛 | 低（沙盒、不可 withdraw） | **高**（RNG + 可信裁定变成硬前置，G 已全额原生背书=真钱） |
| 差异化叙事 | 中 | 高 |
| 复用现有代码 | 直接复用 `resolveDebate` | 需重接 `GTreasury.spendG/creditG` |

**决定性理由**：这是自治 agent 世界，要的是**大量有机下注**；agent 天然持有 ore、默认 0 G。
**已知坑**：`MAX_ORE_POOL=1000` 会静默吞派彩（`:868,881`），市场派彩需豁免此 cap 或接受截断（G 是 wei、无此问题）。
**翻去 G 的条件**：① 随机源已硬化（见 2.2）+ 可信自裁定上线；② 确实要桥到真实价值的 Arena 经济，并愿意给 agent 注 G 或引入真人下注。在那之前 G 市场=空池 + 可被薅的风险。
**工程对策**：E1.1 设计接口时把 `currency` 做成市场创建参数，v1 只开 `ORE` 路径，以后加 `G` 不重写结算引擎。
**本轮更新**：身份模型已定为「真人拥有/控制 agent」（见 ★ 节）。真人通过自己的 agent 玩、agent 产 ore → **ore 推荐确认保留**，不因「外部真人」反转为 G。

### 2.2 横切完整性门槛（gate ① 的真实价值 + ③）

`ArenaEngine.sol:545` 的匹配种子用 `block.prevrandao`，代码自带 TODO「上 prize pool 前换 VRF」。**一旦市场或卡挂上真实价值，这个可操纵种子 + 人工裁定就从 demo 瑕疵变成可被薅的金融漏洞。** ① 的「自结算」方案能绕开预测市场这一半（链上事实不需随机/人工），但 Arena 匹配仍需 VRF/commit-reveal。

### 2.3 拆解三原则（决定怎么并行不撞）

1. **能独立成合约的就别改 GameEngine**：预测市场走**新合约**，避免和平衡改动抢 GameEngine 的 UUPS 存储布局。
2. **改事件 vs 改存储分开派**：emit 新事件不改布局 → 可并行；append storage → 必须串行、单人。
3. **每个任务自带「完成判定」**，派出去不用回来问算不算做完。

---

## 3. 任务分解（WBS）

角色：`SC`=合约 `MCP`=工具层 `FE`=前端 `INFRA`=keeper/遥测/运维 `DOC`=文档。

### E1 · 预测市场（新）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E1.1 | 设计 `PredictionMarket` 接口（market struct + SELF_RESOLVING/ORACLE 两型 + currency 可插拔） | SC | — | 一页设计稿 + interface 定稿 |
| E1.2 | 自结算市场合约：create/bet/resolve，读链上状态裁定，复用 `resolveDebate:854-892` | SC | E1.1 | 「X 在 T 是否拥有 hex Y」permissionless 自动正确结算，含测试 |
| E1.3 | Oracle 主观市场 + 过期退款 | SC | E1.2 | 主观题人工裁定、超时全退，含测试 |
| E1.4 | MCP 工具 create_market/bet/resolve/list/get | MCP | E1.1 | agent 能自主建市/下注，e2e 通过 |
| E1.5 | `/markets` 前端页（→ **并入 E6.4**，需 E6 钱包/写链路） | FE | E1.4 + E6.1 | 能浏览/下注/看结算 |
| E1.6 | keeper 自动结算到期市场 | INFRA | E1.2 | 到期市场被自动 resolve |

### E2 · 平衡可调 + 遥测（新）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E2.1 | `GameEngine:20-59` 关键常量 → owner 可写 storage + 批量 setter；`_calcDecay` 系数挪进 storage | SC（GameEngine owner） | — | 参数可热改无需重部署；旧测试全过 + 新增 layout 测试 |
| E2.2 | 遥测脚本：链上事件 → 策略分布/财富基尼/淘汰复活率/领地周转 | INFRA | — | 一张仪表盘或 CSV |
| E2.3 | 离线确定性模拟扫参数（后置） | INFRA/SC | E2.1,E2.2 | 给定参数集跑出长期分布 |

### E3 · 叙事卡 / NFT（复用 #28/#46/#47）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E3.1 | `Card` 加元数据位 + `mintStoryCard`（append，UUPS 安全） | SC（CardLedger owner） | — | 故事卡带元数据铸造；市场不受影响 |
| E3.2 | GameEngine emit `AchievementUnlocked`（只加事件） | SC | — | 三类里程碑正确 fire，可与 E2.1 并行 |
| E3.3 | keeper 监听成就事件 → `mintStoryCard` | INFRA | E3.1,E3.2 | 「写圣典 → 自动得故事卡」端到端 |
| E3.4 | MCP + inventory 展示卡元数据 | MCP/FE | E3.1 | 背包可见稀有度/来历 |
| E3.5 | ERC-721 外部可流通（后置） | SC | E0.1 + 单位扩容 | — |

### E4 · 战斗可视化（复用 #34）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E4.1 | **（gate）** `simulateWithTrace` 增吐 `AbilityEvent[]`；`simulate()` 不动 | SC | — | trace 含按序能力事件；确定性测试全过 |
| E4.2 | `ReplayCanvas` 把能力事件插在攻击步间演 | FE | **E4.1** | 能看出「Wraith 死→召唤 3/3」连锁 |
| E4.3 | BattleLog 能力事件旁白（可选） | FE | E4.1 | 日志逐条可读 |

### E0 · 完整性（横切，新）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E0.1 | `ArenaEngine:545` 种子换 VRF/commit-reveal | SC | — | 同块种子不可预测；确定性回放仍成立 |

### E5 · 仓库卫生（新，多为 good-first-issue）
| ID | 任务 | 角色 | 完成判定 |
|---|---|---|---|
| E5.1 | 修 `CLAUDE.md`（testnet→mainnet、radius 4→100、地址表）+ `AGENTS.md` | DOC | 文档与现状一致 |
| E5.2 | 收敛三处 router 地址，定权威主网地址，修 `gravity-town-mainnet-skill` 的 `0x4c2F…` | SC/INFRA | 全仓只剩一个主网 router |
| E5.3 | `just gravity-upgrade` 加「升级前回显目标网络并确认」守卫 | INFRA | 不会误升主网 |
| E5.4 | 排查/轮换提交进 git 的密钥（justfile、.mcp.json、*.toml） | INFRA/SEC | 无真钥在库 |
| E5.5 | 修文案漂移：`tools.ts:316` +10→+5、`tools.ts:530` 10min→5min | MCP | 文案与合约一致 |
| E5.6 | 删死代码 `frontend/src/chain/` | FE | 无引用、构建通过 |

### E6 · 外部用户客户端（钱包 / 写链路 / UI，新；本轮核心新增）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E6.1 | **钱包连接 + 写链路基座**（嵌入式钱包/社交登录 + wagmi/viem；多数动作走 operator-relay 代发，用户几乎不签名/不付 gas） | FE | — | 真人登录后能（经 relay 或自签）调用一个 agent 动作（如 harvest）成功 |
| E6.2 | Agent 创建/onboarding 流（连钱包 → createAgent → 命名/性格/目标；非 crypto 引导） | FE/MCP | E6.1 | 真人从零拥有一个 agent |
| E6.3 | owner→operator 委托开关（开/关 autopilot；可收回） | FE | E6.1 | 真人能把自己 agent 委托给平台 operator 或收回 |
| E6.4 | 预测市场前端完整 UX（**取代 E1.5**）：市场流 / 详情(世界上下文) / 下注弹层 / 持仓 / 结算凭证 | FE | E6.1 + E1.4 | 端到端下注 + 看结算 |
| E6.5 | 卡牌画廊 + provenance 故事 + 市场买卖 UI | FE | E6.1 + E3.4 | 真人能浏览/买卖卡 |
| E6.6 | G 充值 on-ramp（depositG）+ 余额(G/ore)展示 | FE/MCP | E6.1 | 真人能充 G 并看到余额 |
| E6.7 | 通知（结算 / 派彩 / 被超价 / 成就铸卡） | FE/INFRA | — | 关键事件有通知 |
| E6.8 | 战斗回放分享链接 / 片段导出（拉新） | FE | #34 | 一局可分享/导出 |
| E6.9 | 移动端响应式 + i18n 收口（已有 zh/en） | FE | — | 主流程移动端可用 |

### E7 · 用户自营 agent · autopilot（INFRA，新；被 ★ 节 🔵 决策 gate）
| ID | 任务 | 角色 | 依赖 | 完成判定 |
|---|---|---|---|---|
| E7.1 | 🔵 定 autopilot 计费/gas 模型 + **operator-relay 代发交易/垫 gas 方案**（LLM：自带 key / 买额度 / 免费档限流；gas：平台 relay 垫付 vs 用户付） | 架构/INFRA | — | 一页决策稿 |
| E7.2 | agent-runner 多租户化：按用户 agent 动态加载/委托/限流（现为固定 26 角色 + 全局限流） | INFRA | E7.1 | 用户 agent 能被平台 runner 驱动 |
| E7.3 | 真人「喂目标 / 接管 / 暂停」控制面 | FE/MCP | E6.3, E7.2 | 真人能设目标、暂停、手动接管一回合 |
| E7.4 | gas/LLM 费用计量与配额（超额停跑、可充值） | INFRA | E7.1 | 超额停跑、可充值续 |

---

## 4. 与现有 issue 的对应（复用，不重复建）

| 主线 | 已有 issue | 处理 |
|---|---|---|
| ④ 战斗可视化 | **#34** `feat(arena/ui): Battle Replay 动画 + 战斗 log + 时间轴` | 不新建；评论补硬依赖 **E4.1**（trace 先吐 AbilityEvent[]） |
| ③ 叙事卡/NFT | **#28** 双 loop / **#46** ERC-721 / **#47** NFT ledger | 不新建；#28 评论贴 **E3.1/3.2/3.3** 拆解；#46/#47 为后置件 |
| Arena tier | **#33**（已实现） | 关闭或标 done |

**需要新建的精简批次（8 个，按你们标题约定）**：

| # | 标题 | label |
|---|---|---|
| 1 | `feat(market): 世界预测市场 — 独立合约 + 自结算 + parimutuel(ore)` | enhancement（tracking issue，E1.\* 勾选清单） |
| 2 | `feat(engine/balance): 平衡参数 storage 化 + owner 热调 setter` | enhancement |
| 3 | `chore(telemetry): 链上事件聚合 → 策略/财富/淘汰指标` | enhancement |
| 4 | `fix(arena/rng): runMatchmaking 种子换 VRF/commit-reveal` | enhancement |
| 5 | `docs: 同步主网现状 + 收敛 router 地址 + gravity-upgrade 守卫` | documentation |
| 6 | `fix(mcp): post +10→+5 / chronicle 10min→5min 文案漂移` | good first issue |
| 7 | `feat(client): 外部用户客户端 — 钱包/写链路 + agent 创建 + 市场/卡 UI` | enhancement（tracking issue，E6.\* 勾选清单） |
| 8 | `feat(infra/autopilot): 用户自营 agent — 多租户 runner + 计费/gas` | enhancement（tracking issue，E7.\*；先做 E7.1 决策稿） |

> #7/#8 是本轮新增的「外部真人」两条脊柱。#7 的 E6.1（钱包+写链路）建议提前到 M0，因为它 gate 所有真人功能。

> 被 gate、现在开不了工的任务（E1.2–1.6、E3.\*、E4.2…）**不开成独立 issue**，先躺在 tracking issue 的勾选清单里，解锁了再提升。

---

## 5. 任务管理

**追踪载体**：沿用你们现状——GitHub issues + 标题前缀约定（`feat(scope):`）。**不新增 label 体系**（你们现在只用 GitHub 默认 label、无 milestone，保持轻）。大主线用 tracking issue + 勾选清单（如 #31 的风格）。

**防撞规则（最重要）**：
- `GameEngine.sol` 的**存储改动只有 E2.1 一处**，固定一个 owner，**先单独 land**；其它 epic 不许往 GameEngine append storage。
- E1 走**新合约**、E3.2 只 **emit 事件** → 因此能和 E2.1 安全并行。
- `CardLedger`(E3.1) / `ArenaCombat`+`AbilityLib`(E0.1+E4.1) 各自单一 owner。

**并行分工（四人示例，按文件域切，零冲突）**：
| 人 | 文件域 | 任务序列 |
|---|---|---|
| A（SC·主世界） | GameEngine.sol | E2.1 → E3.2 → E1.2/E1.3（新合约） |
| B（SC·Arena） | ArenaEngine/ArenaCombat/AbilityLib/CardLedger | E0.1 → E4.1 → E3.1 |
| C（前端·世界/Arena） | frontend/ 可视化 | E5.6 → E4.2 → E3.4 |
| **C2（前端·外部客户端）** | frontend/ 写链路+真人 UI | **E6.1 → E6.2/E6.3 → E6.4 → E6.5/E6.6**（E6 是本轮最大前端面，建议独立 owner） |
| D（MCP/INFRA） | mcp-server/、keeper、遥测、autopilot | E5.5 → E2.2 → E1.4/E1.6 → **E7.1 → E7.2** → E3.3 |
| 你/架构 | — | E1.1 设计稿 + **E7.1 计费决策** + review；E5.1–5.4 派任意人 |

> 说明：E6（外部客户端）是本轮新增的最大前端工作量，单人难兼顾「世界可视化」+「写链路真人 UI」，建议拆出独立前端 owner（C2）。

**里程碑批次**：
- **M0（解锁+使能，全并行）**：E5.\*、E2.1、E0.1、E4.1、E1.1、**E6.1（钱包/写链路地基）**、**E7.1（autopilot 计费决策稿）**。互不依赖，先铺底。
- **M1（第一批竖切）**：E1.2+1.4+**6.4**（市场端到端，含真人下注 UI）、E4.2+**6.8**（可视化+分享）、E2.2（遥测）、E3.1+3.2（卡元数据+成就事件）、**E6.2+6.3（agent 创建 + autopilot 委托开关）**。
- **M2（闭环）**：E1.3+1.6、E3.3+3.4+**6.5（卡市场 UI）**、E2.3、**E7.2+7.3（多租户 runner + 喂目标/接管面）**、**E6.6/6.7/6.9（充值/通知/移动端）**。
- **Deferred**：E3.5（ERC-721）、单位扩容 epic。

**DoD 约定**（写进每个 issue）：`合约改动带 Foundry 测试；动存储则附 layout 测试；MCP 带 e2e 脚本一条；前端带截图/录屏；PR 描述写清依赖的 issue 号`。

---

## 6. 待拍板清单（review 时逐条确认）

- [ ] 🔵 预测市场货币：v1 **ore**（✅ 倾向）还是 G？是否接受「currency 可插拔、G 后置」的工程对策？
- [ ] 🔵 `MAX_ORE_POOL=1000` 对市场派彩：豁免 cap 还是接受截断？
- [ ] 🔵 RNG 方案：VRF（依赖外部 VRF 服务/预言机是否可得）还是 commit-reveal（纯链上但多一步交互）？
- [ ] 🔵 是否单开「单位扩容（12 → 60）」epic、谁长期负责？
- [ ] 🔵 E5.4 密钥：库里的私钥是 throwaway 还是需要轮换？
- [ ] 🔵 是否要建 `epic` / `blocked` 两个 label（默认不建）？
- [ ] 🔵 新建 6 个 issue 的标题与归属是否 OK？是否要顺带在 #34/#28 补拆解评论？

**外部用户 / UX（本轮新增）**
- [x] ✅ 用户 agent = autopilot + steering，分工为 **owner 战略家 / AI 执行者**（见 ★ 用户旅程；剩下只欠 E7.1 计费/gas 模型）
- [ ] 🔵 上手用**嵌入式钱包 + 社交登录**还是要求自带钱包？（✅ 倾向嵌入式，否则非 crypto 用户流失在第一步）
- [ ] 🔵 是否采用 **operator-relay 代发交易 + 平台垫 gas** 做 gasless 上手？（✅ 倾向是，复用现成 operator 机制）
- [ ] 🔵 autopilot 的 LLM 计费与 gas 谁付、怎么限流？（E7.1：自带 key / 买额度 / 免费档；gas relayer or 用户付）
- [ ] 🔵 非 crypto 用户 onboarding 要做到多轻？（托管钱包 / 社交登录 / 还是要求自带钱包）
- [x] ✅ 预测市场货币：因「human-as-agent」**确认保留 ore**（真人通过 agent 玩、agent 产 ore）
- [x] ✅ 身份模型：真人**拥有/控制 agent**（非裸 EOA），复用 `agentOwner`/`operator`，合约基本不改
- [ ] 🔵 E6/E7 是否进 M0？（钱包/写链路 E6.1 是所有真人功能的地基，建议提前到 M0）
