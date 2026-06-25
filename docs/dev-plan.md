# Gravity Town v2 · 并行开发与执行计划（PM 视角）

> 配套工程稿: [`docs/game-design.md`](game-design.md)（合约/结构/不变量权威定义）· 玩家视角: [`docs/game-design-ux.md`](game-design-ux.md)。本文**不重写合约规格**，只把 §10 线性的 M0–M7 转成可并行的 lane / 依赖 / 节奏。**本文不引入 PR#76 的旧 World-as-Market/万物皆答题 范畴**——一律以 game-design.md 为准；任何来自 PR#76 的 scope 视为越界（见 §8 L-T 门禁扫描）。

---

## 0. TL;DR（30 秒版）

> ### ⚠️ GATE 0 阻塞器（当前未过）
> **M0 决策签字 0/12 完成 → 接口冻结尚不能合法启动 → 无法并行。**
> 必须逐项签字（§3 决策表，每项 ✓ + owner + 日期），**12/12 后才放行冻接口**。在此之前任何 lane 不得起步。

- **关键路径（顺序执行 ~12–13 周；并行后净 ~7.5–8.5 周到可玩 MVP）**：`M0 决策+签字(1.5w) → 接口冻结(1w) → [L-A 财库 ∥ L-C 世界 ∥ L-D RNG] → L-B MATH(随 L-A) → C1 冻结后 L-B STATE(顺序,1w) → L-E 行动汇流 → L-I 集成切换`。逐 lane 周数与 PERT 见 §10。
- **唯一并行总开关 = 接口冻结**；冻结的前置 = M0 的 12 项决策**全部在 `/docs/M0-DECISIONS.md` 里签字**（§3，每项 ✓ + owner + 日期）。
- **能最早 demo 的薄片 = MATH-only**（P1），不依赖 STATE / V2World checkpoint，先转起来。
- **承重护栏 = L-T**：接口冻结当天起常驻，`contracts/test/WorldInvariants.t.sol`（6 项 property test）+ CI 门禁所有 lane 合并，不变量红则不准 merge。
- **三个硬汇流点**：①STATE ⟂ V2World.checkpoint（M2→M3，**注意 L-B STATE 顺序等 L-C，非并行**）②L-E ⟂ AP+Hex+RNG+L-B STATE 结算逻辑（M3→M4）③L-I feature-flag 软切（M4→M5，**翻 flag 须 L-T 6/6 ∧ P2 gate ∧ M4.5 审计 ∧ 迁移快照校验全绿**）。
- **本文未决而需 owner 拍板的**：见 §3 决策表（尤其尚未签字的 **#1 World A/B**、**#5b reservedBackingG 边界**——须指定 owner + 期限）+ §12 OPEN 数值；签字前不得冻接口。
- **7 个必须先落地的执行工件**（详见 §1.工件清单）：`/docs/M0-DECISIONS.md`、`/contracts/src/interfaces/` 9 接口 + `HexGrid.sol` + `Mock*`、`/contracts/test/WorldInvariants.t.sol`、`/lane-PLAN.md`、`/docs/gates.md`、`/docs/§12-values.md`、Router V3→V4 扩展 + setter。无这 7 件，本文只是路线图、不是可执行部署规格。

---

## 1. 这份文档是什么 / 怎么读

工程稿 §10 把里程碑写成一条线性链（M0→M1→…→M7）。但其中很多模块**没有真实依赖**，只是被排成了一串。本文把它拆成**可并行的 lane**：先锁 M0 决策、冻结接口，然后多人/多 agent 各占一条 lane 同时开工，最后按垂直切片合龙到可玩 MVP。读者是项目 lead、工程师和并行 coding agent——你只需要知道**什么能并行、什么顺序、怎么推到能 demo**。合约字段细节一律回查 game-design.md，不在这里复述。

**阅读顺序建议**：§0 TL;DR → §2 一眼看懂图 → §3 M0 决策表（先签字）→ §5 lane 总表（认领 lane）→ §7 切片（看怎么合龙）。其余按需查。

**七个落地工件（本文之外、但本文强约束——无则 gate 是空壳）**：

| # | 工件路径 | 内容 | 谁建/何时 |
|---|---|---|---|
| 1 | `/docs/M0-DECISIONS.md` | §3 决策表 12 项逐行：列 `# / 决策 / owner / 签字✓ / 日期 / 解锁 lane`；README/ADR 登记为阻塞依赖 | lead，M0 开始即建 |
| 2 | `/contracts/src/interfaces/` + `/contracts/src/libraries/HexGrid.sol` + `Mock*` | 9 个 `I*.sol` + `HexGrid` library + 3 个确定性 Mock（§4 清单） | lead，冻结后 3 天内 |
| 3 | `/contracts/test/WorldInvariants.t.sol` | 6 项 property test 骨架（§8 不变量 #1–#6 映射）；CI `forge test --match-contract WorldInvariants` | L-T owner，冻结日 +1d |
| 4 | `/lane-PLAN.md`（或 CONTRIBUTING.md） | worktree 命名 regex、文件归属矩阵、合并次序、接口冻结/只读协议、Mock↔real 同步规约、feature-flag SOP、Router 维护 SOP（§9） | lead，冻结前 |
| 5 | `/docs/gates.md` | P1/P2/P3 DoD 可执行清单（§7） + M4.5 审计 gate；挂 GitHub milestones | lead，M1 前 |
| 6 | `/docs/§12-values.md` | OPEN 数值：列 `参数 / 影响 / 决定期限 / 占位(local-only) / owner / 日期`（§12）；CI linter 检测硬编码非默认值 | lead，M1 前 |
| 7 | `Router.sol` V3→V4 扩展 | 7–10 个 address 槽 + 公共 getter + `getAddressesV4()` + setter（§4 Router 段） | lead，随接口冻结 |

**CI gate 总览（必须机械化，非「文档纪律」）**：(a) `M0-DECISIONS.md` 12/12 未签 → block merge to main；(b) `forge test --match-contract WorldInvariants` 红 → block；(c) L-B STATE 代码引用 `IWorldCheckpoint` 而 C1 未打 `frozen` tag → reject；(d) PR#76 越界 grep（ore/arsenal/happiness/raid）命中 → block + 评论；(e) Mock 与 real 跑同一测试套件，返回类型不一致 → fail；(f) `feat/lane-F-*`/`feat/lane-O-*` 在 M5 集成 tag 前 push → auto-reject；(g) §12 硬编码非默认值 → warn。

---

## 2. 一眼看懂：怎么并行

