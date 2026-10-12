# Filtering Spec — Any / Explicit Subset 模型（P0 凍結版）

> 狀態：**P0 CONTRACT FROZEN（2026-10-13）／ 實作待授權（Implementation Authorization pending）**。
> 本文件是依原始 Owner Decisions（OD-1 ～ OD-7）與 **Spec Freeze Round（FD-1 ～ FD-6）**（見下方「Spec Freeze Record」）
> 凍結的 P0 語義與 UX 契約。Owner 已 review 並**批准 P0 Spec Freeze**；本輪僅為 **Spec Revision**，
> **尚未授權 Production Implementation**——實作須俟 Implementation Authorization 另行啟動。
> 本輪未修改任何 production code、未實作 filter、未 commit、未 push、未開 PR。
> 範圍對象：`assets/app.js` 的 `buildCompareControls`（現行 app.js:182-303）、`assets/style.css` 的
> compare-controls 區塊（style.css:126-179）、`index.html` 的 script 載入方式。

---

## Spec Freeze Record（2026-10-13）

Owner 於 2026-10-13 完成 review：**批准 P0 Spec Freeze**，核准既有核心設計，並下達 6 項 Freeze-round 決議
（下稱 **FD-1 ～ FD-6**，與原始 OD-1 ～ OD-7 **並存、不取代**）。本輪僅允許 **Spec Revision**，**不授權 Production Implementation**。

### FD-1 ～ FD-6 → 落點

| FD | 決議（Freeze Round，2026-10-13） | 相對原 Spec 的效果 | 落點 |
|----|------|------|------|
| **FD-1** | **P0 State Machine 批准**：`Any \| Subset(非空)`；保留 multi-select、facet 內 OR／facet 間 AND、`Any→{A}→{A,B}→{B}→Any`、Reset→全 Any、跨維度衝突→合法 0 results。**正式批准三項行為反轉**：① 首次點 chip = 加入（非排除）② 移除「全不選」③ 預設 chip 不再全顯示 ✓ | 確認既有設計，無反轉 | §2、§3.1、§5.1 |
| **FD-2** | **Only = 已隔離時 NO-OP（idempotent）**：目前為 `{A}` 時再 `Only(A)` 不改任何 state；唯有 normal toggle 能藉取消最後一項返回 `Any`；**Only 不得兼具 toggle 語義** | 確認並強化 §2.2(b) | §2.2(b) |
| **FD-3** | **OD-4 選 (A) 方向**（schema／metadata-driven，**不採** frontend curated map）；**但不批准「每個 submission 加 optional family」為最終架構**。P1 優先評估 **canonical model-family registry** 為單一分類來源（評估準則見 §4.2）。屬 **P1 decision direction，非 P0 requirement，且不阻擋 P0** | **下修**原 §4.2「建議採 (A) per-submission 欄位」→ 方向確定、架構待定 | §4（改寫）、§9 |
| **FD-4** | **Explicit All ≠ Any 契約**：即使 `Subset` 含目前所有已知值，也**不得**自動轉 `Any`；`Any` = 未來新增值亦不受限、`Subset` = 明確選取的**現有** identity 集合、新增值**不得被靜默加入**；新資料若不在任何現有 Explicit Subset，**不得自行擴大**使用者選擇 | 將 §2.3 既有註記**升格為明文契約**並補前瞻語義 | §2.4（新增）、I8 |
| **FD-5** | **Exclusion Workflow 退化** 列為**已知且接受**的 P0 Trade-off；本輪**不新增** Exclude Operator 或負向 filter state | 記入 Accepted Trade-offs | §9 Trade-off #1 |
| **FD-6** | **測試方案批准**（§7 七項 ＋ PR #24 四不變量 ＋ 輕量 DOM smoke）；**另加一項**：驗證「新增 facet value 後 Explicit All 與 Any 的語義差異」 | 既有 §7 ＋ 新增測試項 | §7.1（第 8 項） |

### P0 Frozen Contract — 凍結清單（實作不得偏離）

以下為本次凍結、下一輪實作必須逐項符合的契約：

1. **狀態模型**：每 facet `S(f) ∈ { Any } ∪ { Subset(V) : V⊆Values(f), V≠∅ }`；初始**全 Any**（§2.1）。
2. **Normal toggle** 四個 transition（§2.2a）＋ 取消最後一項折疊回 `Any`（I1）。
3. **三項行為反轉**（FD-1）：首次點擊 = 加入、無「全不選」、預設零 ✓。
4. **Only**：設單值、**不動他 facet**、**已隔離時 NO-OP**、**非 toggle**（§2.2b、FD-2、I6）。
5. **Reset**：全部回 `Any`；控制列以單一 Reset 取代全選／全不選（§2.2c、§5.4）。
6. **可見性**：facet 內 OR／facet 間 AND（§3.1）；跨維度衝突 **0 results 合法**、不回滾、不刪 selection（I3）。
7. **Explicit All ≠ Any** 契約（§2.4、FD-4、I8）。
8. **Chip 視覺**：selected = ✓ ＋ 填色（`aria-pressed=true`）、其餘中性無符號；**去除 ✕**（§5.1、I2）。
9. **PR #24 四個不變量**全程保護（§6）。
10. **filter 只切換 `hidden`**，不重排／重建／重載（I5）。
11. **§7.1 純邏輯測試（八項）** ＋ CI `node --test`（FD-6）。
12. **Only／Toggle 的 DOM 結構契約**（Editorial Clarification）：chip 主體 toggle 與尾段 Only 為 **sibling `<button>`**、
    共用**非互動式 wrapper**；**禁止 nested `<button>` 或任何 nested interactive control**；
    保留「主體＝normal toggle／尾段＝獨立 Only」語義分離；Only 具明確 accessible name「只看 {值}」；
    keyboard／touch／screen reader 均須可操作（§5.3）。

### 本輪不凍結／仍待決（**均不阻擋 P0**）

