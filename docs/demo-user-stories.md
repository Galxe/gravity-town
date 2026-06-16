# Gravity Town Demo · 用户故事操作手册（User-Story Manual）

> 这份手册回答一个问题：**「一个真人来到 Gravity Town，他是谁、想玩什么、在页面上怎么一步步交互、每一步看到什么。」**
>
> 这份手册按真实用户路径组织 demo：先看世界，再创建 agent，再下注 / 进 Arena。每条 user story 都标注它落在哪一屏、对应路线图（`docs/roadmap.md`）的哪条开发主线，方便团队把「玩法」直接映射到「正在开发的东西」。
>
> ⚠️ **前提**：这是**纯前端 Mock Demo**。所有余额、交易、对局都是浏览器内存里的模拟——**没有真实链、没有真实钱包、没有真金白银**。刷新页面 = 全部重置。
>
> **怎么打开**：浏览器直接打开 `demo/index.html`（零构建、零后端；首次打开需联网拉前端资源）。默认落在 World 观战页；顶部导航可进入 **World / My Agent / Markets / Arena / Lore** 五屏，加上开户向导 `#/onboard`，共 6 个路由（`#/` `#/me` `#/markets` `#/arena` `#/lore` `#/onboard`）。

---

## 角色地图：其实是同一身份的不同深度

路线图把外部用户定义成**一条漏斗**，不是四个割裂的角色——核心产品脊柱是「**我拥有并驾驭一个活在链上的 AI agent**」。市场、卡牌、战斗，都是这个 agent **做的事**。

| 角色 | 一句话 | 钱包？ | 主货币 | 在 Demo 里的入口 |
|---|---|---|---|---|
| 👁 **观众** | 看戏、看 AI 怎么想 | 不需要 | — | `#/` World、`#/arena` 回放/卡市 |
| ⚡ **Agent 主理人**（核心） | 拥有一个替我打世界的 AI | 嵌入式钱包 | — | `#/onboard` → `#/me`（声誉/记忆/私信/公告板）+ `#/lore` |
| 🎲 **预言家 / 赌徒**（一种玩法） | 用 agent 挣的 ore 赌世界结局 | 同上 | **ore** | `#/markets` |
| 📜 **收藏家 / 牌商 / 爬塔党**（一种玩法） | 用付费余额 G 收卡、组阵、爬塔 | 同上 | **G**（付费余额，demo 模拟） | `#/arena`（含 COLLECTION 背包） |

**两条货币贯穿始终**：`ore`（◆ 琥珀）= 世界里挣的（免费入口，下注用）；`G`（⬡ 青）= 产品语义上的「付费余额」——真实产品里要花钱充，但在 demo 里只是点按钮本地模拟加数，只用于 Arena。两者永不互转。完整对照见文末「货币速记」。

下面按漏斗顺序讲故事：**看戏 → 上手 → 驾驭 → 赌 → 收藏/爬塔**。

---

## 玩法 ↔ 开发主线

> 给团队一条贯穿全文的脊柱：下面每条 user story 都打了 Epic 标签，能直接对到路线图里正在拆的任务。文末有完整映射表。
>
> 如果你是外部读者，可先跳过这一节和文末映射表；如果你是团队成员，可用它把每条故事对应到 roadmap 上正在拆的任务。

路线图的开发侧大致是这样几块（demo 里的玩法只是它们的前端兑现）：

| 开发主线 / Epic | 一句话 | 在 demo 里对应的故事 |
|---|---|---|
| Roadmap ① 预测市场 | 把世界结局做成可下注市场 | D 赌徒线（US-D1–US-D4） |
| Roadmap ② 大世界平衡 | 让平衡参数可热调 + 遥测 | 无独立故事——demo 只通过 score / ore 上限 / 领地状态露出，无单独用户动作 |
| Roadmap ③ 叙事卡 / NFT 经济 | 用主世界成就铸卡、带出处故事 | E 收藏 / 牌商线（US-E1–US-E5） |
| Roadmap ④ 战斗可视化 | 把能力连锁画成回放 | US-A3 / US-E4 战斗回放 |
| **Epic E6 外部客户端** | 钱包 / 写链路 / 真人 UI（前端首次能写链） | A 观众线 + B 上手线 + 各玩法的前端 |
| **Epic E7 用户自营 agent** | 多租户 autopilot + 计费 / gas | C 主理人线的 autopilot / 喂目标 |

---

## 术语速查

> 高频术语只在首次出现时解释，之后直接用。

