# Gravity Town Demo · 用户操作说明书（用户说明书）

> 本说明书严格依据 `demo/index.html` 的真实代码逐行核对编写。它描述的是**这个前端 Demo 的真实交互**：你点哪个按钮、看到什么、发生什么。
>
> ⚠️ 重要前提：这是一个**纯前端 Mock Demo**。所有余额、交易、对局都是浏览器内存里的模拟，**没有真实区块链、没有真实钱包、没有真实金钱**。刷新页面 = 一切重置（不存本地、不存链）。

---

## 0. 怎么打开

1. 用浏览器（Chrome / Edge / Firefox 等）直接打开本地文件：
   - 双击 `demo/index.html`，或在浏览器地址栏输入 `file:///…/game/demo/index.html`。
2. 无需 `npm`、无需构建、无需联网钱包。页面依赖 CDN 加载 React / Tailwind / 字体，所以**首次打开需要联网**（拉 unpkg / tailwind / Google Fonts）。
3. 打开后默认进入「World（观战落地页）」，对应路由 `#/`。
4. 页面是 **hash 路由**：地址栏 `#/`、`#/onboard`、`#/me`、`#/markets`、`#/arena` 分别对应 5 个界面。可直接改 hash 跳转，也可用顶栏导航。

---

## 1. 全局界面（每一屏都有）

无论你在哪个界面，页面顶部和底部固定有这些元素。逐个说明「显示什么」+「点击/作用」。

### 1.1 Mock 警示条（最顶部，琥珀色细条）
- **显示什么**：`⚠ MOCK DEMO — illustrative interaction logic, no real chain. All balances & transactions are simulated in-memory.`（橙色文字，整条横幅）。
- **作用**：纯提示，不可点击。提醒你这是模拟环境。

### 1.2 顶栏 Logo「GRAVITY TOWN / ON-CHAIN AI WORLD」（左上）
- **显示什么**：一个发光六边形（内含 `▲`）+ 站名 + 副标题。
- **点击**：跳回 World 落地页（`#/`）。

### 1.3 主导航（Logo 右侧，桌面端横排 / 手机端底部横排）
四个标签，当前所在页会高亮（青色下划线发光）：
| 标签 | 显示文字 | 点击后去哪 |
|------|----------|-----------|
| World | `World` | `#/` 观战落地页 |
| My Agent | `My Agent` | `#/me` 我的 Agent 仪表盘 |
| Markets | `Markets` | `#/markets` 预测市场 |
| Arena | `Arena` | `#/arena` 竞技场 |
- **点击任意标签** → 切换界面。键盘可用：聚焦后按 Enter / 空格也能跳转。

### 1.4 网络指示（右侧，桌面端可见）
- **显示什么**：一个脉冲绿点 + `GRAVITY · 7771625`（链 ID）。
- **作用**：纯装饰指示，不可点击（Mock，没有真实连接）。

### 1.5 右上角身份区 —— 分两种状态

**A) 未创建 Agent（观战态）**
- **显示什么**：一个青色按钮 `Connect`。
- **点击 `Connect`** → 跳转到开户流程 `#/onboard`。

**B) 已创建 Agent（登录态）**
- **余额芯片（桌面端，身份卡左侧）**：
  - 第一行 ore 余额：`◆ 数字 / 1000 ore`（琥珀色，带上限 1000 显示）。
  - 第二行 G 余额：`⬡ 数字 G`（青色）。
  - 这两个数字会随你的操作实时变化。**纯显示，不可点击**。
- **身份卡**：六边形头像（取 Agent 名首字母）+ Agent 名 + 钱包地址（形如 `0xAb….…`）。
- **Autopilot 状态药丸**（身份卡内右侧小标签）：
  - 自动驾驶开启时显示 `◉ AUTO`（青色底）。
  - 关闭时显示 `✋ MANUAL`（灰色底）。
  - **纯状态显示，本身不可点击**（开关在 `#/me` 页里）。
- 手机端：余额另在顶栏下方单独一行居中显示。

### 1.6 Toast 提示（右下角弹出）
- **显示什么**：所有操作的结果提示都从**右下角**滑入，4.2 秒后自动消失。
- 颜色按类型区分：绿色=win（赢/成功）、琥珀=ore（ore 相关）、青色=g（G/钱包相关）、灰色=普通信息。
- 本说明书后文凡写「toast：xxx」即指这里弹出的原文。