- **P1 — Model Family bulk-select 的資料架構**（§4、FD-3）：方向已定（metadata-driven，否決 frontend map），
  但 **canonical registry vs per-submission 欄位**尚待 Owner 拍板；**不綁進 P0 PR**。
- **P1 — 候選 count**（§3.2、§5.2）、**Active Filter Summary**（§5.4）。
- **Deferred**（§9）：hierarchical tri-state family UI、URL／localStorage persistence、saved presets、
  大型前端測試基建、跨維度「只看此配置」、動態 Family Token Semantics。
- **Production Implementation 尚未授權**：本 Spec 凍結後，實作需另行 **Implementation Authorization** 方可開始。

---

## 0. 背景與核心缺陷（為何要改）

現行 filter 狀態（app.js:234-303）：

- `selected`：`Map<facetKey, Set<原始值>>`，**初始塞入該 facet 的全部值**（app.js:251）。
- 可見性判斷 `subVisible`（app.js:237-238）：`FILTER_FACETS.every(f => selected.get(f.key).has(facetValue(sub,f.key)))`
  —— facet 內 OR（Set 成員）、facet 間 AND（`every`）。
- chip 初始 `aria-pressed="true"`（app.js:263）；點擊 `next = !set.has(value)`（app.js:266-267）。
- CSS：`.chip::before{content:'✓'}`（style.css:164）預設**每顆都顯示 ✓**；`[aria-pressed="false"]` 顯示
  **✕ + 虛線框 + muted**（style.css:165-166）。

**核心缺陷**（Owner 已認同）：`selected = 全部值` 與「不限制」被折疊成同一個狀態。因此：

1. 預設（未篩選）畫面上**所有 chip 都是 ✓**，暗示「我選了全部」，而非中性的「未施加限制」。
2. 在這個「全選」預設下點一顆 chip，`next = !has(value)` 會把它**移除**，產生「全選時點一個 = 排除該選項」
   的互動語義——OD-1 明令廢止，不得沿用。
3. 「全不選」（app.js:292-294 的 `setAll(false)`）會產生**空集合 = 全部隱藏**，是一個合法可達但無意義的死狀態。

本修訂把每個 facet 的狀態明確拆成 **`Any`（不限制）** 與 **`Explicit Subset`（明確子集）** 兩態，根除上述混淆。

---

## 1. Owner Decisions → 實現對照

| OD | 決議 | 本 Spec 的落點 |
|----|------|----------------|
| OD-1 | `Any \| Explicit Subset` 核心模型；中性預設、✓ 表選取、去除 ✕；保留 facet 內 OR / facet 間 AND；不破壞 multi-select；採納指定的四個 transition | §2 狀態機、§3 可見性、§5 UI |
| OD-2 | 不支援 Explicit Empty；取消最後一項回到 Any；跨維度衝突導致的 0 results 合法；Reset = 全部回 Any | §2（I1、Reset）、§3（零結果） |
| OD-3 | Quick Isolation（Only）獨立於 multi-select；normal click = toggle；Only = 設為單值且**不動其他 facet**；Desktop/keyboard/touch 皆可發現可操作；禁 hover-only / modifier-only；compact affordance；跨維度重設另立命名 | §2（Only、Reset 區分）、§5.3 affordance |
| OD-4 | Model Family 先採**輕量 bulk-selection**；不做 tri-state；先驗證既有 metadata 可靠度；保留跨 family multi-select；不靠 display-name substring；區分 Tool-Grok 與 Grok family；展開為當前 model IDs 快照、新模型不自動入既有 subset | §4（含資料可靠度結論） |
| OD-5 | Persistence 本輪 out of scope，但狀態設計不得排除未來 | §2 狀態可序列化、§9 未來 |
| OD-6 | Faceted counts 語義精確：來自真實 records、依**其他維度** active constraints 計算；候選 count ≠ 點後總數；0-count 不得刪既有 selection；results summary 永遠等於實際可見卡片數 | §3.2 counts |
| OD-7 | 最小可持續測試方案（七項）＋ 保護 PR #24 四個不變量 | §7 測試、§6 不變量清單 |

---

## 2. 狀態機 / Interaction Contract

### 2.1 狀態定義

每個 facet `f`（現 `FILTER_FACETS` = 工具 `client`、模型 `model`、推理強度 `effort`，app.js:124-128）持有狀態：

```
S(f) ∈ { Any }  ∪  { Subset(V) : V ⊆ Values(f), V ≠ ∅ }
```

- **`Any`**：不限制。該 facet 不參與過濾（視為永遠通過）。
- **`Subset(V)`**：明確選取的非空原始值集合。
- `Values(f)`：目前 task 中該 facet 出現過的 distinct 原始值（含缺值 sentinel `'—'`，`facetValue` 產生，app.js:134-136），
  計算方式與現行 app.js:246 相同、**只算一次**。

全域 filter 狀態 `F = { S(f) : f ∈ FACETS }`。初始：**所有 facet = `Any`**（取代現行 app.js:251 的「全選」）。

> **可序列化（為 OD-5 預留）**：`F` 可無損序列化為
> `{ client:'any' | ['codex',...], model:'any' | [...], effort:'any' | [...] }`。
> 本輪不接 URL / localStorage，但狀態形狀已足以未來直接做 URL state，不需再改模型。

### 2.2 動作與 transition

**（a）Normal toggle** — 點擊 facet `f` 中值 `v` 的 chip 主體：

| 目前 S(f) | 條件 | 下一個 S(f) |
|-----------|------|-------------|
| `Any` | — | `Subset({v})` |
| `Subset(V)` | `v ∉ V` | `Subset(V ∪ {v})` |
| `Subset(V)` | `v ∈ V` 且 `|V| > 1` | `Subset(V \ {v})` |
| `Subset(V)` | `v ∈ V` 且 `|V| = 1` | `Any` |