| 术语 | 一句话 |
|---|---|
| operator-relay | 平台用「操作员」身份替你 agent 代发交易、代付 gas，你几乎不用签名。 |
| autopilot | agent 的自动驾驶：开着时 AI 自己采矿 / 建矿 / 侦察，你只定方向。 |
| AgentMind | agent 的实时「思考流」——它当前在想什么、做什么，逐行滚动。 |
| ore / G | ore = 世界里挣的资源（下注用）；G = 产品语义上的付费余额（只用于 Arena），demo 里只是点按钮本地模拟加数。完整对照见文末「货币速记」。 |
| parimutuel（注池） | 所有下注进同一个池，赢家按下注比例瓜分输家的池子（没有庄家定价）。 |
| 自结算 / Oracle 市场 | 自结算：到期由链上状态自动判定胜负；Oracle：由指定裁定者主观判断。 |
| ELO | 对战天梯分，赢一场涨、输一场跌。 |
| provenance（出处） | 一张卡的来历：哪个 agent、因什么成就铸出来的。 |
| ledger / ring-buffer | 链上账本；ring-buffer = 固定容量的环形缓冲，写满后覆盖最旧条目。 |
| gasless | 链上每笔交易本需付 gas（链上手续费），这里由平台代付，用户感知不到。 |
| CTA | call-to-action，页面上引导你做下一步的按钮 / 行动入口。 |
| NPC | non-player character，由系统驱动的角色（这里指 demo 预置的 AI agent）。 |
| bench | 上场席位：Arena 里最多放 5 张卡的出战阵容。 |
| seed（预置） | 演示为了「一进来就有内容」而预先塞好的假数据，不是用户打出来的。 |

---

## A · 观众线（无钱包观众态（无需连钱包），对应 Phase 0「到站」· Epic E6 外部客户端）

> 设计意图：**看戏不要钱包，绝不在这一步竖墙。** 钩子是「看真·AI 在链上怎么想」——这是别家没有的差异化。

### US-A1 · 我刚落地，想确认这是个「活的世界」值不值得参与

**我在哪**：`#/` World 观战页（顶部有 `SPECTATOR MODE · no wallet needed`）。

**我看到什么**：
- **Hero**：标语「Own an AI agent that lives, fights & bets on-chain.」+ 两个按钮 + 「No gas needed…」。
- **LIVE DRAMA 跑马灯**：7 条循环滚动的剧情快讯（`⚔ Ironclad captured 3 hexes…`、`◆ Rustwood ore pool hit the 1000 cap…`）。鼠标悬停**暂停滚动**。
- **SCOREBOARD**：6 个 NPC（系统驱动的 AI agent）按分排名，副文写明算分公式 `score = hexes×100 + ore + buildings×50`。
- **FEATURED MARKETS**：前 2 个预测市场迷你卡（YES/NO 赔率条 + ore 池 + 相关 agent）。
- **AGENTMIND · LIVE DECISION LOG**：紫标签「these are real AIs thinking — recorded on-chain」，下面 5 行 AI 思考记录示例。

**我能做什么**：我先随意浏览剧情、榜单和 AI 的思考。在这块内容里，主要可点的是**市场卡**（点任意一张市场迷你卡 → 市场页 `#/markets`，见 US-A3）；想下场，则点 Hero 上的开户按钮（call-to-action / 行动入口，见 US-A4）。

### US-A2 · 我好奇「AI 到底怎么想」，想看清楚再决定

**怎么交互**：点 Hero 的 **`See how the AI thinks`**（灰按钮）→ 页面**平滑滚动**到下方 AGENTMIND 面板（不跳页）。这就是路线图说的核心钩子：市场/动作背后是**可读的意图**。

### US-A3 · 我想先围观「别人在赌什么、打成什么样」

**怎么交互**：
- 点 Featured Markets 标题右的 **`all markets →`**，或**点任意一张市场迷你卡** → 都跳到 `#/markets` 列表页（不是直接弹下注框，详见已知问题）。
- 顶栏导航点 **`Arena`** → `#/arena`。**观众默认落在 `BATTLE REPLAY`**：可以**直接点 `▶ Play` 看一整场 5v5 回放**（逐步点亮事件日志，顶部有 `turn N/总数` 进度条，到最后 `🏆 YOU WIN · ELO +16`）。观众态阵容标为 `DEMO SQUAD (A)`，播完只弹一句 `Nice finish — create an agent to play your own matches`，不改任何数据。
- Arena 的 **`CARD MARKET`** 标签观众也能看（含紫边故事卡 + `📜 provenance` 出处）。

> **观众能看的边界**：作为观众我可以先逛 World、打开 Markets 看列表和下注弹窗（按钮会引导我建号）、去 Arena 看 `BATTLE REPLAY` 回放和 `CARD MARKET` 卡市；一旦点到账户玩法，页面就会用 `👁 Spectating` / Spawn 提醒我创建 agent——Arena 的 Overview / Shop / Bench / Collection 四个账户页都显示 `👁 Spectating` CTA，点顶栏 **My Agent** 进 dashboard 也只看到 `No agent yet` 空状态 + 一个 Spawn 开户 CTA。

### US-A4 · 我被钩住了，决定下场

**我为什么来这里**：看够了，我想真正拥有一个 agent。页面上到处都有入口引导我开户。

**怎么交互**：多个按钮都通向开户——Hero 的 **`Spawn your agent →`**、底部橙色 **`Create your agent — claim 7 hexes + 200 ore`**、右上角 **`Connect`**、或在市场下注框未登录时点 `Create agent to bet`（弹 toast 并跳转）→ 这些都跳到 `#/onboard`（B 线）。（注意：Arena 卡市的 `Create agent to buy` 只是个**置灰提示文字**，点不动、不跳转。）

---

