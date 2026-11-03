# 无障碍审计记录 · 2026-11-02

> 工具：axe-core 4.10.2，注入页面运行（非 DevTools 手点），WCAG 2.1 AA 规则集；
> 手动验收用 macOS VoiceOver + Safari。
> 范围：前端自有的 5 个路由 + 登录弹窗。结账页由 Stripe 托管，不在可改范围内。

---

## 0. 结果一句话

**axe 违规 11 处 → 0 处**，另修掉 7 处自动工具查不到、靠手动键盘测试才发现的问题，接了 CI 守卫防回退（17 个用例），并用 VoiceOver 实测验收（六项全过）。

---

## 1. 基线（修复前）

| 页面 | 违规规则 | 节点数 | 严重度 |
|---|---|---|---|
| `/`（首页 / kit builder） | `color-contrast` | 6 | serious |
| `/`（首页 / kit builder） | `landmark-complementary-is-top-level` | 1 | moderate |
| `/orders`（未登录） | `color-contrast` | 1 | serious |
| `/success` | `color-contrast` | 1 | serious |
| `/cancel` | `color-contrast` | 1 | serious |
| `/` + 登录弹窗 | `color-contrast` | 1 | serious |
| `/orders`（已登录） | — | 0 | — |
| `/orders/:id` | — | 0 | — |

合计 **11 个失败节点**，来自 **3 个根因**：

两类对比度问题：

- `#ffffff` on `#e86f3b` = **3.1:1**（需要 4.5:1）——`.primary-link`、`.checkout-button`、`.auth-submit`
- `#71807d` on `#f9f7f1` = **3.85:1**（需要 4.5:1）——`.sku` 商品编号

---

## 2. axe 查出来的，修了什么

### 2.1 对比度

`--orange` 这个 token 在整张样式表里只用了 3 次，全部是 `background` 配白字，所以改 token 一处就全部解决，不会误伤「橙色当文字」的场景。

```
--orange: #e86f3b  →  #c44d18   白字对比度 3.1:1 → 4.75:1
.sku color: #71807d → #5f6d6a   3.85:1 → 5.05:1
```

### 2.2 landmark 嵌套

`<main>` 把 `<header>`、`<nav>` 整个包在里面了，于是 builder 里的 `<aside class="summary-card">` 成了「landmark 套 landmark」。

两处一起改：

- header / nav 提到 `<main>` 外面（5 个组件都是同一个毛病）
- summary-card 本来就不是「页面的补充内容」，是 builder 的组成部分，不该是 landmark，改成普通 `<div>`，靠里面的 `<h2>` 撑结构

---

## 3. axe 查不到的，手动测出来的

> 这部分才是重点。自动工具跑到 0 违规，下面 6 条它一条都不会报。

### 3.1 弹窗没有焦点陷阱 ⚠️

`auth-dialog.tsx` 写了 `aria-modal="true"`，但 Tab 能直接走出弹窗跑到后面的页面上去。**对辅助技术来说这是一句假话。**

实测：焦点放在弹窗最后一个控件上按 Tab → 焦点离开了 `.auth-dialog`。

修法：`keydown` 里拦 Tab / Shift+Tab，在首尾控件处回绕。

### 3.2 关闭弹窗后焦点丢失 ⚠️

按 Esc 关掉弹窗后，焦点掉到 `<body>` 上——键盘用户得从头 Tab 一遍才能回到原来的位置。

**这里踩了一个坑**：第一版把 `document.activeElement` 存进 ref 就完事，实测没生效。原因是 `<input autoFocus>` 由 React 在 commit 阶段处理，**早于 passive effect**，所以 effect 跑到的时候 `activeElement` 已经是弹窗里的输入框了，存下来的「触发元素」是错的。

修法：去掉 `autoFocus`，在 effect 里先存触发元素、再自己把焦点送进弹窗，顺序就对了。

### 3.3 整张卡片当 live region ⚠️

```jsx
<aside className="summary-card" aria-live="polite">   // 改之前
```

每次改数量，读屏会把**整张卡片**重念一遍：标题、每一行商品、总价、税费说明、按钮文字。实际只有两个数字变了。

修法：`aria-live` 从卡片上拿掉，只挂在 `.item-count` 和总价上（总价配 `aria-labelledby` 说明这是什么数字）。

`orders-list.tsx` 的 `.orders-list` 也是同一个毛病，一并处理。