對照 OD-1 的四個案例（完全一致）：
`Any —點A→ {A} —點B→ {A,B} —點A→ {B} —點B→ Any`。

> **這是有意識的互動語義變更**：從 `Any` 起手，第一次點擊是**加入（select）**，不是排除。
> 不得保留「全選時點一個 = 排除」。中性預設（§5.1，無任何 ✓）本身就是這個 add 語義最強的視覺提示。

**（b）Only(v)** — Quick Isolation（OD-3），對 facet `f`：

```
S(f) := Subset({v})      // 不論先前狀態，直接設為單值
∀ g ≠ f : S(g) 不變       // 絕不默默清除其他 facet
```

Only **不是 toggle**（FD-2）：對已是 `Subset({v})` 的 facet 再 `Only(v)` 為 **NO-OP / idempotent**
（維持 `{v}`，不改任何 state）。**唯有** normal toggle 能藉取消最後一項返回 `Any`（§2.2a 末列）；
`Only` **不得**兼具 toggle 語義、**不得**被用來回到 `Any`。回到 `Any` 只走 normal toggle（點掉該唯一值）或 Reset。

**（c）Reset Filters** — 全域（OD-2）：

```
∀ f : S(f) := Any
```

取代現行 `全選` + `全不選` 兩顆按鈕：
- 「全選」在舊模型等同「全部可見」，新模型即 `Any`，由 Reset 覆蓋；
- 「全不選」只會產生被 OD-2 禁止的空集合 —— **移除**，不提供入口。

**（d）FamilyAdd(T)** — Model Family 輕量 bulk-select（OD-4，P1），**僅作用於 `model` facet**：

```
M := { sub.model : normalizeModelId(sub.modelId) ∈ Members(T) }   // 當前 task 快照
S(model) := (S(model) = Any) ? Subset(M) : Subset(V ∪ M)
∀ g ≠ model : S(g) 不變
```

詳見 §4。要點：additive（union，可與既有 selection 並存→「選 Grok 系列後仍能加 GPT-5.6 Sol」）；
**展開為當前 model IDs 的快照**，狀態只存展開後的 display 值集合，故未來新增模型**不會**自動進入既有 subset
（動態 membership 屬 deferred 的 Family Token Semantics，§9）。

### 2.3 不變量（實作與測試都須守住）

- **I1 — 無空子集**：任何 `Subset(V)` 恆有 `V ≠ ∅`；取消最後一項一律折疊成 `Any`（OD-2）。
- **I2 — Any ⇔ 中性**：`S(f)=Any` 時該 facet **無任何 chip 呈 selected**（無 ✓）；反向亦然。
- **I3 — counts 不改狀態**：顯示 0-count 的候選值**不得**自動從既有 `Subset(V)` 移除（OD-6）。
- **I4 — summary = 真實可見數**：results summary 恆等於 `subs.filter(visible).length`，恆等於 DOM 中未 `hidden` 的卡片數。
- **I5 — filter 只動可見性**：任何 filter 動作只切換卡片 `hidden`，**不重排 DOM、不重建 grid、不重載已載入 demo**（PR #24，§6）。
- **I6 — Only 不觸及他 facet**（OD-3）。
- **I7 — Family 只靠 normalized modelId map**：不用 display-name substring、不用 provider，且僅作用於 model facet（§4）。
- **I8 — Explicit All ≠ Any**（FD-4）：`Subset(V)` 即使 `V = Values(f)` 也**不**自動轉 `Any`；新值**不得**被靜默加入既有 `Subset`（完整契約見 §2.4）。

> **注意：不自動折疊 `Subset(全部值)` → `Any`（即 I8）。** 若使用者逐一點到全選，那是「明確選了全部」（誠實顯示全部 ✓），
> 與中性的 `Any` 行為等價但語義不同；回到中性的唯一正規途徑是 Reset。這避免點擊動作被狀態機默默吞掉。詳見 §2.4。

### 2.4 Explicit All ≠ Any 契約與 Edge Cases（FD-4，完整）

**核心契約（FD-4，對應 I8）**：`Subset(V)` 與 `Any` 即使在「`V` 恰好等於目前所有已知值」時，仍是**語義不同的兩個狀態**，
狀態機**不得**自動把前者折疊成後者。

- **`Any` ＝ 開放語義**：對該 facet 不施加限制，且此「不限制」**延伸到未來可能新增的值**。
- **`Subset(V)` ＝ 封閉語義**：使用者**明確**選取的**現有** identity 集合；日後若資料集出現 `V` 以外的新值 `w`，
  `w` **不**會被靜默納入 `V`，在該 facet 受限時 `w` 的卡片**不可見**。
- **禁止自行擴大選擇**：任何機制（family 快照 §2.2d、資料刷新、未來 persistence 還原）**都不得**在使用者未明確操作下，
  把新值加進既有 `Subset`。此契約是 §2.2d family 快照「新模型不自動入既有 subset」原則的**全 facet 推廣**。
- **回到開放語義的唯一途徑**：normal toggle 取消最後一項（§2.2a 末列）或 Reset（§2.2c）。
  逐一點到全選仍是 `Subset(全部)`（誠實顯示全部 ✓），**不**等於 `Any`。

> 本 session 內因 `Values(f)` 只計算一次（§2.1），不會實際觀察到「session 中途新增值」；本契約約束的是**狀態語義**，
> 以及**未來資料刷新 / persistence 還原**時的正確行為，並由 §7.1(8) 以「引入 `V` 外新值」的純邏輯測試守住。

**Edge Cases 完整清單**：