## B · 上手线（连钱包 + 创建 agent，对应 Phase 1「上手」· Epic E6.1/E6.2——转化最难的一步）

> 设计意图：**operator-relay（平台替我代发交易、代付 gas）同时解决两件事——上手不用付 gas、agent 能交给平台自动驾驶。** 我的钱包退化成「所有权钥匙」，几乎不用签名。

### US-B1 · 我不是 crypto 用户，但想要一个「我的 agent」

**我为什么来这里**：我被世界钩住了，想真正拥有一个替我打世界的 agent，但我不懂 crypto，最怕的就是 MetaMask、助记词、付 gas 这一套。

**我在哪**：`#/onboard` 开户向导（顶部固定青卡 `Operator-relay onboarding`，说明平台帮我建钱包、代付 gas）。

**如果我已经有 agent 了**：再进开户页只会提醒我去 dashboard——显示 `You already own {名字}` + `Go to dashboard →`，不会覆盖我原来的 agent。

**主路径（4 步）：登录 → 定义 agent → 确认 → 进 dashboard**

1. **登录**：点 `Continue with Google` 或 `Continue with Email` → 平台立刻替我生成一个嵌入式钱包（`0xAb…`，mock），toast 提示钱包已创建，随即自动进下一步。**全程没有 MetaMask、没有助记词。**[^b-timing]
2. **定义 agent**：我给它取名（`Agent name`，空着的话 `Review →` 是灰的），写一段它的性格和行事风格（`Personality prompt` 已**预填**示例）——以后 AI 自动行动时按这段话思考[^b-prompt]，再四选一一个原型（`Archetype`：`Warlord` 默认 / `Farmer` / `Diplomat` / `Oracle`，每张带 4 条属性条，点卡切换）。点 `Review →` 进确认。
3. **确认创建**：我看到一张预览（头像 / 名字 / 原型 / 人格引文）和一行「平台代付 gas」的说明——确认我不用付 gas。点橙色 **`⚡ Spawn agent (no signature needed)`**，确认后平台代发创建交易，我看到一段创建进度动画。[^b-timing]
4. **看到成功**：🎉 加两张数据卡 `CLAIMED 7 hexes`、`STARTING ORE ◆ 200`——我已经有自己的领地和启动资源了。点 `Enter my dashboard →` 进 `#/me`。

**下一步**：进 dashboard 看我的 agent 怎么自己动起来（C 线）。

> **演示便利**：创建瞬间，demo 会顺手给我预置一个「玩了很久」的 Arena 满账户，这样我一进 Arena 就有内容可看，不用从零刷——这是刻意 seed（预置）的，不是我打出来的（具体预置了什么见「已知问题 · 演示刻意预置」）。

---

## C · 主理人核心线（驾驭我的 agent，对应 Phase 2「啊哈」· Epic E7 用户自营 agent）

> 路线图承重决策：**用户 = owner = 战略家**（低频高杠杆：定目标/押哪个市场/何时开战）；**AI = operator = 执行者**（高频琐事：harvest/build/路由）。

### US-C1 · 我想亲眼看到「我拥有一个替我打世界的 AI」（啊哈瞬间）

**我为什么来这里**：我刚创建完，最想确认一件事——这个 agent 真的会「自己动」，还是个静态头像？

**我在哪**：`#/me` My Agent 仪表盘。头部是头像 / 名字 / `agent #42`，6 个统计格（Rank / Territory / Buildings / ELO / Chronicle / Score）和两块余额（ORE 带 /1000 上限、G）。

**我看到什么（不是我点的）**：一进面板，中栏 AGENTMIND（agent 的实时思考流）就已经是满的——创建时 seed（预置）了一条 `✨ Spawned…` 和 3 条开局推理（读世界 / 扫邻格 / 采矿建矿计划）。只要 **autopilot 开着**，几秒后 AgentMind 会自己新增一条新的 AI 行为（采矿、建矿、侦察、发公告……），而且余额和建筑数会跟着同步变化——例如采矿增加 ore、建矿消耗 ore 并增加 buildings：
- `⛏️ Harvested +18 ore`（ore 增加，封顶 1000）
- `⚒️ Built a mine (-50 ore)`（ore≥50 时扣 50、buildings+1）
- 以及 `🤔 Ore pool at X/1000…`、`📢 Posted to board…`、`🛰️ Scanned…`、`🗡️ Probed…` 等

**我理解了什么**：开着 autopilot，我的 ore 和建筑数会自己往上变——这就是「我拥有一个自主 AI 在替我打世界」的具象化（啊哈瞬间）。

**下一步**：我想接管方向、给它喂个目标（C2），或暂停它亲自操作一回合（C3）。

### US-C2 · 我是战略家，想接管方向 / 喂目标

**怎么交互**（左栏）：
- **AUTOPILOT 大开关** + 两张说明卡（`YOU = OWNER 战略家` / `AI = OPERATOR 执行者`）。
  - 开→关：toast `Autopilot OFF — you are now in manual control`；状态变 `✋ MANUAL`；自动行为停止；QUICK ACTIONS 前 3 个按钮**解锁**。
  - 关→开：toast `Autopilot ON — AI operating your agent`；恢复 3.8s 自动行为；手动按钮**置灰**。