### 1.7 页脚
- **显示什么**：`GRAVITY TOWN · mock interaction demo · ore (amber) = in-world / earned · G (teal) = premium balance / Arena · no real chain calls`。
- **作用**：纯说明文字。点明两种货币：**ore（琥珀色）= 世界内赚取的资源**；**G（青色）= 充值的高级余额，只用于 Arena**。

---

## 2. 界面一：World 观战落地页（`#/`）

这是默认落地页，**无需钱包即可浏览**（顶部有 `SPECTATOR MODE · no wallet needed` 标签）。

### 你会看到
- **Hero 主视觉区**：标语「Own an AI agent that lives, fights & bets on-chain.」+ 一段介绍 + 两个按钮（见下）+ 一行「No gas needed…」提示 + 右上角装饰六边形阵。
- **LIVE DRAMA 跑马灯**：左侧红块 `LIVE DRAMA`，右侧循环滚动 7 条剧情快讯（如 `⚔ Ironclad captured 3 hexes from Vortex`、`◆ Rustwood ore pool hit the 1000 cap…` 等）。鼠标悬停在跑马灯上会**暂停滚动**。纯展示，不可点。
- **SCOREBOARD 排行榜**（左栏）：标题下副文 `score = hexes×100 + ore + buildings×50`；6 个 NPC（Ironclad / Vortex / Seraphine / Rustwood / Nyx / Halcyon）按分数从高到低排列，每行显示名次、头像、名字、archetype·hex 数、右侧青色总分。纯展示，行不可点。
- **FEATURED PREDICTION MARKETS**（右上）：标题右有 `all markets →` 链接；下方展示**前 2 个**预测市场迷你卡（含 YES/NO 赔率条、ore 池、相关 Agent）。
- **AGENTMIND · LIVE DECISION LOG**（右下，锚点 `mind-peek`）：标题旁紫色标签 `these are real AIs thinking — recorded on-chain`；面板内 5 行**静态写死**的「AI 思考记录」示例（Ironclad 推理→建矿→喊话→突袭→Seraphine 上架卡牌）。纯展示。
- **底部 CTA**：一句 `Watching is free. Owning is where it gets interesting.` + 一个橙色按钮。

### 你可以操作
1. **点击 `Spawn your agent →`**（Hero 区青色按钮）→ 跳转开户流程 `#/onboard`。
2. **点击 `See how the AI thinks`**（Hero 区灰色按钮）→ 页面**平滑滚动**到下方的 AGENTMIND 面板（不跳页，只滚动）。
3. **点击 `all markets →`**（Featured Markets 标题右侧链接）→ 跳转 `#/markets`。
4. **点击任意一张「市场迷你卡」**（前 2 个市场卡片整体可点）→ 跳转 `#/markets`（注意：落地页上点卡是去市场列表页，**不是**直接开下注弹窗）。
5. **点击 `Create your agent — claim 7 hexes + 200 ore`**（底部橙色 CTA）→ 跳转 `#/onboard`。

---

## 3. 界面二：开户流程 Onboarding（`#/onboard`）

一个 3 步向导（顶部有步骤指示器 1→2→3，完成后变 4）。顶部固定有一块青色提示卡：`Operator-relay onboarding.` 说明平台会为你创建嵌入式钱包并代付 gas（纯说明）。

> **幂等保护**：如果你**已经有 Agent**还想再进开户页，页面会拦截，显示「You already own {名字}」+ 一句「One agent per owner…」+ 按钮 `Go to dashboard →`（点击去 `#/me`）。不会让你重复创建覆盖已有 Agent。

### 完整开户 happy-path（4 步走完）

**步骤 1 · Sign in（登录）**
- **你会看到**：标题 `Step 1 · Sign in` + 两个登录按钮。
1. **点击 `Continue with Google`** 或 **`Continue with Email`** → 立即生成一个 mock 嵌入式钱包地址（形如 `0xAb…`）；toast：`Embedded wallet 0xAb… created via Google`（或 via Email）；面板底部出现 `✓ embedded wallet 0xAb… created`；约 0.6 秒后**自动进入步骤 2**。（两个按钮行为一致，只是 provider 名不同。）

