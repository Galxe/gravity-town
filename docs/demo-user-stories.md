# Gravity Town Demo · 用户故事操作手册（User-Story Manual）

> 这份手册回答一个问题：**「一个真人来到 Gravity Town，他是谁、想玩什么、在我的页面上怎么一步步交互、每一步看到什么。」**
>
> 它是 PR #76 那份「逐屏逐按钮说明书」的**重组版**——同样严格对应 `demo/index.html` 的真实交互，但不再按界面平铺，而是按**用户旅程**串起来。每条 user story 都标注它落在哪一屏、对应路线图（`docs/roadmap.md`）的哪条产品脊柱。
>
> ⚠️ **前提**：这是**纯前端 Mock Demo**。所有余额、交易、对局都是浏览器内存里的模拟——**没有真实链、没有真实钱包、没有真金白银**。刷新页面 = 全部重置。
>
> **怎么打开**：浏览器直接打开 `demo/index.html`（`file://`，零构建/零后端）。首次打开需联网（CDN 拉 React/Tailwind/字体）。默认落在 `#/` World 观战页；hash 路由 `#/` `#/onboard` `#/me` `#/markets` `#/arena` 对应 5 屏。

---

## 角色地图：其实是同一身份的不同深度

路线图把外部用户定义成**一条漏斗**，不是四个割裂的角色——核心产品脊柱是「**我拥有并驾驭一个活在链上的 AI agent**」。市场、卡牌、战斗，都是这个 agent **做的事**。

| 角色 | 一句话 | 钱包？ | 主货币 | 在 Demo 里的入口 |
|---|---|---|---|---|
| 👁 **观众** | 看戏、看 AI 怎么想 | 不需要 | — | `#/` World、`#/arena` 回放/卡市 |
| ⚡ **Agent 主理人**（核心） | 拥有一个替我打世界的 AI | 嵌入式钱包 | — | `#/onboard` → `#/me` |
| 🎲 **预言家 / 赌徒**（一种玩法） | 用 agent 挣的 ore 赌世界结局 | 同上 | **ore** | `#/markets` |
| 📜 **收藏家 / 牌商 / 爬塔党**（一种玩法） | 用充值的 G 收卡、组阵、爬塔 | 同上 | **G** | `#/arena` |

**两条货币贯穿始终**：`ore`（◆ 琥珀）= 世界里挣的（免费入口，下注用）；`G`（⬡ 青）= 真金充值的（只用于 Arena）。两者永不互转。

下面按漏斗顺序讲故事：**看戏 → 上手 → 驾驭 → 赌 → 收藏/爬塔**。

---

## A · 观众线（零钱包，对应路线图 Phase 0「到站」）

> 设计意图：**看戏不要钱包，绝不在这一步竖墙。** 钩子是「看真·AI 在链上怎么想」——这是别家没有的差异化。

### US-A1 · 我刚落地，想确认这是个「活的世界」值不值得参与

**我在哪**：`#/` World 观战页（顶部有 `SPECTATOR MODE · no wallet needed`）。

**我看到什么**：
- **Hero**：标语「Own an AI agent that lives, fights & bets on-chain.」+ 两个按钮 + 「No gas needed…」。
- **LIVE DRAMA 跑马灯**：7 条循环滚动的剧情快讯（`⚔ Ironclad captured 3 hexes…`、`◆ Rustwood ore pool hit the 1000 cap…`）。鼠标悬停**暂停滚动**。
- **SCOREBOARD**：6 个 NPC 按分排名，副文写明算分公式 `score = hexes×100 + ore + buildings×50`。
- **FEATURED MARKETS**：前 2 个预测市场迷你卡（YES/NO 赔率条 + ore 池 + 相关 agent）。
- **AGENTMIND · LIVE DECISION LOG**：紫标签「these are real AIs thinking — recorded on-chain」，下面 5 行 AI 思考记录示例。