| # | 情境 | 契約行為 | 依據 |
|---|------|----------|------|
| E1 | `Subset({v})` 再點 `v`（最後一項） | → `Any`（不是 Empty） | I1、§2.2a |
| E2 | 嘗試產生空集合（舊「全不選」） | 不可達；無入口 | OD-2、FD-1、§2.2c |
| E3 | 逐一點到 `Subset(全部值)` | 維持 `Subset`（全 ✓），**不**折疊成 `Any` | FD-4、I8 |
| E4 | `Subset(V)` 下出現 `V` 外新值 `w` | `w` **不**入 `V`；該 facet 受限時 `w` 卡片不可見 | FD-4、I8 |
| E5 | 同上但該 facet = `Any` 時出現新值 `w` | `w` 卡片**可見**（開放語義） | FD-4 |
| E6 | 跨維度條件無交集 | **合法** 0 results；不回滾、不刪 selection | OD-2、§3.1、I3 |
| E7 | 候選值 count=0 但仍被選 | 保留於 `Subset`、貢獻 0 可見卡、弱化顯示仍可點 | OD-6、I3、§3.2 |
| E8 | 已是 `Subset({v})` 再 `Only(v)` | **NO-OP** | FD-2、§2.2b |
| E9 | family 展開（§2.2d）遇無 `modelId`／不可歸類 submission | 不被 family 選到；但**仍出現**於一般（非 family）結果，**不得**消失或誤歸類（fail-soft） | FD-3、§4.3 |

---

## 3. 可見性與計數語義

### 3.1 可見性（保留 OR / AND）

```
visible(sub) ⇔ ∀ f ∈ FACETS :  S(f) = Any  ∨  facetValue(sub, f) ∈ V  (當 S(f)=Subset(V))
```

- facet **內** OR：命中 `V` 任一值即該 facet 通過。
- facet **間** AND：每個 facet 都要通過（`∀`）。
- 與現行 app.js:237-238 的唯一差異：`Any` 短路為「通過」，不再要求「全部值都在 set 內」。
  在非 Any 的 facet 上，判斷邏輯與現行完全相同 → multi-select 的 AND/OR 行為不變（不破壞 OD-1 末句）。

**零結果（OD-2）**：不同維度條件衝突（例：`model=Grok 4.7` AND `client=codex` 無交集）會使 `visible` 全 false。
這是**合法**結果，照常顯示「顯示 0/N」，並呈現空網格，**不**觸發任何狀態回滾或 selection 刪除。

### 3.2 候選計數（OD-6，P1）

對每個 facet `f` 的每個候選值 `v ∈ Values(f)`：

```
count(f, v) = |{ sub : facetValue(sub,f) = v  ∧  ∀ g ≠ f : passes(sub, g) }|
```

即「在**其他維度**目前 active constraints 下，值 `v` 涵蓋多少真實 records」。關鍵性質：

- **只看 g ≠ f**：count 不受 `f` 自身當前選取影響 → 在同一 facet 內 toggle 時 count 不閃動（標準 faceted 行為）。
- **候選 count ≠ 點後總數**：`count(f,v)` 是「`v` 這個候選涵蓋數」，與「點下去後整體可見卡片數」是兩個不同數字，
  UI 不得混用（OD-6）。整體可見數 = §3.1 的 `|{visible}|`（含 `f`），屬 results summary。
- **0-count 候選**：照常顯示但弱化（§5.2），**絕不**自動從 selection 移除（I3）。一個值可以同時「被選」且 count=0
  （因另一維度排除），這會貢獻 0 可見卡片，屬合法。
- **資料來源**：永遠從真實 submission records 計，不另存快取總數。

> P0 先不做候選 count；現行 results summary `顯示 N/total`（app.js:223-226）即 §3.1 的 `|{visible}|`，
> 已滿足 I4，予以保留。候選 count 屬 P1 疊加。

---

## 4. Model Family（OD-4 ＋ FD-3）— 資料可靠度結論與 P1 架構方向

### 4.1 現有 metadata 可靠度（已實地驗證）

> 依 §Appendix 的 51 筆 submission 快照。**結論：現有欄位不足以可靠支撐 family bulk-select，需先決策資料來源。**

- **`provider`** ∈ `{anthropic, cursor, moonshotai, openai, xai}`。`anthropic` 同時涵蓋 Fable 5 / Opus 4.6 / Opus 4.8 /
  Sonnet 5 —— **橫跨多個 family**。故 **provider ≠ model family**，Owner「不要預設 provider 可代表 family」的警告成立。
  （`xai` 恰好只對 Grok 是巧合，不能一般化。）
- **`modelId`** 有三個病徵，直接判定「原樣不可靠」：
  1. **命名空間不一致**：`anthropic/claude-fable-5` 與 `claude-fable-5` 並存（同一模型兩種寫法）。
  2. **可缺**：schema 中 `modelId` 為選填（只有計價才必須），實測有一筆 `undefined`。
  3. **不被正規化**：`scripts/lib/pricing.mjs:4` 明載「submission 的 modelId 本身不改，只改查詢端」——
     `aliasFor` 只在**計價查表**時把兩種寫法解析到同一單價，**submission 原值仍保留作者寫法**。
     前端若直接拿 `sub.modelId` 分群，會把 `anthropic/claude-fable-5` 與 `claude-fable-5` 當成兩個模型。
- **`model`**（display name，如「Grok 4.7」）：substring「Grok」雖可命中，但 OD-4 明禁 display-name substring（脆弱）。
- **Tool-Grok vs Grok family**：`client='grok'`（工具 CLI）與 `model='Grok 4.x'` / `modelId='grok-4.x'`（模型）
  是**不同欄位**，資料層可乾淨區分。family 動作只作用於 `model` facet、永不碰 `client` facet（I7），即滿足此區分。

### 4.2 P1 架構方向（FD-3）：metadata-driven，canonical registry 為首選待評估

**FD-3 定調**：family bulk-select 採 **schema／metadata-driven 方向**（即原 (A) 方向），**否決** frontend curated map（原 (B)）
與 display-name substring（OD-4）。**但不批准**「每個 submission 加 optional `family` 欄位」為最終架構——原因：
同一 `modelId` 可出現在多份 submission，per-submission 選填欄位**無法自行保證分類完整性與跨 submission 一致性**
（作者可能漏標，或同一模型在不同 submission 標成不同 family）。故本項維持 **P1 decision direction，非 P0 requirement，且不阻擋 P0**。