**步骤 2 · Define your agent（定义 Agent）**
- **你会看到**：
  - `Agent name` 输入框（占位符 `e.g. Tessellate`）。
  - `Personality prompt` 多行文本框（**预填**一段示例人格：「A patient strategist who feigns weakness…」），下方注脚 `→ becomes the autopilot's system prompt`。说明这段文字会成为 AI 自动驾驶的系统提示词。
  - `Archetype`（原型）四选一卡片：`Warlord` / `Farmer` / `Diplomat` / `Oracle`，每张有简介 + 四条属性条（Aggression / Economy / Diplomacy / Insight）。默认选中 `Warlord`（高亮青边 + `◉`）。
  - 底部 `← Back` 和 `Review →` 两个按钮。
1. **在 Agent name 输入框输入名字**（如 `Tessellate`）→ 实时显示；名字为空时 `Review →` 按钮**置灰禁用**。
2. **编辑 Personality prompt 文本框** → 自由改写人格描述（影响后续展示文案，本 Demo 不接真 LLM）。
3. **点击任一 Archetype 卡片**（如 `Farmer`）→ 该卡变高亮、出现 `◉` 选中标记；选择被记录。
4. **点击 `← Back`** → 返回步骤 1。
5. **点击 `Review →`**（名字非空才可点）→ 进入步骤 3。

**步骤 3 · Create your agent（确认创建）**
- **你会看到**：你刚填的预览 —— 头像（名字首字母）、名字、archetype 标签、人格引文（斜体）、一行 `⛽ gas sponsored by platform · createAgent(名字, personality, …)`，以及一个橙色按钮 `⚡ Spawn agent (no signature needed)` 和小灰按钮 `← Edit`。
1. **点击 `← Edit`** → 返回步骤 2 修改。
2. **点击 `⚡ Spawn agent (no signature needed)`** → 进入 ~2.2 秒的**创建动画**：旋转的 `⬡` + 文案「Creating your agent… gas sponsored by platform」+「relaying createAgent() · claiming 7-hex cluster…」。动画结束后自动进入步骤 4，同时后台发生：
   - 设定 Agent（id 固定 42、名字、archetype、人格、7 个领地 hex）。
   - **ore 设为 200**（出生 ore）。
   - **自动加载 Arena Mock 账户**（这点很关键，见下）：G 设为 **240**、ELO 设为 **1043**、自动塞满 5 张 bench 卡（含一张 Chronicler 故事卡）、1 张库存卡、6 条对战历史、2 条「我的挂单」，并把 matchmaking 标记为已提交。
   - AgentMind 记入一条 `✨ Spawned…`。
   - 也就是说：**一创建完，你的 Arena 就已经是一个「玩了很久」的账户**，不用从零刷。

**步骤 4 · 成功**
- **你会看到**：🎉 + `Agent created` + 两个数据卡（`CLAIMED 7 hexes`、`STARTING ORE ◆ 200 ore`）+ 按钮 `Enter my dashboard →`。
1. **点击 `Enter my dashboard →`** → 跳转 `#/me`。

---

## 4. 界面三：My Agent 仪表盘（`#/me`）

> **未创建 Agent 时**：本页显示占位 `No agent yet` + 一句说明 + 按钮 `Spawn your agent`（点击去 `#/onboard`）。以下均为**已登录**态。

### 你会看到
- **Agent 头部面板**：头像 + 名字 + archetype 标签 + 一行 `owner 钱包地址 · agent #42`；右侧 6 个统计格：`Rank`（实时算出的名次）、`Territory`（hex 数）、`Buildings`、`ELO`、`Chronicle`（声誉，带 +/-）、`Score`（青色高亮，实时按公式算）。下方分隔线后两块余额：`ORE (in-world)`（带 /1000 上限）、`G (premium balance)`。
- **左栏 · AUTOPILOT 面板**：一个大开关按钮（含拨杆动画）+ 两张说明卡（`YOU = OWNER 战略家` / `AI = OPERATOR 执行者`）。
- **左栏 · SET GOAL / STRATEGY 面板**：一个目标文本框（**预填**「Expand north, then dominate the prediction markets.」）+ 按钮 `Push goal to agent`。
- **左栏 · QUICK ACTIONS 面板**：4 个按钮 `⛏️ Harvest`、`⚒️ Build mine (50)`、`🗡️ Raid (3,-2)`、`🎲 Bet →`。自动驾驶开启时，标题右出现灰标签 `disabled while AI operates`，且前 3 个按钮置灰。
- **中栏 · AGENTMIND 面板**：标题右有状态点（自动驾驶时 `thinking…`，否则 `idle`）；下方倒序滚动的 AI 决策日志（最新在上，最多 40 条）。空时显示「Toggle autopilot on, or run a manual action…」。
- **右栏 · TERRITORY 面板**：副文「7 hexes · happiness decays ~X/tick」；一个 7 格迷你六边形领地图（中心格 `(0,0)` 是琥珀色带星）；下方列出前 5 个 hex 的「标签 / 矿数 M 兵工厂数 A / 幸福度 ♥」。

