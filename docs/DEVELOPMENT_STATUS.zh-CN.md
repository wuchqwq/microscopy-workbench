# 开发状态

[简体中文](DEVELOPMENT_STATUS.zh-CN.md) · [English](DEVELOPMENT_STATUS.md) · [项目概览](../README.zh-CN.md)

## 当前核实主线：2026-11-05

本页是当前实现索引，已通过 GitHub 连接器核对主线 [c69424ac25a35efd816d68cacd5904f5381c7485](https://github.com/wuchqwq/microscopy-workbench/commit/c69424ac25a35efd816d68cacd5904f5381c7485)，该提交于 2026-11-04 合并。

[PR #131](https://github.com/wuchqwq/microscopy-workbench/pull/131)保留了至 #130 的已审查工作台栈及依赖历史。合并说明明确排除独立 [PR #105](https://github.com/wuchqwq/microscopy-workbench/pull/105)和另行开发的 STEM 候选。核查时尚无 GitHub Release。源代码合入不产生新的数值、Agent、原生平台或真实样品验收证据。

### 当前主线已实现

- 不依赖 DM 的 MCP 科学 provider、可选 Skills、本地 Image Panel 与结构化 CLI，共用 provider 对象和原请求日志。
- 直接从图像 ROI 执行 FFT，编辑多个 ROI，对照来源与 FFT，进行明确的点/线测量和条件性拖峰重测。基础 FFT 不要求观察理由或先明确保存工作区。
- 整体分析的明确保存点，独立的工作编辑与执行历史，受保护的正常重开、崩溃草稿选择与原请求恢复。
- 无界面的已保存 ROI 对比，独立核验来源/FFT 关联、带来源报告、执行历史读取及明确的缺少计算选项。
- 持久来源证明的创建、查询、撤回与受保护采用。回溯证明保留原资格，不能把原本不可用的 FFT 输入升级为严格预执行复用。
- 有边界的 ROI、atlas、多尺度观察与主动接续；条件性单域 GPA、投影绕数、有限通用/孪晶结构比较及首个跨方法接续工具。
- 复用 Panel/provider 的 Windows Electron 开发入口，提供原生菜单和“保存／不保存／取消”。

参见[工作流程](WORKBENCH_WORKFLOW.zh-CN.md)、[工作区合同](ANALYSIS_WORKSPACE.md)、[CLI](CLI.md)、[桌面入口](DESKTOP.md)和[运行时支持](CI_SUPPORT.md)。工具存在不证明可选依赖或当前科学输入满足资格要求。

### 现有证据实际覆盖什么

| 证据 | 已记录范围 | 限制 |
| --- | --- | --- |
| [单主图收尾](validation/single-image-closeout-20261104.md) | 公开合成数据上的 Windows 桌面鼠标/键盘 ROI 编辑、两个 FFT、来源对照、峰位修订、保存/取消/不保存/正常重开，以及独立只读来源和保存点核对 | 不代表峰定位精度、应变、真实样品物理准确性、干净机安装或完整 GUI 易用性。精确 760×800 和窄窗科学编辑仍未测。 |
| [持久来源证明验收](validation/persistent-source-proof-b-20261104.md) | 对既有公开长历史调用正式 stdio MCP，核对 CLI/Panel 消费、保留原资格、撤回/采用，证明核对期间无新增 FFT | 工具安全停止后，证明入口的原生鼠标路径仍为 NOT_TESTED。哈希是一致性记录，不是签名或独立样品观测。 |
| [已注册 Panel 恢复](INSPECTOR_PANEL_RECOVERY.md) | 拥有关系明确的已注册 helper 与 Inspector 恢复合同，准确 checkpoint/generation 和显式证据复核 | 旧的未注册档案和不支持状态分别处理。恢复卡片可能尚未复核，不能推出全部冷恢复均已合格。 |
| 各方法验收报告 | 报告中的准确数值、协议、模型与合成输入范围 | 未被具体后续证据取代的历史失败与 NOT_TESTED/HOLD 继续保留。不推出普遍提速或真实材料识别。 |

收尾报告记录受验源码和当时分支状态。即使代码现已合入主线，报告里的“尚未合并”仍属于历史事实。本次文档更新没有改写或重跑这些验收。合并记录中的候选 CI，不是本次文档补丁新跑的检查，也不能代替发行时对准确 head 的核验。

### 仍然保留的边界

- 自动图像特征提案仍为 **EXPERIMENTAL（实验性）**，包含已记录的漏检阳性。没有提案不能证明样品正常或均匀。
- 结构/反射相容不能确认化学物相、三维孪晶、真实材料位错或原子边界相干性。
- GPA 要求明确来源域和参考假设；拓扑仍是条件性投影证据。不包含 ptychography 重构或实时仪器控制。
- 真人易用性、当前 macOS/Linux 原生桌面资格、真实样品物理准确性、干净机安装发行和升级恢复分别验收。
- 窄窗/DPI、原来未解决的现场及长历史证明读取成本，保留各报告的开放限制。后来的隔离测试通过不会抹除首次失败，也不会确认未访问状态。
- 独立 STEM 分析、新的物理前向/盲测候选和开放 PR 结果，必须单独核实并准入后，才能描述成当前主线功能。

针对新的发行或其他 checkout，重新核对准确 ref、相关 CI 与验收记录。不要把下方历史分支状态恢复成当前事实。

## 历史实现档案

2026-11-01 的逐项实现记录、原审查提交 SHA 和历史分支描述保留在[英文状态页的历史档案](DEVELOPMENT_STATUS.md#historical-implementation-archive)。其中“当前”“开放”“未合并”等指当时快照，不能覆盖本页的新主线摘要。各原始验收报告保持原文，不被本次文档更新转换成新实验。