**共通前置（正規化與 fail-soft）**：
- 正規化 `normalizeModelId(id) = String(id).split('/').pop()`（剝除 `provider/` 前綴），使 `anthropic/claude-fable-5 → claude-fable-5`。
- **pricing alias ≠ model identity（FD-3）**：`scripts/lib/pricing.mjs` 的 `aliasFor` 僅為**計價查表**用途，**不得**無條件視為模型身分；
  canonical identity 的來源須獨立界定，不可逕用 pricing alias。
- **Unknown / missing `modelId` 的 fail-soft 策略（FD-3，硬性要求）**：無法歸類者**不**被任何 family 選到，
  但**必須**仍以個別模型身分正常出現在一般（非 family）結果中——**不得**從結果消失、**不得**被誤歸類。
  分類缺口必須是**明確、可見**的（例：該卡片照常顯示、只是不響應 family 快速鍵），而非靜默吞卡。

**P1 待評估的兩個候選架構**（均在 metadata-driven 方向下；Owner 傾向 A2）：

- **(A2) 首選待評估 — Canonical model-family registry（單一分類來源）**：以 **canonical model identity** 為 key 的集中式
  registry／metadata（例：`正規化後 modelId → family`），作為**唯一**分類來源，build 時正規化＋驗證：
  - **同一 canonical model identity 不得映射到互相矛盾的 family**（build-time 驗證強制）。
  - 單一來源 → 跨 submission 天然一致，不受個別作者標註落差影響。
  - 新模型只需在 registry 補一筆，即對所有引用該 identity 的 submission 生效。
- **(A1) 備選 — per-submission 選填 `family` 欄位**（原 §4.2A，**下修**）：由作者在每筆 submission 標註、build 時驗證：
  - 優點：顯式、自我文件化、與 pricing 解耦。
  - **FD-3 疑慮**：同一 `modelId` 散落多份 submission，無法自證完整性與一致性（漏標／標法分歧），
    須額外的跨 submission 一致性檢查才能補足。

**(B) frontend curated map — 否決（FD-3）**：前端自維護的 `MODEL_FAMILIES` map 雖非 substring／非 provider，
但屬非 metadata-driven、維護負擔高、且有「無 `modelId` 的 submission 漏選」gap（例目前那筆 `undefined`），**不**作為 P1 架構。

**P1 決策待辦（交付 Owner 拍板）**：
1. 比較 **centralized metadata（A2）** 與 **submission-level field（A1）** 的維護成本與一致性保證。
2. 界定 canonical model identity 的權威來源（**不得**等同 pricing alias）。
3. 落實 build-time normalization／validation（含「同一 identity → 單一 family」強制、unknown fail-soft 可見策略）。

> 單成員（GPT-5.5 / Sonnet 5 / Fable 5 / Kimi K3 / Composer 2.5）在當前快照下不產生 family 按鈕（§4.3）。

### 4.3 共通行為契約（無論最終採 A1／A2）

- family 動作為 **additive union**（§2.2d），保留跨 family multi-select，可與個別模型並存。
- 展開為**當前 task 中實際存在的 member display 值快照**；狀態只存展開結果，新增模型**不自動**入既有 subset（§2.4、I8）。
- 只對有 **≥2 個成員實際出現**於當前 task 的 family 顯示快速按鈕（單成員按鈕無意義）。
- family 按鈕是 **row-level 的 bulk-selection convenience**，不是另一個 single-select mode（§5.3）。
- 僅作用於 `model` facet，**永不**碰 `client` facet（I7，維持 Tool-Grok vs Grok family 區分）。
- unknown／不可歸類 submission 依 §4.2 fail-soft：不被 family 選到、但在一般結果**不消失、不誤歸類**（E9）。

> **狀態（FD-3）**：OD-4 family bulk-select 維持 **P1**，**不綁進 P0 PR**、**不阻擋 P0**。方向已定（metadata-driven）；
> **最終資料架構（A2 canonical registry vs A1 submission-level 欄位）待 Owner 拍板**後再實作。

---

## 5. UI 行為（Desktop / Keyboard / Touch）

### 5.1 Chip 視覺狀態（取代現行 ✓/✕）

| 狀態 | `aria-pressed` | 視覺 |
|------|----------------|------|
| selected（∈ Subset） | `true` | accent 填色 + **前綴 ✓**（OD-1：Explicit Subset 用 ✓ 顯示） |
| unselected / Any 下全部 | `false` | 中性 outline、無前綴符號（**去除 ✕**、無刪除線、無虛線框） |

- **預設（全 Any）= 全部 `aria-pressed=false` = 全中性、零 ✓**（滿足 OD-1「不顯示全部 ✓」「中性狀態」）。
- 「subset 中未選的值」與「Any 下的值」共用**同一個**中性樣式（OD-1「中性／弱化」），不需第三種樣式 → 實作更省。
- CSS 改動集中在 style.css:164-166：移除 `.chip::before{content:'✓'}` 的無條件 ✓ 與
  `[aria-pressed="false"]::before{content:'✕'}`；改為 `[aria-pressed="true"]` 才上 ✓ 與 accent。
- **維持無障礙對比**：現行註解標示 muted on bg 6.32:1、accent on panel-2 5.07:1（皆 ≥ WCAG AA 4.5:1）。
  新樣式須重新確認 selected/neutral 兩態對比仍 ≥ 4.5:1，且**不只靠顏色**區分（✓ 符號 + 填色雙編碼）。

### 5.2 候選 count 呈現（P1）

每顆 chip 標籤後附小字 count（如 `Codex · 3`），`count=0` 時 chip 整體弱化（降低不透明度/置灰）但**仍可點**（I3）。
count 於每次 applyFilter 後重算（§3.2）。

### 5.3 Only 與 Family 的 affordance（OD-3 compact 設計）