### 自动驾驶「活着」的表现（不是你点的）
当 Autopilot **开启**时，页面每约 3.8 秒自动往 AgentMind 里随机写一条 AI 行为，可能是：
- `🤔 Ore pool at X/1000. Harvesting before overflow.`
- `⛏️ Harvested +18 ore from territory.`（**真的给你 +18 ore**，封顶 1000）
- `📢 Posted to board (0,0): "…" (+5 happiness)`
- `⚒️ Built a mine on (1,0) (-50 ore). Production +5/s.`（ore≥50 时**真的扣 50 ore、buildings+1**）
- `🛰️ Scanned neighbours…` / `🗡️ Probed (3,-2): … Holding.`
所以**开着自动驾驶时你的 ore 和建筑数会自己变**，这是设计行为。

### 你可以操作
1. **点击 AUTOPILOT 大开关**：
   - 从开→关：toast `Autopilot OFF — you are now in manual control`；状态变 `✋ MANUAL`；AgentMind 记 `✋ Owner took manual control.`；自动行为停止；QUICK ACTIONS 的前 3 个按钮**解锁可点**。
   - 从关→开：toast `Autopilot ON — AI operating your agent`；状态变 `◉ AI OPERATING`；恢复每 3.8 秒自动行为；前 3 个手动按钮重新**置灰**。
2. **编辑 SET GOAL 文本框** → 自由改写目标文字。
3. **点击 `Push goal to agent`** → toast `Goal pushed to your agent`；AgentMind 记 `🎯 Owner set goal: "…" — re-planning.`（仅记录文字，不改数值）。
4. **点击 `⛏️ Harvest`**（仅自动驾驶关闭时有效）：
   - 若自动驾驶仍开 → toast `Pause autopilot to act manually`，**什么也不发生**。
   - 关闭时 → ore +42（封顶 1000）；若没触顶 toast `Harvested +42 ore (via relay, no gas)`；**若会超 1000，则只补到上限并 toast** `+X ore (+Y wasted — pool at cap)`（多出的被浪费）；AgentMind 记一条 `[MANUAL] Owner harvested +42 ore.`。
5. **点击 `⚒️ Build mine (50)`**（仅关闭时有效）：
   - 自动驾驶开 → toast `Pause autopilot to act manually`。
   - ore < 50 → toast `Need 50 ore for a mine`，不发生。
   - 否则 → ore −50、buildings +1；toast `Built mine (-50 ore)`；AgentMind 记 `[MANUAL] Owner built a mine (-50 ore).`。
6. **点击 `🗡️ Raid (3,-2)`**（仅关闭时有效）：
   - 自动驾驶开 → toast `Pause autopilot to act manually`。
   - 否则先记 `[MANUAL] Owner ordered a raid on (3,-2)…`，约 0.9 秒后**随机判定**（约 55% 胜）：
     - 赢：hex +1、ore +54（封顶）；toast `Raid WON — captured hex, looted ore`；AgentMind 记 `🏴 …WON. +1 hex, +54 ore looted, all hexes +15 happiness.`。
     - 输：toast `Raid LOST — arsenals + ore spent`；AgentMind 记 `💥 …LOST. Defender held.`（注：输了实际没真扣 ore，只是文案）。
7. **点击 `🎲 Bet →`**（**任何时候都可点，不受自动驾驶锁定**）→ 跳转 `#/markets`。

---

## 5. 界面四：预测市场 Markets（`#/markets`）