### 3.4 异步状态和错误完全不出声

`.result-status`（"Loading order…"、"Confirming your payment…"）和 `.result-error` 都是裸 `<p>`，不在任何 live region 里。页面在轮询支付状态，读屏用户什么都听不到。

修法：loading 加 `role="status"`，错误加 `role="alert"`。注意 `role="status"` 的元素要**常驻 DOM**、只换文字内容，条件渲染整个元素的话有些读屏不播报。

### 3.5 订单详情是个假表格

`.detail-lines` 是 4 列 CSS grid 拼的，没有任何表格语义，行列关系对读屏完全丢失。外层那个 `aria-label="Order line items"` 挂在裸 `<div>` 上，大部分辅助技术直接忽略。

修法：加 ARIA 表格角色（`role="table" / "row" / "columnheader" / "cell"`）。**没有改成真 `<table>`**，因为布局是 `display: grid`，换标签要重写 CSS；ARIA 角色能在不动一行样式的前提下补上语义。

### 3.6 5 个页面共用一个 `<title>`

全部是 "MedKit Studio | Configure a medical kit"。WCAG 2.4.2 要求标题能描述页面。

修法：root layout 用 `title.template`，各页给自己的 `title`。

### 3.8 弹窗打开时背景没有 inert ⚠️

**这条是搭 CI 守卫时才发现的**，第一轮手动审计漏了。

现象是 CI 里的弹窗用例**偶发失败**，报背景元素对比度不足。根因不是颜色——是弹窗打开时 `<main>` 和 `<header>` 还活着：

- 遮罩是 `rgba(7, 34, 33, 0.64)`，半透明。axe 透过它去算背景内容的对比度，算出来的是混合后的值
- 失败与否取决于当时哪些元素在视口内，所以时好时坏

焦点陷阱只管住了 Tab，读屏的虚拟光标照样能走到背景里去。修法是弹窗打开时给 `<main>` 和 `<header>` 加 `inert`（React 19 原生支持布尔属性），辅助技术和 tab 顺序一起排除。

**flaky 的守卫比没有守卫更糟**——它会训练你忽略 CI。所以这条必须挖到根因，不能靠重试或者关掉某条规则糊过去。

### 3.7 顺带加的

- **跳转链接**：header 里有 4–5 个链接挡在正文前面，补了 skip link
- **焦点样式**：整张 1200 行样式表里只有一条 `focus` 规则（还是弹窗输入框的），其余全靠浏览器默认那圈 1px 细线。补了统一的 `:focus-visible` 3px 轮廓

---

## 4. 复测（修复后）

| 页面 | axe 违规 |
|---|---|
| `/` 未登录 | 0 |
| `/` + 登录弹窗打开 | 0 |
| `/orders` 未登录 | 0 |
| `/orders` 已登录 | 0 |
| `/orders/:id` | 0 |
| `/success` | 0 |
| `/cancel` | 0 |

手动复测：

- Tab 从弹窗末位 → 回绕到关闭按钮 ✅
- Shift+Tab 从弹窗首位 → 回绕到末位 ✅
- Esc 关闭 → 焦点回到「Sign in」按钮 ✅
- skip link 是 Tab 第一站，获得焦点时滑出、失焦后收回 ✅
- 所有控件 `:focus-visible` 命中 3px 轮廓 ✅

`npx tsc --noEmit`、`npm run lint`、`npm run build:compat` 均通过。

---

## 5. 本来担心、结果没问题的

面试如果被追问「自定义组件能不能键盘操作」，这里的答案是**能，而且本来就能**：

kit builder 的加减数量、Add 按钮全是原生 `<button>`，没有 `div + onClick`。实测 Tab 一圈 12 个控件，顺序和视觉顺序一致，每个都有像样的可访问名称（"Add one Essential First Aid Kit"、"Remove one Essential First Aid Kit"）。商品图有 alt，装饰性 SVG 是 `aria-hidden="true" focusable="false"`。

**这部分不是修出来的，是原本就写对了**——说的时候别邀功。

---

## 6. CI 守卫

一次性审计会回退，所以接了自动化：`.github/workflows/ci.yml` 里新增 `accessibility` job。

```
frontend/
  playwright.config.ts
  e2e/
    accessibility.spec.ts      17 个用例
    fixtures/stub-api.mjs      假后端
```