**我能做什么**：主要是浏览——跑马灯、排行榜行、AgentMind 5 行都是纯展示不可点。**例外：前 2 张市场迷你卡可点**（整卡 `cursor-pointer`，点击 → `#/markets`，见 US-A3）。

### US-A2 · 我好奇「AI 到底怎么想」，想看清楚再决定

**怎么交互**：点 Hero 的 **`See how the AI thinks`**（灰按钮）→ 页面**平滑滚动**到下方 AGENTMIND 面板（不跳页）。这就是路线图说的核心钩子：市场/动作背后是**可读的意图**。

### US-A3 · 我想先围观「别人在赌什么、打成什么样」

**怎么交互**：
- 点 Featured Markets 标题右的 **`all markets →`**，或**点任意一张市场迷你卡** → 都跳到 `#/markets` 列表页。（注意：落地页点卡是去**列表**，不是直接弹下注框。）
- 顶栏导航点 **`Arena`** → `#/arena`。**观众默认落在 `BATTLE REPLAY`**：可以**直接点 `▶ Play` 看一整场 5v5 回放**（逐步点亮事件日志，顶部有 `turn N/总数` 进度条，到最后 `🏆 YOU WIN · ELO +16`）。观众态阵容标为 `DEMO SQUAD (A)`，播完只弹一句 `Nice finish — create an agent to play your own matches`，不改任何数据。
- Arena 的 **`CARD MARKET`** 标签观众也能看（含紫边故事卡 + `📜 provenance` 出处）。

> **观众能看的边界**：World 全部、Markets 列表与下注弹窗（按钮会引导建号）、Arena 的 `BATTLE REPLAY` 与 `CARD MARKET`。Arena 的 Overview/Shop/Bench 三个账户页对观众显示 `👁 Spectating` CTA。

### US-A4 · 我被钩住了，决定下场

**怎么交互**：多个 CTA 通向开户——Hero 的 **`Spawn your agent →`**、底部橙色 **`Create your agent — claim 7 hexes + 200 ore`**、右上角 **`Connect`**、或市场下注框未登录点 `Create agent to bet`（toast + 跳）→ 这些都跳 `#/onboard`。（注意：Arena 卡市的 `Create agent to buy` 是**置灰 label**，点不动、不跳转。）

---

## B · 上手线（连钱包 + 创建 agent，对应 Phase 1「上手」——转化最难的一步）

> 设计意图：**operator-relay 同时解决 gasless 和 autopilot**。平台用嵌入式钱包代付 gas、代发交易，用户钱包退化成「所有权钥匙」，几乎不签名。

### US-B1 · 我不是 crypto 用户，但想要一个「我的 agent」

**我在哪**：`#/onboard`，一个 3 步向导（顶部固定青卡 `Operator-relay onboarding` 说明平台代建钱包、代付 gas）。

**幂等保护**：如果我已有 agent 又进开户页 → 拦截，显示 `You already own {名字}` + `Go to dashboard →`，不会覆盖已有 agent。

**Happy-path（4 步）**：

1. **Step 1 · 登录**：点 `Continue with Google` 或 `Continue with Email` → 立刻生成 mock 嵌入式钱包（`0xAb…`）；toast `Embedded wallet … created via Google`；约 0.6s 自动进 Step 2。**全程无 MetaMask、无助记词。**
2. **Step 2 · 定义 agent**：
   - 填 `Agent name`（空则 `Review →` 置灰禁用）。
   - `Personality prompt` 多行框（**预填**示例人格），注脚说明它 `→ becomes the autopilot's system prompt`——**性格即 AI 的系统提示词**。
   - `Archetype` 四选一：`Warlord`（默认）/ `Farmer` / `Diplomat` / `Oracle`，每张带 4 条属性条。点卡切换选择。
   - 点 `Review →` 进 Step 3。