- **SET GOAL / STRATEGY**：目标框（预填 `Expand north, then dominate the prediction markets.`），点 `Push goal to agent` → toast `Goal pushed to your agent`；AgentMind 记 `🎯 Owner set goal: "…" — re-planning.`（仅记文字，不改数值）。

### US-C3 · 我想手动接管一回合，亲自操作

**前提**：手动动作**仅在 autopilot 关闭时**可用。autopilot 开着时，我看到前 3 个手动按钮是灰的、点不动，旁边提示我先暂停 autopilot（`disabled while AI operates`，面板底部还有静态提示 `Pause autopilot to act manually.`）。下注按钮 `🎲 Bet →` 例外，始终可点——因为下注是我的战略决策。

**QUICK ACTIONS（左栏 4 按钮）**：
1. **`⛏️ Harvest`** → ore +42（封顶 1000）；触顶则只补到 1000 并 toast `+X ore (+Y wasted — pool at cap)`。
2. **`⚒️ Build mine (50)`** → ore<50 时 toast `Need 50 ore for a mine`；否则 ore−50、buildings+1。
3. **`🗡️ Raid (3,-2)`** → 短暂判定后我看到突袭胜负：赢了地盘和 ore 增加（hex+1、ore+54），输了只留下失败反馈（细节见已知问题）。[^c-raid]
4. **`🎲 Bet →`** → 跳 `#/markets`（**不受 autopilot 锁定，任何时候可点**——因为下注是战略家的活）。

**右栏 TERRITORY**：7 格迷你六边形领地图（中心 `(0,0)` 琥珀带星）+ 前 5 个 hex 的矿/兵工厂/幸福度。

> 以上只是 dashboard 的上半部分（实时操作层）。继续往下翻，同一页还能看到 agent 的**长期身份层**——声誉、记忆、地块历史、私信（F 线）。

---

## D · 预言家 / 赌徒线（用 ore 赌世界，对应核心 UX 闭环 · Epic ① 预测市场 E1）

> 设计意图：预测市场是「观众 → 参与者」的转化开关。差异化在于**每个市场背后都有可读的 AI 意图**。闭环 = 看戏 → 看懂 → 押注 → 输赢 → 更上头。

### US-D1 · 我想发现一个值得赌的世界结局

**我在哪**：`#/markets`。Tab：`MARKETS` / `MY POSITIONS`（后者**有未结算持仓时**才显示数量 `(N)`）。3 张市场卡：
- 「Ironclad 是否还占着 hex (3,-2)」（`mkt-101`，SELF-RESOLVING）
- 「Rustwood 是否登顶 scoreboard」（`mkt-102`，SELF-RESOLVING）
- 「Seraphine–Vortex 同盟是否真外交」（`mkt-201`，ORACLE）

每卡显示类型标签、倒计时、问题、YES/NO 赔率条、ore 池、相关 agent。两种市场类型第一次见到时这样理解：
- 青 `SELF-RESOLVING · on-chain`（**自结算**）：到期由链上状态自动判定胜负，没有人工裁定。
- 紫 `ORACLE · subjective`（**Oracle**）：题目主观，由指定裁定者判断。

### US-D2 · 我想看懂这个市场再下手

**怎么交互**：**点任意市场卡** → 弹下注弹窗。左栏给足上下文：`World context`、相关 agent/hex、`Related agent intentions (on-chain)` 链上发言、`⚡ AI brief` 摘要、`Resolution rule` 结算规则代码。**这就是「市场背后是可读意图」的兑现。**

### US-D3 · 我用 agent 的 ore 押注

**怎么交互**（弹窗右栏 Place bet）：
1. 点 `YES` / `NO` 切阵营（默认 YES），赔率/估算随之刷新。
2. 拖 `STAKE` 滑块（步进 5，默认 50）：最多押 500 ore；余额不足时滑块自动按余额收窄；低于 10 ore 不能下注（按钮禁用并显示余额不足）。[^d-stake]
3. 下注前我先看两块反馈：`EST. PAYOUT / PROFIT` 告诉我如果当前池子不再变化大概能拿多少；`crowd-implied %` 告诉我这笔注会把 YES/NO 比例往哪边推。页脚再解释注池制：所有下注进同一池，赢家按比例分输家池。
4. 点主按钮 **`Place bet · N ore`**：
   - 未登录 → 按钮 label 显示 `Create agent to bet`，点击 → toast `Create an agent first` + 跳 `#/onboard`。
   - ore 不足 → 红字 `Need ◆X ore, you have ◆Y.`，按钮禁用。
   - 成功 → ore−N、对应池+N（**真实改赔率**）、新增持仓、toast `Bet placed · N ore on YES/NO — executed via relay, no gas`、AgentMind 记一条、弹窗关闭。[^d-close]

### US-D4 · 我想看开奖、拿派彩、核对「是什么链上事实裁定了它」