核心解法一句话：**锁 M0 决策 → 冻结 struct/event/interface → N 条 lane 各自对着 ABI + mock 并行 → 垂直切片合龙跑通闭环。**

接口一旦冻结，每条 lane 都对着稳定的 ABI 和 mock/stub 编码，互不踩；这才是「真并行 + 合并安全」的前提，而不是嘴上并行、合并时炸。

**★ 解锁链（一行看懂关键路径，注意 STATE 是顺序非并行）**：
`M0 决策[12签字] →[MUST FREEZE,1w]→ 接口冻结 → (🔴L-A 财库 ⇒ 🔴L-B MATH) ∥ (🔴L-C V2World ⇒ C1冻结 ⇒ 🔴L-B STATE 顺序1w) ∥ (🟡L-D RNG) → 🔴L-E 行动[⟂AP+Hex+RNG+STATE结算] → 🔴L-I 集成[⟂真实切换,带4重门]`
🔴 = MVP 关键路径（卡它就卡 demo） · 🟡 = 支撑/旁挂（不卡关键路径）

```
                         ┌─────────────────────────────┐
                         │  M0 决策锁定 (阻塞所有人)     │   ← 不锁=不能冻接口=不能并行
                         │  §3 决策表 12 项须全签字      │   ← 现状 0/12 = GATE 0 未过
                         │  落 /docs/M0-DECISIONS.md     │   ← CI: 12/12 未签则 block main
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
                          │  ②⟂ AP.spend+Hex邻接+RNG真实     │
                          │     +L-B STATE 结算逻辑完成       │
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
| 🔴L-A 财库 | 仅 M0 #4/#5/#5b | L-B payout backing | ~2w |
| 🔴L-C V2World | 仅 M0 #1/#2/#6/#10 | C1→L-B STATE、L-E hex | ~2.5w |
| 🔴L-B MATH/STATE | L-A（payout）；**STATE 硬等 L-C C1** | L-E（AP+STATE 结算） | 1.5w+1w |
| 🔴L-E 行动 | L-C+L-B STATE+L-D real RNG **四齐** | L-I 真实切换 | ~2w |

**图例（合并为一处）**：`⟂` = 硬汇流/同步点（上游不齐则等）；🔴 关键路径；🟡 旁挂并行。三个 `⟂`：
- **① STATE ⟂ V2World.ckpt（M2→M3）**：L-C 先冻 `IWorldCheckpoint.sol`（C1）→ L-B STATE 分支才可测/合并。**L-B STATE 不与 L-A/L-C 并行，是 C1 之后顺序 1w。**
- **② L-E ⟂ AP.spend + Hex邻接 + RNG真实 + L-B STATE 结算逻辑完成（M3→M4）**。
- **③ L-I ⟂ 真实栈（M4→M5）**：翻 flag 须 4 重门全绿（见 §6 join③）。

> **依赖无环（DAG）已核**：合约调用图单向——`APLedger.creditFromMarket` **只**由 `PredictionMarketEngine` 调；`APLedger.spendForAction` **只**由 `V2World`/`APActionAdapter` 调（**Market 永不调 spend，V2World 永不调 credit**），故不存在回边。lane 依赖矩阵（§5）每列均无来自其下游的入边。

---

## 3. 第 0 步（阻塞所有人）：先锁 M0 决策 + 签字

> **M0 owner = [待指定：项目 lead / owner 姓名]，12 项须于 [待定截止日，建议接口冻结前 1.5w] 前全部决定。未签项阻塞接口冻结。**
> 在 README 登记：「M0 owner: [NAME]，决策截止 [DEADLINE]」，并给 M0 owner 设日历提醒。**当前签字进度：0/12。**

**未锁 = 无法冻接口 = 无法并行。** M0 不是调参，是承重边界（§10.M0）。下列每一项直接决定某条 lane 的 struct/接口长什么样，必须在接口冻结前由 **owner 逐项签字**（✓ + 姓名 + 日期）才放行。**签字栏留空 = 该 lane 不得起步。**

**gate 流程（强约束 + CI 机械化）**：(1) 本表逐行转录进 `/docs/M0-DECISIONS.md`，加 `owner`/`日期`/`✓`/`解锁 lane` 列；(2) 12 项各由 owner review 并签字；(3) tracker 在 README/ADR 中登记为**阻塞依赖**；(4) **CI job 校验 12 行全有 ✓+日期，否则 block merge to main**；(5) 关键：`#1 World A/B` 未签 → `feat/lane-C-world` 分支禁止创建；`#5b reservedBackingG` 未签 → L-A escrow 记账禁止 finalize。