本地跑：

```bash
cd frontend && npm run test:a11y
```

### 覆盖什么

| 组 | 用例数 | 查什么 |
|---|---|---|
| axe 扫描 | 8 | 7 个页面状态 + 登录弹窗，WCAG 2.1 A/AA 全规则 |
| 键盘与焦点 | 6 | skip link、焦点陷阱双向、焦点归还、背景 inert、可访问名称、live region 范围 |
| axe 测不了的语义 | 3 | 表格角色、标题唯一性、`role="status"` |

### 两个设计决定

**1. 用假后端，不起真的 Mongo + Redis。**

首页的商品数据是 **Server Component 里取的**，所以 Playwright 在浏览器侧的请求拦截根本看不到那次调用——它发生在 Next.js 进程里。只能起一个 HTTP stub 喂固定数据。

好处不只是快：固定 fixture 意味着**渲染出来的 DOM 是确定的**，a11y 回归测试要的正是这个。用真实数据反而会因为库存变动导致用例飘。

**2. 跑生产构建，不跑 dev server。**

Next.js 的 dev overlay 会往页面里插一个自己的可聚焦元素，tab 顺序断言会被它污染。

### 守卫确实会失败

把 `--orange` 改回 `#e86f3b` 验证过，CI 会红，并且报错信息直接给到选择器和颜色值：

```
color-contrast (serious) x2 — Elements must meet minimum color contrast ratio thresholds
    .primary-link
      Element has insufficient color contrast of 3.1
      (foreground color: #ffffff, background color: #e86f3b,
       font size: 10.5pt (14px), font weight: bold).
      Expected contrast ratio of 4.5:1
```

稳定性：`--repeat-each=3` 跑 48 个用例全绿。

---

## 7. VoiceOver 实测（2026-11-03）

macOS VoiceOver + Safari，手动走了一遍。**六项全过，没有因此改动任何代码。**

| 验收项 | 怎么测 | 结果 |
|---|---|---|
| skip link | 页面加载后按一次 Tab | ✅ 念「Skip to main content，链接」 |
| landmark 结构 | `VO + U` → Landmarks | ✅ `banner` / `navigation` / `main` 平级 |
| 标题大纲 | `VO + U` → Headings | ✅ H1 → H2 → H3 → H4 层级合理 |
| live region 收窄 | 激活 Add 按钮，听自动播报 | ✅ 只念数量和总价，不重念整张卡片 |
| 弹窗 `inert` | 弹窗打开后连按 `VO + →` | ✅ 光标在弹窗内循环，走不出去 |
| 表格列名 | 单元格上按 `VO + Shift + C` | ✅ 念出对应列名（如 "Qty"） |

### 过程中踩的两个坑（都是测法问题，不是代码问题）

**1. Tab 跳过了整个表格。** 这是正确行为——Tab 只访问可聚焦元素，表格里一个都没有。读屏用户靠的是 VoiceOver 光标（`VO + →`），它和键盘焦点是两套独立的光标。焦点陷阱管 Tab，`inert` 管 VO 光标，所以只测 Tab 验不出 `inert`。

**2. 按行走不报列名。** `VO + ↓` 念整行（"row 2 of 3, Essential First Aid Kit $39 1 $39"），这对任何表格包括原生 `<table>` 都一样。列名要按单元格走（`VO + →`）才报，或者直接用 `VO + Shift + C` 查当前单元格的列标题。

### 结论：自动化的边界在哪

这一趟里风险最高的那条，CI 一个字都验不了。

CI 断言的是 `role="table"` 存在、4 个 `columnheader`、3 个 `row`——全绿。但「列名到底念不念得出来」属于辅助技术的运行时行为，取决于 AT 对 ARIA 的实现质量，只有戴上耳机才知道。

考虑过的风险是：`display: grid` 加在 `role="row"` 上，有让部分辅助技术丢失行列关联的已知可能。实测确认 Safari + VoiceOver 下关联正常，所以保留 ARIA 角色方案，没有改成真 `<table>`。如果以后换别的 AT 发现关联断了，正确做法是换真 `<table>` + `table-layout: fixed` 还原布局。

---

## 8. 还没做

- **只测了 Chromium（自动）和 Safari（手动）**：没跑 Firefox / NVDA / JAWS
- **Stripe 结账页**：托管页面，改不了，也测不了
