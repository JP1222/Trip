# Wall / Board 产品路线图

> 目标：把首页 cork board 从「固定拼贴墙」做成**可装饰的个人画板**——相纸、边框、夹子、钉子、贴纸可自由组合；用户上传的图直接贴上 board；以后还能和朋友一起摆。

相关旧笔记：[`FUTURE-WALL.md`](./FUTURE-WALL.md)（愿景速记，本文件为执行路线图）。

---

## 1. 产品一句话

**一块真实的软木板**：照片有不同「相纸/边框」，装饰物可挑选，所有东西都能拖、转、缩放并记住布局。

---

## 2. 现状（2026-07 基线）

| 能力 | 状态 |
|------|------|
| 首页 cork 质感 + polaroid 网格 | ✅ 已有（固定布局） |
| Trip 卡片上墙（lived / planned） | ✅ |
| Admin 管理 trips、拖拽排序 | ✅ |
| Admin 上传 **board photos**（独立合照等） | ✅ 刚落地（`wall_photos`） |
| 白边 caption / 名字行 | ✅ 文案级，非画布编辑 |
| 多种相纸 / 无边框 / 可写字白边 | ❌ |
| 自由位置 / 旋转 / 缩放 | ❌（随机倾角仅装饰） |
| 夹子、钉子、贴纸等装饰库 | ❌（CSS pin 为死装饰） |
| 用户自助上传贴墙（非 admin） | ❌ |
| 分享布局 / 协作编辑 | ❌ |

**相关代码**

- Public wall：`PolaroidWall.tsx`、`lib/wall.ts`
- Admin board photos：`AdminWallPhotos.tsx`、`lib/wall-photos.ts`、`/api/admin/wall/photos`
- 质感：`globals.css` cork / instant 样式、`public/textures/`

---

## 3. 设计原则

1. **Board 是画布，不是相册页** — 相册仍在 trip 详情；board 是情绪与陈列。
2. **一切上墙物统一成「Wall Object」** — 照片、便签、夹子、贴纸共用 transform（x, y, rotate, scale, z）。
3. **相纸 / 边框是皮肤，不是另一套布局** — 同一张图可换 `frameStyle`。
4. **装饰是一等公民** — 夹子、钉子可独立放置，也可「吸附」到某张相纸（后期）。
5. **先单人 board，后协作** — 权限模型不要拖慢 MVP 画布。
6. **移动端先能看、后能精细编辑** — 大屏编辑，手机主浏览 + 轻操作。
7. **可回退** — 布局存 JSON/表结构，坏布局可 reset 到「智能网格」。

---

## 4. 核心概念模型（目标数据）

```
Board
  ├── surface (cork | fridge | custom…)     // 后期
  ├── objects[]                             // 画布上的一切
  │     ├── kind: photo | note | decor
  │     ├── transform: { x, y, rotate, scale, z }
  │     ├── photo?  → media + frameStyle + caption
  │     ├── note?   → text + color
  │     └── decor?  → catalogId | customAssetId
  └── settings (grid snap, locked, …)
```

### 相纸 / 边框（Frame styles）— 产品目录

| id | 名称 | 说明 |
|----|------|------|
| `polaroid` | 拍立得 | 经典白边，**下白边可写字**（caption） |
| `polaroid-square` | 方幅拍立得 | 1:1 构图 |
| `borderless` | 无边框 | 照片贴满，像冲洗后直接钉上 |
| `thin-white` | 细白边 | 轻相框感 |
| `matte-black` | 黑卡纸 | 展览感 |
| `film-strip` | 胶片条 | 可选，偏 playful |
| `washi` | 和纸贴边 | 可选，与胶带装饰联动 |

> 首发建议只做 **3 种**：`polaroid` / `borderless` / `thin-white`。其余当皮肤包迭代。

### 装饰目录（Decor catalog）

| 类型 | 例子 | 来源 |
|------|------|------|
| 钉子 pin | 红/金/木色图钉 | 内置 SVG / 小图 |
| 夹子 clip | 金属夹、木夹、彩色夹 | 内置 |
| 胶带 tape | 半透明 washi | 内置 |
| 便签 note | 黄/粉/蓝，可打字 | 内置 + 文本 |
| 贴纸 sticker | 旅行印章、磁贴 | 内置包 + **用户上传** |
| 自定义图 | 任意 PNG/透明图当贴纸 | 用户上传 |

装饰统一字段：`catalogItemId` 或 `assetUrl`，外加 transform。

---

## 5. 分阶段路线图

### Phase 0 — 收口现状（约 0.5 周）

**目标**：board photos 稳、和 trip wall 边界清晰。

