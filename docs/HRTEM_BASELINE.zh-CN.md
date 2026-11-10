# HRTEM：从观察到可导出、可重开的证据

本地研究分支的这套基线回答“这个选区与参考区有什么差别、证据支持到哪里、下一步该看什么”。先看原图和已保存结果，再选择与问题有关的工具；数值通过、多模块一致或平滑图像都不能替代真实材料验证。当前工作尚未推送，不能把本页当作已发布主线能力。

## 从哪一个入口开始

| 研究问题 | 已有入口 | 当前能给出的结果 |
| --- | --- | --- |
| 局部周期、方向或原始强度是什么？ | 明确文件/帧 → 原值、剖面或 ROI → FFT → 峰/测量；见[数值检查](IMAGE_NUMERIC_INSPECTION.md) | 像素域或有来源的标定域观察；最大值不是自动确认的反射 |
| 同一保存频带在两个区域有什么差别？ | [Task A](hrtem-saved-band-task-a.md)：一份合格 fixed_g GPA → peak_roi_comparison | 每带幅值比、包裹相位差、有效支持和拒绝原因、可读报告与导出 |
| 明确候选的图像相位闭合证据如何与实空间来源一起复核？ | [Task B v2](hrtem-candidate-task-b.md)：明确 ROI/候选、调用者实空间陈述、GPA、指定多回路、方法计划 → discovery_review | 分开归属的支持、反对、未知、下一工具；自由文本 hypothesis 未被解析或具体验证 |
| 某个结构/取向是否与测量相容？ | [研究者引导流程](WORKBENCH_WORKFLOW.zh-CN.md)、有限结构比较 | 给定候选的相容、冲突与缺失信息，不能推出唯一物相或三维结构 |

**这里没有通用原始 HRTEM 单载波/平面载波解调入口，没有自动候选发现或晶格/条纹追踪。** 基础 ROI → FFT 不要求先跑 discovery，也不要求先做 GPA。只有一个可见方向、参考支持不足或源域未知时，先停在原图/FFT/测量，不强行进入双方向 GPA。

## Task A：已保存频带的可操作路径

1. 让已连接的 Agent 发现当前 MCP schema，用 image_info 读取一份实际存在的 fixed_g GPA，核对源帧、FFT、g、mask、标定和参考说明。上游 GPA 仍要求明确源域、两个非共线方向、合格无窗 FFT 和参考连通支持；不满足就停止。没有尺度时保留像素单位。
2. 指定同一局部 FFT 输入网格上的 roi_rect、reference_rect 和真实 reference_text。坐标是整数半开 XYXY，不是 PNG 坐标；FFT 来自裁剪源图时，使用其 source_mapping 转换坐标。研究者提供选区意图，Agent 从实际返回值管理对象 ID。
3. 调用 image_method_plan：object_ids 仅包含这一份 GPA，information.goal 为 peak_roi_comparison，填写上述两个区域和参考说明。budget 的 method_calls、fft_pixels、gpa_band_pixels、topology_path_samples 可以全部为 0；仍有明确的摘要计算成本和耗时，但不派发新的 FFT/GPA/拓扑。保存新的 request_id，超时查询 image_result，不能换 ID 重放未知请求。
4. 查看返回的 decision.peak_comparison、预览和 peak-comparison.txt。幅值比针对同一滤波带 ROI/参考，不是原始条纹幅值；包裹相位差单位 rad、范围 [-pi,pi]，没有自动展开、局部平面去除或位移反演。每带至少 9 个有效像素、90% 有效支持、0.9 相干性是确定性摘要门槛，不是置信度。
5. 幅值可用、相位不相干时保留幅值比而不强给单一相位差；支持不足时保留 null 和原因，不能把 null 当零。有效性继承双带联合 mask：较差的第二带也会压低第一带支持，不能解释为材料失败。观察支持的是这些选区的滤波图像差异，不是应变或位错。
6. 调用 image_export，object_id 选择该方法计划，output_dir 选择已有父目录下的新目录，使用新 request_id。实际导出 method-decision.json、存在的 peak-comparison.txt、preview.png、manifest.json 和 provenance.json。导出只复制保存产物，不把新计划覆盖到旧计划。
7. image_info 读回计划，image_result 查询原计划/导出 ID，核对身份、decision、哈希。若要移动摘要窗口，用 image_method_next 修改 ROI/参考并保留预算根，不重算 FFT。不同 goal 不能在同一预算根间切换。

