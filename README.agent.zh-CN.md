# Agent 使用说明：研究者引导的晶体学分析

## 先安装所需 Skills

本仓库的四个科研 Skills 可使用 [独立 npx 安装器](docs/SKILLS_INSTALL.zh-CN.md)。只需 Node 22/24，明确指定客户端 Skills 目录，默认不覆盖已有内容。使用 GitHub URL 并固定完整 commit SHA；本项目没有发布 npm 注册表包。经用户授权后安装；安装 Skills 与安装工作台/连接 MCP 是独立步骤。

[简体中文](README.agent.zh-CN.md) · [English](README.agent.md) · [研究者工作流程](docs/WORKBENCH_WORKFLOW.zh-CN.md)

## 循环中的职责

通过 MCP 和已安装的 Skills，调用明确数值工具，自动完成授权分析。研究者提供问题、相关知识与修正；内部 ID 和常规工具组织由 Agent 管理。解释前查看真实图像与保存证据，不能用合理的文字代替数值工作。

基础 ROI → FFT 不要求先写理由或明确保存工作区。下方的人工观察工作流是证据引导接续的一种正式入口，不是所有图像操作的前提。按问题选择必要方法，明确预算与停止条件。

操作前发现当前连接实际的工具 schema，读取来源、帧、标定、当前 Panel/草稿和相关保存上下文。工具存在不等于可选依赖或科学输入合格。向研究者交付简洁结果、替代解释和最有用的下一项观察。

## 共用工作区、来源与恢复

工作编辑、明确保存点、不可变执行与显示偏好彼此独立。GUI 与无界面工作组合前，阅读[工作区合同](docs/ANALYSIS_WORKSPACE.md)和 [CLI 合同](docs/CLI.md)。“不保存”后，保存的 A 不得自动采用探索性 FFT(B)。原浮点 ROI 关联与整数支持区域分开保留，不能仅凭计算边界相同推断关联。

每次写入在派发前保留原请求 ID。超时/取消后查询工具正式的原结果端点，不得换新 ID 重试未知副作用。已有但不合格或未确认的 FFT 不属于“缺少计算”。返回保存视图或重开 helper，不授权重做科学计算。

仅在注册/checkpoint 合同适用时使用[有拥有关系的 Panel 恢复](docs/INSPECTOR_PANEL_RECOVERY.md)。恢复的晶体卡片在新的受保护证据挂接核验当前依赖前，仍保持未复核。旧完成回执之外，还须单独读取当前状态。

需要来源证明时，检查实际公布的 `image_source_proof`、`image_source_proof_info` 和 `image_source_proof_revoke` 合同。记录证明、采用引用和保存工作区分别执行。回溯证明保留原 FFT 资格，不能把缺失的预执行输入证据升级为严格复用。哈希记录不是数字签名。

## 科学路径

### 从明确 ROI 接续

从两个保存的 Panel 区域进入有限结构比较，使用[人工 ROI → 晶体学路径](docs/MANUAL_CRYSTAL_WORKFLOW.md)。读取其中补充的 `roi_handoff`，取得准确锚点与当前标定；区域复核和比较共用双区域 atlas 的 FFT/测量子对象。不要求全场扫描或让研究者输入内部 ID。[集成记录](docs/MANUAL_CRYSTAL_ACCEPTANCE.md)区分真实浏览器、模型、软件与物理资格。

F4b 首版正式路径从研究者选定的 ROI 和真实观察理由开始：明确调用 `image_discovery(entry="manual")`，选择已有科学工具，再用 `image_discovery_review` 绑定、复核、修订和恢复证据。不要求先建完整结构场。自动 `entry="feature"` 为 **EXPERIMENTAL（实验性）**；空提案不代表图像正常。旧请求兼容默认值不作为正式工作流建议。见 [F4b 范围](docs/IMAGE_FIRST_DISCOVERY.md)。

### 有预算的空间观察

[主动分析](docs/ACTIVE_ANALYSIS.md)在保存的 domain map 上调用 `image_analysis_candidates`，明确累计预算。通过 `image_field_extend` 选择可检查动作，重建 `image_domain_map` 并再评价，保留探索预留和停止证据。将 `active_plan` 与准确的 `spatial_field`、`domains` 引用一同保存。原 extension 未完成时先查原结果；新提案不授权重放未知写入。已提交的 observation-key 测量覆盖可更新结构场，无须额外 FFT。