3. **Step 3 · 确认创建**：看到预览（头像/名字/archetype/人格引文）+ 一行 `⛽ gas sponsored by platform · createAgent(…)`。点橙色 **`⚡ Spawn agent (no signature needed)`** → 约 2.2s 创建动画（`relaying createAgent() · claiming 7-hex cluster…`）。
4. **Step 4 · 成功**：🎉 + 两张数据卡 `CLAIMED 7 hexes`、`STARTING ORE ◆ 200`。点 `Enter my dashboard →` 去 `#/me`。

**创建瞬间后台发生了什么**（重要）：agent id 固定 42、**ore=200**（出生），并**自动加载一个「玩了很久」的 Arena 账户**：G=240、ELO=1043、5 张 bench 卡（含 1 张 Chronicler 故事卡）、1 张库存卡、6 条战绩、2 条挂单、matchmaking 已提交。**所以你一进 Arena 就是满账户，不用从零刷**（这是刻意 seed 的演示便利，非你打出来的）。

---

## C · 主理人核心线（驾驭我的 agent，对应 Phase 2「啊哈」+ 分工决策）

> 路线图承重决策：**用户 = owner = 战略家**（低频高杠杆：定目标/押哪个市场/何时开战）；**AI = operator = 执行者**（高频琐事：harvest/build/路由）。

### US-C1 · 我想亲眼看到「我拥有一个替我打世界的 AI」（啊哈瞬间）

**我在哪**：`#/me` My Agent 仪表盘。头部是头像/名字/`agent #42` + 6 个统计格（Rank/Territory/Buildings/ELO/Chronicle/Score）+ 两块余额（ORE 带 /1000 上限、G）。

**autopilot「活着」的表现**（不是我点的）：创建后立刻 seed `✨ Spawned…` + 3 条 AI 开局推理（读世界 / 扫邻格 / 采矿建矿计划），所以一进面板 AGENTMIND 就是满的；之后当 **Autopilot 开启**，中栏 AGENTMIND 每约 **3.8s 自动写一条** AI 行为，且**真的改数值**：
- `⛏️ Harvested +18 ore`（真 +18，封顶 1000）
- `⚒️ Built a mine (-50 ore)`（ore≥50 时真扣 50、buildings+1）
- `🤔 Ore pool at X/1000…`、`📢 Posted to board…`、`🛰️ Scanned…`、`🗡️ Probed…`

**所以开着 autopilot，我的 ore 和建筑数会自己变**——这就是「自主 AI 在替我打世界」的具象化。

### US-C2 · 我是战略家，想接管方向 / 喂目标

**怎么交互**（左栏）：
- **AUTOPILOT 大开关** + 两张说明卡（`YOU = OWNER 战略家` / `AI = OPERATOR 执行者`）。
  - 开→关：toast `Autopilot OFF — you are now in manual control`；状态变 `✋ MANUAL`；自动行为停止；QUICK ACTIONS 前 3 个按钮**解锁**。
  - 关→开：toast `Autopilot ON — AI operating your agent`；恢复 3.8s 自动行为；手动按钮**置灰**。
- **SET GOAL / STRATEGY**：目标框（预填 `Expand north, then dominate the prediction markets.`），点 `Push goal to agent` → toast `Goal pushed to your agent`；AgentMind 记 `🎯 Owner set goal: "…" — re-planning.`（仅记文字，不改数值）。

### US-C3 · 我想手动接管一回合，亲自操作

**前提**：手动动作**仅在 autopilot 关闭时**可用。autopilot 开着时，前 3 个按钮**直接置灰点不动**（标题旁出现 `disabled while AI operates`，面板底部有静态提示 `Pause autopilot to act manually.`）——不是点了弹 toast，是根本点不了。`🎲 Bet →` 例外，始终可点。

**QUICK ACTIONS（左栏 4 按钮）**：
1. **`⛏️ Harvest`** → ore +42（封顶 1000）；触顶则只补到 1000 并 toast `+X ore (+Y wasted — pool at cap)`。
2. **`⚒️ Build mine (50)`** → ore<50 时 toast `Need 50 ore for a mine`；否则 ore−50、buildings+1。
3. **`🗡️ Raid (3,-2)`** → 约 0.9s 后随机判定（~55% 胜）：赢则 hex+1、ore+54；输则只弹文案（**输了实际没真扣 ore**，纯演示剧情）。
4. **`🎲 Bet →`** → 跳 `#/markets`（**不受 autopilot 锁定，任何时候可点**——因为下注是战略家的活）。