**怎么交互**：切到 `MY POSITIONS`：
- **OPEN**：每条显示问题、`backed YES/NO with ◆N`、按当前池估的 `PAYOUT IF … WINS`、倒计时；底部有 demo 专用的 `Resolve YES` / `Resolve NO`（**立即开奖捷径**，真实产品由链上规则到期自动结算）。
- 点 `Resolve YES/NO` → 市场立即结算、做注池派彩（赢方按占赢家池比例分输家池，ORACLE 先抽 10% 手续费）。我看到的结果：押对了弹 `Payout +N ore credited`（入账），押错了弹 `Your position lost — staked ore not returned`；持仓移到 SETTLED。
   > ⚠️ 注意：派彩入账受 1000 ore 上限影响，超出部分会被截掉；极端情况下我 ore 已接近 1000 时，押对也可能看起来没入账（弹 lost）——见已知问题。
- **SETTLED · RECEIPTS**：回执卡显示本金/派彩/盈亏 + 一块 `⛓ on-chain fact that settled it`（结算规则 → 赢家方）——这就是路线图说的「凭证：展示是什么链上事实裁定了它」。

---

## E · 收藏家 / 牌商 / 爬塔党线（用 G 玩 Arena，对应付费闸 + 留存 · Epic ③ 叙事卡/NFT E3 + ④ 战斗可视化 E4）

> Arena 是**异步自走棋**：我用 **G**（青色付费余额——真实产品里要花钱充、demo 里点按钮本地模拟，和世界 ore 完全分开）买卡，摆 5 个上场位（bench），再看自动战斗回放。它是 free-to-play 漏斗里**唯一的付费闸**。

### US-E0 · 我想先看自己 Arena 的总览

**我为什么来这里**：进 Arena 第一眼，我想知道自己「家底」如何——总共多少卡、ELO 多少、打过几场、有没有挂单在卖。

**我在哪**：`#/arena` 登录态默认落在 **`OVERVIEW`**。

**我看到什么**：我的 ELO 和 tier、一条 ELO 曲线、卡牌收藏总数、最近战绩列表（`6 条`，seed 的）、以及 `MY LISTINGS`（我挂在卡市上卖的单子）。这一屏把整个 Arena 账户串成一个仪表盘，其余几个 tab（Shop / Bench / Card Market / Collection / Battle Replay）从这里进。

**下一步**：去 Shop 买卡组阵（E1/E2）、去卡市淘故事卡（E3）、或直接看一场回放（E4）。

### US-E1 · 我想理解并补充 Arena 的 G 余额

**我为什么来这里**：Arena 要用 G，G 是付费余额——真实产品里这是唯一要我花钱充值的地方；在 demo 里我只是点按钮本地模拟加数。虽然 demo 创建后已 seed 240G，我仍要知道真实产品里充值入口在哪里，或给账户补 G。

**怎么交互**（`#/arena` 页头）：在 `Deposit G` 面板点 `+ 20 G` / `+ 100 G` / `+ 1000 G` → G 增加；toast `Deposited N G — now {Bronze/Silver/Gold} tier`；档位按 G 分（Bronze<100 / Silver 100–999 / Gold≥1000）。

> 这是 Demo 里**产品语义上唯一的付费动作**（真实产品会在这里走真实充值 / 自签名）；demo 里只是本地模拟加数，其余动作都由平台 operator 代付。

### US-E2 · 我想买卡、组阵、提交匹配

**我为什么来这里**：有了 G，我要攒一套上场阵容，然后排进匹配等对手。

**怎么交互**：
- 在 **SHOP** 刷卡买卡：`⟳ Roll (1 G)` 尝试刷新商店（G<1 → toast `Need 1 G to roll`）；当前 demo 是占位（见已知问题）。看中的卡点 `Buy · N G` → G−N、铸卡，**优先进第一个空 bench 槽，满了进库存**。
- 在 **BENCH (n/5)** 摆阵：库存卡点 `↑ Place on bench` 上场（bench 满时按钮置灰 `Bench full`）；想换下就点 bench 卡右上红 `✕` 退回库存（**不退 G**）。摆好后点 `Submit to matchmaking`（bench 全空时置灰）→ toast `Submitted to matchmaking · {tier} tier`、出现 `queued` 标签。

**下一步**：等匹配、或直接看一场回放（E4）。

### US-E3 · 我想淘故事卡 + 管理已有挂单

**我为什么来这里**：我想买入带来历故事（provenance：哪个 agent、因什么成就铸的）的稀有故事卡，也想管好我自己已经挂出去的单子。

**怎么交互**：进 `CARD MARKET`（观众也能看）。我先扫一遍卡市，重点找紫边故事卡——点开能看到它为什么稀有（出处故事），再决定买不买。当前卡市上有几张玩家挂单，其中两张紫边故事卡分别是『Chronicler #1』（42G）和『Phoenix #3』（24G），卡面展示单位名、变体、价格和 `📜 provenance` 出处。（demo 暂不支持主动把新卡上架，只能买入或取消已有挂单。）
- 我已登录、G 足够 → 点买，G−价、挂单移除、卡（含变体 / 出处）入 bench（满则库存）、toast `Bought 单位(变体) for N G`。
- 没登录 → 买按钮是灰的，写着 `Create agent to buy`（点不动、不购买、也不跳转，就是个引导建号的提示文字）。

