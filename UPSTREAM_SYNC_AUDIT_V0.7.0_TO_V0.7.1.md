# 上游更新审核清单：v0.7.0 -> v0.7.1

来源：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
上游正式版：[v0.7.1](https://github.com/CookSleep/gpt_image_playground/releases/tag/v0.7.1)
本地基线：`package.json`、`package-lock.json` 均为 `0.7.0`，当前 `main` 为 `bbdfef9`
范围：[`v0.7.0...v0.7.1`](https://github.com/CookSleep/gpt_image_playground/compare/v0.7.0...v0.7.1)
原始提交数：55
当前审核条目：55
上游文件变更：63 个文件，新增 9,760 行，删除 3,556 行
核验日期：2026-07-24

说明：沿用原审核文档的规则；排除 Agent、Responses API、fal.ai、上游收藏夹、赞助及无关外链，只手工摘取适用于当前 Images API 画廊的改动。当前项目不是上游 `v0.7.0` 的直接后代，且已对 `store.ts`、`InputBar.tsx`、`SettingsModal.tsx` 等核心文件进行深度裁剪，因此本轮不得整版 merge 或批量 cherry-pick。重构类提交应参考上游模块边界，将当前项目已有逻辑做等价提取，保持 Zustand 状态字段、localStorage 键、IndexedDB 表结构和备份格式兼容。

上游历史中同时包含功能提交和将功能分支并回主线的 merge 提交。表中完整保留 55 条记录，但 merge 提交只用于追踪来源，不得在对应功能提交之外重复实施。

| 序号 | 提交 | 日期 | 建议处理 | 这一条更新了什么 | 人工审核 |
| --- | --- | --- | --- | --- | --- |
| 1 | [`002243f`](https://github.com/CookSleep/gpt_image_playground/commit/002243f) | 2026-07-14 | 按规则排除 | 从 Agent 工作区提取助手输出块、工具状态和图片任务排列逻辑；完全依赖 Agent/Responses 数据结构。 | 已审核：按建议排除 |
| 2 | [`dfecfa5`](https://github.com/CookSleep/gpt_image_playground/commit/dfecfa5) | 2026-07-14 | 部分可审核 | 提取通用 Server-Sent Events 解析器，并让 Agent API 与 Images API 共享。当前项目只应移植 Images API 可复用部分及对应测试。 | 已审核，不适用：本地 Images API 明确使用非流式 `b64_json`，现有测试锁定请求体不含 `stream`，不存在可替换的 SSE 消费端；不新增无人调用的解析模块。 |
| 3 | [`5a3077e`](https://github.com/CookSleep/gpt_image_playground/commit/5a3077e) | 2026-07-14 | 谨慎审核 | 将 `contentEditable` 的光标、选区、提及标签和纯文本转换逻辑从 `InputBar` 提取为独立适配器。当前实现比上游精简，应先等价提取本地逻辑，再按需吸收增强。 | 已合入：新增本地精简 `contentEditableMentions.ts`，提取光标读取/设置、提及 HTML 生成和 DOM 纯文本读取；`InputBar` 保持现有 `@图N` 语义。新增 1 项安全转义测试，全量 115 项测试及构建通过。 |
| 4 | [`e9c5a0b`](https://github.com/CookSleep/gpt_image_playground/commit/e9c5a0b) | 2026-07-14 | 可审核 | 将原图 LRU、缩略图缓存、后台补全、并发控制和订阅通知从 `store.ts` 提取为 `imageCache.ts`。本地存在同源实现，适合行为不变地迁移。 | 已合入：等价提取本地缓存逻辑至 `src/lib/imageCache.ts`，组件改为直接依赖新模块，保留 `store.ts` 兼容导出；新增 5 项缓存测试，全量 101 项测试及构建通过。 |
| 5 | [`74d9167`](https://github.com/CookSleep/gpt_image_playground/commit/74d9167) | 2026-07-14 | 部分可审核 | 拆分设置弹窗，将自定义服务商、配置导入 URL、ZIP 下载途径等独立为子组件；Agent 设置及当前项目已删除的通用设置页结构不得恢复。 | 已合入：提取自定义服务商与 ZIP 下载途径子弹窗，并将配置导入 URL 拼装提取为纯辅助模块；未恢复 Agent 或通用设置页。新增 3 项 URL 测试，全量 107 项测试及构建通过，桌面和 390px 移动端无溢出。 |
| 6 | [`f8d8715`](https://github.com/CookSleep/gpt_image_playground/commit/f8d8715) | 2026-07-14 | 不单独移植 | 将设置弹窗拆分分支合并回主线；对应内容由第 5 条审核，避免重复实施。 | 已审核：仅作合并来源记录，不单独移植 |
| 7 | [`6499825`](https://github.com/CookSleep/gpt_image_playground/commit/6499825) | 2026-07-14 | 不单独移植 | 将共享 API 流解析分支合并回主线；对应内容由第 2 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 8 | [`dace8a1`](https://github.com/CookSleep/gpt_image_playground/commit/dace8a1) | 2026-07-14 | 不单独移植 | 将 Agent 助手输出块分支合并回主线；对应内容已按第 1 条排除。 | 已审核：仅作合并来源记录，不单独移植 |
| 9 | [`69dadb0`](https://github.com/CookSleep/gpt_image_playground/commit/69dadb0) | 2026-07-14 | 不单独移植 | 将提示词编辑适配器分支合并回主线；对应内容由第 3 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 10 | [`45e4f1a`](https://github.com/CookSleep/gpt_image_playground/commit/45e4f1a) | 2026-07-14 | 不单独移植 | 将图片缓存模块分支合并回主线；对应内容由第 4 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 11 | [`ba151a8`](https://github.com/CookSleep/gpt_image_playground/commit/ba151a8) | 2026-07-14 | 按规则排除 | 提取 Agent 对话分支、轮次、消息路径和搜索文本等状态逻辑。 | 已审核：按建议排除 |
| 12 | [`d750f5c`](https://github.com/CookSleep/gpt_image_playground/commit/d750f5c) | 2026-07-14 | 不单独移植 | 将 Agent 对话状态分支合并回主线；对应内容已按第 11 条排除。 | 已审核：仅作合并来源记录，不单独移植 |
| 13 | [`5fa5651`](https://github.com/CookSleep/gpt_image_playground/commit/5fa5651) | 2026-07-14 | 部分可审核 | 统一任务、Agent 轮次和关联图片的删除流程，并补异步测试。当前项目只可重写画廊任务及图片清理部分。 | 已合入本地画廊部分：单删/批删统一走 `removeTasks`，同步清理选择、详情、孤立图片、缓存及 Lightbox；Agent 轮次不适用。 |
| 14 | [`2062936`](https://github.com/CookSleep/gpt_image_playground/commit/2062936) | 2026-07-14 | 部分可审核 | 修复删除任务期间状态变化造成的竞争条件。应按当前 Images API 与自定义异步任务模型重新实现并补并发测试。 | 已合入：删除先以函数式状态更新移除目标，持久化等待期间的新建/更新任务不会被旧快照覆盖；Images API 与自定义恢复的迟到输出会回收，不会复活已删任务。 |
| 15 | [`9beb089`](https://github.com/CookSleep/gpt_image_playground/commit/9beb089) | 2026-07-14 | 部分可审核 | 完善删除后任务、图片及持久化数据清理。只保留当前项目真实存在的数据关系。 | 已合入：删除时停止 FAL、自定义异步及 OpenAI 看门狗计时器；图片清理按最新引用复查，检查/删除窗口新增引用时恢复原图和缩略图。 |
| 16 | [`26d53c8`](https://github.com/CookSleep/gpt_image_playground/commit/26d53c8) | 2026-07-14 | 不单独移植 | 将统一删除流程分支合并回主线；对应内容由第 13～15 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 17 | [`ae9e6d6`](https://github.com/CookSleep/gpt_image_playground/commit/ae9e6d6) | 2026-07-14 | 部分可审核 | 简化设置弹窗局部状态及子弹窗交互。可用于本地 `SettingsModal` 拆分，但需保留当前自定义服务商和即时保存行为。 | 已合入：父组件继续持有草稿、校验与即时保存，子弹窗仅接收状态和回调；`SettingsModal.tsx` 减少约 224 行。 |
| 18 | [`8b12005`](https://github.com/CookSleep/gpt_image_playground/commit/8b12005) | 2026-07-14 | 谨慎审核 | 收紧提及标签的选区、光标边界和异常 DOM 处理，并扩充测试。应在第 3 条完成后按本地交互逐项验证。 | 已审核并按本地模型吸收：光标落入提及 tag 时吸附到边界，提及原文通过 `data-mention-text` 保留，HTML 内容与属性均转义；上游文本提及、跨输入框选区与 Agent 分支不适用，未引入 `jsdom` 依赖。 |
| 19 | [`a17a381`](https://github.com/CookSleep/gpt_image_playground/commit/a17a381) | 2026-07-14 | 部分可审核 | 简化 SSE 与图片缓存工具并增加测试。可跟随第 2、4 条吸收，但不得引入 Agent API。 | 已审核：图片缓存最终版及测试已随第 4 条合入；SSE 因本地 Images API 非流式而不适用，不引入 Agent API。 |
| 20 | [`b78fe14`](https://github.com/CookSleep/gpt_image_playground/commit/b78fe14) | 2026-07-14 | 按规则排除 | 收紧 Agent 对话及输出状态辅助函数。 | 已审核：按建议排除 |
| 21 | [`14353a2`](https://github.com/CookSleep/gpt_image_playground/commit/14353a2) | 2026-07-14 | 部分可审核 | 通过 IndexedDB 事务加强任务删除一致性，并同步处理 Agent 对话。当前项目可借鉴事务设计，但必须按本地任务和图片表重写。 | 已合入本地精简版：`commitTaskDeletion` 在单个 IndexedDB `tasks` 事务中删除去重后的目标 ID，事务失败时回退逐项删除；本地无 Agent 对话表。 |
| 22 | [`b312be9`](https://github.com/CookSleep/gpt_image_playground/commit/b312be9) | 2026-07-14 | 按规则排除 | 保持 Agent 批量工具中已删除图片占位块的输出顺序。 | 已审核：按建议排除 |
| 23 | [`56aa47e`](https://github.com/CookSleep/gpt_image_playground/commit/56aa47e) | 2026-07-14 | 部分可审核 | 让批量删除及清理流程可重复执行，并扩充数据库与状态测试；Agent 批次身份部分排除，通用幂等设计可用于本地。 | 已合入通用幂等设计：重复 ID 去重、不存在 ID 不计数且不显示成功提示；孤图删除与缓存/UI 清理可重复执行，Agent 批次身份不适用。 |
| 24 | [`31a65a7`](https://github.com/CookSleep/gpt_image_playground/commit/31a65a7) | 2026-07-14 | 按规则排除 | 仅更新 README，涉及上游项目说明及外部内容。 | 已审核：按建议排除 |
| 25 | [`81a5df4`](https://github.com/CookSleep/gpt_image_playground/commit/81a5df4) | 2026-07-14 | 按规则排除 | 仅更新 README。 | 已审核：按建议排除 |
| 26 | [`03ab6bb`](https://github.com/CookSleep/gpt_image_playground/commit/03ab6bb) | 2026-07-14 | 按规则排除 | 规范 Agent 批量工具调用中的项目身份，涉及 `agentApi` 和 Agent 批次状态。 | 已审核：按建议排除 |
| 27 | [`1a6ad5e`](https://github.com/CookSleep/gpt_image_playground/commit/1a6ad5e) | 2026-07-14 | 按规则排除 | 迁移旧 Agent 批量任务身份数据。 | 已审核：按建议排除 |
| 28 | [`60271a6`](https://github.com/CookSleep/gpt_image_playground/commit/60271a6) | 2026-07-14 | 不单独移植 | 将设置状态简化分支合并回主线；对应内容由第 17 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 29 | [`417f0ef`](https://github.com/CookSleep/gpt_image_playground/commit/417f0ef) | 2026-07-14 | 不单独移植 | 将 `contentEditable` 覆盖增强分支合并回主线；对应内容由第 18 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 30 | [`cb99e89`](https://github.com/CookSleep/gpt_image_playground/commit/cb99e89) | 2026-07-14 | 不单独移植 | 将流解析和缓存工具简化分支合并回主线；对应内容由第 19 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 31 | [`9178a98`](https://github.com/CookSleep/gpt_image_playground/commit/9178a98) | 2026-07-14 | 不单独移植 | 将 Agent 状态辅助函数分支合并回主线；已按第 20 条排除。 | 已审核：仅作合并来源记录，不单独移植 |
| 32 | [`a213271`](https://github.com/CookSleep/gpt_image_playground/commit/a213271) | 2026-07-14 | 不单独移植 | 将任务删除一致性分支合并回主线；对应内容由第 21、23 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 33 | [`22084f8`](https://github.com/CookSleep/gpt_image_playground/commit/22084f8) | 2026-07-14 | 部分可审核 | 重构 Store 异步测试的隔离方式。可借鉴测试结构，但只能覆盖当前项目保留的画廊和自定义服务商状态。 | 已按现有本地隔离框架吸收：扩展 DB/API mock 与可控 Promise，覆盖画廊任务删除和 Images API 异步状态；未引入 Agent 测试结构或新测试依赖。 |
| 34 | [`ca3701a`](https://github.com/CookSleep/gpt_image_playground/commit/ca3701a) | 2026-07-14 | 部分可审核 | 增加删除事务交错执行测试。仅在实施第 13～15、21、23 条时按本地数据模型重写。 | 已合入本地交错测试：覆盖事务等待期间状态新增/更新、输出落库期间删除、图片检查/删除窗口新增引用。删除组共新增 6 项测试，全量 121 项及构建通过。 |
| 35 | [`3a604f0`](https://github.com/CookSleep/gpt_image_playground/commit/3a604f0) | 2026-07-14 | 不单独移植 | 将 Store 异步测试隔离分支合并回主线；对应内容由第 33、34 条审核。 | 已审核：仅作合并来源记录，不单独移植 |
| 36 | [`9c0466a`](https://github.com/CookSleep/gpt_image_playground/commit/9c0466a) | 2026-07-15 | 按规则排除 | 删除 Agent 输出透传逻辑。 | 已审核：按建议排除 |
| 37 | [`6d5cd2d`](https://github.com/CookSleep/gpt_image_playground/commit/6d5cd2d) | 2026-07-15 | 按规则排除 | 提取 Agent Responses 输出和运行状态模块及测试。 | 已审核：按建议排除 |
| 38 | [`db550ad`](https://github.com/CookSleep/gpt_image_playground/commit/db550ad) | 2026-07-15 | 按规则排除 | 协调 Agent 助手消息删除与关联任务清理。 | 已审核：按建议排除 |
| 39 | [`0ac0f21`](https://github.com/CookSleep/gpt_image_playground/commit/0ac0f21) | 2026-07-15 | 部分可审核 | 提取画廊与 Agent 输入草稿状态。当前项目只保留单一画廊输入，不能照搬；可参考边界提取本地提示词、参考图和遮罩草稿逻辑。 | 已合入本地精简版：新增 `inputDraftState.ts`，提取遮罩主图置首、参考图替换/移除/整体设置与拖动规则；保持现有单画廊输入及 `@图N` 语义，不引入 Agent 草稿。新增 4 项测试。 |
| 40 | [`26cd532`](https://github.com/CookSleep/gpt_image_playground/commit/26cd532) | 2026-07-15 | 按规则排除 | 提取上游收藏夹状态、默认收藏夹迁移及相关组件逻辑；当前项目已删除此功能。 | 已审核：按建议排除 |
| 41 | [`0b2fb2a`](https://github.com/CookSleep/gpt_image_playground/commit/0b2fb2a) | 2026-07-15 | 按规则排除 | 提取 Agent 请求输入构建器及测试。 | 已审核：按建议排除 |
| 42 | [`15a2904`](https://github.com/CookSleep/gpt_image_playground/commit/15a2904) | 2026-07-15 | 谨慎审核 | 提取持久化状态编码、迁移与恢复逻辑；上游模块依赖 Agent、收藏夹和输入草稿。应只参考设计，编写本地精简版并保持 `cctq-image` 存储键和旧数据兼容。 | 已合入本地精简版：新增 `persistedState.ts`，提取编码与恢复；保持 `cctq-image` 键和旧数据兼容，参考图仅持久化 ID，畸形字段按白名单归一化且不能覆盖 Store action。新增 4 项测试，全量 129 项及构建通过。 |
| 43 | [`80d3d2d`](https://github.com/CookSleep/gpt_image_playground/commit/80d3d2d) | 2026-07-15 | 部分可审核 | 提取任务完成、失败、中断、实际参数与提示词映射等状态转换。适合本地重构，但需保留 OpenAI 兼容及自定义服务商逻辑并去除 fal/Agent 分支。 | 已合入：新增本地精简版 `taskState.ts`，提取生命周期 patch、中断恢复、实际参数及提示词映射；保留自定义异步恢复副作用在 `store.ts`。新增 3 项测试，全量 104 项测试及构建通过。 |
| 44 | [`f1fd1ba`](https://github.com/CookSleep/gpt_image_playground/commit/f1fd1ba) | 2026-07-15 | 按规则排除 | 修复 Agent 工作区参考图提示显示。 | 已审核：按建议排除 |
| 45 | [`db5d244`](https://github.com/CookSleep/gpt_image_playground/commit/db5d244) | 2026-07-15 | 按规则排除 | 将 Agent 参考图提示绑定到参考图区域。 | 已审核：按建议排除 |
| 46 | [`a104775`](https://github.com/CookSleep/gpt_image_playground/commit/a104775) | 2026-07-15 | 按规则排除 | 仅更新 README。 | 已审核：按建议排除 |
| 47 | [`7c0d210`](https://github.com/CookSleep/gpt_image_playground/commit/7c0d210) | 2026-07-17 | 按规则排除 | 仅更新 README。 | 已审核：按建议排除 |
| 48 | [`0104f81`](https://github.com/CookSleep/gpt_image_playground/commit/0104f81) | 2026-07-17 | 按规则排除 | 修复上游 Vercel 同步 Release 后的自动部署；当前项目不使用该工作流。 | 已审核：按建议排除 |
| 49 | [`ae8de0f`](https://github.com/CookSleep/gpt_image_playground/commit/ae8de0f) | 2026-07-19 | 按规则排除 | 仅更新 README。 | 已审核：按建议排除 |
| 50 | [`ca5fec9`](https://github.com/CookSleep/gpt_image_playground/commit/ca5fec9) | 2026-07-21 | 可审核 | 参考图点击统一进入大图预览，并在预览中替换图片或进入遮罩编辑；移除旧编辑偏好。需适配本地 `InputBar`、`Lightbox` 和精简设置结构。 | 已合入：所有参考图点击统一进入 `Lightbox`，预览内提供替换图片及添加/编辑遮罩；保留单遮罩限制，替换遮罩主图时清空不再匹配的草稿。新增 2 项 Store 测试，全量 114 项测试及构建通过；自动浏览器回归因本地 Edge 启动失败未完成。 |
| 51 | [`971e444`](https://github.com/CookSleep/gpt_image_playground/commit/971e444) | 2026-07-21 | 可审核 | 支持一次选择多份普通 ZIP 备份并合并导入，同时保持分片备份完整性校验。当前项目已有 v0.7.0 分片基础，可按本地备份格式移植并补测试。 | 已合入：允许多个普通备份一次导入，任务与图片按既有主键语义合并，配置逐份使用现有等价规则去重；分片混选、重复和缺片校验保持不变。新增 2 项测试，全量 109 项测试及构建通过。 |
| 52 | [`34041c9`](https://github.com/CookSleep/gpt_image_playground/commit/34041c9) | 2026-07-21 | 部分可审核 | 优化遮罩编辑器顶部操作区、深色模式和笔刷大小滑杆整区点击/拖动；其中 ZIP 子弹窗的一行样式需随第 5 条决定。 | 已合入：优化顶部操作区与深色态，笔刷滑杆整区支持按压/拖动，ZIP 子弹窗完成按钮同步圆角；新增 3 项滑杆映射测试，全量 114 项测试及构建通过；自动浏览器回归同第 50 条受 Edge 启动失败阻塞。 |
| 53 | [`01c4e93`](https://github.com/CookSleep/gpt_image_playground/commit/01c4e93) | 2026-07-23 | 按规则排除 | 将新建或切换 Responses API 配置时的默认模型更新为 `gpt-5.6-sol`。 | 已审核：按建议排除 |
| 54 | [`95392f5`](https://github.com/CookSleep/gpt_image_playground/commit/95392f5) | 2026-07-23 | 条件性审核 | 发布 v0.7.1，更新版本号和 Release 文档。只能在选定功能、重构和测试完成后更新当前项目版本；上游 Release 文档不合入。 | 已合入本地版本收口：`package.json` 与 `package-lock.json` 根包均更新为 `0.7.1`；上游 Release 文档不合入。最终全量 129 项测试及生产构建通过。 |
| 55 | [`eb91e4f`](https://github.com/CookSleep/gpt_image_playground/commit/eb91e4f) | 2026-07-23 | 不单独移植 | 上游维护者将远端主线合并到发布分支形成的 merge 提交，不包含需要单独移植的功能。 | 已审核：仅作合并来源记录，不单独移植 |

## 模块迁移矩阵

| 模块 | 关联条目 | 本地兼容性 | 建议实施方式 | 主要风险 |
| --- | --- | --- | --- | --- |
| 图片缓存 `imageCache.ts` | 4、19 | 高 | 将本地 `store.ts` 中现有缓存代码等价移动；第一阶段保留从 `store.ts` 重新导出，逐步切换调用方。 | 缓存清理遗漏、缩略图订阅未注销、旧导入流程漏写缓存。 |
| 任务状态 `taskState.ts` | 43 | 高，但需适配 | 提取本地已有的中断、完成/失败、实际参数和图片映射逻辑；不照搬 fal/Agent 分支。 | 自定义异步服务商恢复状态、部分成功任务参数发生回归。 |
| 设置页子组件 | 5、17、52 | 高 | 提取本地自定义服务商、配置导入 URL、ZIP 下载途径三个子弹窗及纯辅助常量；保持当前设置提交语义。 | 子弹窗关闭顺序、滚动锁、草稿与即时保存状态不一致。 |
| 自定义服务商辅助常量 | 5 | 高 | 把默认 JSON、LLM 提示词和表单转换辅助函数移到本地模块。 | 本地仅支持 Images API，不能带回上游 Agent/Responses 模板。 |
| `contentEditable` 适配器 | 3、18 | 中 | 先移动本地两项光标函数并建立回归测试，再评估引入上游完整选区/提及处理。 | 中文输入法、移动端光标、全选复制、`@图N` 标签边界。 |
| SSE 解析器 | 2、19 | 中到高 | 仅抽取 Images API 当前使用的流解析协议，并以现有流式测试固定行为。 | 分块边界、CRLF、多行 data、结束事件及错误事件兼容。 |
| 本地输入草稿模块 | 39 | 中 | 只提取单一画廊的提示词、参考图、遮罩草稿同步，不引入 Agent 会话模型。 | localStorage 恢复和遮罩目标引用丢失。 |
| 本地持久化模块 | 42 | 中，直接照搬为低 | 编写精简版 `persistedState.ts`；保持 Zustand 存储键、字段语义和旧版本恢复路径不变。 | 升级后配置、提示词、参考图或旧数据无法恢复。 |
| 任务删除事务 | 13～15、21、23、33、34 | 中 | 独立阶段按本地 IndexedDB 表和引用关系重写；先补失败注入与事务交错测试。 | 误删仍被引用图片、孤立缩略图、内存状态与数据库不一致。 |
| Agent/Responses 状态模块 | 1、11、20、22、26、27、36～38、41、44、45 | 不适用 | 排除。 | 重新引入已裁剪功能和依赖。 |
| 上游收藏夹状态 | 40 | 不适用 | 排除。 | 恢复已删除 UI 和持久化字段。 |

## 实际实施顺序

1. 已建立 `codex/sync-v0.7.1` 独立分支，并固定 `96` 项测试与生产构建基线。
2. 已分提交完成图片缓存、任务状态、设置页子组件等行为等价提取。
3. 已移植多普通备份合并导入、参考图预览内替换/遮罩编辑和遮罩编辑器交互优化。
4. 已按本地模型完成输入草稿、持久化模块和任务删除事务，并补充相应异步与竞态测试。
5. 已完成精简 `contentEditable` 适配器；SSE 经审核确认本地 Images API 为非流式 `b64_json`，因此不引入无调用方模块。
6. 已将项目版本更新为 `0.7.1`；55 条上游提交均完成人工审核，最终 129 项测试及生产构建通过。

## 兼容性硬约束

1. 不改变 Zustand 持久化键 `cctq-image`，不直接采用上游含 Agent/收藏夹字段的 `persistedState.ts`。
2. 不改变现有 IndexedDB 数据库、对象仓库及备份清单格式，除非先提供向后迁移和回滚测试。
3. 不恢复 Agent、Responses API、fal.ai、上游收藏夹、Vercel 工作流、赞助内容和无关外链。
4. 保留 OpenAI 兼容 Images API、自定义服务商、非流式 `b64_json`、本地代理和现有部署策略；不擅自启用 `stream` 或 `partial_images`。
5. 保留 `cctq-image` 导出命名、当前品牌、公告、尺寸限制及项目已有 UI 定制。
6. 重构提交以“行为等价”为第一目标；性能、状态语义和 UI 变更必须拆成后续独立提交。
7. 每个阶段至少通过 TypeScript/Vite 构建和现有全量测试；新增模块需迁移或补充与其风险相匹配的测试。

## 当前审核结论

1. `v0.7.1` 范围内 55 条提交已全部人工审核：适用部分按本地架构移植，不适用的 Agent、Responses、fal.ai、收藏夹和赞助内容均保持排除。
2. 图片缓存、任务状态、设置子组件、输入草稿、持久化和删除事务已完成本地等价模块化；没有整版 merge 或批量 cherry-pick。
3. 用户可见功能已包含多普通备份合并导入、参考图预览内替换/遮罩编辑和遮罩编辑器交互优化。
4. 项目版本已更新为 `0.7.1`，最终 19 个测试文件共 129 项通过，TypeScript/Vite 生产构建通过。参考图与遮罩的自动浏览器回归仍受本地 Edge 启动失败限制，已在对应条目如实记录。