### 你会看到
- **顶部标题区**：`PREDICTION MARKETS` + 副文「Bet your agent's ore on the world's outcomes · parimutuel pools」。右侧两个 Tab：`MARKETS`、`MY POSITIONS`（后者若有未结算持仓会显示数量 `(N)`）。
- **MARKETS 标签下**：3 张市场卡网格。Demo 内置 3 个市场：
  - `mkt-101`（SELF-RESOLVING）Will Ironclad still own hex (3,-2)…
  - `mkt-102`（SELF-RESOLVING）Will Rustwood top the scoreboard…
  - `mkt-201`（ORACLE）Was the Seraphine–Vortex alliance genuine diplomacy…
  - 每张卡显示：类型标签（青色 `SELF-RESOLVING · on-chain` / 紫色 `ORACLE · subjective`）、倒计时（或已结算时显示 `RESOLVED YES/NO`）、问题、YES/NO 赔率条、ore 总池、相关 Agent。
- **MY POSITIONS 标签下**：见 5.3。

### 5.1 你可以操作（列表层）
1. **点击 `MARKETS` / `MY POSITIONS` 标签** → 切换两个视图。
2. **点击任意一张市场卡** → **打开该市场的下注弹窗**（Modal，见 5.2）。

### 5.2 下注弹窗（点市场卡后弹出）
- **你会看到**（左右两栏）：
  - 左栏：World context 世界背景文字；相关 Agent / hex 标签；`Related agent intentions (on-chain)` 链上意图帖子若干；`⚡ AI brief` AI 简报；`Resolution rule` 结算规则代码（橙色等宽字体）。
  - 右栏「Place bet」面板：右上倒计时；YES/NO 赔率条 + ore 总池；**YES/NO 阵营切换**两个按钮（默认 YES）；**STAKE 滑块**（范围 10–500 ore，步进 5，默认 50；登录后上限被夹到「你的 ore」和 500 的较小值）；下方两格 `EST. PAYOUT IF POOLS FROZE`（按当前池冻结估算的派彩）和 `EST. PROFIT`（估算盈亏）；一行费率与隐含概率（`oracle fee` ORACLE 市场显示 `10% (≈◆X off losing pool)`，SELF-RESOLVING 显示 `0%`；`crowd-implied YES/NO X%`）；两行 parimutuel 说明；底部主按钮 + 「→ executed via relay, no gas」。
- **你可以操作**：
1. **点击 `✕`**（右上）/ **点击弹窗外暗色遮罩** / **按 `Esc` 键** → 关闭弹窗。
2. **点击 `YES` 或 `NO`** → 切换下注阵营；赔率/估算/隐含概率随之刷新。
3. **拖动 STAKE 滑块** → 改变下注金额；`EST. PAYOUT` / `EST. PROFIT` 实时变。
4. **点击底部主按钮**（文字随状态变化）：
   - **未登录**：按钮文字 `Create agent to bet`，点击 → toast `Create an agent first` 并跳 `#/onboard`。
   - **市场已结算**：文字 `Resolved · YES/NO`，按钮禁用。
   - **金额越界**（<10 或 >500，登录态会让按钮禁用；处理函数里也兜底）→ toast `Minimum bet is 10 ore` / `Maximum bet is 500 ore`。
   - **ore 不足**：面板会出现红字 `Need ◆X ore, you have ◆Y.`，按钮禁用；强行触发也 toast 同义提示。
   - **正常下注**：文字 `Place bet · N ore`。点击后 → ore 扣除 N；该市场对应阵营的池 +N（**你的下注会真实改变赔率**）；新增一条持仓记录；toast `Bet placed · N ore on YES/NO — executed via relay, no gas`；AgentMind 记 `🎲 Owner bet N ore on YES/NO: "问题"`；弹窗关闭。

### 5.3 MY POSITIONS（我的持仓）标签
- **你会看到**：
  - **OPEN POSITIONS（未结算）**：无持仓时显示「No open bets yet…」。有持仓时每条显示问题、`backed YES/NO with ◆N ore`、`PAYOUT IF YES/NO WINS`（按当前池估算）、`CLOSES` 倒计时；底部有一行 demo 提示 + 两个按钮 `Resolve YES`、`Resolve NO`。
  - **SETTLED · RECEIPTS（已结算回执）**：无则显示「No settled bets yet…」。有则每条显示问题、下注方与金额、`RESOLVED YES/NO · WON/LOST` 标签、`PAYOUT ◆X (+利润 / −本金)`，以及一块 `⛓ on-chain fact that settled it`（显示结算规则 → 赢家方）。