| # | M0 决策 | 推荐/口径 | 解锁/卡住谁 | 签字 (owner/日期) |
|---|---|---|---|---|
| 1 | **World 方案 A/B**（**未决，须 owner 拍板；签字前禁建 `feat/lane-C-world`**） | **B = 新建 `V2World` 自持状态**（边界干净，邻接/RNG/defense 独立成型；A 需外部写旧 `GameEngine` 内部 mapping，存储/权限风险高，不推荐）。选 B → L-C 范围 = 完全自持 V2World、无外部 adapter 写 GameEngine；选 A → L-C = adapter hook 进旧 GameEngine（高风险，不推荐） | L-C 全部 / L-E adapter footprint / L-I 读取源；**L-B STATE 接口须等本项定** | ☐ ____ / ____ |
| 2 | **`V2World` 最小 schema** | `hexOwner/hexCount/agentHexKeys`、`hexDefense`(衰减/upkeep/capture清零)、spawn/respawn allocator、checkpoint event/mapping(含 `finalized`)、`v2Score` 公式 | L-C 起步；L-B 的 STATE 引用 | ☐ ____ / ____ |
| 3 | **STATE checkpoint 策略** | eventId 生成/唯一性、finalized 条件、**创建时必须不存在或未 finalized**、结算时必须存在且 finalized、时间序约束 `openAt<closeAt≤(snapshotTs OR eventFinalizableAfter)≤settleAfter≤settleDeadline`、超时 void+refund、**只能由 `V2World` 写** | L-B 的 STATE 结算分支、L-C checkpoint 写入 | ☐ ____ / ____ |
| 4 | **G backing 来源与顺序** | losing stakes → 预存补贴池 → 协议已拨入派彩池 surplus；每来源比例/释放条件（补贴释放须满足独立 owner eligibility）；**creditG 前必须有等额具名 backing** | L-A / L-B payout 路径 | ☐ ____ / ____ |
| 5 | **`creditG` 单一入口** | 正式奖励路径只认单一 `PredictionMarketEngine`/treasury wrapper（**禁止泛 `onlyOperator`**）；二级走独立 `SECONDARY_CARD_TRANSFER` 白名单 | L-A 权限改造、L-B 发奖 | ☐ ____ / ____ |
| 5b | **`reservedBackingG` 边界（二选一，必须明确写下选哪个；未决，须 owner 拍板；签字前 L-A escrow 不得 finalize）** | **推荐 (a) 简单**：`GTreasury` 加 `reservedBackingG`，`surplusG = balance − totalOutstandingG − reservedBackingG`；或 (b) 市场 G 走独立 wrapper 不进 GTreasury surplus 口径。**M0 须落决策记录 + 边界注释，不写代码，只定方向**；本项定前 L-A escrow/subsidy 记账方向**不得 finalize** | L-A 记账模型、L-B payout backing | ☐ ____ / ____ |
| 6 | **防御不变量** | `D_max`、`defenseHalfLife/upkeep`、`costToReachDefense`、`costToReachP50AttackAgainst`、`p_floor`（§6 公式锁死） | L-C defense、L-E 攻防数值 | ☐ ____ / ____ |
| 7 | **trivial vs 非 trivial AP eligibility（两侧都须锁口径）** | **trivial**：`trivial=true` + `fixedAP=fixedTrivialAP` + **无 G payout**，受多维 throttle（§12）。**非 trivial**：≥2 独立 owner、`minIndependentLoserStakeG`、creator/resolver/subject 排除、同 owner 净风险、单边/自对冲退款无 AP/G、**真实 `losingBurnG` 硬要求**、AP throttle 锚 `realBurnedGInMarket`（非 tax/refund） | L-B 结算 eligibility | ☐ ____ / ____ |
| 8 | **odds anti-snipe** | 早期窗口/TWAP 快照定义 `[openAt+warmup, closeAt−antiSnipeWindow]`，close 前锁定；close 瞬时 odds 不进 `uncertaintyWeight`/AP 公式 | L-B `uncertaintyWeight` | ☐ ____ / ____ |
| 9 | **RNG 选型** | VRF 或 commit-reveal 二选一 + 请求/揭示/超时/退款规则；**禁用裸 `block.prevrandao`** 做 AP-gated 胜负 | L-D / L-E（M4 硬依赖） | ☐ ____ / ____ |
| 10 | **HexGrid 邻接** | 落为 public/library 级 `HexGrid.areAdjacent`/`toKey`/`fromKey`/边界检查，不复用旧 location/cooldown 模型 | L-C / L-E | ☐ ____ / ____ |
| 11 | **QuestionRegistry 独立 or 内嵌** | 独立合约 vs `PredictionMarketEngine` 内部 enum/whitelist——**必须明确二选一**；若独立则进 Router setter | L-B scope / Router 扩展 | ☐ ____ / ____ |
| 12 | **ORACLE 定位 + M4.5 信任模型签字** | 三类盘第三类、最后上线(M7)，**deferred 非 cut**；信任模型（单签/多签/optimistic/attestation + 挑战窗 + 失败恢复）先登记；**M4.5 审计须含 1 页 ORACLE 信任模型决策 + 批准，L-O 待此签字方可实现** | L-O（不阻塞 MVP） | ☐ ____ / ____ |

> 数值（§12）可后置（`fixedTrivialAP`、各 cap、`taxBps/burnBps`、`minAttackAP` 等）——但**约束式与 struct 字段**必须现在锁，否则无法冻接口。数值跟踪见 §12 / `/docs/§12-values.md`。

---

## 4. 并行的总开关：接口冻结（contract-first）

M0 拍板后，第一件并行工作不是写实现，而是**冻结接口**。

**冻结 owner 与流程（不可省，否则「冻结」名存实亡）**：
- **接口冻结 owner = lead（唯一定稿人）**。`interface I*.sol`、`HexGrid.sol` 与 `Router` 只此一人可提交；这些路径写入 `CODEOWNERS`，PR 须 lead review。
- **流程**：M0 12/12 签字后，lead 在 **3 天内**于 `/contracts/src/interfaces/` 起草全部接口 + mock → 各 lane 48h 内 review → lead 批准/驳回改动 → **封板日（freeze-board date）= M0+1w，写进 PR/tag**。
- **封板后规则**：接口文件**只读**，任何 struct/签名改动须 lead + PM 双签经 review/approval；lane 开发期间不得擅改。

**冻结工件清单（freeze 后第一周内交付，不等 M1 实现）**——目录与文件须真实落地：