报告导出不包含上游科学数组。需要重查幅值和 mask 时，单独对实际 GPA 对象调用 image_export；其中保留 amplitude.npy、low_amplitude.npy、valid_phase.npy、valid_displacement.npy、valid_tensor.npy、edge_invalid.npy、数组说明、manifest 和 provenance。检查实际导出文件的哈希，不从预览颜色读数。

## Task B：明确候选和条件性闭合证据

1. 通过 image_discovery(entry=manual) 指定源像素 ROI 和真实选择理由；manual 表示显式坐标，不证明有人操作。selection_origin 如实填调用者来源，候选 ID 来自返回值；这是指定候选，不是自动发现。
2. 复用该精确 ROI、源帧和标定下已保存的 fixed_g GPA。拓扑需要至少三个可分辨方向族及合格的 v3 保存 Fourier-mask 支持；可能要复用两份 GPA，不能把共轭/重复方向当成独立观测。所有记录必须共享精确 FFT、网格和 mask 带宽。
3. 明确 model_assumption_text、2..8 个有方向的局部矩形回路，至少一对严格嵌套。rect 为半开 XYXY，positive_image_xy 在 y 向下图像上沿东、南、西、北。参数源、路径、幅度门槛和参考必须保留。它们限制的是有条件净图像相位闭合，不是原子位错确认。
4. 用 image_method_plan 的 projected_topology goal 和有限预算取得建议。只有实际提出的 GPA/topology 动作才能用 image_method_step 执行，并必须使用 next_request_id、对应 action_id、root_plan_id 和选择理由；再用 image_method_next 汇总。stop/缺少信息不能冒充已执行。明确授权的直接 topology 负控另有原请求，不能伪记为方法预算内的子步骤。
5. 用 image_discovery_review 绑定候选、恰好一份 topology 和一份 projected_topology 方法计划；两者 GPA、回路和模型必须一致。candidate_assessment 保留 hypothesis 和 real_space_evidence：来源为 manual_review、specified_points 或 synthetic_construction，给出 source_text、observation_text、调用者 relation 与候选内源像素 anchors_xy。来源文字/哈希不认证外部事实，合成真值不冒充独立实空间观察。
6. 读取 candidate_result v2、预览和 candidate-review.txt。**hypothesis 是自由文本，未被自动解析或作为具体验证目标；数值支持/反对仅针对指定回路的净图像相位闭合。** 调用者对实空间证据的支持/反对仍是单独归属的陈述。
7. 对该 review 调用 image_export 到新目录，得到 discovery-review.json、存在的 candidate-review.txt、实际预览和 manifest/provenance；然后用原对象/请求 ID 原样重开。拓扑完整路径数组/报告须另行导出 topology 对象；幅值/mask 须另行导出各 GPA，不能认为 review 导出已经包含所有父数组。

| 反馈 | 能说明什么 | 不能推出什么 |
| --- | --- | --- |
| 支持 | 指定有效嵌套回路的条件性非零净图像相位闭合；或标明来源的调用者陈述 | 任意自由文本假设成立、材料位移、真实位错或唯一三维 Burgers 矢量 |
| 反对 | 指定有效路径的零净绕转反对这些路径上的非零净闭合；或调用者单独提供的反对陈述 | 所有位置无缺陷；零绕转也可能包含相消核心 |
| 未知/拒绝 | 低幅、路径不合格、部分约束、模型未验证或竞争解释 | 不能把不可用诊断当作肯定或物理否定 |