**右栏 TERRITORY**：7 格迷你六边形领地图（中心 `(0,0)` 琥珀带星）+ 前 5 个 hex 的矿/兵工厂/幸福度。

---

## D · 预言家 / 赌徒线（用 ore 赌世界，对应核心 UX 闭环·高频）

> 设计意图：预测市场是「观众 → 参与者」的转化开关。差异化在于**每个市场背后都有可读的 AI 意图**。闭环 = 看戏 → 看懂 → 押注 → 输赢 → 更上头。

### US-D1 · 我想发现一个值得赌的世界结局

**我在哪**：`#/markets`。Tab：`MARKETS` / `MY POSITIONS`（后者**有未结算持仓时**才显示数量 `(N)`）。3 张市场卡：
- `mkt-101` SELF-RESOLVING：Ironclad 是否还占着 hex (3,-2)
- `mkt-102` SELF-RESOLVING：Rustwood 是否登顶 scoreboard
- `mkt-201` ORACLE：Seraphine–Vortex 同盟是否真外交

每卡显示类型标签（青 `SELF-RESOLVING · on-chain` / 紫 `ORACLE · subjective`）、倒计时、问题、YES/NO 赔率条、ore 池、相关 agent。

### US-D2 · 我想看懂这个市场再下手

**怎么交互**：**点任意市场卡** → 弹下注弹窗。左栏给足上下文：`World context`、相关 agent/hex、`Related agent intentions (on-chain)` 链上发言、`⚡ AI brief` 摘要、`Resolution rule` 结算规则代码。**这就是「市场背后是可读意图」的兑现。**

### US-D3 · 我用 agent 的 ore 押注

**怎么交互**（弹窗右栏 Place bet）：
1. 点 `YES` / `NO` 切阵营（默认 YES），赔率/估算随之刷新。
2. 拖 `STAKE` 滑块（步进 5，默认 50；登录态上限 = `max(10, min(500, round(你的 ore)))`、下限 10，ore<10 时按钮禁用并显示余额不足；未登录滑块上限为 500）。
3. 看 `EST. PAYOUT` / `EST. PROFIT` 实时估算 + 费率行（ORACLE 抽 `10%`，SELF-RESOLVING `0%`）+ `crowd-implied %` + parimutuel 提示「你的注会移动赔率」。
4. 点主按钮 **`Place bet · N ore`**：
   - 未登录 → 按钮 label 显示 `Create agent to bet`，点击 → toast `Create an agent first` + 跳 `#/onboard`。
   - ore 不足 → 红字 `Need ◆X ore, you have ◆Y.`，按钮禁用。
   - 成功 → ore−N、对应池+N（**真实改赔率**）、新增持仓、toast `Bet placed · N ore on YES/NO — executed via relay, no gas`、AgentMind 记一条、弹窗关闭。
   - 关闭弹窗：`✕` / 点遮罩 / `Esc`。

### US-D4 · 我想看开奖、拿派彩、核对「是什么链上事实裁定了它」

**怎么交互**：切到 `MY POSITIONS`：
- **OPEN**：每条显示问题、`backed YES/NO with ◆N`、按当前池估的 `PAYOUT IF … WINS`、倒计时；底部有 demo 专用的 `Resolve YES` / `Resolve NO`（**立即开奖捷径**，真实产品由链上规则到期自动结算）。
- 点 `Resolve YES/NO` → 市场标记结算、做 parimutuel 派彩（赢方按占赢家池比例分输家池，ORACLE 先抽 10% rake，**入账按 1000 上限夹取，超出浪费**）；toast 序列 `Market resolved · YES/NO wins` →（赢且实际入账>0）`Payout +N ore credited`（有溢出追加 ` (X wasted — at cap)`）/（输，或赢但派彩被 1000 cap 全吞）`Your position lost — staked ore not returned`；持仓移到 SETTLED。
   > ⚠️ 边界：若你 ore 已接近 1000，赢来的派彩可能被 cap **全部吞掉**（`credited=0`），此时即便你押对了也会弹「lost」文案——demo 的已知粗糙处。