`/contracts/src/interfaces/`：
- `IPredictionMarketEngine.sol`
- `IQuestionRegistry.sol`（若 #11 选独立）
- `IMarketSettlementResolver.sol`
- `IAPLedger.sol`
- `IV2World.sol` + **`IWorldCheckpoint.sol`（checkpoint 读接口须最先冻结 = C1，见 §6 join①；进 CODEOWNERS，L-C/L-T 双 review）**
- `IProtocolTreasuryAccounting.sol`
- `IRNGProvider.sol`
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
        uint256 eventId;
        uint8   kind;          // battle / capture / respawn / window
        bytes32 hexKey;
        uint256 battleId;
        uint256 windowId;
        address beforeOwner;
        address afterOwner;
        address actorAgentId;
        uint256 blockNumber;
        uint256 timestamp;
        bool    finalized;
    }
    function getCheckpoint(uint256 eventId) external view returns (CheckpointData memory);
}
```
字段权威对齐 game-design §4/§8；**`beforeOwner/afterOwner/finalized` 为必含项**。L-C 若漏 `actorAgentId/battleId/windowId` → L-E 读不到 → 静默失败，故清单一次锁定、不得后补。本接口须同时落 `/contracts/test/interfaces/` 与 `MockV2World`。

**其余冻结对象字段口径**（字段权威在 game-design.md，这里只列冻结清单）：

- **Question / Market / Position**（§4）：`QuestionKind/Status`、`Question` struct（含 `templateId/params/snapshot*/settleDeadline/trivial/resolver`）、`Market`/`Position`、`outcomeStakeG`/`positions` mapping。**字段须标 `[MATH+STATE]` vs `[STATE-only]`**（如 `marketType:[MATH+STATE]`、`stateCheckpointEventId:[STATE-only]`），让 L-B 的 MATH stub 可省略 STATE 字段、后续合并不撞。**trivial 路径须含 `trivial:bool` + `fixedAP` 字段并强制「`trivial=true` ⇒ `fixedAP=fixedTrivialAP` ∧ 无 G payout」（不留 OPEN）。**
- **APLedger**（§5）：`apBalance`、`earnedInEpoch`、`ownerTrivialEarnedInEpoch`、`globalTrivialEarnedInEpoch`、`creditFromMarket(onlyMarket)`、`spendForAction(onlyAction)`。
- **V2World 动作 + checkpoint**（§6/§8）：`attackWithAP/reinforceHex/returnFromElimination` 签名、`hexDefense`、`checkpoints(eventId)`（schema 见上 `IWorldCheckpoint`）、`getScore/ScoreView`、battle/capture/respawn/window 事件。
- **HexGrid library**：`areAdjacent(q1,r1,q2,r2)`、`toKey/fromKey`、边界检查。
- **RNGProvider**：request/reveal/timeout 接口 + 退款语义。
- **Treasury 记账口径**：`reservedBackingG`/wrapper 二选一落地（§3#5b）、`TreasuryUse` 枚举、`netTreasuryTakeG(epoch)` 累加器签名、`creditG` 权限边界。**`netTreasuryTakeG` cap 强制为 L-A 必交项（非可选）**：累加器 + `checkNetTakeCapAndEnforce()`（cap 比较 + 超 cap 拒绝/强制 source-neutral 回流）+ 由 L-T property #5 测试。
- **Router 扩展（V3→V4，随冻结一并完成，不等 M4，仅加地址槽+setter，无需实现）**：当前 `Router.sol`（V3）只有 `gTreasury/cardLedger`，**缺下列全部**。须为 `PredictionMarketEngine/APLedger/V2World/ProtocolTreasuryAccounting/MarketSettlementResolver/RNGProvider/HexGrid`（+ 若 #11 独立则 `QuestionRegistry`；Post-MVP 预留 `CardMintEngine/SecondaryCardMarket/ActionCardBonusAdapter`）补 **address 槽 + public getter + setter + `getAddressesV4()`**。**向后兼容策略**：dual-read（按 feature-flag 走 V3 或 V4 getter）或冻结完成前强制 V4 迁移——二选一写进 `/lane-PLAN.md` Router 维护 SOP。**这步漏了 = M5 集成 feature-flag 翻转读到 V3 旧地址 → MCP 调错 APLedger/V2World/RNG → 生产静默 0-day。**

**Mock 与真实接口同套测试（防漂移，CI 强制）**：Mock 测试文件须**import 并跑与 real 合约同一测试套件**（非另写一套），用 `forge test --match-contract` 强制返回类型一致（mock 返 struct、real 返 tuple 这类漂移直接 fail）。`/lane-PLAN.md` 写明：「Mock ABI 须与 real bit-identical，不同步则 CI 失败」。L-C 改 World 接口时 lead 同步更新 mock。**每条 lane 对着 interface + mock 编码**，真实实现到位时无缝替换——这就是并行真正成立、合并不打架的机制。

**Mock→real 测试 harness 模式（M1 start 前定，写进 CONTRIBUTING.md）**：用参数化基类（如 `testWithMockAndReal` base / `@ParameterizedTest(sources={MockV2World, V2World})`）对同一断言注入 mock 与 real 两套实现；状态初始化差异显式处理（mock 给固定 10 hex；real 走 spawn allocator 初始化等量 hex）；标注哪些测试 both-run、哪些 real-only（如真实 RNG VRF 回调）。

---

## 5. 并行工作流 · Lanes

每条 lane = 一个人 / 一个 coding agent 能独占的 workstream。**每条 lane 一个 git worktree**，分支命名 `feat/lane-<X>-<name>`（如 `feat/lane-A-treasury`），对着只读的 `interface I*.sol` + mock 编码。Owner（主/备）须在 `/lane-PLAN.md` 填**真实人/agent 名**，非占位。MVP = M0–M5；Post-MVP = M6/M7。worktree/合并 SOP 见 §9。

🔴 = MVP 关键路径 · 🟡 = 旁挂/Post-MVP。

**(a) 快速扫描表（Lane | Owner | Est. | Deps）**：

| Lane | Owner（主/备） | Est. | Deps（谁卡它） |
|---|---|---|---|
| 🔴 L-A 财库安全层 | ☐ 主 / ☐ 备 | ~2w | M0 #4/#5/#5b（无合约依赖，可最先动） |
| 🔴 L-B 市场+结算+AP | ☐ 主 / ☐ 备 | MATH ~1.5w + STATE ~1w | M0 #3/#7/#8/#11；L-A（escrow/payout）；**STATE 硬等 L-C C1（join①）** |
| 🔴 L-C 世界+Hex | ☐ 主 / ☐ 备 | ~2.5w | M0 #1(B)/#2/#6/#10（独立；可选旧快照导入） |
| 🟡 L-D RNG Provider | ☐ 主 / ☐ 备 | mock ~1w + real ~1.5w | M0 #9（独立；M4 才被 L-E 接入） |
| 🔴 L-E AP-gated 行动层 | ☐ 主 / ☐ 备 | ~2w | **L-C hex + L-B STATE 结算 + L-D real RNG 四齐（join②）** |
| 🔴 L-I 集成面 | ☐ 主 / ☐ 备（stub→real，1–2 人） | stub 持续 + 切换 ~2w | Market/AP/V2World 部署可调用；翻 flag 须 4 重门（join③） |
| 🟡 L-T 测试/不变量护栏 | ☐ **专属 QA/security**（须填真实名，不借 dev lane） | 常驻 | Day 1（接口冻结即起） |
| 🟡 L-F 卡牌 [M6] | ☐ 主 / ☐ 备 | ~2–3w | **M5 集成 tag 后**；L-A `netTreasuryTakeG`/`cardTaxShareBps`；成就白名单（§12 OPEN） |
| 🟡 L-O ORACLE [M7] | ☐ 主 / ☐ 备 + ☐ security | ~2–3w | **M4.5 信任模型签字 + 独立评审后**；M6 之后 |

**(b) 交付物与说明（按 lane）**：

- **🔴 L-A 财库安全层** — 模块：`GTreasury` 权限收紧 + `ProtocolTreasuryAccounting`（`reservedBackingG`/wrapper、`TreasuryUse`、`netTreasuryTakeG` cap、burn/sink 口径）。交付：收紧的 `creditG`/`surplusG`、**`netTreasuryTakeG` 累加器 + `checkNetTakeCapAndEnforce()` 超 cap 拒绝/回流（必交，非可选，L-T #5 测）**、可查询 backing 边界 + 自带 escrow 不变量测试。并行安全：✅ 独立，可最先动。
- **🔴 L-B 市场+结算+AP经济** — 模块：`PredictionMarketEngine`、`QuestionRegistry`（若独立）、`MarketSettlementResolver`、`APLedger`、odds TWAP 快照。交付：**M1 = MATH 盘开/押/关/结算 + binary settlement + `trivial=true` 强制 + `fixedAP=fixedTrivialAP` + AP `creditFromMarket` + throttle 测试**；**STATE 分支 M3 交付**（M1 可先码 STATE 骨架但**不测不 merge**，gate 在 C1 封板 + M3）。并行安全：⚠️ MATH 段独立先跑；**STATE 段顺序等 L-C C1，非并行**。
- **🔴 L-C 世界+Hex** — 模块：`V2World`、`HexGrid` lib、spawn/respawn allocator、`hexDefense`、checkpoint 写入 + finalized gate、`v2Score`、（若继承旧世界）一次性快照导入 + 校验。交付：v2 hex 存储 + 邻接库 + 防御 + **checkpoint mapping（含 `IWorldCheckpoint` 全字段）** + score；**C1 = checkpoint event/mapping schema + `IWorldCheckpoint` 须最先交付并 M2 中旬冻结（见 §10 子里程碑 M2.a）**。并行安全：✅ 与 L-A/L-B 完全并行。
- **🟡 L-D RNG Provider** — 模块：`RNGProvider`（VRF 或 commit-reveal）+ timeout/退款。交付：**M2 末交可用 mock RNG**（给 seed 返确定 bool，部署 testnet，带完整 request/reveal/timeout/refund 签名）供 L-E/P1；**M4 起前交真实实现**。**criticality 澄清：mock 晚交 → 卡 P1（硬 deadline）；real 晚交 → 卡 P2/L-E（非 MVP-P1 关键路径）。** 并行安全：✅ 独立。
- **🔴 L-E AP-gated 行动层** — 模块：`V2World` 内部 hooks（方案 B）或 `APActionAdapter`（方案 A）：`attackWithAP/reinforceHex/returnFromElimination`、Tullock 结算、capture+checkpoint 写入。交付：三动作可调用 + 防御清零 + battle/capture/respawn checkpoint。并行安全：⚠️ 汇流点，**四上游（L-C hex + APLedger.spend + L-B STATE 结算逻辑 + L-D real RNG）就绪才整合**；mock RNG 期可先写非 RNG 路径骨架。
- **🔴 L-I 集成面** — 模块：`mcp-server/chain.ts`+`tools.ts`（换 ABI、退役 ore/build、加 market/AP/hex 工具）、`agent-runner/llm.ts`（prompt 重写：邻接攻击/AP-only/删 ore-arsenal-happiness）、`frontend/useGameEngine.ts`（读 V2World.getScore/Market/APLedger）。**L-I 还须在 M0+1w 起搭 stub 实现**（Market/AP/V2World 工具硬编码返回 + `useGameEngine` hook，带 `TODO §M5 real impl` 注释），让前端 M1–M4 对着 stub 并行迭代 UI。交付：三处经统一 feature-flag 翻到新闭环，无旧 ore/score 残留。并行安全：⚠️ stub 阶段并行；**真实切换 = 翻 flag，须 L-T 6/6 ∧ P2 gate ∧ M4.5 审计 ∧ 迁移快照校验全绿（join③）**。
- **🟡 L-T 测试/不变量护栏** — 模块：`contracts/test/WorldInvariants.t.sol`（6 项 property test）+ CI 门禁 + PR#76 越界扫描。交付：6 项 property test（接口冻结 day1 起 stub）+ merge gate + PR#76 grep + §12 linter；见 §8。并行安全：✅ 常驻贯穿全程。
- **🟡 L-F 卡牌 [M6]** — 模块：`CardMintEngine`（公库出资/白板自冻、`frozenG[cardId]`）、`SecondaryCardMarket`（tax/burn 分流）、`ActionCardBonusAdapter`。交付：两条铸造路径 + 二级守恒（`sellerCreditG+secondaryTaxG+secondaryBurnG==buyerSpendG`）+ 攻防 bonus hook（不消耗卡）。并行安全：✅ 独立但晚启；**CI: `feat/lane-F-*` 在 M5 集成 tag 前 push → auto-reject**。
- **🟡 L-O ORACLE [M7]** — 模块：ORACLE 信任模型文档 + resolver 接口 + challenge/attestation + 失败恢复。交付：`IMarketOracle` 实现 + 挑战流程。并行安全：✅ 最后；**待 M4.5 信任模型签字 + 独立安全评审；CI: `feat/lane-O-*` 在 M5 tag 前 push → auto-reject**。

---

## 6. 依赖图与关键路径

**关键路径（决定 MVP 何时能玩）**：
`M0 决策(1.5w) → 接口冻结(1w) → L-A 财库(M1) → L-B MATH(随 L-A) → L-C V2World ⇒ C1冻结 ⇒ L-B STATE(顺序1w) → L-E AP-gated 行动(M4) → L-I 集成(M5)`。**顺序执行约 12–13 周；并行后净关键路径 ~7.5–8.5 周**（含 L-C→L-B STATE 顺序段，逐 lane PERT 见 §10）。

三个硬汇流点（join），其余皆可并行。**每个 join 标注「谁等谁、何时齐」**：

1. **join① STATE 市场 ⟂ V2World checkpoint（M2 → M3 硬阻塞，且 L-B STATE 非并行）**
   STATE 盘结算分支必须读 `V2World.checkpoints(eventId)`。**严格次序**：(1) L-C **先**交付 `C1 = checkpoint event/mapping schema + IWorldCheckpoint 读接口`（**M2 中旬冻结 = 子里程碑 M2.a**）→ (2) lead 封板该接口 → (3) **只有此后** L-B 才能写并测 STATE 分支（顺序 ~1w，**不与 L-A/L-C 并行**）。**CI 门禁**：PR 触碰 STATE resolver 代码且 `IWorldCheckpoint.sol` 未打 `frozen` tag → reject（带提示信息）。**MATH 段不受此限，可先发（M1）。**

   **M1 scope 澄清（消歧）**：M1 **只交付 MATH-only**——L-B 的 STATE 分支允许 M1 内先码骨架但**不测、不 merge**，STATE 的测试与上线 **gate 在 M2.a checkpoint ABI 封板 + M3 完成**。即 game-design §9「V2World checkpoint 未完成则降级 MATH-only」是**默认兜底，非可选**。DoD：`L-B.MATH` 在 M1 完成；`L-B.STATE` 在 M3 完成。

2. **join② AP-gated 行动 ⟂ RNG + APLedger.spend + L-B STATE 结算逻辑（M3 → M4 硬阻塞）**
   `attackWithAP` 必须先 `APLedger.spendForAction` 再走 `RNGProvider` 结算；且行动产出的 capture/battle checkpoint 要喂回 STATE 市场，故 **L-E 的真正起跑线 = AP.spend ✓ + Hex邻接 ✓ + RNG真实 ✓ + L-B STATE 结算逻辑完成 ✓ 四齐**，不是 L-E 起步、也不只是 M2 MATH。**硬期限**：L-D **M2 末**交 mock RNG（确定性 seed，L-E 据此搭非 RNG 骨架 + 测试），**M4 起前**交真实 RNG（L-E 据此写 `resolveWithRNG`）。L-D 延期 = L-E 静默滑期，故 L-D 这两个交付期是硬 deadline。

3. **join③ 集成 ⟂ 真实栈（M4 → M5，翻 flag 须 4 重门全绿）**
   L-I 真实切换要 Market/AP/V2World 全部可调用。**软切换机制 = 统一 feature-flag**（见下「feature-flag 定义」）。**硬 gate：feature-flag 只能在 (L-T 6/6 不变量绿) ∧ (P2 gate 过 = STATE + 三动作 live + 真实 RNG 工作) ∧ (M4.5 审计 checkpoint 过) ∧ (数据迁移快照校验通过) 全部满足后翻转。** 否则 MCP 带 stub-era 假设调真实合约 → 生产静默 0-day。**MCP 可对 stub 先调**，让前端在 M1/M2 并行迭代 UI，不必干等。

**feature-flag 定义（L-I 三处同源，消除 stale-state；落 `/lane-PLAN.md`）**：
- **单一源**：一个 flag `GT_V2_ENABLED`，存于 [二选一：`.env.{network}` / 链上 SettingsRegistry]；`mcp-server` / `agent-runner` / `frontend` **三处启动时读同一源（不轮询）**，各自在用旧/新 ABI 前检查；CI 校验三处读同一 key。
- **Router 配合**：dual-read——flag=off 读 V3 getter，flag=on 读 `getAddressesV4()`（§4 Router 段）。
- **软切换 SOP**：(a) 部署新合约 + 填 Router V4 槽 → (b) 翻 flag → (c) 冒烟校验三服务都已翻 → (d) 1 个 epoch 无回归则下线旧 ABI 路径。
- **回滚**：翻回 flag 即回旧栈，不重部署合约；切后新建的 test market 须手工数据修复。
- **stub→real 数据语义**：question ledger / G 余额 / treasury 池**保留**；test agent / test market 切换时**重置**；切前快照校验（详见 §11）。

**可以 EARLY ship 的薄片**：**MATH-only 切片**——L-A + L-B(MATH 段) + L-C(hex+respawn) + L-D(mock 起) + L-E(attack) 就能跑通「押数学题 → 赢 AP → 攻击邻接 → 夺地」，**不需要 STATE**（§9 工程稿明确 MVP 可降级 MATH-only）。**MATH-only 是 V2World 滑期时的默认兜底路径，不是可选优化。** 这让闭环在 STATE 之前就先转起来、先 demo。

---

## 7. 分阶段推进 · 垂直切片（DoD 落 `/docs/gates.md`，挂 GitHub milestones）

每个阶段以一个**可 demo 的薄片**收尾（不是「某合约写完」，而是「这条线能点通」）。**每个 gate 给可执行 DoD 清单**：

- **P1 — MATH 闭环薄片**（M0+M1+M2+M4 的 MATH 子集）
  端到端：押 MATH 盘 → 赢 trivial AP → `attackWithAP` 打邻接 hex → 夺地，胜负只看占地。**MATH-only，STATE 关闭。**
  **P1 特性矩阵**：Market（MATH ✓ / STATE ✗ / ORACLE ✗）｜AP（仅 trivial 空投 `fixedAP=fixedTrivialAP`，eligibility 不校验）｜V2World（hex+owner 可读、`attackWithAP` 带 **mock RNG** ✓、capture 结算 trivial AP ✓、**含简化 respawn：0 AP 回中立 hex、无 RNG**，避免「无 respawn 则被淘汰者出不来」的鸡生蛋）｜Defense（dummy、无 upkeep）。
  **P1 的 RNG = mock + 确定性 seed（可重复攻击）**：L-D 须在 **P1 start（M2 末，§6 join②）前交 mock RNG**；**真实 RNG 是 P2/M4 的 blocker，不是 P1 gate**——故关键路径上的「M4 真实 RNG」不被 P1 提前。
  **P1 gate DoD（可勾选）**：(1) 创 10 个 agent；(2) 各能向 MATH 盘押 20G；(3) 盘结算并发 `fixedTrivialAP`；(4) agent 能 `attackWithAP`（mock RNG）打邻接 hex；(5) capture 成功；(6) 新 owner 进 checkpoint log；(7) L-T 6 项不变量中 4 项核心绿。
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

**PR#76 越界扫描门禁**：L-T CI 扫描 PR 分支，对 `GameEngine` 参考段以外出现的 `ore` / `arsenal` / `happiness` / `raid` / 旧 UM model 模式 grep 命中即**自动评论「检测到 PR#76/v1 范畴混入 lane——只能作 v1 reference，不可作 v2 impl」并 block**。

**§12 OPEN 数值 linter**：每个 §12 open param 在合约 stub 内须带 `/// TODO §12(x): set via owner governance, not hard-code` 注释；CI linter 对硬编码非默认值告警；`/docs/§12-values.md` 跟踪表挂 owner/期限（见 §12）。