- **你可以操作（完整「下注→开奖→看回执」闭环）**：
1. 先在 MARKETS 里下一注（见 5.2）。
2. 切到 `MY POSITIONS`，在该持仓底部 **点击 `Resolve YES`（或 `Resolve NO`）** —— 这是 **Demo 专用「跳过等待、立即开奖」**的按钮：
   - 市场被标记为已结算、记录赢家方。
   - 对你在该市场的每个未结算持仓做 **parimutuel 派彩结算**：赢的一方按「本金 + 你占赢家池的比例 × 可分配的输家池」拿钱（ORACLE 市场先从输家池抽 10% rake，SELF-RESOLVING 不抽）；**派彩入账时按 1000 ore 上限夹取，超出的被浪费**。
   - toast 序列：先 `Market resolved · YES/NO wins`；若有入账 `Payout +N ore credited`（若触顶再追加 ` (X wasted — at cap)`）；若你这边是输的一方则 `Your position lost — staked ore not returned`；AgentMind 记一条 `⛓ Market … resolved → YES/NO…`。
   - 该持仓从 OPEN 移到 SETTLED，生成一张回执卡。
3. 在 SETTLED 区**查看回执**：能看到本金、派彩、盈亏，以及链上结算规则。

> 说明：`Resolve YES/NO` 是 Demo 给你手动推进剧情用的；真实产品里市场到期由链上规则自动结算。

---

## 6. 界面五：Arena 竞技场（`#/arena`）

Arena 是 SAP 式异步自走棋，**全部用 G（青色高级余额）计价**，与世界内的 ore 完全分开。顶部副文：`SAP-style autobattler · priced in G (premium balance) · 5-slot bench · 12 units`。

### 6.0 观战 vs 登录的关键区别（务必理解）
Arena 有 5 个 Tab。**观战者（未创建 Agent）也能看其中两个**：
| Tab | 观战者（无 Agent） | 登录者（有 Agent） |
|-----|-------------------|-------------------|
| `OVERVIEW` | 显示「Spectating」CTA | 看收藏/ELO/战绩/挂单 |
| `SHOP` | 显示「Spectating」CTA | 可买卡 |
| `BENCH (n/5)` | 显示「Spectating」CTA | 可组阵/提交匹配 |
| `CARD MARKET` | **可看**（买卡按钮提示先建号） | 可买卡 |
| `BATTLE REPLAY` | **可看可播放** | 可播放并记录战绩 |
- **观战者默认落在 `BATTLE REPLAY`**（公开的对战回放钩子）；登录者默认落在 `OVERVIEW`。
- **观战横幅**：未登录时，页头右侧不显示战绩条，而是一个按钮 `👁 Spectating · spawn an agent to play`（点击去 `#/onboard`）。
- 三个账户型 Tab（Overview / Shop / Bench）对观战者显示 **`ArenaSpectatorCTA`** 面板：`👁 Spectating` + 「Create an agent to unlock {该功能}. Battle replays and the card market are open to everyone.」+ 按钮 `Spawn your agent`（去 `#/onboard`）。

### 你会看到（登录态页头）
- **战绩条**：`TIER`（按 G 分档：Bronze<100 / Silver 100–999 / Gold≥1000）、`W / L`（胜/负，按对战历史算）、`ELO`、`BALANCE`（G 余额）。
- **Deposit G 面板**（仅登录可见）：说明文字 + 三个充值按钮 `+ 20 G`、`+ 100 G`、`+ 1000 G`。
- **Tab 行**：`OVERVIEW`、`SHOP`、`BENCH (n/5)`、`CARD MARKET`、`BATTLE REPLAY`。

### 6.1 页头可操作项
1. **点击 `+ 20 G` / `+ 100 G` / `+ 1000 G`**（仅登录）→ G 余额增加对应数额；toast `Deposited N G — now {Bronze/Silver/Gold} tier`；档位与 TIER 颜色随之更新。（这是 Demo 里唯一被文案标注为「真实充值/自签名」的动作，其余皆由 operator 代付。）
2. **点击任意 Tab** → 切换下方内容区。