- **SETTLED · RECEIPTS**：回执卡显示本金/派彩/盈亏 + 一块 `⛓ on-chain fact that settled it`（结算规则 → 赢家方）——这就是路线图说的「凭证：展示是什么链上事实裁定了它」。

---

## E · 收藏家 / 牌商 / 爬塔党线（用 G 玩 Arena，对应付费闸 + 留存）

> Arena = SAP 式异步自走棋，**全程用 G（青色高级余额）**，与世界 ore 完全分开。`5-slot bench · 12 units`。这是 free-to-play 漏斗里**唯一的付费闸**。

### US-E1 · 我想充值进场

**怎么交互**（`#/arena` 登录态页头）：`Deposit G` 面板点 `+ 20 G` / `+ 100 G` / `+ 1000 G` → G 增加；toast `Deposited N G — now {Bronze/Silver/Gold} tier`；TIER 按 G 分档（Bronze<100 / Silver 100–999 / Gold≥1000）。

> 这是 Demo 里**唯一被标注为「真实充值 / 需自签名」**的动作；其余皆由 operator 代付。

### US-E2 · 我想买卡、组阵、提交匹配

**怎么交互**：
- **SHOP**：`⟳ Roll (1 G)`（G<1 → toast `Need 1 G to roll`；否则扣 1 G 但**不换卡**，Demo 诚实标注 `same roster`——半空操作）；6 张商店卡点 `Buy · N G` → G−N、铸卡，**优先进第一个空 bench 槽，满则进库存**。
- **BENCH (n/5)**：库存卡 `↑ Place on bench`（bench 满时按钮置灰 `Bench full`）；bench 卡右上红 `✕` 下场退库存（**不退 G**）；`Submit to matchmaking`（bench 全空时按钮置灰；提交成功 toast `Submitted to matchmaking · {tier} tier`、出现 `queued` 标签）。

### US-E3 · 我是牌商，想买卖带「出处故事」的卡

**怎么交互**：`CARD MARKET`（观众也能看）：4 张玩家挂单，含 2 张紫边故事卡（Reaver「Chronicler #1」42G、Mystic「Phoenix #3」24G，带 `📜 provenance` 出处）。点买按钮：
- 未登录 → 买按钮**置灰**、label 显示 `Create agent to buy`（点不动，不会购买，也不弹 toast/跳转——它就是个引导你去建号的提示文字）。
- G 足 → G−价、挂单移除、铸卡（含变体/出处）入 bench（满则库存）、toast `Bought 单位(变体) for N G`。

**卖方视角**：在 `OVERVIEW` 的 `MY LISTINGS` 点某条 `Cancel` → 挂单移除、卡退回 inventory、toast `Listing cancelled — card returned to inventory`。

### US-E4 · 我想看自己阵容打一场（爬塔/留存）

**怎么交互**：`BATTLE REPLAY`：左栏 `▶ Play` / `⏭ Skip` / `🔗 Share`，对阵 `YOUR SQUAD (A)`（取自你 bench，登录态；观众态显示 `DEMO SQUAD (A)`）vs `VORTEX (B)`，**双方各 5 单位（真 5v5）**；右栏 10 步事件日志 + `turn N/总数` 进度条。
- `▶ Play` → 每约 1.1s 推进一步，到 `🏆 …YOU WIN · ELO +16`。**登录者**记一胜、ELO+16、写战绩、toast `Match WON · ELO a → b (+16)`（`C.ELO_WIN_DELTA=16`，等 ELO 胜 = K×0.5）。
- `⏭ Skip` → 直接跳末步，**不触发结算/战绩**（只有 `▶ Play` 自动播完才记）。
- `🔗 Share` → toast `Replay link copied (mock) — share to recruit`（**纯 mock，不真复制**；路线图里「回放可分享/导出」是拉新奇观，此处仅占位）。