覆盖 §3 承重不变量（每项一组 property test，CI 断言示例）：

1. **赌池排除 surplus**：任一时刻 `协议可提 ≤ native 余额 − 全部未结算市场 G 负债 − reservedBackingG − frozenG`；owner/治理无法把 escrow/补贴当 surplus 提走。`assert(withdrawableSurplus <= balance - totalOutstandingG - reservedBackingG - frozenG)`。
2. **creditG 等额 backing**：每次 `creditG` 前都能指出已扣减/锁定的等额具名来源；无 backing 的 payout 被拒；`creditG` 仅单一 `PredictionMarketEngine`/wrapper 可调（泛 operator 被拒）。
3. **AP 只能赢来**：AP 仅经 `creditFromMarket` 增发；不可买、不可泛 operator mint、不可与 G 自由兑换；`spendForAction` 仅 `V2World`/`APActionAdapter` 可调。
4. **防御不变量**：`0 ≤ effectiveDefense ≤ D_max`、半衰期/upkeep、`P(success|maxAttackAP, D_max) ≥ p_floor`、capture 后清零。
5. **净抽水 cap**：`assert(netTreasuryTakeG[epoch] <= treasuryTakeCapBps × grossPlayerPaidG)`，超 cap 拒绝或强制 source-neutral 回流；burn 永不回流。
6. **trivial throttle / 非 trivial eligibility**：单边/自对冲盘只退款不发 AP/G；`trivial=true ⇒ fixedAP=fixedTrivialAP ∧ 无 G payout`；trivial 多维 cap（agent/owner/epoch/global）；AP throttle 锚 `realBurnedGInMarket`（非 tax/refund）。