為避免每顆 chip 掛過多常駐控制，**把兩類動作分層**：

- **Only = per-chip 尾段按鈕**（chip 內兩段式）：
  ```
  [  Codex   ⟲ ]      ← 主體「Codex」= normal toggle；尾段「⟲ / 只看」= Only(該值)
  ```
  - 尾段是**真正的 `<button>`**，accessible name =「只看 {值}」，常駐可見（可發現）。
  - 視覺克制：細分隔線 + icon，低調但命中區 ≥ 24×24（WCAG 2.5.8 AA；touch 建議 ≥ 44）。
  - **Desktop**：滑鼠點尾段 = Only；hover 可加強提示但功能**不得 hover-only**。
  - **Keyboard**：Tab 先到 chip 主體、再到尾段 Only 按鈕、再到下一顆；Enter/Space 觸發。（可選 roving arrow，非必要。）
  - **Touch**：主體與尾段是兩個相鄰 tap target，皆足夠大；**不**依賴 long-press（long-press 可日後作為附加增強，
    但可見按鈕恆為主要路徑）。
  - **DOM 結構契約（Editorial Clarification，2026-10-13；不重啟既有 Owner Decisions）**：上述「chip 內兩段式」在 DOM 層凍結為——
    - **Toggle 與 Only 為 sibling interactive elements**：chip 主體（normal multi-select toggle）與尾段 Only 各自是獨立的 `<button>`，
      兩者為**兄弟節點**，共用一個**非互動式 wrapper**（如 `<span>`／`<div>`；wrapper 本身不可 focus、不綁互動語義）。
    - **禁止 nested interactive**：**不得**把 Only `<button>` 巢狀於 toggle `<button>` 之內，亦不得出現任何其他 nested `<button>`
      或 nested interactive control（巢狀互動元素在 HTML 非法，且破壞鍵盤／報讀語義）。
    - **語義分離保留**：主體維持正常 multi-select Toggle（§2.2a），尾段維持獨立 Only action（§2.2b、FD-2、I6）；
      Only **非 toggle**、不得與主體混用語義。
    - **Only accessible name**：尾段按鈕須有明確 accessible name「只看 {值}」（承上），不得僅以無名 icon 呈現。
    - **三通道皆可操作**：Keyboard（Tab 依序：主體→尾段 Only→下一顆，Enter/Space 觸發）、Touch（兩個相鄰且足夠大的 tap target）、
      Screen reader（兩個各自具名的 button、語義獨立）皆須可操作，與上列 affordance 行為一致。
    - 瀏覽器驗證沿用 §7.2 既有 smoke（目視確認：兩個各自具名的 button、無 nested interactive）；依 Owner Decision 本輪**不**另加 §7.2 測試項。
- **Family = row-level 快速按鈕**（僅 `model` facet 列）：
  ```
  模型：[Grok 系列]  [GPT-5.6 系列]   | Grok 4.5 | Grok 4.6 | Grok 4.7 | GPT-5.6 Sol | ...
  ```
  - 放在 facet 列開頭、與 chip 分離，明確是「bulk-add 便利鍵」而非 single-select。
  - `client` facet（Tool-Grok 所在）**永不**出現 family 按鈕 → UI 層強化 Tool vs Model 區分。
  - Desktop/Keyboard/Touch 皆為一般按鈕，無特殊手勢。

> **跨維度重設**與 facet-level Only 嚴格分離（OD-3 末句）：若未來要「只看這個完整配置（跨所有 facet）」，
> 須另立命名動作（如「只看此配置」），**不**與 chip 尾段的 Only 混用。本輪不納入。

### 5.4 控制列組成（取代現行 全選/全不選）

```
排序：[名稱 ▾] [↑ 遞增]                      ← 完全不動（含 dir 按鈕 ARIA 契約，§6）
工具：  | claude-code | codex | ...
模型：  [Grok 系列]* | Grok 4.5 | ...          ← *P1
推理強度：| low | medium | high | ...
[Reset Filters]   顯示 N/total   （提示文字）   ← 全選/全不選 → 單一 Reset
```

- **提示文字**沿用現行精神（app.js:296）：「同一列可複選；不同列的條件須同時符合」。
- **Active Filter Summary（P1，僅在確有助益時）**：一行摘要非 Any 的 facet（如「工具：Codex ＋ 模型：Grok 4.7」）
  並提供逐 facet 快速清除。列為 P1-optional，不確定收益則不做。

---

## 6. PR #24 不變量保護清單（OD-7）

實作時**逐項驗收**，任一破壞即視為 regression：

1. **moveBefore 不重載**（app.js:157-180）：filter 只切換 `hidden`，**永不**重排/重建 grid；排序才用
   `moveBefore`(state-preserving) 重排。→ 新模型的任何 filter 動作（toggle/Only/Reset/family）只准改 `hidden`（I5）。
2. **隱藏前 focus guard**（app.js:227-232）：`setVisible` 在 `!visible` 且焦點仍在卡內時先把焦點移到觸發按鈕。
   → **原樣保留**；Only/Reset/family 呼叫 applyFilter 時一律傳入觸發元素作 focusFallback。
3. **排序方向鈕的 ARIA changing-label 契約**（app.js:205-213）：dir 按鈕用**會變的 `aria-label`**
   （「排序方向：遞增/遞減」），**不是** `aria-pressed`。→ 完全不動。**切勿**把 `aria-pressed` 加到 dir 按鈕，
   也**切勿**把 chip 的狀態改成 aria-label-toggle —— 兩種控制契約必須維持分離（chip 用 `aria-pressed`，dir 用 aria-label）。
4. **sort / filter 互通**：排序重排 DOM 次序、filter 切換可見性，兩者正交。→ 新的 Only/family **不得**重排；
   filter 後既有排序順序保持；視覺順序 = tab / 報讀順序不變。