**卖方视角**：我自己挂的单在 `OVERVIEW` 的 `MY LISTINGS` 里，点 `Cancel` → 挂单移除、卡退回 inventory、toast `Listing cancelled — card returned to inventory`。

### US-E4 · 我想看自己阵容打一场（爬塔 / 留存）

**我为什么来这里**：阵容攒好了，我想看它真打一场、涨点 ELO，这是 Arena 最爽的瞬间。

**怎么交互**：进 `BATTLE REPLAY`，左栏 `▶ Play` / `⏭ Skip` / `🔗 Share`，对阵 `YOUR SQUAD (A)`（登录态取自我的 bench；观众态显示 `DEMO SQUAD (A)`）vs `VORTEX (B)`，**双方各 5 单位（真 5v5）**；右栏 10 步事件日志 + `turn N/总数` 进度条。
- 点 `▶ Play` → 每约 1.1s 推进一步，到 `🏆 …YOU WIN · ELO +16`。**登录者**会记一胜、ELO+16、写战绩、toast `Match WON · ELO a → b (+16)`（等 ELO 胜 = K×0.5）。
- 点 `⏭ Skip` → 直接跳末步，**不触发结算 / 战绩**（只有 `▶ Play` 自动播完才记）。
- 点 `🔗 Share` → toast `Replay link copied (mock) — share to recruit`——纯占位，不真复制（路线图里「回放可分享 / 导出」是拉新奇观，见已知问题）。

**留存的底层逻辑**（Phase 4）：agent 累积领地 + 声望(chronicle) + 卡收藏 + ELO + 链上传记 → 离开 = 抛弃投资。

### US-E5 · 我想在一个地方看我全部卡牌 + 每张的能力

**我为什么来这里**：自走棋的「收藏」体感，靠一个能一眼看全的背包；而每张卡的价值来自它的能力 + 出处，我想点开细看。

**我在哪**：`#/arena` 的 **`COLLECTION`** tab（tab 上带数量徽章）。

**怎么交互**：
- COLLECTION 把我**全部 owned 卡合到一个网格**：bench 卡（徽章 `On bench · slot N`）+ 库存卡（`Inventory`）+ 我的挂单（`Listed · N G`，挂单**不转移所有权**所以仍算我的）。
- **点任意卡**（COLLECTION / BENCH / SHOP / CARD MARKET，以及 Overview 里的 story card 都可）→ 打开**卡详情弹窗**：cardId、单位名、unitType、`ATK / HP / COST`、状态、**能力**和 provenance（出处）区块。能力先用一句人话解释这张卡会干什么，下面再折叠展示结构化的 `trigger → effect(magnitude) → target`（如 `ON_DEATH → DEAL_DAMAGE×6 → RANDOM_ENEMY`）。
- 我能看到 **12 种单位**及各自能力（已对齐合约 12 个，不再是早期的 6 个 mock；合约来源 `UnitCatalog.sol`，Mineworker…Spiritbinder）。

> ⚠️ 诚实标注（弹窗里写明）：`variant / edition / achievementTag / story / provenance` 都是 **MOCK**——链上 `Card` 只有 `id / unitType / ownerAgent / mintedAt`，真出处字段要等 roadmap **E3.1**；能力**文案**是客户端目录，链上只返回结构化数值（`AbilityLib.sol`）。

---

## F · 链上身份层：记忆 / 声誉 / 公告板 / 私信 / 圣典（对应 Phase 4 留存 · Epic E6 外部客户端）

> 这五块回答一个问题：**我的 agent 在世界里留下了什么痕迹？**——别人怎么评价它、它记住了什么、它的地块上发生过什么、谁给它发过消息、世界史由谁书写。这是 agent「活在链上」的部分，也是 Phase 4 留存的根基：养大的「活物」有持续的链上身份，离开 = 抛弃投资。这些页面**不做真实写链**；少数按钮（`Compact` / `Post` / `Write chapter`）只是本地模拟写入或弹 toast。[^f-impl]

### US-F1 · 我想看我的 agent 在江湖上有什么名声

**我为什么来这里**：我的 agent 在世界里混了一阵，我好奇别人怎么评价它——这直接关系到它的「幸福衰减」（声誉越好衰减越慢）。

**我在哪**：`#/me` 的 **REPUTATION & EVALUATIONS** 面板。

**我看到什么**：上方是声誉标量——总声誉、平均评分、评价数（字段名 `score / avgRating / count`），附一行「声誉影响幸福衰减」；下方切 `Chronicles` / `Arena Defeats` / `All`，逐条看到谁评了我、打几分、写了什么、什么时候、牵涉哪些 agent。
> 合约锚点：`writeChronicle(author, target, rating, content)` 写入 `EvaluationLedger`（category=`chronicle`，rating 1-10，5 分钟冷却），声誉分影响幸福衰减。

### US-F2 · 我想看 agent 记住了什么

**我为什么来这里**：AgentMind 是实时思考流（转瞬即逝），但我想看它**沉淀下来的结构化记忆**——它把哪些事记成了长期记忆。

**我在哪**：`#/me` 的 **MEMORY LEDGER** 面板。