数值未定（§12）不挡：测试写成参数化断言，对约束式而非具体常数。

---

## 9. 分工 · worktree · 合并（落地为 `/lane-PLAN.md` / CONTRIBUTING.md）

本节内容须落入项目根 **`/lane-PLAN.md`（或 CONTRIBUTING.md）**，作为并行隔离单一事实源（SOP）。内容须含：(1) worktree 命名 regex；(2) 文件归属矩阵；(3) 合并次序；(4) 接口冻结/只读协议；(5) Mock↔real 同步规约；(6) feature-flag SOP；(7) Router V3→V4 维护 SOP。

- **lead（接口 owner）**：拍 M0、主笔接口冻结、维护 Router setter（V3→V4 dual-read 策略）、守 join 点。接口冻结**只此一人定稿**。`/contracts/src/interfaces/`、`HexGrid.sol`、`Router.sol` 写入 `CODEOWNERS`。
- **每条 lane 一主一备，须填真实人/agent 名**（§5 已留签字位，禁占位）：L-A 财库、L-C V2World、L-D RNG 三条**接口冻结后即可同时开工**；L-B MATH 随 L-A，**L-B STATE 顺序等 C1**；L-E 由 L-C 或 L-B 的 owner 在四上游就绪后接手汇流；L-I 由前端/集成同学在 stub 上提前起步；L-T 由一名专属 QA/security 同学常驻。
- **worktree-per-lane 命名规约（regex `feat/lane-[A-Z]-[a-z-]+`）**：`feat/lane-A-treasury`、`feat/lane-B-market`、`feat/lane-C-world`、`feat/lane-D-rng`、`feat/lane-E-action`、`feat/lane-I-integration`、`feat/lane-T-invariants`、`feat/lane-F-cards`、`feat/lane-O-oracle`。对着冻结的 `interface I*.sol` + mock 编码，互不踩文件。
- **文件归属矩阵（哪条 lane 碰哪些路径，详表入 `/lane-PLAN.md`）**：L-A→`ProtocolTreasuryAccounting/GTreasury`；L-B→`PredictionMarketEngine/QuestionRegistry/MarketSettlementResolver/APLedger`；L-C→`V2World/HexGrid`；L-D→`RNGProvider`；L-E→`APActionAdapter`/V2World action hooks；L-I→`mcp-server/agent-runner/frontend`；L-T→`contracts/test/`。`interfaces/`+`Router.sol` 仅 lead。
- **接口只读约束**：`/contracts/src/interfaces/I*.sol`、`/contracts/src/libraries/HexGrid.sol`、`Router.sol` **仅 lead 可改**（封板后经 lead+PM 双签 review）；任何 lane PR 触碰这些文件即被 L-T gate + CODEOWNERS 拦下。
- **合并次序 SOP**：`L-A → L-B(MATH，依赖 A payout) → L-C/L-D(并行) → C1 封板 → L-B(STATE) → L-E(依赖四者) → L-I(最后)`；L-T 全程旁挂、门禁每次合并；L-F/L-O 在 M5 tag 后。合并冲突面≈接口文件，故只读约束把冲突压到最小。
- **contract-first 防冲突**：lane 之间只通过 interface 交互，禁止跨 lane 直接引用对方内部状态（尤其禁止外部改 `GameEngine`/`V2World` 内部 mapping，§8 权限边界）。
- **最小并行起步阵型（约 4–5 人）**：L-A、L-C、L-D 立即并行 → L-B MATH 接 L-A → C1 后 L-B STATE → L-E 汇流 → L-I 收尾；L-T 全程旁挂。