[多尺度结构场](docs/MULTISCALE_DOMAINS.md)使用 `image_spatial_field`，明确窗口大小、步距和窗口预算；随后用有来源的倒易容差、有限转角假设调用 `image_domain_map`。在 Panel 检查候选支持和未知部分。AnalysisContext 保存准确 experiment、`spatial_field` 和 `domains`；通过 `previous_field_id` 与已提交测量覆盖修订观测，同时保留不变频谱。这是候选几何，不是物相或缺陷确认。

R3 的 `image_feature_field` 从 atlas、比较或 R2 观察保存稀疏、带版本的局部结构特征场（JSON/CSV/PNG），不重算 FFT。`image_spatial_atlas` 组合已有 ROI FFT/峰/测量操作；`image_local_signature_compare` 在保存的 atlas 或 R2 联合观察上比较明确面内转角假设。见[局部结构域](docs/SPATIAL_DOMAINS.md)。这些是描述性局部倒易特征，不是自动物相/孪晶/位错识别。TIFF 接入保留有限灰度 float32 与 uint16。

### 实际 provider 与 Skills

本 provider 可在 Windows/macOS/Linux 使用，不要求 DM/GMS 或旧仓库。先按[客户端配置](docs/CLIENT_SETUP.zh-CN.md)接入，再发现当前连接真实的 `image_*`、可选 `structure_*` 和 context 工具。缺少可选模块不授权调用同级 DM provider，也不能虚构能力。

复用自动化可安装[本地 MCP + Skills 插件](docs/AUTOMATION_PLUGIN.md)。`microscopy-automation` Skill 使用有界区域、FFT、峰、测量与已有候选比较，通过具名 AnalysisContext 保留当前引用。不要求开发者会话 ID 或临时科学脚本。

Skill 是用户选择安装的目录，复制时包含脚本与 references，拒绝覆盖。存在 Skill 不代表外部 Materials Project provider 已连接。没有明确授权，不安装依赖或修改审批设置。

### 序列与数值输入

[跨帧工具](docs/SEQUENCE_PLUGIN.md)保存明确帧顺序和有来源的语义，建立有边界的 ROI 对应，再组合已有 FFT/峰/测量形成联合证据。重连后读取具名 context 与原请求；没有实时 Panel 时用 `image_panel_open` 打开已保存联合对象，不重做科学计算。

[无模型 Inspector](docs/RESEARCHER_DATA_INSPECTOR.md)使用同一套数组和测量记录。[数值检查](docs/IMAGE_NUMERIC_INSPECTION.md)读取原值，而非预览亮度。明确坐标、带符号 XY 标定、帧/ROI 和 FFT 来源；尺度未知时保持像素域。科学写入前保存原请求 ID，超时查原结果，保留数据和用户/客户端既有设置。

直接读取 `.dm3` / `.dm4` 时使用[可选读取器](docs/DM4_DIRECT_IMPORT.md)，打开科学 catalog，明确零基帧索引，歧义时明确 dataset。文件标定来源 `dm_file_metadata` 不等于用户确认，也不等于 DM 原生执行，禁止分析 RGB 缩略图。

对于 rank 3–6 DM 输入，检查 catalog 后用 `image_frame`，按原 NumPy 轴顺序明确 `plane_axes:[Y,X]`；每个轴都给出 `plane_indices`，两个平面轴为 null，其余为固定零基整数。返回的 `dm_plane_selection` 是科学来源，不表示深度或分辨率。

[普通二维复数 DM 数据](docs/DM_COMPLEX_IMAGES.md)在打开 Panel 前明确选择 `image_preview.component`；数值观察也须单独明确分量。NPY 保留复数 dtype 与实虚两部。不推断 FFT/波/相位语义，不把显示振幅交给未经资格确认的复数 FFT/比较。packed 和 nD 复数仍拒绝；普通二维复数不能改称外部 FFT 或丢弃虚部。

### 解释和历史兼容

[Panel 使用](docs/LOCAL_IMAGE_PANEL.md)、[标注合同](docs/IMAGE_ANNOTATIONS.md)和[反射比较](docs/REFLECTION_COMPARISON.md)说明保留的科学行为。旧技术示例中的 `DM_IMAGE_*` 属于拆分前的合并 checkout；本包使用配置指南中的 `MICROSCOPY_*`，不要为旧例子安装 GMS。

DM 是单独注册的同级 MCP。其原生失败不触发隐藏 fallback。导入保存的 capture 是只读科学文件交接，不是实时宿主连接。仓库改名不授权重命名旧请求 ID、manifest、保存 schema 或标定记录。

各模块的假设、具体方法和已做验证见[工作流程](docs/WORKBENCH_WORKFLOW.zh-CN.md)与[当前状态](docs/DEVELOPMENT_STATUS.zh-CN.md)。未合并候选和盲测结果不得当作已发布能力。