- [x] Admin 上传 / 改 caption / 删 / 排序 board photos
- [ ] Public wall 展示层与 admin 管理文案统一（中/英）
- [ ] 文档与备份说明：`wall_photos` + `media-public/wall/`
- [ ] 明确：**trip 媒体** vs **board 媒体** 两套入口不混淆

**完成定义**：合照可 admin 管理；首页稳定显示；无数据迁移坑。

---

### Phase 1 — 相纸皮肤（约 1–1.5 周）

**目标**：同一张 board 照片可选边框样式；拍立得白边可写字（已有 caption 字段强化 UX）。

**做什么**

1. `wall_photos` 增加 `frame_style`（默认 `polaroid`）
2. CSS / 组件：`FramePolaroid`、`FrameBorderless`、`FrameThinWhite`
3. Admin：选边框预览 + 编辑 caption / meta（拍立得脚注）
4. 无边框样式：无下白边，或 caption 改为 hover/lightbox 显示
5. 可选：白边手写字体已有 `--font-hand`，强化「写在相纸上」的感觉

**不做**

- 自由拖拽坐标
- 用户侧编辑

**完成定义**：同一张图切换 3 种边框，public + admin 一致；拍立得下白边文案清晰可读。

---

### Phase 2 — 画布布局 MVP（约 2–3 周）⭐ 核心跃迁

**目标**：board 从「响应式网格」变成「可保存的自由画布」。

**做什么**

1. **数据模型**  
   - 新表或 JSONB：`wall_layout` / `wall_objects`  
   - 每对象：`id, kind, x, y, rotate, scale, z, ref_id`  
   - `ref_id` 指向 `wall_photos.id` 或 decor
2. **坐标系**  
   - 逻辑画布固定宽高比（如 1600×1000）或 % 相对 cork surface  
   - 响应式：按容器缩放整板，不重排
3. **编辑模式**（admin 先）  
   - 拖拽移动、角点旋转、边框缩放  
   - 选中态、删除、前置/后置  
   - 吸附网格 / 轻微对齐辅助（可选）
4. **浏览模式**  
   - 无编辑手柄；点击照片仍可 lightbox 放大
5. **Reset layout**  
   - 一键回到「自动网格」布局（兼容现在的感觉）

**技术注意**

- 触控：pointer events + 防滚动冲突  
- 性能：对象 < 50 时 DOM 足够；之后再考虑 canvas  
- Trip 卡片：Phase 2 可**仍占网格槽**或先「固定区 + 自由区」；建议 **先只让 board photos 自由布局**，trip 保持现有墙，降低爆炸半径

**完成定义**：admin 摆好 board 照片位置/角度/大小 → 刷新仍在；访客看到同一布局。

---

### Phase 3 — 装饰物：钉子 / 夹子 / 胶带（约 1.5–2 周）

**目标**：用户（admin）从目录里拿装饰贴到 board。

**做什么**

1. 内置 **decor catalog**（JSON 或 DB）：id、名、预览图、默认 scale、是否可换色
2. 编辑器左侧/底部 **工具架（Tray）**  
   - 分类：Pins · Clips · Tape · Notes  
   - 拖到画布生成 object
3. 装饰 object 可独立移动/旋转/缩放/删除
4. 钉子可「装饰性」叠在照片角上（先不做真正物理吸附）
5. 资源：SVG 优先（清晰、可 recolor）

**完成定义**：可在照片旁钉 2 颗钉、夹一个木夹、贴一段胶带，布局可保存。

---

### Phase 4 — 用户上传任意图贴墙（约 1–2 周）

**目标**：不只 admin；「上传 → 选相纸 → 贴上 board」。

**做什么**

1. Public 或好友入口：`Add to board`（需权限，见 Phase 6）  
   - 短期：仍限 admin / 登录  
   - 中期：capability token「可往 board 贴图」
2. 上传流复用现有 staging + 出图；写入 `wall_photos` 并创建 canvas object
3. 上传后向导：选 frame → 可写 caption → 放到画布中心可拖
4. 透明 PNG 可标为 **sticker** kind（当装饰而不是相纸）

**完成定义**：上传一张日常照，选无边框或拍立得，拖到满意位置并保存。

---

### Phase 5 — 便签 + 自定义贴纸包（约 1–2 周）

**目标**：board 更「生活化」，不只有照片。

1. **Sticky notes**：双击编辑文字、颜色、字号；手写字体选项  
2. **用户贴纸**：上传小图进「我的贴纸」库，可反复拖用  
3. 简单 z-order 管理（置于顶层 / 底层）  
4. （可选）许可证牌、冰箱贴等主题包

**完成定义**：一页 board 上同时有照片 + 便签 + 贴纸，不乱、可管。

---

### Phase 6 — 分享与协作（约 2–3 周）

**目标**：把「我的 board 样子」发给朋友；可选一起摆。

