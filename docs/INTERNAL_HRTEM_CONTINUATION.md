# HRTEM 保存频带接续（Task A）

这是既有 `image_method_plan` / `image_method_next` 的有限 GUI 接续，不是新算法、自动索引、原始 HRTEM 单载波入口或材料结论。

## 模块与共享集成

- `lib/panel_hrtem_continuation.mts`：纯预检、输入映射、现有 provider 参数构造与保存结果的只读摘要。没有 provider 调用、请求重试、文件写入或 FFT/GPA 计算。
- `tools/image_panel.mts`：由主集成者使用现有 `journalCall` 提交一次 `image_method_plan`；先持久原请求，未知时只查该请求。读取和重新查看使用 `image_info` / 原 `image_result`。
- `ui/image-panel/app.mts` / `index.html`：由主集成者提供已保存合格频带选择、图上目标／参考两个矩形、参考依据、比较与重新查看入口。研究者不抄对象 ID、不写 JSON、不因导入 HRTEM 自动运行 GPA。
- 工作区保留结果对象／请求引用与研究者输入，保存和重开不能重放科学请求。

## 函数合同

`hrtemComparisonReadiness(seed)` 返回 `ready`、`missing`、准确对象、局部网格、保存参数及来源映射。预检仅说明适配输入是否齐全；provider 仍权威核查数组、manifest、两个方向与支持掩膜。

`hrtemComparisonParameters({seed,target_rect,reference_rect,reference_text,coordinate_space?,source_object_id?})` 返回现有 provider 接受的 `{object_ids:[seedId], budget:{四项均0}, information:{goal:'peak_roi_comparison',roi_rect,reference_rect,reference_text}}`。共享调用者生成并记录唯一原 `request_id`。这仍创建有成本、有身份的摘要记录，不是免费科学执行。

矩形为整数半开 XYXY。`coordinate_space='local_fft_pixels'`（默认）明确表示保存 FFT 局部网格；`source_pixels` 必须带准确源帧 ID，使用保存 `input_dependency.source_mapping` 转换，不静默裁切、取整或用 PNG 距离。GPA 预览的 `source_array_indices` 面板引用 GPA 对象的局部网格，不是原图坐标。不能用一个选区混淆这两套坐标。

`hrtemComparisonContext(input)` 提供独立 UI 来源对象：频带种子／原请求、完整保存依赖及参数、目标／参考角色和原选择。它不附加到 provider 参数中。

`hrtemComparisonSummary(saved)` 只读 `decision.peak_comparison`：保留精确结果、band/g、参考、有效支持、原因及 null。主文字显示六位有效数字不写回。比较结果导出仍调用既有 `image_export`：保存 decision JSON、可读 text、实际 PNG、manifest/provenance；不包含父 GPA 数组，后者需单独导出实际 GPA。

## 正确停止与有限验收

仅一份已保存 `kind=gpa`、`reference_mode=fixed_g` 且来源完整的结果可开始。缺少时回到原图／ROI／FFT，不默认新跑 GPA。参考必须是明确选择和真实来源／显式假设，不能自动声称等价。

比较保留幅值比与包裹相位差，单位 rad、范围 [-pi,pi]。至少9有效像素、90%有效支持和相干性0.9是既有确定性门槛，不是置信度；双带联合 mask 可能让差的第二带压低第一带有效支持。幅值可用而相位不可归约时保留幅值与 null 相位；支持不足保留 null、计数与原因，不变成零或材料反证。未知成像传递、厚度／离焦／结构替代解释、参考等价和独立不确定度继续明确。

定向 Node 测试在 `tests/panel-hrtem-continuation.test.mjs`。只验纯适配层；真实 GUI 两类结果、返回源窗口／频带／参考、导出与原位置重开由主集成者串行验收。没有原生证据前不称产品闭环通过。

## 既有公开 fixture 的有界准备

`tools/prepare_hrtem_continuation_fixture.py --output <全新绝对目录>` 直接复用 `tests/test_peak_comparison.py:SavedComparison.seed`，准备可比与暗区支持不足两个独立256²float32 case，只生成既有真实 provider 的源／帧／FFT／GPA及明确模拟来源的源图预览，不预先创建比较。准确ID、参数、哈希及推荐区域在 `fixture-receipt.json`；自包含 TIFF 与 `source_conditions.json` 同目录保存。输出已存在即拒绝，避免未知副作用重放。

这是解析载波软件 fixture，不是实验图或物理 HRTEM 成像仿真；没有物理尺度、材料、厚度或离焦真值。操作者已读构造，不能宣称独立盲测。构造真值保留作产品结果保存后的核对，不应填进产品候选结论后再称自动推断。该脚本本身不启动 GUI、不发送模型请求；原生验收必须从保存频带开始，并记录本轮仅由 fixture 准备频带。