### 6.2 OVERVIEW 标签（登录）
- **你会看到**：
  - 左 `COLLECTION`：卡牌总数、`BENCHED n/5`、`TIER`；以及「Story / provenance cards」列表（变体非 Standard 的故事卡，如 Chronicler 卡，带 `🏅 成就标签` 和故事文案）。无则提示去 Card Market 买。
  - 中 `ELO`：当前 ELO + `K=32 · equal-ELO win ≈ +16 · last N matches`；一条 ELO 折线 sparkline（含数据点）；下方 low/high。
  - 右 `MATCH HISTORY`：倒序列出每场 `W/L · vs 对手 · ELO 变化 · +/-Δ · 时间`；下方 `MY LISTINGS`（我挂在卡市的卡），每条显示单位、浏览数 `N👁`、价格、`Cancel` 按钮。
- **你可以操作**：
1. **点击某条「我的挂单」的 `Cancel`** → 该挂单移除；toast `Listing cancelled — card returned to inventory`；该卡**退回库存（inventory）**（之后可在 Bench 标签里上场）。

### 6.3 SHOP 标签（登录）
- **你会看到**：顶部说明 `cards cost 3–6 G · roll 1 G`（bench 满时追加 `· bench full → buys go to inventory`）+ `⟳ Roll (1 G)` 按钮；下方 6 张商店卡（Sentinel/Wraith/Forgeling/Bulwark/Reaver/Mystic），每张含攻血、技能、价格，下面一个 `Buy · N G` 按钮。
- **你可以操作**：
1. **点击 `⟳ Roll (1 G)`**：
   - G<1 → toast `Need 1 G to roll`。
   - 否则 → G −1；toast `Rolled shop (-1 G) — same roster in this demo`。**注意：这是个「半空操作」——它只扣 1 G、并不真的换一批卡，商店阵容不变**（Demo 如实标注 same roster）。
2. **点击某张卡的 `Buy · N G`**：
   - G 不足 → 按钮置灰；强行触发 toast `Need N G — deposit more`。
   - 否则 → G −N；铸造该卡，**优先放进第一个空 bench 槽；bench 满则进库存**；toast `Bought 单位 (-N G)`（满时追加 ` → inventory (bench full)`）。

### 6.4 BENCH 标签（登录）
- **你会看到**：
  - `BENCH · n/5`：5 个槽位，已放卡的显示卡面 + 右上角红 `✕` 移除按钮；空槽显示 `empty slot N`。
  - `INVENTORY · n`：未上场的卡；每张下面有 `↑ Place on bench` 按钮（bench 满时变 `Bench full` 置灰）。无库存时显示说明面板。
  - 底部：`Submit to matchmaking` 按钮；已提交时旁边显示绿标签 `queued · {tier} pool · matches every 30m`；一行说明「移除退回库存，G 只能靠卖卡找回」。
- **你可以操作**：
1. **点击某张库存卡的 `↑ Place on bench`**：
   - bench 满（无空槽）→ toast `Bench is full — remove a card first`。
   - 否则 → 该卡从库存移出、填入第一个空槽；toast `Placed 单位 into slot N`。
2. **点击 bench 卡右上角红 `✕`** → 该卡下场退回库存；toast `Benched card 单位 → inventory (no G refund — sell on market to cash out)`（**下场不退 G**）。
3. **点击 `Submit to matchmaking`**：
   - bench 全空 → toast `Bench is empty — add at least one card`。
   - 否则 → 标记已提交、记录当前档位；toast `Submitted to matchmaking · {tier} tier`；旁边出现 `queued` 标签。

### 6.5 CARD MARKET 标签（观战者也可看）
- **你会看到**：说明 `player listings · G-priced · story cards carry on-chain provenance`；4 张玩家挂单卡（Wraith 5G / Bulwark 6G / 一张 Reaver「Chronicler #1」42G 故事卡 / 一张 Mystic「Phoenix #3」24G 故事卡）。故事卡有紫色边、`📜 provenance` 出处文案。每卡底部有买按钮。售罄时显示 `All listings sold.`。
- **你可以操作**：
1. **点击某卡的买按钮**：
   - **未登录**：按钮文字为 `Create agent to buy`，点击 → toast `Create an agent to buy cards`，不发生购买。
   - 登录且 G 不足 → 按钮置灰；强行触发 toast `Need N G`。
   - 登录且足额 → G −价格；该挂单从市场移除；铸造该卡（含变体/出处），**优先入 bench，满则入库存**；toast `Bought 单位(变体 版本) for N G`（满时追加 ` → inventory`）。

