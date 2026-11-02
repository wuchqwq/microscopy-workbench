# 阶段一直接交互小修：定向验证记录（2026-11-03）

本记录区分原生操作、受控回归与未实现设计；不代表阶段一整体完成或真实样品验收。

## 版本与范围

- 代码：[PR #94](https://github.com/wuchqwq/microscopy-workbench/pull/94)，准确源码 `191dca8dcb3e0218433031151c230fb282a6a3f6`。
- 对照版本：`78ba035b661540165b29be666824c0ef49d32032`。代码基于尚未合并的 #87，依赖 #83 → #85 → #86 → #87；不能当成 main。
- 本轮核对 main 仍为 `c8e95c38c552995cc24efa5dc9d5459ec80b02c6`；没有据此合并、移动基线或改变保护。
- 生产改动限于 Image Panel 的 TypeScript `.mts` 与 HTML；另有相关测试。没有改变科学算法、provider、Inspector、registry、旧对象或原始数据。
- 保持现有自动重测条件、唯一活动编辑器、草稿/未知请求保护；没有 React 迁移，MIT 许可及 DM-free runtime 保持不变。

## 原版 Windows 原生观察

在独立工作区与公开合成输入上，由 root 使用真实鼠标操作，不控制用户试用会话。

| 路径/现象 | 观察与判定 |
|---|---|
| 两 ROI → FFT → 返回来源并移动 ROI → 第二个 FFT | 两次来源图均正常显示；这条有限路径有原生证据 |
| 用户报告的来源图持续空白/加载中 | **NOT_REPRODUCED**；本次正常显示不能否定原报告，具体原始原因仍未定位 |
| 画框后工具模式 | 原版松手后仍处 ROI 模式，实测保留；不是改后已通过的证据 |
| 选中 ROI 后 Delete | 原版无删除响应，实测保留；随后补焦点限定的删除路径 |

不把原版路径成功解释为所有网络/解码/切窗条件均通过。状态记录及截图只保存在本机，本文不附原图、截图、原始日志、capability 或私人路径。

## 保留的首败与分类

下列为本机证据目录内的相对文件名；受控测试不冒充原生鼠标操作或用户原始故障复现。

| 证据文件 | 原始结果与含义 |
|---|---|
| `asset-first-failure.log` | 3 FAIL：受控保存资产读取/解码/恢复边界 |
| `asset-first-active-failure.log` | 1 FAIL：初次活动原图转只读时缺少底图保留 |
| `roi-hit-first-failures.log` | 3 FAIL：小框中心被误判为缩放，以及原版缺少仅控制点命中的接口；重叠优先级另由实际 handler 回归覆盖 |
| `roi-handlers-first-failures.log` | 6 项中 1 PASS、5 FAIL：直接交互处理路径 |
| `roi-undo-selection-first-failure.log` | 1 FAIL：撤销几何后当前科学选区未同步 |
| `roi-retracted-reselection-original-failure.log` | 1 FAIL：撤回 ROI 仍能从选择入口恢复成当前选区 |
| `roi-property-retraction-first.log` | 1 FAIL：属性设为撤回后仍保留绑定选区 |
| `asset-first-active-infrastructure-failure.log`、`roi-retracted-reselection-first-failure.log` | dist 文件未找到：Copy-Item/构建目录竞争导致的**基础设施失败**，不计产品缺陷 |
| `combined-build-first.log` | 首次整合 TypeScript FAIL：`WindowOptions` 尚缺 `getActiveSavedImage`，及 `AppSelection`/面板联合类型不匹配；原记录保留 |

后续成功不覆盖这些首败；也不把所有失败合并成同一根因。

## 准确小修内容

- 正常 ROI 画完回选择；Delete 仅在画布焦点下作用于明确选中的 ROI，文本/可编辑内容中不触发。临时框可清除并撤销。
- 保存 ROI 的删除通过 `status: retracted` 追加修订，保留稳定身份及历史。下拉项禁用、选择入口及历史选择拒绝撤回标记；Undo 可追加补偿修订。
- 保留可选择的小框中心；已选框的缩放控制点优先于普通叠放命中；Escape 恢复未完成新手势前的选区。撤销几何同步当前 draft，避免下一次 FFT 使用旧坐标。
- 属性手动设为撤回时，清理仍精确绑定该标记的当前选区；晚到回复不能清掉研究者随后创建的不同临时 ROI。旧 FFT 输入与测量记录保留。
- 只读资产 GET 与图像 decode 共用默认 10 秒期限；ticket、窗口/对象/活动状态核对屏蔽晚到回复，取消等待后不自动重放科学请求。
- 精确缓存已解码活动图的原对象身份，同帧回退时明确显示“上一已核对底图，标注待加载”。底图不取得保存资产资格，不借新对象引用生成误配标注或写入相机。
- 超时/失败可从标题栏及窄窗口列表明确“重试只读图像”；仅重读保存资产，不生成预览/FFT。底层只读 RPC **没有被取消**，迟到响应由当前性检查丢弃。

## 定向验证结果

| 阶段 | 结果 | 保留记录 |
|---|---|---|
| 整合编译修正 | build PASS | `combined-build-corrected.log` |
| 第一轮相关 5 文件 | 220 PASS，0 FAIL，0 SKIP | `combined-targeted-first.log` |
| 最终编译 | build PASS | `review-build.log` |
| 最终相关 8 文件 | 275 PASS，0 FAIL，0 SKIP | `review-targeted.log` |

两轮测试有重叠，**不能相加为 495 项独立通过**。本地验证使用正式构建与受影响 Node/UI 状态测试，未重复 FFT/GPA/拓扑/晶体模拟/完整噪声矩阵；托管 CI 按既有范围规则执行。
准确提交的托管 CI：[41535541506](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41535541506) 与 [41535541421](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41535541421)，共 17＋3 作业 SUCCESS；CI scope gate job `125589772093`、F3b scope gate job `125588153955` 均通过，保护未放宽。

## 改后 Windows 原生组合验证（准确提交 191dca8）

root 在准确提交 `191dca8` 上实际操作；以下只覆盖已执行手势。前三份 ROI 状态由独立只读脚本交叉核对，FFT/重开另有 root 正式 MCP 与对象核查；不把读取当作鼠标操作。

| 实际操作 | 观察与落盘证据 |
|---|---|
| R 画 ROI1，再 R 画重叠 ROI2 | 两次松手均回 Select；这是 root 原生界面观察 |
| 画布焦点 Delete 删除 ROI2 | `fixed-after-delete.state.json`：ROI2=`retracted`，selection 与 edit_state.selection 均 null；ROI1 保留 |
| Ctrl+Z 撤销删除、点击重叠区选 ROI2 | 原生成功；保存对象父链恢复相同 ROI2 ID 和原坐标，没有新造身份 |
| 拖 ROI2 内部移动，再一次 Ctrl+Z | `fixed-moved-roi2.state.json`：两端同量平移约 `[2.856213,1.713728]` 源像素；撤销对象恢复原坐标，ROI1 未动 |
| 选 ROI1 后拖 E 控制点，该点同时落在 ROI2 内部 | `fixed-resized-roi1.state.json`：仅 ROI1 右边界 `58.287556885 → 61.715012294`；左/上/下边界与 ROI2 坐标均不变，draft 与 anchor 一致 |
| 空 ROI 理由文本框焦点下按 Delete | root 核对 AX 无变化、未删 ROI；不把空文本当成必须有字符删除 |
| FFT1 上 P 建候选 → 测量 → V 拖峰 | 生成 M1 后自动追加 M2；两次测量均可读，旧记录未替换；`fixed-after-measure.state.json`、`fixed-after-auto-remeasure.state.json` |
| P3 返回来源，Select 空白拖临时 ROI → Delete → Ctrl+Z → 直接 FFT2 | 返回对应 ROI；Delete 仅清临时框，Undo 恢复浮点选区；未保存理由，也未新增观察（仍 2 个保存 ROI） |
| 打开帮助 → Escape | `fixed-before-help-and-reopen.state.json` 与 `fixed-after-help.state.json` 的 object/selection/edit/op/collection/revision 深比较相同 |
| 正常关闭 → 同工作区重开 | 首次退出码 0；generation 2 恢复当前 FFT2、3 个窗口、准确对象/浮点引用、布局与相机；`fixed-cold-on-fft.state.json` |
| 重开后 P3 返回、正式 MCP 读回 | 恢复原临时浮点 ROI，未冒称保存观察；FFT 和来源各 `image_panel_current` 返回 1 PNG 与 validated 多 ROI packet；image_info 可读 M1/M2/两个原 FFT |

稳定身份：ROI1=`mark-a3704d48e64c424ca5998009`，ROI2=`mark-8fa46027af694dd1937fd33e`。显示小数仅作摘要，完整浮点坐标留在原对象。
本机 `verify-fixed-native-snapshots.mjs` 只读三份状态及相关不可变对象：身份/父链、几何、清洁状态和 7 个声明资产哈希核对 PASS；不调用 helper、服务或浏览器。
脚本初稿曾因额外假设 CSS 的 x/y 映射严格等比例而失败；该假设不属于保存合同，已移除，仅比较实际科学锚点，不改变科学算法或容差。该脚本本身不证明鼠标/AX或原始数组前后对比。
M1=`2a61cf7bef26436c92688d1a36d737a0`，M2=`5a569921f3c54da1a1f8f0ac9da4a882`；周期约 `6.6345522921 → 8.0567460930 px`。这是故意移动候选后的几何变化，**不是峰准确性或材料应变验证**。
临时输入精确为 `[101.13074949927966,76.94816605457673,118.26802654491938,88.37301845567384]`；FFT2 整数处理范围 `[101,76,119,89]`，FFT1 为 `[15,16,62,57]`，两者不混同原浮点来源。
冷恢复 collection revision 从 29 到 30 是重新核对元数据的计数推进。初稿误要求计数相等的断言失败保留于 `cold-comparison-initial-failure.md`；按对象/选区/窗口/相机/来源等语义比较后 `cold-comparison.json` PASS，不计科学缺陷。
`final-science-boundary-verification.json` PASS：旧 M1 的点/网格/周期与此前相同；M2 所记前测量 manifest SHA 匹配 M1 实际文件；原始源/帧与原 FFT 网格哈希保留，两个 FFT 的原始浮点输入准确。
最终来源对象为 `476ef8ea6a314ac6a2ebd0f558d38e37`，2 个保存 ROI 加独立临时选区；`fixed-cold-return-spatial.state.json`、`fixed-final-spatial.state.json` 可核对。最终 Chrome error/warn 均为空，generation 2 controller 也正常退出 0；用户试用页面未触碰。
受控 GET/decode 期限、回复竞争和状态注入的 PASS 不能单独证明原用户空白故障已复现或消失。

## 启动与现有恢复方式

以下在准确源码的独立 checkout 中执行；替换引号内占位符。需要当前支持的 Node/npm 与明确的独立 Python 科学环境，不是安装包资格。

```powershell
npm ci
npm run build
npm run inspect -- --source "<公开图像绝对路径>" --workspace "<独立工作区绝对路径>" --python "<Python绝对路径>"
# 停止当前 Inspector 后，以同一工作区/同一 Python 重新打开：
npm run inspect -- --workspace "<同一工作区绝对路径>" --python "<同一Python绝对路径>"
```

当前恢复沿用经验证的 checkpoint 与原请求查询，不是新显式保存点；异常/未知请求读取原 ID，不自动重做。中文“使用说明”可打开并用 Escape 关闭。本轮正常关闭通过受控 Inspector.close 执行；生产启动器 Ctrl+C 资格仍未测试，独立 #84 尚未集成。

## 保存合同与遗留边界

[PR #93 保存合同](../DESKTOP_INTERACTION_SAVE_CONTRACT.md)的核心三项已确认：分析工作区整体保存；显示配方/标注样式/ROI 理由/采用结果纳入保存、相机布局偏好分离；保留当前自动重测。
**生产显式保存生命周期仍 NOT_IMPLEMENTED**；“保存 A → 编辑 B → FFT(B) → 不保存 → 重开 A、B 执行历史保留且不自动采用”仍 **NOT_TESTED**，不得因设计批准标为 PASS。
现有恢复 checkpoint 不等于显式保存点；多窗 working ownership、保存中编辑竞争、丢弃标记与迁移仍待后续实现和审查。
**NOT_TESTED / 未完成**：用户原空白触发条件；受控超时的真实浏览器手势；全部 8 控制点/极小框的全面易用性；保存生命周期 A/B；其他平台、真实样品、完整 GUI；#91 桌面/headless CLI 与 #92 干净安装。
本轮不宣称独立桌面、headless 分析 CLI、干净 Windows 安装、全部 GUI、长期易用性或真实材料准确性完成。私有实验数据仍须另行授权。