5. **其他保留**：`載入顯示中` 按鈕（app.js:98-103）讀 `.card:not([hidden])`，因可見性仍由 `hidden` 驅動而**仍正確**；
   `aria-live="polite"` 的 count（app.js:222）保留，Only/Reset/family 後會朗讀新的「顯示 N/total」。

---

## 7. 最小測試策略（OD-7）

現況：無 `package.json`、無測試、CI `validate` job 跑三個 Node script（Node 22；`.github/workflows/pages.yml`）。
**不**引入 Playwright 全框架。分層如下：

### 7.1 純邏輯單元測試（`node --test`，零依賴）— P0

前置是 §8 的 **filter-core 抽取**：把 Any/Explicit 的 reducer、可見性 predicate、counts 抽成**無 DOM 副作用**的
ES module，使其可被 Node 內建 test runner 直接 import。覆蓋 OD-7 的七項 ＋ FD-6 追加第 8 項：

1. **Any / Explicit transitions**：§2.2(a) 四個 transition ＋ 取消最後一項折疊回 Any（I1）。
2. **Multi-select AND/OR**：對 fixture submissions 跑 `visible`，驗證 facet 內 OR、facet 間 AND。
3. **Only isolation**：`only(f,v)` 後 `S(f)=Subset({v})` 且其他 facet 不變（I6）。
4. **Reset**：`reset()` 後所有 facet = Any（I2）。
5. **跨 facet 衝突 → 零結果**：構造無交集條件，`visible` 全 false、狀態不回滾、selection 不被刪（OD-2 / I3）。
6. **Family bulk selection**：`familyAdd` 為 union、快照展開、`normalizeModelId` 正規化、Tool-Grok 不受影響、
   無 modelId 的 gap 行為（§4）。
7. **Counts + sorting**：`count(f,v)` 只依其他維度（§3.2）；沿用既有 `sortValue` / `compareText` 的 numeric-aware
   與「缺值排最後」（app.js:143-174）。
8. **Explicit All vs Any（新增值語義差異，FD-4／FD-6）**：以同一組 facet 值分別建立 `Subset(V)`（`V` = 目前全部值）與 `Any`，
   再引入一筆帶 `V` 外新值 `w` 的 fixture submission，驗證：`Any` 下 `w` **可見**；`Subset(V)` 下 `w` **不可見**、
   且 `V` **不被**自動擴張（I8、§2.4 E4/E5）。此項守住「Explicit All ≠ Any」契約。

**CI 掛點**：在 `validate` job 加一步 `node --test test/`（Node 22 內建，無需 `package.json`）。最小、可持續、零框架。

### 7.2 DOM 不變量（§6 的 1-4）— 手動 smoke 清單（P0）＋ 延後自動化

`moveBefore 不重載`、`focus guard`、`dir-button ARIA`、`sort/filter 互通` 為瀏覽器行為，難以無 DOM 單元化。
本輪提供**簡短手動回歸清單**（這四項已上線且穩定）：

- 載入某張 demo iframe → 切換任一 filter → 確認該 iframe **未重載**（計數器/狀態保留）。
- 焦點置於卡內元素 → 操作使該卡隱藏 → 確認焦點落到觸發按鈕、非 body。
- 切換排序方向 → 讀 dir 按鈕 `aria-label` 在「遞增/遞減」間變動，且無 `aria-pressed`。
- 排序後再 filter → 可見卡片的相對順序不變。

**延後**：單一支 Playwright smoke（load demo → toggle filter → 斷言 iframe 未重載）可作為日後 moveBefore 的自動守門，
但依 OD-7 本輪不建置大規模前端測試基建。

---

## 8. 實作足跡（最小）與 app.js 遷移

### 8.1 檔案清單

| 檔案 | 動作 | 內容 |
|------|------|------|
| `assets/filter-core.js` | **新增**（純 ESM，約 80-120 行，無 DOM） | `facetValues()`、`initState()`、`toggle()`、`only()`、`reset()`、`familyAdd()`、`visible()`、`count()`、`normalizeModelId()`；（P1）`familyGroups()` — 成員資料由 §4 metadata 衍生，來源 A1/A2 待定（FD-3），**不**內嵌前端 curated map |
| `assets/app.js` | 改寫 `buildCompareControls`（182-303） | 以 filter-core 驅動狀態；chip 由狀態 render；Only 尾段；Reset；（P1）family 列按鈕、候選 count |
| `index.html` | 兩個 `<script>` → `type="module"`；`?v` bump | 讓 app.js `import` filter-core |
| `assets/style.css` | 改 126-179 區塊 | chip 去 ✓/✕ → 中性 + selected ✓；Only 尾段；family/Reset 按鈕；（P1）count badge |
| `test/filter-core.test.mjs` | **新增** | §7.1 八項 |
| `.github/workflows/pages.yml` | 加一步 | `node --test test/` |
| `schema/submission.schema.json` **或** canonical family registry | （P1、FD-3，架構待定） | A1：schema 加選填 `family` ＋ 回填；A2：新增 canonical model-family registry ＋ build-time 驗證（擇一，待 Owner 拍板） |

### 8.2 `assets/app.js` 逐點遷移（selected-set → Any/Explicit）

| 現行 | 行 | 遷移後 |
|------|----|--------|
| `const selected = new Map()`（facetKey→Set 全選） | 234 | `const facetState = new Map()`，每 facet 存 `{mode:'any'}` 或 `{mode:'subset', values:Set}` |
| `selected.set(facet.key, new Set(values))`（初始全選） | 251 | `facetState.set(facet.key, {mode:'any'})`（初始不限制） |
| `subVisible`：`selected.get(k).has(...)` | 237-238 | 呼叫 `visible(sub, facetState)`（§3.1，`any` 短路通過） |
| chip 初始 `aria-pressed="true"` | 263 | `"false"`（Any 下全部非 pressed，I2） |
| chip click：`next = !set.has(value)` 加/刪 | 264-270 | 呼叫 `toggle(facetState, f, v)`（§2.2a reducer），再由新狀態 **重繪該 facet 全部 chip 的 aria-pressed** |
| `setAll` + `全選`/`全不選` | 278-294 | **移除**；改為單一 `Reset`（§2.2c）＋ per-chip Only（§2.2b）＋（P1）family 列按鈕（§2.2d） |
| `applyFilter(focusFallback)` | 240-243 | 精神不變：跑 `visible` → `setVisible` → `updateCount`；**focus guard 原樣**（§6.2） |
| `updateCount`（`!hidden` 計數） | 223-226 | 不動（= §3.1 的 `|{visible}|`，滿足 I4） |
| `setVisible`（隱藏前移焦點） | 227-232 | **完全不動**（PR #24 不變量） |