**留存的底层逻辑**（路线图 Phase 4）：agent 累积领地 + 声望(chronicle) + 卡收藏 + ELO + 链上传记 → 离开 = 抛弃投资。

---

## 货币速记

| | ore（◆ 琥珀） | G（⬡ 青） |
|---|---|---|
| 是什么 | 世界内资源，时间/技巧挣的 | 真金充值的高级余额 |
| 怎么来 | 出生送 200、harvest、突袭获胜(+54)、派彩 | 创建即 seed 240、Deposit G 充值 |
| 上限 | **1000**（超出即浪费，多处 cap toast） | 无 |
| 用途 | 建矿（`Build mine`，demo 无 arsenal UI）、**预测市场下注**（突袭在 demo 里不消耗 ore） | **仅 Arena**：买卡/Roll/卡市 |
| 互转 | ❌ 两者永不互转 | ❌ |

---

## ⚠️ 已知问题 / 死路 / 反直觉行为（如实记录）

1. **SHOP `⟳ Roll (1 G)` 是半空操作**：扣 1 G 但不换卡阵容（已诚实标注 `same roster`）。
2. **`🔗 Share` 不真复制链接**，只弹 mock toast。
3. **`⏭ Skip` 不触发结算/战绩**，只有 `▶ Play` 自动播完才记。
4. **落地页点市场卡 → 去市场列表页**，不是直接弹下注框（要在 `#/markets` 再点一次卡）。
5. **`Resolve YES/NO` 是 Demo 立即开奖捷径**，真实产品由链上规则到期自动结算。
6. **手动 Raid 失败没真扣 ore**，文案说「arsenals + ore spent」但状态未改。
7. **创建 agent 后 Arena 直接是满账户**（G=240/ELO=1043/bench 满/有战绩挂单）——刻意 seed，非你打出来的。
8. **网络指示 `GRAVITY · 7771625`、Mock 警示条、AgentMind 落地页 5 行**均为静态装饰，不可交互。
9. **Battle Replay 的 ELO 可重复刷**：每次点 `▶ Play` 都把 `settled` 重置为 false，登录者反复播完会**反复 +16 ELO、反复写一条胜绩**（约 `demo/index.html:1924`+`:1900-1908`）。demo 无防重放。
10. **刷新页面 = 全部重置**（无任何持久化）。

---

## 附：用户故事 ↔ 路线图能力映射

| User story | 对应屏 | 路线图脊柱 / Epic |
|---|---|---|
| A1–A4 观众线 | `#/`、`#/arena` 回放/卡市 | Phase 0「到站」· AgentMind 钩子 |
| B1 创建 agent | `#/onboard` | E6.1 钱包/写链路 + E6.2 onboarding · operator-relay |
| C1 看 autopilot | `#/me` | Phase 2 啊哈 · E7 自营 agent |
| C2 接管/喂目标 | `#/me` | owner=战略家 / AI=执行者 · E6.3 + E7.3 |
| C3 手动动作 | `#/me` | 手动动作 UI |
| D1–D4 赌徒线 | `#/markets` | ① 预测市场（核心）· E1 + E6.4 · parimutuel/ore |
| E1–E3 收藏/牌商 | `#/arena` | ③ 叙事卡/NFT 经济 · E3 + E6.5/E6.6 · G |
| E4 战斗回放 | `#/arena` | ④ 战斗可视化 · #34 + E6.8 |

---

*本手册基于 `demo/index.html`（约 2004 行）真实交互重组编写，叙事框架取自 `docs/roadmap.md`。代码更新时请同步。*

*相关：#76（本 demo）· #34（战斗回放）· #28（双循环经济）· #73（游戏总览）*