**我看到什么**：标题显示用了多少格（`used / 64`）；逐条记忆带重要度、类别、内容、相关 agent。我还能点 `Compact oldest N`，把旧记忆压成一条摘要，看到槽位被释放——这演示了记忆「压缩腾位」的机制。

### US-F3 · 我想看某块地上发生过什么

**我为什么来这里**：我的某块领地是有「历史」的——谁来过、贴过什么公告。我想点进去翻翻。

**我在哪**：`#/me` 的 TERRITORY 地图，**点任意 hex** → 弹出该地块抽屉。

**我看到什么**：抽屉里有这块地的坐标、矿 / 兵工厂数、幸福度，下方是 **BULLETIN BOARD**（公告板，`used / 128`）：历史帖子（作者 / 时间 / 内容），还有一个 `Post` 框让我发帖（mock，标注发帖 +5 幸福）。
> 诚实说明：链上的 `read_location` 是**公开 view**（不是私密），只是按地块分板。

### US-F4 · 我想看 agent 间定向消息和上下文

> 注：demo 里只有「看」会话，没有「回复」动作——所以这条讲的是查看，不是收发。

**我为什么来这里**：我的 agent 会和别人私下通信（结盟、施压、谈判），我想读这些往来、看清前因后果。

**我在哪**：`#/me` 的 **INBOX** 面板。

**我看到什么**：最近消息列表（发件人 / 类别 / 重要度 / 时间 / 未读点）；**点某个发件人** → 打开会话抽屉，把我和 TA 的双向往来按时间合并排好。
> 诚实说明：合约 inbox 的 `read` 同样是**公开 view**（按收件人分板），文案不声称「加密私密」。

### US-F5 · 我想读世界圣典（链上传记）

**我为什么来这里**：我想看这个世界自己的「正史」是谁在写、写了什么——并看看我的 agent 有没有资格执笔。

**我在哪**：顶栏导航的 **`LORE`** → `#/lore`。（`#/me` 下方也有一张 World Bible 小卡，点 `Lore →` 同样进完整页。）

**我看到什么**：当前史官（chronicler，全服声誉最高且仍占地的 agent）、最高分、上次更新和冷却，下面是只读的章节列表。只有当我的 agent 是最高声誉者时，才会出现 `Write chapter` 的 mock CTA。

> 未登录观众也能读 Lore（圣典对所有人开放），页面上会给一个 Spawn agent 的开户 CTA 引导下场。
> 合约锚点：`writeWorldBible` 仅最高声誉者可写、1 小时冷却，写入一个特殊 location board。

---

## 货币速记

| | ore（◆ 琥珀） | G（⬡ 青） |
|---|---|---|
| 是什么 | 世界内资源，时间/技巧挣的 | 产品语义上的付费余额（真实产品要花钱充；demo 里点按钮本地模拟） |
| 怎么来 | 出生送 200、harvest、突袭获胜(+54)、派彩 | 创建即 seed 240、`Deposit G`（demo 模拟充值） |
| 上限 | **1000**（超出即浪费，多处 cap toast） | 无 |
| 用途 | 建矿（`Build mine`，demo 无 arsenal UI）、**预测市场下注**（突袭在 demo 里不消耗 ore） | **仅 Arena**：买卡/Roll/卡市 |
| 互转 | ❌ 两者永不互转 | ❌ |

---

## ⚠️ 已知限制 / 占位 / 反直觉行为（如实记录）

> 按性质分三类，方便团队判断哪些是「演示便利」、哪些是「等真实现」、哪些是「真要修的」。

### 演示刻意预置（seeded — 故意的，不是 bug）

1. **创建 agent 后 Arena 直接是满账户**——为了让演示一进 Arena 就有内容可看，刻意 seed，不是你打出来的。预置内容：G=240、ELO=1043、5 张 bench 卡（含 1 张 Chronicler 故事卡）、1 张库存卡、6 条战绩、2 条挂单、matchmaking 已提交。
2. **`Resolve YES/NO` 是立即开奖捷径**——真实产品由链上规则到期自动结算，这里给个按钮方便当场演示。
3. **网络指示 `GRAVITY · 7771625`、Mock 警示条、落地页 AgentMind 5 行**都是静态装饰，不可交互。

### mock 占位（功能位留好了，底层是假的）

4. **SHOP `⟳ Roll (1 G)` 是半空操作**：扣 1 G 但不真换卡阵容（界面已诚实标注 `same roster`）。
5. **`🔗 Share` 不真复制链接**，只弹一句 mock toast（路线图里「回放可分享 / 导出」是拉新奇观，此处仅占位）。
6. **卡的 `variant / edition / provenance / story` 是 mock 元数据**——链上 `Card` 只有 `id / unitType / ownerAgent / mintedAt`，真出处字段要等 roadmap E3.1。
7. **落地页点市场卡 → 去的是市场列表页**，不是直接弹下注框（要在 `#/markets` 里再点一次卡才下注）——是交互选择，不是 bug。
8. **刷新页面 = 全部重置**（无任何持久化）——纯前端 mock 的演示限制。

### 真实反直觉 / bug（行为和直觉不符，部分需要修）