1. **只读分享链接**：`/board/:slug` 或 home 带 layout 版本  
2. **角色**（对齐 trip collab 思路，独立 capability）  
   - view  
   - decorate（只能动自己贴的）  
   - edit（移动全部）  
   - admin  
3. 冲突：最后写入 / 或对象级 lock（先简单）  
4. 不做完整 realtime 也可：保存后 refresh 同步

**完成定义**：朋友打开链接看到同一块板；有 edit token 的人能拖动物件。

---

### Phase 7 — 表面与氛围（可选，穿插）

- 换 board 材质：软木 / 冰箱门 / 金属 / 木墙  
- 自定义背景图  
- 环境光、阴影随 rotate 微调  
- 导出整板长图（分享到聊天）

---

## 6. 建议实施顺序（一张图）

```
Phase 0  收口 board photos
    ↓
Phase 1  相纸皮肤（polaroid / 无边框 / 细白边）
    ↓
Phase 2  自由画布 + 持久化布局   ← 体验质变
    ↓
Phase 3  装饰目录（钉 / 夹 / 胶带）
    ↓
Phase 4  上传即贴墙（权限可控）
    ↓
Phase 5  便签 + 自定义贴纸
    ↓
Phase 6  分享链接 + 协作角色
    ↓
Phase 7  材质 / 导出 / 氛围
```

**刻意后置**

| 后置 | 原因 |
|------|------|
| 完整 free-canvas 含 trip 卡片 | trip 仍是导航入口，先别和装饰混成一团 |
| 实时多人光标 | 复杂度高，小圈子非刚需 |
| 3D / WebGL 板 | 2D DOM 足够 |
| AI 自动排版 | 可作彩蛋，不挡主路径 |
| 商用素材市场 | 先内置包 + 用户上传 |

---

## 7. 里程碑与验收

| 里程碑 | 用户可感知的结果 |
|--------|------------------|
| M1 相纸 | 「这张用拍立得，那张无边框」 |
| M2 画布 | 「我想把合照放大歪一点钉在左上」 |
| M3 装饰 | 「夹子和钉子我自己挑」 |
| M4 自助贴图 | 「随手拍的也能贴上去」 |
| M5 生活感 | 「便签写下次去哪」 |
| M6 分享 | 「把这块板发给朋友看 / 一起摆」 |

---

## 8. UX 草图（编辑态）

```
┌─────────────────────────────────────────────┐
│  [浏览] [编辑]     撤销  重做  重置布局  保存  │
├──────────┬──────────────────────────────────┤
│ 工具架    │         Cork surface             │
│ · 相纸    │    ╭─polaroid─╮    📎 clip       │
│ · 钉子    │    │  photo   │      📌         │
│ · 夹子    │    │          │                 │
│ · 胶带    │    │ Our crew │   [trip cards…] │
│ · 便签    │    ╰──────────╯                 │
│ · 上传    │                                 │
└──────────┴──────────────────────────────────┘
```

- **浏览**：现在的沉浸感，轻交互（放大照片）  
- **编辑**：工具架 + 选中手柄；admin 默认可进，朋友按 token  

---

## 9. 工程切片建议（Phase 2 开工时）

1. `wall_objects` 表 + 读写 API（admin only）  
2. `BoardCanvas` 组件：只渲染 objects，transform 用 CSS  
3. `BoardEditor` 叠交互层（dnd-kit 或 pointer 自研）  
4. 保留现有 `PolaroidWall` 网格路径作为 `layoutMode: "auto" | "canvas"`  
5. Feature flag：`BOARD_CANVAS=1` 便于渐进放量  

---

## 10. 风险

| 风险 | 缓解 |
|------|------|
| 移动端难精调 | 编辑主桌面；手机以浏览 + 简单移动为主 |
| 布局在不同屏错位 | 相对坐标 + 固定逻辑画布宽高比 |
| 对象太多卡顿 | 上限（如 40 objects）；大图用已有 thumb |
| 和 trip 墙信息架构打架 | Trip 卡片分区或折叠「旅程区」 |
| 权限过早做大 | Phase 4 前只 admin 写 |

---

## 11. 近期推荐（你要「架子 + 相纸 + 装饰」时）

若资源有限，**最小有爽感路径**：

1. **Phase 1** 三种相纸（尤其拍立得可写字白边）— 1 周级  
2. **Phase 2** 仅 board photos 自由拖转缩放 — 2 周级  
3. **Phase 3** 内置 6–8 个钉/夹 — 1 周级  

三步做完，已经接近你描述的「自己组合喜欢的夹子、钉子、装饰」；上传与协作可下一波。

---

## 12. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-28 | `FUTURE-WALL.md` 愿景速记 |
| 2026-07-29 | 本路线图：相纸 / 装饰 / 画布分阶段；对齐已上线 board photos |