### 6.6 BATTLE REPLAY 标签（观战者也可看可播）
- **你会看到**（左右两栏）：
  - 左「REPLAY · 5v5」：三个按钮 `▶ Play`、`⏭ Skip`、`🔗 Share`；下方对战双方阵容（`YOUR SQUAD (A)` 取自你 bench 的卡，没有则用默认 4 张；`VORTEX (B)` 固定）；一行确定性回放说明。
  - 右「EVENT LOG」：10 步回合制战斗日志（开局→buff→伤害→召唤 Husk→技能连锁→你方获胜 ELO +16）。未播放到的步骤呈半透明，随播放逐条点亮。
- **你可以操作**：
1. **点击 `▶ Play`** → 从第 1 步开始，每约 1.1 秒推进一步，事件日志逐条点亮，直到最后一步 `🏆 …YOU WIN · ELO +16`。结束时：
   - **观战者（无 Agent）**：toast `Nice finish — create an agent to play your own matches`（不改任何数据）。
   - **登录者（有 Agent）**：本应记一场胜、ELO 增加、写入战绩并 toast `Match WON · ELO a → b (+16)`。
     > ⚠️ **已知 Bug / 死路**：这段代码引用了一个**未定义的常量 `C.ELO_WIN_DELTA`**（`C` 里只定义了 `ELO_K`/`ELO_START`，没有 `ELO_WIN_DELTA`）。因此登录者播放到底时，新 ELO = 旧 ELO + `undefined` = **NaN**，ELO 显示会变成 `NaN`，toast 也会显示 `+undefined`。**观战者播放不受影响**（走的是另一分支）。详见文末「已知问题」。
2. **点击 `⏭ Skip`** → 直接跳到最后一步（停止自动播放）。注意：Skip 只是把进度条拉到末步，**不会触发上面的结算/记录逻辑**（结算只在 `▶ Play` 自动播放到底时触发）。
3. **点击 `🔗 Share`** → toast `Replay link copied (mock) — share to recruit`（**纯 mock，没有真复制链接**）。

---

## 7. 货币速记（ore vs G）

- **ore（◆ 琥珀色）**：世界内资源。出生送 200，封顶 **1000**（超出即浪费，多处有 cap toast）。用于：建矿/兵工厂、突袭、**预测市场下注**。
- **G（⬡ 青色）**：高级余额，靠「Deposit G」充值。仅用于 **Arena**（买卡、Roll、卡市交易）。分档 Bronze/Silver/Gold。
- 两者**永不互转**，各管各的。

---

## 8. 已知问题 / 死路 / 让人意外的行为（如实记录）

1. **🐞 真实 Bug：Battle Replay 登录态播放到底会让 ELO 变 NaN**。代码引用未定义的 `C.ELO_WIN_DELTA`（`demo/index.html` 约 1903–1906 行）。登录用户点 `▶ Play` 播完，ELO 会显示 `NaN`、toast 显示 `+undefined`，且写入一条 ELO 异常的战绩。观战者不受影响。修复方法：在常量 `C` 中加入 `ELO_WIN_DELTA: 16`（与文案「+16」一致）。
2. **SHOP 的 `⟳ Roll (1 G)` 是「半空」操作**：扣 1 G 但**不换卡**，商店阵容始终不变（Demo 文案 same roster in this demo 已诚实标注）。
3. **`🔗 Share`（Battle Replay）不真复制链接**，只弹 mock toast。
4. **`⏭ Skip`（Battle Replay）不触发结算/战绩记录**，只有 `▶ Play` 自动播完才会记。
5. **落地页点市场卡 → 去市场列表页**，而非直接开下注弹窗（要在 `#/markets` 列表里再点一次卡才弹下注框）。
6. **`Resolve YES/NO` 是 Demo 专用的「立即开奖」捷径**，真实产品由链上规则到期自动结算。
7. **手动 Raid 失败时其实没真扣 ore**，文案说「arsenals + ore spent」但状态未改（纯演示输的剧情）。
8. **创建 Agent 后 Arena 直接是「满账户」**：G=240、ELO=1043、bench 已塞满、已有战绩与挂单——这是刻意 seed 的，不是你打出来的。
9. **网络指示 `GRAVITY · 7771625`、Mock 警示条、AGENTMIND 落地页 5 行示例**均为静态装饰，不可交互。
10. **刷新页面 = 全部重置**（无任何持久化）。

---

*本文档基于 `demo/index.html`（约 2004 行）真实代码核对编写；如代码更新，请同步本说明书。*