下一工具使用真实能力：image_info 查看 topology 的 report.loops[].reflections[] 失败、low_amplitude_path_pixels 等计数；image_export 导出 GPA 的幅值/mask、数组说明与来源哈希。image_gpa_read 仅提供 1..64 个明确整数局部点的相位/位移/张量采样及 phase_valid、tensor_valid、invalid_reason，不提供幅值或逐频带低幅 mask，不静默取整小数锚点。image_profile 可以检查明确实空间线剖面，仍不等于自动条纹追踪。区别纯对比调制与真实材料位移还需要独立晶格位置/结构信息、成像模型或额外数据。

## 已做的改进和可核查入口

研究提交尚未推送；准确 SHA 用 git show 核对，不提供未存在的远端提交链接。各验证报告保留首次失败、通过范围及未验收项。

| 增量 | 准确提交 | 验证/限制 |
| --- | --- | --- |
| 保存频带 ROI/参考摘要 | 7620f4accf1bb1e5857cf6347da3d077ef55a11c | [Task A](hrtem-saved-band-task-a.md)，已知比值约 1.6、相位约 +/-0.4 rad、低信号/不相干拒绝；不是原始单载波入口 |
| 可读反馈及下一观察 | 7b63507c04415087e8f0f79b3e909278b610e43d | [反馈验收](validation/hrtem-feedback-20261106.md)，不改数值准入 |
| GPA 派生解析浮点读取兼容 | d78653a3bbdddd20efb5b75a369fd7eb36e29b47 | [契约](GPA_ANALYTIC_READ_COMPATIBILITY.md)、[报告](validation/gpa-analytic-read-20261106.md)，仅白名单解析派生值、版本化误差界 |
| 保存相干性归约读取兼容 | 4e5201bbfbab26c0420ac9dd0195a64ab44d9e0f | [契约](SAVED_BAND_SUMMARY_READ_COMPATIBILITY.md)、[报告](validation/saved-band-summary-read-20261106.md)，样本数/相消相关界；跨越 0.9 时拒绝兼容，不重判历史 |
| 明确候选的 A/B 证据接续 | 2613a563209c58469132a426c4bc0b636b69c891 | [Task B 验收](validation/hrtem-task-b-20261106.md)，正/负/低幅/纯对比涡旋；不是自动候选或实空间识别 |
| 工具建议及 hypothesis 边界修正 | 542256d1f8a72b8c4b6bc5134155cb7ccfb5e4b5 | [P2 复审证据](validation/hrtem-task-b-p2-20261106.md)，新写 v2；旧 v1 保留原文，包括已知错误旧建议，使用时以 v2 说明为准 |
| 本轮最小导出闭环 | 本轮待审提交以最终报告/git HEAD 为准 | [最终收尾验收](validation/hrtem-final-closeout-20261106.md)：A/B 结果、文字、JSON、PNG、真实导出、来源与原样重开 |

## 跨平台与仍未验收的范围

- 已验证原 Linux 交接 Task A 的 GPA 与正例/拒绝计划在本机 Windows 的元数据/compact 读取，原文件哈希不变；只对白名单解析/归约诊断采用有依据的窄兼容路径，不放宽参数、数组、ID、动作、预算或历史状态。
- 新 A/B 工作区的保存、原样读取、导出和正式 MCP 验证在当前 Windows 原生保存根完成。原交接记录中的 Linux 绝对 PNG 指针没有被改写，不能据此声称旧全量图片展示或新 Task B 跨平台迁移已通过。
- 本轮从真实交接 GPA 的隔离副本明确创建一个新 Task A 观察并导出；这是新记录，既不迁移旧决定，也不重算原 FFT/GPA。完整结果见最终收尾报告。
- 尚无真实材料位错、材料应变准确性、独立不确定度、自动晶格/条纹追踪、真人 GUI 易用性或干净机器安装验收；macOS/Linux 新闭环、任意版本/FFT 后端迁移仍未验证。源域、参考和成像模型的物理有效性仍需材料与实验背景。

保存原始问题、独立来源、参考/路径/标定假设、预算和未知项。超时先查原请求，不重放未知操作，不覆写旧记录。下一步只为当前研究问题补充有用证据，不把合成软件通过改称真实材料结论。