---

## 10. 推进节奏与闸门

PM cadence——**先锁什么、何时开闸**：

`M0 决策锁定+签字（/docs/M0-DECISIONS.md 12/12）` → `接口冻结（开并行总闸，封板 M0+1w）` → `lane swarm（L-A/L-C/L-D 同步开工，L-B MATH 随 L-A）` → **M2.a 子里程碑：L-C 交付 C1（`IWorldCheckpoint` 封板）→ L-B STATE 解锁** → **P1 切片 gate（MATH 闭环 demo，RNG=mock + L-T 4/6 绿，DoD §7）** → `join①②：L-B STATE + L-E 汇流 + L-D 真实 RNG` → **P2 切片 gate（STATE + 三动作 + 真实 RNG，L-T 6/6）** → **M4.5 审计 checkpoint（部署前安全评审，含 ORACLE 信任模型 1 页签字；gate：signoff 后才批 M5 merge）** → `M5 集成 checkpoint（feature-flag 4 重门全绿后三处同切，无旧 score 残留）` → **P3 demo gate（AI 跑通闭环 + 可回滚）** → **M5.5 testnet 部署 + keeper 接入 + 性能调优（~2w）→ M5.7 mainnet 部署** → `Post-MVP：L-F → L-O`。

每个 gate 必过 L-T 不变量；每次 join 前做一次集成冒烟。

**逐 lane 估时与关键路径（PERT 粗算）**：