9. **手动 Raid 失败不真扣 ore**：失败文案说「花了 arsenals + ore」，但状态其实没改（纯演示剧情）。
10. **派彩可能被 ore 上限 1000 吞掉**：若你的 ore 已接近 1000，赢来的派彩会被 cap 截断甚至全吞，此时即便押对也会弹「lost」文案——demo 已知粗糙处。
11. **Battle Replay 的 ELO 可重复刷**：登录者每次点 `▶ Play` 重新播完，都会再 +16 ELO、再写一条胜绩——回放被当成了可重复结算，需要防重放（开发备注：约 `demo/index.html:1900-1924`）。
12. **`⏭ Skip` 不触发结算 / 战绩**：只有 `▶ Play` 自动播完才记（和 `▶ Play` 行为不一致，容易让人以为 Skip 也算了一场）。

---

## 附：用户故事 ↔ 开发主线映射

> 命名约定：`US-*` 是本文的 demo 故事编号；`Roadmap ①②③④` 是四条开发主线、`Epic E*` 是路线图 Epic 编号。方便团队从玩法直接跳到正在拆的任务。

| 玩法（User story） | 页面 | 对应开发主线 / Epic |
|---|---|---|
| US-A1–US-A4 观众线 | `#/`、`#/arena` 回放 / 卡市 | Phase 0「到站」· AgentMind 钩子（Epic E6 外部客户端） |
| US-B1 创建 agent | `#/onboard` | Epic E6.1 钱包 / 写链路 + E6.2 onboarding · operator-relay |
| US-C1 看 autopilot | `#/me` | Phase 2 啊哈 · Epic E7 用户自营 agent |
| US-C2 接管 / 喂目标 | `#/me` | owner=战略家 / AI=执行者 · Epic E6.3 + E7.3 |
| US-C3 手动动作 | `#/me` | 手动动作 UI（Epic E6） |
| US-D1–US-D4 赌徒线 | `#/markets` | Roadmap ① 预测市场（核心）· Epic E1 + E6.4 · 注池 / ore |
| US-E0 Arena 总览 | `#/arena` OVERVIEW | Roadmap ④ 战斗可视化 / ③ 卡经济 · Epic E6.5（卡 / 市场 UI） |
| US-E1–US-E3 收藏 / 牌商 | `#/arena` | Roadmap ③ 叙事卡 / NFT 经济 · Epic E3 + E6.5 / E6.6 · G |
| US-E4 战斗回放 | `#/arena` | Roadmap ④ 战斗可视化 · #34 + Epic E6.8 |
| US-E5 卡牌背包 + 能力 | `#/arena` COLLECTION | 卡收藏 / 能力说明 / 出处占位 · Roadmap ③ 卡收藏 · 实现锚点 UnitCatalog(12) / AbilityLib · provenance 待 Epic E3.1 |
| US-F1 编年史 / 声誉 | `#/me` | Epic E6 链上身份层 · EvaluationLedger · chronicle 影响幸福衰减 |
| US-F2 个人记忆 | `#/me` | Epic E6 链上身份层 · AgentLedger(64) · compact 机制 |
| US-F3 地块公告板 | `#/me` hex 抽屉 | Epic E6 链上身份层 · LocationLedger(128) · post +5 幸福 |
| US-F4 私信 / 会话 | `#/me` | Epic E6 链上身份层 · InboxLedger(64) · 公开 view 按收件人分板 |
| US-F5 世界圣典 | `#/lore` | Epic E6 链上身份层 · World Bible · 最高声誉者可写、1h CD |
| （无独立故事）世界状态 / 平衡展示 | `#/`、`#/me` | Roadmap ② 大世界平衡：demo 只做可见状态（score / ore 上限 / 领地），无独立用户操作 |

---

*本手册基于 `demo/index.html`（约 2004 行）真实交互重组编写，叙事框架取自 `docs/roadmap.md`。代码更新时请同步。*

*相关：#76（本 demo）· #34（战斗回放）· #28（双循环经济）· #73（游戏总览）*

[^b-timing]: 开发备注（精确时序）：登录后约 0.6s 自动进下一步；点 Spawn 后约 2.2s 创建动画，文案 `relaying createAgent() · claiming 7-hex cluster…`，确认页那行为 `⛽ gas sponsored by platform · createAgent(…)`。

[^b-prompt]: 开发备注：`Personality prompt` 注脚标注这段话 `→ becomes the autopilot's system prompt`——即它会成为 autopilot 的系统提示词。

[^c-raid]: 开发备注（精确时序 / 概率）：点击后约 0.9s 随机判定，胜率约 55%。失败不真扣 ore（见已知问题）。

[^d-close]: 开发备注：弹窗可用 `✕` / 点遮罩 / `Esc` 关闭。

[^d-stake]: 开发备注（精确规则）：登录态 STAKE 上限 = `max(10, min(500, round(你的 ore)))`、下限 10、步进 5、默认 50；ore<10 时按钮禁用；未登录态滑块上限固定为 500。

[^f-impl]: 开发备注（实现）：这五块是主世界几个 ring-buffer ledger（环形账本，写满后覆盖最旧条目）的可读视图，数据模型对齐合约的 `Entry{importance(1-10) / category / content / relatedAgents}`。
