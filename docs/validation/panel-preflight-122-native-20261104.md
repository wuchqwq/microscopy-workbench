# #122 修复、#121 B 设计与轻量原生闭环

## 精确版本与交付

- 实际执行的功能源码：`f2ff30b201758ba711150a899a213d45ffdb76a7`，[PR #125](https://github.com/wuchqwq/microscopy-workbench/pull/125)，基于 #124 的 `34bedbd82f614243e7274ee4cd75ad1e5dc08e97`。本报告只追加证据，不改变这些运行时代码。
- 用户选择 #121 **B：先设计持久来源证明**。设计为 `0dea4050f498e0367b2957dda00c685680fd6082`，[PR #126](https://github.com/wuchqwq/microscopy-workbench/pull/126)，也是基于 #124 的独立文档分支。没有发证、存储、CLI 资格升级或新的科学功能实现；深历史限制仍未消除。
- 开始核对的实时 main 为 `dd9b706786041c6c0a6678ff6cd4dd84dbe06a3e`。#123/#124 尚未合并，本轮继续其完整父链；不把旧 main 当功能候选。未合并、移动稳定基线或更改门禁。

#125 的实现、范围和首败见[定向回归记录](panel-preflight-122-20261104.md)。独立子代理只读复核精确源码后未发现阻断；没有为复核重复执行已通过的测试。

## 原生流程：实际执行

操作者为按用户指定的 `gpt-6.1-terra` 子代理，使用官方 computer-use／Sky，动作基于新观察的真实窗口；不是 DOM 替身或协议注入，也不是用户本人的易用性审查。

公开合成源图：`public-image-first-116.tiff`，256×256；SHA-256 `408e2d2ce55e065cb52fcb4a461620058d634206cad697af6303cf20bdd71f04`。独立工作区：`F:/mircograph-workbench/preflight-lineage-evidence-20261104/native-workspace`。没有使用私人金刚石／石墨样品。

首次启动使用生产 `desktop_main.mjs`、普通 Node `v24.16.0`、已有锁定 Electron 和指定 Python。唯一目标 PID 1776／HWND 4985212，截图逻辑尺寸 1429×907。旧失败窗口 PID 12292／HWND 14749978 未操作。

| 步骤 | 实际结果与边界 |
| --- | --- |
| 两个部分重叠 ROI | 两框记录并读回；ROI 1 整数支持 `[30,32,135,138]`，ROI 2 `[94,87,205,198]`。分别选中。 |
| 各 FFT 一次 | 先 ROI 2→FFT 1，再 ROI 1→FFT 2。两次均有原请求、冻结输入和已完成对象；没有再计算 FFT。 |
| 对照 | “平铺并适应全部”显示空间图及 FFT 1/2；FFT 属性显示原输入。图上浮点 ROI 与整数支持有区别。标签仍有拥挤，未宣称全尺寸可读性问题全部关闭。 |
| 测峰与拖峰重测 | FFT 2 的 g1 首测后小幅拖动，既有自动重测生成新测量；界面显示 1/2，新旧保留。没有独立拖前哈希快照，不能把后读原 journal 说成拖前独立取证。 |
| 回空间、移动 ROI | 最新工作图 ROI 1 移到支持 `[35,36,140,141]`；再从 FFT 2 返回准确历史输入，仍为旧 `[30,32,135,138]`。已有 FFT 不重算、不迁移到新 ROI。 |
| 明确保存 | Ctrl+S 显示“分析工作区已保存并读回”，形成下述保存点。 |
| #122 历史编辑拒绝 | 历史 ROI 1 名称加 `-history-test` 后明确应用一次；出现“本批标注在派发前被拒绝，未派发科学请求；本地草稿保留”，字段保留。不是科学 unknown。当前界面未见原请求查询按钮，因此原生点击查询为 NOT_TESTED；实际 app-handler 回归覆盖其不误查旧 return。 |
| 不保存退出 | Alt+F4 弹三选项，明确说明已执行科学记录保留；只点一次“不保存”。13 秒观察时窗口仍在，操作者停下并保留原 `FIRST FAIL / unresolved` 标注。之后同一原操作完成，进程消失；后台 normal_closed=true、恢复副本 unavailable，工作内容回保存基线。没有重发或强杀。复核归类为延迟关闭，不能据首次未确认断言关闭程序故障；没有准确总点击耗时。 |
| 正常重开 | 同源码、不传 source，读取原保存版；界面显示已保存，ROI 名称无临时后缀，原 FFT 2 与重测数值仍可看。未再计算或测量。 |
| 窄窗关键入口 | 仅任务专用 main 副本调整窗口构造及一次尺寸补偿，renderer/preload/CSP/provider/menu 不变；实际内容 **761×801**，不冒充精确 760×800 原生。窗口菜单、属性叉、F1／Esc 帮助可达。 |
| 最后关闭 | 窄窗 Alt+F4 一次，后续 Sky 不再列出窗口；后台正常关闭。 |

窄窗重开目标为 PID 4496／HWND 46404176。初始 ROI 关联读回出现 `Panel changed while reading ROI handoff`；操作者没有重放科学请求。是否自动收敛、是否需显式重读未完成验收；此项保持待查，不能据可查看 FFT 宣称所有关联恢复通过。窄窗计数文字有截断，源图标签拥挤也保留为可读性限制，不在本轮追加整体布局修改。

g1 界面条件性结果从 `15.78027 px`／`0.06337026 cycles/pixel` 变为 `10.81124 px`／`0.09249629 cycles/pixel`。XY 物理标定未知；这些只证明手动选点与修订接续，没有验收峰准确性、应变、晶向或物相解释。

## 根代理的只读独立核对

正常保存点为 `save-e519d993-97ed-40d3-8556-898309658594`，revision 1，manifest SHA-256 `5f90ba836e665f1ff2935cd13084966ffa7dda5a52aebc87d972a43d438192fb`。拒绝后、NoSave 后及重开后指针和保存点文件哈希相同，保存点不含临时后缀，最终 working 内容哈希等于 base，normal_closed=true、recovery.available=false。

| 对象 | 原请求／来源 |
| --- | --- |
| FFT 1 `0e765fd331e349a58286442f684c6379` | `panel-5c8717c4699bfe97f2b6656d2f800d01-3`；原 ROI 2；completed、冻结输入 validated。 |
| FFT 2 `6704bb5d9517437c9d0b1b2b620bd100` | `panel-e0721fc75da87ed6a86e754c76753156-4`；原 ROI 1；completed、冻结输入 validated。 |
| 原测量 `262d93dd9672471c910dafb7916b5630` | 正式 reader 返回 historical，原 journal/manifest/payload 资格仍通过。 |
| 新测量 `8fb09cf2c42f44b3bf252ed0ba28ef79` | current、same_grid/same_frame=true；previous_measurement_object_id 精确指向原测量，当前标注匹配。 |

两 FFT 冻结源视图均为 `cb9161768d994cf7af323943e85ed802`；ROI 1 后移的新视图 `fb40dff601ae45b2a416e6d9dc766901` 保持同一标注身份，旧视图仍保留原浮点几何。`listPanelExecutionInputs` 和 `readImageMeasurements` 是正式只读 reader 核对，不冒充原生输入或新科学准确性测试。

本轮只有 **2 个 raw FFT／2 个完成 FFT 请求／2 个测量对象**；临时拒绝名称未出现在任何科学请求参数中。全部实际 payload 哈希符合原 manifest。最早文件快照实际取于两次 FFT 之后（23 个科学文件），不是计算前基线；后续 36 个文件中，原 23 个均未变化。拖峰后／拒绝后／最终重开快照均已保存，后两阶段文件集合相同，没有额外应用名称或重算。

上一轮原生旧工作区 37 个科学文件、本轮未动的长链原 244 个科学文件也重新对账，全部不变；旧长链总数仍 248、原源图 hash 不变。没有因修复覆盖旧失败现场。

## CI、失败与未测范围

#125 精确 `f2ff30b` 的 [Node/provider CI](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41768773167) 和 [F3b CI](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41768773298) 通过。#126 精确 `0dea405` 的[文档 scope CI](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41768833376) 和 [F3b gate](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41768833410) 通过。托管 CI 按仓库规则运行；本地未手动重复科学算法套件。

保留全部首次 Node／Panel／恢复与编译失败，见父提交报告；本报告不相加重叠测试数量。原生 13 秒未确认原文及后续延迟完成并存。本地只读核对脚本另有一次 Windows ESM 路径格式错误，改用 pathToFileURL 后成功，属于证据工具错误，未执行科学操作。

**NOT_TESTED／待查：** 原生点击“查询原请求”；精确 760×800 与其它 DPI；重开关联拒绝提示的最终收敛；标签拥挤／计数截断；原持续全空白的同一现场；#121 持久来源证明实现、旧 unavailable 自动复用与长链完整资格；真实样品科学准确性、真人易用性、阶段三安装升级。没有新增算法、安装发行或 Agent 调度，也没有宣称完整 GUI／真实样品验收通过。

## 证据与启动恢复

本地证据根 `F:/mircograph-workbench/preflight-lineage-evidence-20261104`：`native-final-operator.md`、`native-reopen-operator.md`、`native-final-reconciliation.json`、各阶段 `native-snapshot-*.json`、`prior-workspaces-unchanged.json` 和首败日志。未上传截图或私人文件。

在包含 #125 的候选工作树，完成普通 Node >=22.12 的锁定依赖、build 与桌面运行时安装后，正常重开可用：

```powershell
npm ci
npm run build
npm run desktop:install
npm run desktop -- --workspace "F:/mircograph-workbench/preflight-lineage-evidence-20261104/native-workspace" --python "F:/mircograph-workbench/windows-validation/.venv/Scripts/python.exe"
```

已有保存工作区省略 source；新工作区才明确指定只读源图。未知结果仍查询原请求，不重复操作。帮助入口为 F1 或“使用说明”，Esc 关闭。本轮两个新试验窗口已正常关闭，旧失败窗口原样保留。
