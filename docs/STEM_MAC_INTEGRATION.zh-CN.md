# Mac 隔离 STEM 集成候选

本候选保留原生 UI/CIF/Live FFT 工作台快照，按共同 HRTEM 基线迁入 STEM 专属增量。
原运行树、dist、GUI、工作区和全局 MCP 配置均未修改；尚未回迁或推送。

## 来源与实际范围

- Mac 基座：`7802780d155954562baa8653ea38f357c49eb836`，分支
  `work/native-visual-mac-demo-20261108`。
- 未提交快照：`2026-11-08T21:04:26.713923Z`，46 文件；原始字节、补丁和
  SHA-256 来源清单保存在隔离候选同级 `snapshot/`，采集前后稳定。
- STEM 来源：[PR #134](https://github.com/wuchqwq/microscopy-workbench/pull/134)，
  `51efc13c1ad6d933155beac341148cb1ebbf2fc9`；核对时为 Draft、未合并。
- 共同 HRTEM 祖先：`e63592ed7b1bf94bcfcdbedf7fabaa22434a3b75`。
- 本次仅迁入位点观察、continuation、S2、参考统计、review/CLI/worker 注册及必要
  预览恢复、峰表完整性字段；没有覆盖整包 UI、研究归档、cross-window 或 CI 配置。
- 四个冲突文件：`lib/image_workspace.mts`、`lib/workbench_cli.mts`、
  `tools/image_workspace.py`、`tests/workbench-cli.test.mjs`。保留 Mac 三点角度、
  来源字段、HRTEM 工具和 deadline 原请求恢复语义，同时加入 STEM 契约。

## 共享科学对象与交互

`image_panel_current.stem_handoff` 是既有 Panel 状态的只读投影，包含准确 view/frame、
标定准备调用、state/draft revision、原始 ROI 支持、当前点/线和草稿门槛。
参考角色不由名字、顺序或亮度猜测；host 必须明确用户意图。点是预期位置先验，
不是定位结果。当前窗口和保留窗口保持各自身份；未保存编辑不进入旧 PNG。

原始统计由 `image_statistics(reference_comparison=...)` 保存，保留每个参考与差值；
`image_profile` 保存 width-one nearest 原数组采样；`site_context` 把这些证据绑定到
准确候选、预期坐标、模态与来源。continuation 最多提出一次明确穿点剖线，
CLI `site-followup` 只从原始 review/profile 回执准备回接参数，不执行科学工具。
超时未知只查原 ID。科学结果和报告继续采用既有 provider 对象/导出，不另建 Agent 框架，
也不把聊天或执行日志放进一级界面。

S2 似然、固定几何、初始化、预算及科学梯度门槛保持来源版本。adapter v2 新增 `acquisition_context` 门槛：
缺少或非 HAADF/ADF 的声明保留原始统计并返回 `UNKNOWN_UNSUPPORTED_MODALITY`，
零拟合；HAADF/ADF 仍须独立 Poisson 计数解释、固定几何/宽度、目标与每个参考资格。
所有声明仍未被认证。当前 adapter v3 仅将 L-BFGS-B 相对目标停止精度 `ftol` 从
`1e-11` 收紧至 `1e-13`，仍要求 projected gradient ≤ `5e-6`；配置统一来自
`image_column_solver.py`，记录配置版本、ID和模块SHA256。旧 v1/v2 记录按各自原始
配置只读恢复，不补写模态、升级旧UNKNOWN或重跑优化器。

## 可以回答与仍不能回答

| 用户关心的问题 | 当前可提供的证据 | 缺口/不能据此下的结论 |
|---|---|---|
| 预期点/原子柱与参考为何不同 | 固定位点、原始强度/统计、每个参考有符号差、来源与穿点剖线 | 不自动找柱、识别元素、占位或确认点缺陷；参考等价、厚度、背景、扫描、投影仍需核查 |
| dumbbell/近邻柱是否分辨 | 原图和明确方向的原数组剖线、用户给定中心及条件幅度证据 | 没有双峰分辨判据、PSF/MTF、位置/宽度联合估计、分辨率不确定度或专属资格样本；S2 不能充当辨识器 |
| 模糊复杂缺陷区域 | 显式 ROI/对照、局部统计/剖线、既有 FFT 和受限晶体学候选假设 | 无复杂缺陷分割或物理唯一性结论；局部不清晰可能应停止在未知 |
| 晶体学候选指导实空间 | 现有 CIF/衍射候选与明确投影可形成工作假设 | 现有 CIF 面板主要对接倒易空间，尚未自动建立 CIF 投影柱到原图的实空间注册/几何；不能暗中当作 S2 输入 |

## 证据边界

本轮有界验证覆盖 Node 契约/HTTP、多 ROI/CIF/Live FFT 保全、Python 原始观察、
条件 S2 正反例与只读恢复、CLI/MCP continuation、共享 HRTEM/STEM review。
初始测试失败、修复、准确命令和结果保存在候选同级 `validation/` 与 `REPORT.zh-CN.md`。

收到的 `haadf-01` 是 abTEM1.0.11 实际 Probe.scan/多层切片/环形探测器产生的
模拟图，48×48 YX、0.150625 Å/px、Cu[001]、200keV/25mrad、60–120mrad 探测角。
采用原子真值和明确 scan origin 投影先验，验证原始统计、三参考、穿点剖线与恢复。
没有剂量、Poisson 噪声或计数标定，因此 S2 必须保持 UNKNOWN，不能缩放/取整以运行。
该基线没有热振动、收敛研究；不是实验材料、缺陷识别或 dumbbell 验收。
原数据线的 HRTEM 三图没有冒充 STEM 样本。

实际原生 GUI 点选/保存/关闭重开、独立模型盲选、实验样品有效性仍未验证。
GUI savepoint 和 provider 持久化是不同合同，本候选没有新增 S2 自动 savepoint 槽位。
本轮保留隔离候选，回迁需先协调并对当时原树重新做只读 diff/apply 检查。
