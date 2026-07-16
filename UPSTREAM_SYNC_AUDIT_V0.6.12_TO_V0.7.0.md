# 上游更新审核清单：v0.6.12 -> v0.7.0

来源：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
上游正式版：[v0.7.0](https://github.com/CookSleep/gpt_image_playground/releases/tag/v0.7.0)
本地基线：`package.json`、`package-lock.json` 均为 `0.6.12`
范围：[`v0.6.12...v0.7.0`](https://github.com/CookSleep/gpt_image_playground/compare/v0.6.12...v0.7.0)
原始提交数：6
当前审核条目：6
核验日期：2026-07-16

说明：沿用原审核文档的规则；排除 Agent、Responses API、fal.ai、赞助及无关外链，只手工摘取适用于当前 Images API 画廊的改动。“建议处理”是初步技术判断，“人工审核”栏留空，由人工决定是否实施。

| 序号 | 提交 | 日期 | 建议处理 | 这一条更新了什么 | 人工审核 |
| --- | --- | --- | --- | --- | --- |
| 1 | [`b877f81`](https://github.com/CookSleep/gpt_image_playground/commit/b877f817cfb026fe074784b6085a676e9c6d8345) | 2026-07-03 | 按规则排除 | 仅更新 README，在赞助服务商表格中新增“随想AI中转站”及其外链。 | 排除 |
| 2 | [`7b22edc`](https://github.com/CookSleep/gpt_image_playground/commit/7b22edc081f5f263f810f9be4458d9a89d1dbc26) | 2026-07-04 | 按规则排除 | 仅更新 README，在赞助服务商表格中新增“合租巴士”、注册链接及推广内容。 | 排除 |
| 3 | [`60da4a9`](https://github.com/CookSleep/gpt_image_playground/commit/60da4a92b39ef99155e9e19839d11a9696edf5fb) | 2026-07-05 | 按规则排除 | 仅调整 README 中赞助服务商“随想AI”的名称和宣传文案。 | 排除 |
| 4 | [`310f0d4`](https://github.com/CookSleep/gpt_image_playground/commit/310f0d4f36a344bfc03232137be79a9975f3399f) | 2026-07-13 | 部分可审核 | 发布 v0.6.13：长提示词出现滚动时提供展开/恢复按钮，展开区域适配顶栏和移动端布局；统一清空、展开按钮提示；允许通用下拉框关闭当前值提示，并在输入参数区减少重复提示；同时更新版本号和 Release 文档。 | 拉取通用修复、更新，排除文档等无关更新 |
| 5 | [`fea5ca3`](https://github.com/CookSleep/gpt_image_playground/commit/fea5ca360ac7ed89a42f556710cc8402d0d65a72) | 2026-07-14 | 部分可审核 | 为大体积备份增加多 ZIP 分片导出和乱序分片导入、分片完整性及文件项校验；ZIP 压缩/解压改为异步；导入导出期间锁定设置窗口，并在运行中或等待恢复的任务存在时阻止任务数据迁移；同时调整数据管理区复选框、说明文字和危险按钮样式。提交混有 Agent 对话和 fal.ai 恢复状态处理。 | 拉取通用修复、更新，排除agent、赞助网址、文档等无关更新 |
| 6 | [`31de601`](https://github.com/CookSleep/gpt_image_playground/commit/31de6011888b7e5efc9ae94564e37b7e7be9378c) | 2026-07-14 | 条件性审核 | 发布 v0.7.0，仅将 `package.json`、`package-lock.json` 版本从 0.6.13 提升到 0.7.0，并用大备份分片功能重写 Release 说明；应在选定功能完成移植后再决定当前项目版本号，不能单独合入。 | 功能完成后，提升版本号 |

## 对照结论

1. 当前项目版本已核实为 `0.6.12`，上游最新正式版本已核实为 `v0.7.0`；本轮范围内共有 6 条提交。
2. 当前项目尚未包含 `310f0d4` 的长提示词展开功能，也尚未包含 `fea5ca3` 的大备份分片和数据迁移锁定功能。
3. `v0.7.0` 之后到核验时的上游 `main` 还有 3 条提交，全部只修改 README，没有额外未发布代码需要纳入本轮人工审核。

## 实施注意

1. `b877f81`、`7b22edc`、`60da4a9` 只有赞助内容和外链，按现有规则整体排除。
2. `310f0d4` 不能直接 cherry-pick。当前项目的 `InputBar.tsx` 和 `Select.tsx` 已与上游分化，且没有上游的 `src/components/input/inputParamsPanel.tsx`；如通过审核，应手工移植输入框展开状态、顶栏高度监听、展开/恢复控件和必要的下拉提示开关，继续排除无关路径。
3. `fea5ca3` 不能直接 cherry-pick。当前项目仍在 `store.ts` 内直接使用同步 `zipSync`/`unzipSync`，没有上游的 `exportZip.ts`、`dataOperations.ts` 和 `Checkbox.tsx`；如通过审核，应按当前结构手工移植，并补齐分片规划、全部分片预校验、异步 ZIP、运行任务保护及多文件导入测试。
4. 移植 `fea5ca3` 时只保留 Images API 任务和图片数据，排除 Agent 对话逻辑；保留当前项目的 `cctq-image` 导出文件名前缀。上游实现的单个 ZIP 硬上限为 2 GiB，默认目标分片大小为 256 MiB，实施时应连同边界测试一起审核，不能只复制 UI。
5. `31de601` 不代表功能本身。只有在人工选定的功能已实施并验证后，才决定是否把当前项目版本提升到 `0.7.0`；上游 `RELEASE.md` 不直接合入。