**關鍵：不破壞既有功能的保證**

- 可見性判斷在「非 Any facet」上與現行**逐字等價**（成員檢查 + `every`）→ multi-select AND/OR 行為不變。
- filter 仍**只切換 `hidden`**，排序仍走 `moveBefore` → §6 四個不變量全保留。
- 非 filter 區塊（sidebar、card、metrics、byline、media、lazy iframe、model-viewer SRI、sort）**一律不動**。
- `index.html` 改 `type="module"`：模組需 `http://`（不支援 `file://`）。但 app.js 本就要求使用者跑 local server
  （見 `renderError`，app.js:560-563 提示 `python3 -m http.server`），故**不造成支援範圍退化**。
- `?v=8` → bump（如 `?v=9`）確保使用者取得新 CSS/JS。

---

## 9. 已知 trade-offs 與未來

**Trade-offs**

1. **第一次點擊 = 加入 → Exclusion Workflow 退化**（FD-5，**已知且接受**）：舊版預設全選時，點一顆 chip 可**快速排除**該選項；
   新版預設 `Any`、normal click 改為建立單值 `Subset`，故「快速排除某一項」的舊工作流會退化（需改以「選取其餘各項」達成）。
   緩解：中性預設（零 ✓）＋提示文字＋✓ 雙編碼。**本輪明確不新增** Exclude Operator、負向 filter state 或 tri-state，
   以免回填被 OD-1 廢止的排除語義；若未來確有需求，另立具名動作並重新設計（Deferred）。
2. **不自動折疊 `Subset(全部)`→`Any`**：逐一全選會顯示全部 ✓（誠實），與 Any 效果等價但語義不同；回中性走 Reset。
3. **Only 作為 per-chip 控制**：每顆 chip 多一個尾段控制（密度↑）。緩解：低調樣式 ＋ family 改放 row-level，使每顆 chip
   最多兩個控制（主體 + Only）。
4. **Family 分類資料架構未定（P1，FD-3）**：frontend curated map（原 §4B）因維護負擔＋無 `modelId` 漏選已**否決**；
   方向定為 metadata-driven，canonical registry（A2）vs per-submission 欄位（A1）待 Owner 拍板（§4.2）。
5. **模組化需 local server**：與既有要求一致，非新增限制。
6. **候選 count 每次重算** `O(facets × values × subs)`：N=51 下可忽略。

**實作優先序（重申 Owner 定義）**

- **P0**：狀態語義（§2）、multi-select transition、Quick Isolation（Only）、Reset、正確 results（§3.1）、§7.1 核心測試、§6 不變量保護。
- **P1**：Model Family 輕量快速選取（§4）——**方向已定：schema／metadata-driven（FD-3）、否決 frontend map**；
  **未決架構**：canonical model-family registry（A2，依 canonical model identity 的單一分類來源）vs per-submission `family` 欄位（A1），
  維護成本與一致性保證待 Owner 拍板（準則見 §4.2）；候選 count／上下文可用性（§3.2）、Active Filter Summary（若確有助益）。
- **Deferred**：完整 hierarchical tri-state family UI、URL/localStorage persistence、saved presets、大型前端測試基建、
  跨維度「只看此配置」、動態 **Family Token Semantics**（狀態改存 family token 使新模型自動入選）。

**為 OD-5 預留**：§2.1 的 `F` 可無損序列化，未來接 URL / localStorage 不需重構模型。

---

## Appendix — 當前資料快照（證據，2026-10-13，51 筆 / 5 tasks）

- `provider`：`anthropic`, `cursor`, `moonshotai`, `openai`, `xai`　（`anthropic` 橫跨 Fable/Opus/Sonnet）
- `client`：`claude-code`, `codex`, `cursor`, `grok`, `opencode`　（`grok` = 工具）
- `model`：`Composer 2.5`, `Fable 5`, `GPT-5.5`, `GPT-5.6 Luna/Sol/Terra`, `Grok 4.5/4.6/4.7`, `Kimi K3`, `Opus 4.6/4.8`, `Sonnet 5`
- `modelId`：`anthropic/claude-fable-5` **與** `claude-fable-5` 並存、`moonshotai/kimi-k3`、`openai/gpt-5.5`、
  `claude-opus-4-6/4-8`、`claude-sonnet-5`、`gpt-5.5`、`gpt-5.6-luna/sol/terra`、`grok-4.5/4.6/4.7`、**一筆 `undefined`**
- `effort`：`low`, `medium`, `high`, `xhigh`, `max`

---

## 附記（非 filter 範圍）— Grok costUsd 用語

與本 filter spec 無關、但依 Owner 指示留存：PR #30 已合併/部署，不需重做。Grok 4.7 的 `costUsdTicks` 與公告標準價推算
仍約 8% 差距；「長脈絡分檔混用」目前**只能算可能解釋，非已證實根因**。建議把卡片 costUsd 明確定位為
**「依標準公開費率估算的成本」**（現 tooltip 為 app.js:335「依 data/pricing.json 換算的 USD」），避免暗示為實際帳單金額。
此為**一行字串 + 可能一句說明**的獨立小改，**不屬本輪**、也**不應綁進 filter PR**；待另行授權。