| Lane | 估时 | 窗口 | 备注 |
|---|---|---|---|
| M0 决策+签字 | 1.5w | M0 | GATE 0，阻塞全员 |
| 接口冻结 | 1w | M0+1w | lead 3 天内交 I*.sol + mock + Router V4 |
| L-A 财库 | ~2w | M1 | 最先动，关键路径头节点 |
| L-C V2World | ~2.5w | M2 | **STATE 的硬 blocker**，C1=M2.a 中旬冻 |
| L-B MATH | ~1.5w | M1 | 随 L-A（与 L-C 并行） |
| L-B STATE | ~1w | M3 | **顺序：C1 封板后才起，非并行** |
| L-D mock RNG | ~1w | M2 末 | 硬 deadline（供 P1） |
| L-D real RNG | ~1.5w | M3–M4 | 硬 deadline（供 P2/L-E，非 P1 关键路径） |
| L-E 行动 | ~2w | M4 | 四上游齐才整合 |
| L-I 集成 | ~2w | M5 | feature-flag 软切（4 重门） |
| M4.5 审计 | ~1w lead-time | M4→M5 间 | gate：signoff 后才批 M5 merge |
| M5.5 部署/调优 | ~2w | P3 后 | testnet→mainnet，非 lane 并行但卡发布 |

- **顺序执行关键路径** ≈ M0(1.5w)+冻结(1w)+L-A(2w)+L-C(2.5w)+L-B MATH(1.5w)+L-B STATE(1w)+L-D real(1.5w)+L-E(2w)+L-I(2w) ≈ **12–13 周**。
- **并行后净关键路径**（修正：含 L-C→C1→L-B STATE 顺序段）≈ M0(1.5w) + 冻结(1w) + max(L-A 2w, L-C 2.5w) + L-B STATE(1w，C1 后顺序) + max(L-B STATE, L-D real ≈ 1.5w 并行) + L-E(2w) + L-I(2w) ≈ **7.5–8.5 周**（旧稿「6–7 周」未计 L-C→L-B STATE 顺序，已修正）。部署期（M5.5–5.7，~2w）另计，不在可玩 MVP 净路径内但卡正式发布。

**Lane ↔ M0–M7 映射**（`●`=主力实现 ｜`◐`=支撑/join/stub ｜`—`=空闲）：

| Lane | M0 | M1 | M2 | M2.a | M3 | M4 | M4.5 | M5 | M6 | M7 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 🔴L-A 财库 | 锁 #4/#5/#5b | ● | — | — | — | — | ◐audit | — | ◐(cap供M6) | — | 最先动，~2w |
| 🔴L-B 市场+AP | 锁 #3/#7/#8/#11 | ●MATH | ◐等C1 | ◐STATE解锁 | ●STATE+AP | — | ◐audit | ◐ | — | — | MATH 先发；**STATE 顺序等 C1** |
| 🔴L-C V2World | 锁 #1/#2/#6/#10 | — | ● | ●C1冻 | — | — | ◐audit | — | — | — | C1 须 M2.a 中旬冻 |
| 🟡L-D RNG | 锁 #9 | (可实现) | ◐mock交付 | — | — | ●真实接入 | — | — | — | — | mock@M2末 / real@M4 硬期限 |
| 🔴L-E 行动 | — | — | ◐mock骨架 | — | — | ●实现 | ◐audit | — | — | — | join② 四齐才整合 |
| 🔴L-I 集成 | — | ◐stub | ◐stub | — | — | ◐建flag | — | ●flag切换 | — | — | feature-flag 软切（4 重门） |
| 🟡L-T 测试 | (起) | ● | ● | ●守join① | ● | ● | ● | ● | ● | ● | 常驻门禁 + PR#76 扫描 |
| 🟡L-F 卡牌 | — | (接口可早启) | — | — | — | — | — | — | ●Post | — | 实现待 M5 tag 后；deps L-A `netTreasuryTakeG` |
| 🟡L-O ORACLE | (deferred登记) | — | — | — | — | — | ◐信任模型签字 | — | — | ●Post | 需独立评审；M6 后 |

---

## 11. 风险与未决

| 风险 | 影响 | 缓解 |
|---|---|---|
| **M0 未签字（现 0/12）= 接口冻不了 = 并行不成立** | 全员卡死，退化成串行；GATE 0 不过 | M0 当唯一前置硬阻塞，§3 表 12 项逐项 owner 签字转录进 `/docs/M0-DECISIONS.md`，**CI 校验 12/12 否则 block main**；指定 M0 owner + 截止日 |
| **#1 World A/B 未决（无 owner/无期限）** | L-C 范围、L-E adapter footprint、L-I 读取源全悬空；L-B STATE 接口锁不了 | 指定 owner + 期限；二选一记 tracker #1+日期；**未签则禁建 `feat/lane-C-world`**；推荐 B |
| **#5b reservedBackingG 边界未决（无 owner/无期限）** | L-A escrow/subsidy 记账方向、L-B payout backing 锁不了 | 指定 owner + 期限；选 (a) GTreasury 加 `reservedBackingG` / (b) wrapper，记 tracker #5b+日期；**未签则 L-A escrow 不得 finalize**；推荐 (a) |
| **Router V3 缺 7–10 槽 + net-new 合约全 0 实现** | Router(V3) 只有 gTreasury/cardLedger；lane day-1 找不到 `IAPLedger` 从哪 import；M5 flag 翻转读 V3 旧址 → 调错合约 0-day | 冻结期 lead 头 3 天交 `/contracts/src/interfaces/I*.sol`+`HexGrid.sol`+`Mock*`+**Router V3→V4 扩展(槽+setter+getAddressesV4，dual-read 策略)**，不等 M1 实现（§4） |
| **L-B STATE 误标并行（旧稿）** | 净周期被低估 1–2 周；STATE owner 不知 C1 何时好 | §6 join① + §10 PERT 已修正为顺序：C1(M2.a)→L-B STATE(1w)；净路径改 7.5–8.5w；M2.a 子里程碑显式登记 |
| **L-E 起跑线漏列 L-B STATE** | L-E 以为 M2 即可起，实际须 STATE 结算逻辑齐 | §5/§6 join② 已补：L-E ⟂ AP.spend+Hex+RNG真实+**L-B STATE 结算完成**四齐 |
| **RNG provider 可用性**（M4 硬依赖） | VRF 不可用或 commit-reveal 超时规则没定，L-E 无法实现攻防 | M0 二选一并定 timeout/退款；L-D **M2 末交 mock、M4 起交真实**（硬 deadline，§6 join②）；**mock 晚→卡 P1；real 晚→卡 P2，非 P1 关键路径** |
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
| **stub→real 切换数据语义** | 切换时哪些状态保留/重置不明，易丢账本或重置 G | 明确：question ledger / G 余额 / treasury 池**保留**；test agent / test market 切换时**重置**；切前快照校验 |
| **keeper 存活/超时** | 题到期但 keeper 离线则市场卡死 | 定 keeper SLA/监控；兜底 = 超时 `settleDeadline` 到 → 自动 void+refund（不依赖 keeper 在线）；测 keeper 失效路径 |

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
