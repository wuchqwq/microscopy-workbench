# Microscopy Workbench：证据边界与三项算法修复复核

日期：2026-11-02（Asia/Shanghai）。本文件是独立的审查交付，不包含生产代码修复。单独存放在本轮审查目录，不覆盖 #53 的根目录报告。

**本阶段可信的交付是：围绕明确图像和 ROI，提出、检查、比较、修订有限解释，并保留相容、冲突和无法区分的部分。现有合成验证不能证明真实物相、材料应变、位错或三维结构。** 三项原错误已在未合并的增量 PR 中修复；main 尚未得到这些修复。

## 1. 固定来源、隔离与审查覆盖

先读 AGENTS.md，再核对实际远端、未合并 PR 和工作树。以下是本轮固定版本，不能把“历史稳定基线”当作未经核验的最新代码。

| 对象 | 源码 SHA | Git tree |
| --- | --- | --- |
| 实际 main；本审查分支基底 | `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c` | `82facfce75c5909c510cb5014e228918904f5de4` |
| 未合并 #57；附件声明基底 | `4141225653b41b134a76c5b2119888c01c481f54` | `d53fa691181d6d2ae348dffe10f3c76b148e17f0` |
| #58 GPA 展示边界 | `b238f9722b31c2959c871bba210c87977d94c2a8` | `094336d3109bbd6b21c80aed2f91f6baf8c7127d` |
| #59 逐位点占位 | `f05b32f5ee659ce0fbab97998f6048364e56a454` | `ec466f5a46eb23d09d8b346f8d354f6b8ab1fd4c` |
| #60 拓扑频带依赖 | `7b48520a92fb086dbf29572a49c580bdb7292b64` | `ce5fb954988fcf22e23f4658638ba490366e51c8` |
| #61 平坦谱与历史峰准入（算法/测试提交） | `e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb` | `49185a46650ae31c7b77f0fa1c0a4dddee1dc140` |
| #61 最终 head（仅原计数叙述勘误） | `31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a` | `be6b655b96965000a345d0fb99ac674a34d9c790` |

修复依赖链是 [#57][pr57] → [#58][pr58] → [#59][pr59] → [#60][pr60] → [#61][pr61]，逐项独立提交和 PR。此审查分支 `audit/evidence-boundary-repairs` 从 main 单独建立，worktree 为 `evidence-boundary-audit-20261102`；四项修复各自有独立 worktree。没有合并、移动稳定基线、修改共用 GUI 或启动脚本。

交付前再次读取远端：main、#57、#61 与表中一致。另有未合并 #45（样品准入）、#53（首轮审查）、#54（交替操作保护）、#55（第二轮审查）、#56（修复方案）。#54 未纳入本轮测试树；共用开发工作树仍为 `a6233f48dffbceea64d337fb8c4028ab489249cb`，状态干净。不能用本轮结果声称已经验证 #54 与该修复链的联合 GUI 行为。

用户要求的独立审查者**实际使用 GPT-6-astra**，负责附件反例、占位、拓扑、平坦谱的独立探针和复核；审查者未修改生产实现。其原始发现和修正后复核分别保留，而非只保留最终正面评价。主审负责实现、完整测试、历史读取和正式 stdio 传递检查。最终独立复核本报告还发现“旧报告两家族归因环境差异”缺乏原始依据；现已在 A03 段和 #61 文档显式勘误，不改科学响应和旧记录。

本轮深入覆盖 GPA 评估的 Panel/MCP/渲染边界、结构模型保存与模拟/孪晶准入、跨 GPA Fourier 支持依赖、峰检测数值平坦性和新旧记录接续。下面算法地图也标出其余主链，但**没有重做完整 A–F 数值审查**。[首轮报告][audit1]、[第二轮报告][audit2]的测试属于各自固定版本，不能累加成当前代码或真实材料的无条件资格。

## 2. 算法地图与信息来源

| 实际实现 | 观测输入 → 预处理 → 中间量/输出 | 假设、适用范围与下游 |
| --- | --- | --- |
| `image_fft`、`image_peaks`、测量工具 | 原始采样数组、帧、明确 ROI → 去均值/窗口/有限 DFT → 复数谱、数值峰、DC 参考向量、周期/方向 | 窗口和有限采样限制可分辨性；带符号 XY 标定来自外部。cycles/length 与角频率的 2π 不混用。FFT 峰是图像的投影周期信息，不自动成为 HKL/物相。供显式测量、局部比较或选反射。 |
| `image_feature_field`、`image_spatial_domains`、`image_domain_compare`、自动候选 | 多个 ROI 的 FFT/峰或图像特征 → 方向/周期摘要、邻接/相容规则 → feature、domain、注意 ROI | 步长是采样间隔，窗口控制局部混合与分辨率；厚度/强度/成像变化可改变特征。重叠 ROI 相关，连通域不证明组内任意两点或物理结构相同。可选诊断，不是默认全图发现前置条件。 |
| GPA 数值与评估 | 图像 FFT、用户选定非共线 g、滤波宽度/参考 → 带通复振幅、包裹相位、位移梯度 → 位移/应变/转动及掩膜、评估 | 位移来自指定相位模型；参考拟合可移除常数/均匀项。低幅、混合域、叠层、对比变化和带宽限制妨碍材料解释。评估经 Panel/MCP 原值传递，不增加实验事实。 |
| `image_topology`、`image_topology_core` | 保存的 fixed-g 包裹相位、振幅、实际 Fourier 掩膜、显式闭合回路 → 绕数/分组/投影闭合拟合、留一残差 | 检查 direct/conjugate 支持复用和相位来源；净绕数不等于缺陷数。投影闭合、依赖行拟合与真实三维 Burgers 分开；仅为明确前提下的诊断。 |
| `crystallography/structure_tools`、`occupancy`、diffsims | 用户/参考来源的晶胞、位点、元素/占位、取向 → 保存重载、倒易几何与运动学计算 → HKL/q、理论强度和结构图 | 这是**候选模型输入和预测**，不是测得的组成。新版本完整保存受支持的逐位点信息；当前有资格的模拟/孪晶链只接收完整有序模型。部分/混合占位可讨论、显示，但相应数值检查拒绝。 |
| 配准、general/twin comparison | 来源明确的实验投影向量与有限显式模型 → 约束配准/反射匹配、未匹配及几何歧义 → 条件相容/冲突/不足 | 拟合用的信息不能再作为独立验证；公共 FFT 和其多个对象不增加证据份数。图像 FFT 不能不加模型地当电子衍射强度；有限投影相容不证明唯一物相、孪晶或三维界面。 |
| Panel/MCP/Skills、method loop | 上述不可变记录和人/AI 的明确选择 → 展示、接续、诊断调用、可追溯修订 | 工具完成不是物理验证；规则式调度不是实验规划。保留人/AI 双入口，候选讨论无需先完成全部模拟，未执行的检查必须明说。 |

每份解释至少分清五层：①采样观测、ROI 和来源；②标定、材料背景及用户假设；③窗口、阈值、参考、模型等算法先验；④模拟预测；⑤这些条件下可支持的物理结论。可复用现有笔记和证据引用，记录“候选及依据—已执行检查—相容—冲突—不足/无法区分”，无需另建候选数据库。

## 3. 原错误、独立反例与处置

分类：①数学/代码错误；②实现正确的方法局限；③超适用范围；④解释过强；⑤证据不足；⑥可选改进。下表“已修复”只指未合并的版本化增量，**不指 main**。

| 优先级 / 问题 | 分类 | 原行为与科学影响 | 当前处置 |
| --- | --- | --- | --- |
| P1 E01：逐位点占位丢失 | ①③ | 保存改变候选结构，错误消光并绕过完整占位孪晶准入 | #59 保存 atom-model v2，统一准入，历史 v1 只按旧义读取 |
| P1 D01：重叠带重复计证 | ①④ | 两个载波被计成第三方向冗余，提升拓扑证据 | #60 新 topology v3 检查实际 mask 与共轭支持；依赖频带不提升冗余 |
| P2 A03：平坦谱舍入峰 | ①④ | 数学上无幅度峰的脉冲进入 valid 特征 | #61 detector v2 增加明确数值未判策略；新动作拒绝未评估历史峰自动复用 |
| P2 展示边界：GPA 评估丢失/误识别 | ①④ | GUI/MCP 看不到已保存解释边界，畸形诊断可能看似正常 | #58 有界精确投影，缺字段不补写，异常显式 unavailable，详情状态保留 |

### E01：必须保持模型，而非只保存源文件哈希

定位：[structure_tools.atoms_data/from_data][occupancy-serialization]（130/139 行）、[simulate][occupancy-simulate]（339 行）；新规范化与门槛在 [occupancy.normalize/require_full][occupancy-policy]（42/169 行），孪晶复用该门槛。

最小 extXYZ：同种 Cu 两个位点，分数坐标 x=0、1/2，`occupancy` 分别为 `[1,.5]` 和 `[1,1]`。独立解析式为 `|1+o exp(iπh)|²`：h=1、2 的同 q 单原子归一化强度分别为 `[.25,2.25]` 和 `[0,4]`。原 `open→保存→重载→simulate` 输出两套完全相同反射表，部分占位 100 消失；部分占位 FCC 的直接门槛拒绝，却经 `open→orient→twin_orient` 通过。实际 ASE/diffsims 完整保存链与直接 diffsims 对照均已执行，非仅序列化单元测试。

修复规范保存展开后每个位点的元素分数，按实际 CIF `spacegroup_kinds` 映射，不把混合元素的总占位当代表元素的占位。多通道声明必须精确一致，畸形/冲突/未映射值拒绝。受支持的部分或混合占位可保存、显示、派生；当前模拟、孪晶及有资格的比较拒绝该模型，未新增无序散射功能。没有占位声明只代表明确的理想模型假设，不是已测化学组成。

缺版本旧对象按原五字段读取，不补写“全占位”；新有资格的使用须从保留原源显式重开并创建新请求/派生记录。原错误、手算正反例、库文件版本/hash、32 调用旧/新链和历史文件不变证据见 [占位修复报告][occupancy-report]与[证据目录][occupancy-evidence]。**没有以调容限或修改旧对象获得通过。**

### D01：相近中心、不同对象和留一拟合都不能证明新观测

定位：[image_topology._source_bundle_records][topology-source]（86 行）、[band_dependency/analyze_with_dependencies][topology-policy]（29/78 行）。原方向家族/拟合内核在历史 v1/v2 中保留。

反例：256² 图像 `cos(2π*.125*x−θ)+cos(2π*.125*y)`，`θ=atan2(y−127.5,x−127.5)`。GPA1 用 `[(.125,0),(0,.125)]`，GPA2 用 `[(.125,.004),(0,.125)]`，σ=.014，reference `[50,50,75,75]`，回路 `[75,75,182,182]`、`[60,60,197,197]`。原结果为三方向、b≈[8,0]、`redundancy_validated=true`，实际复用 336/357 个支持系数。第二独立反例 `(-.125,.004)` 的**直接重叠为零**，却有同样的共轭系数复用，说明只查对象 ID 或中心距离不足。

新 v3 从 hash 合格的原始 `mask_frequency.npy` 读取支持，在 exact/conjugate aliases 去重后逐对检查直接/共轭非零系数。任何保留频带复用都取消各组和总结果的冗余提升，没有调 overlap 百分比阈值。原 winding、b、残差不改写，注明所有行的依赖拟合会重新加权 b；留一残差只是代数一致性。

拟合依赖也实际核对：该链只接收 fixed_g，消费参考常数/平面拟合**之前**的 `phase_demodulated_wrapped`，不是解包裹位移/应变；本反例的原因是原 Fourier 支持复用。即便支持不重叠，共用窗口、噪声和成像模型仍可相关，不能称独立实验或真实缺陷验证。详见[拓扑报告][topology-report]与[原失败/执行/独立复核][topology-evidence]。

### A03：数值未分辨不能成为有效结构特征

定位：[image_peaks.numerical_contrast/detect][peaks-source]（47/80 行）、同文件 14/27/34 行的新记录准入；atlas/joint 缓存和 field/domain 接续只在新动作中调用门槛，历史重建规则保留。

最小输入：63×63 float32 数组仅 `[20,25]=1`，window=none、subtract_mean=false、threshold_rel=1、refinement=none。独立真值是平移 delta 的 DFT：每个频率的模恒为 1。冻结 #59 的实际 NumPy 2.5.4 舍入却产生峰，保存的 spatial_field 为 valid、四方向家族。**勘误：首轮报告文字曾写两家族，但保留的原始响应与本轮复现均为四，且同为 NumPy 2.5.4/SciPy 1.18.1；不能归因环境差异。** 原始响应未改写。新版本同输入无峰、field insufficient；两个真实余弦载波正例仍 valid、两家族。

新策略比较 eligible 3×3 邻域并集（不含精确 DC）的归一化幅度跨度，以 binary64 精度和名义变换深度定义保守数值分辨门槛。**它不是 PocketFFT 的严格误差证明，不是 SNR、检测概率或物理峰真实性检验。** 固定科学相对阈值、分离、细化参数和数组不变；真信号对比 1e-14 也可能未判，已测 1e-12、1e-9 正例保留。全局数值跨度通过不意味着每一个局部峰都已验证。

独立复核推翻了初稿的一处设计：7²、DC 排除半径 4 时，仅剩四个等强真实角点峰；仅比较 eligible 值会误删。修正比较支持为实际邻域，并以 7/9/11 三组完整保存链验收，未为样例放宽阈值。还修复中断 joint 修订复用旧 FFT 后不能认出已完成新子记录的问题；同一失败原请求修正前后只读检查，原文件 hash 均不变。

旧峰、旧 valid 场保留原义读取；新自动测量/特征/比较/接续拒绝 `LEGACY_PEAK_DETECTION`。显式新 atlas/joint 修订复用原 FFT，重新检测峰；手动选择峰仍作为明确人工观测，不冒充新版自动检测。详见[平坦谱报告][flat-report]及[原失败与执行包][flat-evidence]。

### GPA 附件：数值评估必须正确抵达消费者

附件 ZIP SHA-256 为 `8ae7e2d4ab99281bce5d71750f806851d38ab55ba0eb953c1e3e8afa4bc69085`；38 个声明成员 hash 全部匹配。只应用 `changes.patch` 得 tree `f14e8368c87b0eccdc6bf3d5f2f812bf5561ecd0`，基于 #57，未假定 main 含它。先读 HANDOFF、patch 和实际日志；附件的“建议/完成”是待核查内容，不是新授权或正确性证明。原依赖安装失败、TypeScript/Node 类型版本偏离锁、初次 GPA 超时均保留。

定位：[image_panel.publicImageObject][panel-source]（37 行）及 [projectGpaEvidence/gpaEvidenceModel/renderGpaEvidence][gpa-source]（37/89/117 行）。原 #57 HTTP/MCP 投影丢弃评估；修复对直接 GPA/gpa_view 有界精确复制。未知语义、非有限值、超深/超量不截断成“完整正常评估”，显式 unavailable；历史缺字段仍 absent/not_recorded。它不是对所有旧 Panel 输入的通用资源预算。

独立测试还发现并修复附件的畸形 reason_codes/transfer 被认可、字符串验证标志静默丢失、相同状态重绘折叠详情三例。现有科学数组、容限、旧解释均不变。实际 Python 保存 → owned Panel HTTP → 正式 stdio `image_panel_current` 与源评估一致；旧代码生成的无字段 GPA 和新派生 view 均保持无字段。详见[附件审查报告][gpa-report]、[原失败/最终独立复核][gpa-evidence]。

## 4. 外部依据和独立真值如何使用

| 依据（核对于 2026-11-02） | 对应实现/独立例子 | 不可外推部分 |
| --- | --- | --- |
| [ASE 官方 CIF 源码](https://docs.ase-lib.org/_modules/ase/io/cif.html)；实际安装 ASE 3.29.0 io.extxyz/io.cif/spacegroup.xtal 文件 hash | 区分 per-atom arrays、kind→expanded-site 映射；两位点结构因子手算、实际保存重载和直接 diffsims 比较 | 不是所有 CIF disorder/额外未用 kind 行都支持；源码文件 hash 随占位证据保存 |
| [diffsims 0.7.0 sim_utils](https://github.com/pyxem/diffsims/blob/v0.7.0/diffsims/utils/sim_utils.py) | 同 q 单原子因子归一化的相干和，与解析 .25/2.25、0/4 对照 | 运动学理想模型不验证厚度、动力学散射或占位无序的 diffuse scattering |
| [NumPy 2.4 DFT 官方约定](https://numpy.org/doc/2.4/reference/routines.fft.html)；实际 NumPy 2.5.4 | 实图像共轭、shift 后奇偶索引；独立 odd/even/矩形支持与解析 winding | 不假设文档版本等于实际运行版本；worker 明确 float64→complex128，不借库的默认 dtype 推断 |
| [Higham 2002 第二版 §24.1/Theorem 24.2](https://epubs.siam.org/doi/10.1137/1.9780898718027.ch24)、[FFTW 官方精度讨论](https://fftw.org/accuracy/comments.html) | FFT 误差依赖精度、深度与旋转因子；平移 delta 的解析恒模、真实弱峰和真实等强角点控制 | radix-2 条件结论不能证明本策略系数 8、混合基/Bluestein 实现或统一 infinity-norm bound；代码明确 certified_fft_error_bound=false |
| GPA/配准/误差的先前原论文检索与方案 | [#57 的文献与选择说明][literature57]；本轮复跑实际 GPA smoke 的有限仿射独立真值，并核对评估传播 | 本轮未更换 GPA 数学方法；不把单篇论文、成熟库或已有验收评价当通用物理资格 |

## 5. 锁定环境、实际执行与兼容性

macOS arm64，Python 3.13.18、Node 24.22.2、npm 11.19.1。各独立修复环境用 npm ci 的原 package-lock（TS 5.9.3/@types/node 18.19.130），Python 同步并逐项核对 #57 所记录的全部 50 个精确包版本（含 NumPy 2.5.4、SciPy 1.18.1、ASE 3.29.0、diffsims 0.7.0）。不是以环境里碰巧可用的全局依赖代替锁。

| 增量 | 本地实际执行 | 真正历史对象验收 |
| --- | --- | --- |
| #58 | Node 408 PASS/5 SKIP；科学语义 9 PASS；build/typecheck/science/GPA 正式 stdio+HTTP PASS；astra 21 聚焦测试和 13 新 HTTP/MCP-handler 对照 | 冻结无评估字段 producer 生成；3 recoveries、2 HTTP/正式 MCP 展示；40 原文件不变 |
| #59 | 新占位 8 + 既有 general/twin/qualification 63 = 71 Python PASS；旧/新 32 调用完整链；实际 ASE/diffsims 与 twin/general stdio；Node 409 PASS/5 SKIP；build/typecheck/science PASS | 16 历史记录、64 worker 调用；619 原文件不变 |
| #60 | 67 topology + 19 method Python PASS；5 保存反例/正例共 32 创建/读恢复调用；topology/method stdio 与 Panel HTTP；Node 409 PASS/5 SKIP；build/typecheck/science PASS | 真 v1 producer `482565c88fe14ec0583c06f8bf34b239501eb032` 与 #58 v2/method；9 目标、18 读取；原文件不变 |
| #61 | 10 套 Python 合计 83 PASS；14 调用 fresh 保存链；field 正式 stdio/Panel HTTP、science PASS；Node 409 PASS/5 SKIP；build/typecheck PASS；astra 最终另跑 52 数值+10保存、24脉冲、18边界、12角点调用 | 真 #59 旧链 106 完成记录、228 公开调用；367 原文件不变，8 原 FFT 复用并显式建立新版峰 |

计数可能包含重叠测试/重复验收，不能相加当独立证据份数。条件 SKIP 未冒充通过；具体日志见各增量证据目录。保存源码/请求/源文件/数组 hash、原响应、旧解释、修复后的响应和 stdout/stderr。gzip JSON 以原文件名映射精确文本及 SHA-256，二进制科学数组留在独立本地 analysis 工作区，提交包含合成生成器与数组 hash；未使用私人样品、未发布 Panel 会话凭据。

上述四个算法/测试提交的 GitHub 两个工作流（Standalone provider smoke、F3b actual simulation）均已通过。#61 算法提交的运行分别为 [41340416504](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41340416504) 和 [41340416484](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41340416484)，随后提交仅作上述文档勘误，不改算法/测试。CI 同样不代表真实材料资格。本 docs-only 增量核对全部七组 commit/tree、23 个固定源码/证据链接及所引行号，并执行 diff whitespace 检查；没有重复运行生产测试来制造额外证据份数。

特别保留了失败尝试：旧工作区搬路径被合法拒绝；sandbox loopback 被限制；并发 build 导致一次 dist 缺失；测试 harness 包装/参数错误；macOS `/var` 与 `/private/var` 字符串断言在冻结旧版和新版都失败，规范 TMPDIR 后通过。它们与科学反例分开记录，没有修改旧对象路径/hash/科学阈值取得通过。

可执行入口（须各自在相应固定 checkout 的锁定环境中用全新输出目录）：

- #58：`npm test`、`npm run typecheck`、`npm run test:science`、`npm run test:gpa`；[历史/投影 fixtures][gpa-fixtures]，旧生产者固定于报告中，不以删除新字段伪造旧对象。
- #59：`python -B tests/test_site_occupancy.py -v`；[site_occupancy_history.py][occupancy-history] 验证真实旧保存链。
- #60：`python -B tests/fixtures/topology_band_dependence.py FRESH_DIRECTORY`，及 topology/method 测试；[独立保存反例代码][topology-fixture]。
- #61：`python -B tests/test_flat_spectrum.py -v`；[flat_spectrum_saved.py][flat-fixture] 的 create/history 模式产生真旧记录、只读旧记录并创建显式新修订。

## 6. 合理设计、限制与尚缺证据

可继续保留的设计：原数组和显示 PNG 分开；明确 ROI/轴/标定/DC；候选模型与观测分开；不可变请求与结果；已声明的版本按旧义恢复；正式 GUI/MCP 复用同一科学记录；新准入不静默重解释旧 valid；频带依赖绑定真实保存 mask。以上有具体正反例，仍不等于物理正确性自动成立。

必须限制的解释：

- **GPA**：数值 mask、条件数、带宽响应只能说明数值计算的条件。噪声、多个近周期、成像对比变化、界面/叠层可生成可计算相位和应变；参考选择决定哪些常数/均匀项不可识别。材料应变真实性仍需独立物理依据，不能通过界面字段补齐。
- **拓扑**：净 winding 可能抵消多个奇点；相位奇点未必为位错。disjoint support 也不保证独立误差。b 是相位模型下的投影拟合，不能自动给三维 Burgers、缺陷数量或位错类型。
- **候选/配准**：同投影异结构可都通过；自由配准、候选相关尺度或同点拟合后验证会循环论证。#57 把 held-out geometry 与 independent validation 分开，此处不重新宣称完整候选误报率已资格化。错误标定仍可能给相容结果；未匹配反射要依成像/检测可见性解释。
- **峰/field**：新平坦性门槛只阻止所述数值失效，噪声仍可产生已分辨数值峰。局部插值精度不是频率分辨率；结构特征改变也可能来自强度/厚度/窗口。历史自动候选漏检、后验尺度诊断和主动策略不占优记录继续保留在[首轮审查][audit1]，本轮没有用后验调参替换它们。
- **模型占位**：保存完整不等于测得真实组成；本次拒绝部分占位模拟并不排除该物理候选。可以继续讨论并明确该项检查未执行。

**NOT_TESTED**：真实样品和材料准确性；仪器标定误差与成像传递的总体资格；动力学/无序散射；统计置信区间和候选概率校准；全 FFT plan/平台的严格误差界；全数据格式 disorder 支持；完整噪声/混合域/近周期失效概率；#54 与修复链联合 GUI/人机竞争；真实浏览器视觉和手势；新模型自动发现 Skill/完整自主会话。不能用这里的合成 PASS 覆盖这些项。

真实浏览器检查时，origin 权限检查拒绝了隔离 loopback 源；未换浏览器、端口控制渠道或绕过检查。DOM-port 渲染、owned HTTP 和正式 stdio 已执行，但不是浏览器外观/手势验收。

## 7. 当前设计取舍与下一步三项工作

保留研究者 GUI-first 与 Agent-first 双入口；Agent 可按实际图像、测量和用户背景提出少量解释，研究者随时修订。默认明确 ROI → 周期/方向测量 → 有限条件比较。全图结构场、自动候选、GPA、拓扑及 method loop 保留显式诊断入口，不强制进入完整流水线。Skills 的范围说明不是 API 封禁，也不是上述算法修复的替代。

不新增实验顺序、倾转/成像条件选择或信息价值评分；当前图像不能区分就保留歧义。不需要通用 Agent 框架、另一套证据数据库或大规模科学后端替换。可精简默认入口和文案，复用现有工具/Panel/不可变记录，但本轮没有进行架构重写。

三项修复经审查合入后，最值得优先处理的是：

1. **限定一类 ROI 测量的误差与未判契约。** 把标定相关误差、峰定位、有限窗/混叠与未分辨多周期分开；预注册正反例和应未判集。不能把匹配容限、FFT bin、数值舍入门槛当测量 SD 或覆盖率。
2. **限定候选集的反证能力与配准依赖。** 用相同图像、固定标定/配准约束比较正确/错误/投影等价候选，保留未匹配反射与可见性未知。目标是解释相容和冲突，不是给唯一物相或未经校准概率。
3. **限定一种成像模态下 GPA 的可解释条件。** 固定参考、混合域、低幅和对比变化反例，分别验收数值结果、带宽和相位来源假设。无法区分应变与成像变化时保持未判；不发展自动实验规划来掩盖当前证据不足。

## 8. 交付问题的直接答案

**哪些任务可信？** 在本轮合成与历史兼容覆盖内，明确 ROI 的数值 FFT、给定标定下的投影周期/方向测量、完整保存的有序候选模型几何，以及明确约束下的有限候选相容性检查，可为研究者提供可检查证据。GPA 和闭合量只在各自相位模型与参考条件下作为诊断。

**哪些条件应未判？** 标定缺失/冲突、数值未分辨、峰/相位质量不足、未知历史准入、重复 Fourier 证据、混合域/投影叠层、无法支持成像假设、候选投影不可辨识、检查未执行或证据互相冲突。原始观察可保留；不把缺证据写成排除。

**哪些结果算得出却不能作相应物理解释？** FFT 周期不能独自确定 HKL/物相；field 标签不能确认真实结构域；GPA 应变图不能确认材料应变；整数 winding/投影 b 不能确认真实三维 Burgers/位错；有限投影匹配不能确认唯一物相/孪晶/三维界面；同 FFT 派生的多个对象不能当多份独立证据。

最终回答应是“这张图支持哪些可能解释、分别依据什么、做过哪些检查、有哪些冲突和无法判断之处”，而不是“架构合理、测试全绿”。

[pr57]: https://github.com/wuchqwq/microscopy-workbench/pull/57
[pr58]: https://github.com/wuchqwq/microscopy-workbench/pull/58
[pr59]: https://github.com/wuchqwq/microscopy-workbench/pull/59
[pr60]: https://github.com/wuchqwq/microscopy-workbench/pull/60
[pr61]: https://github.com/wuchqwq/microscopy-workbench/pull/61
[audit1]: https://github.com/wuchqwq/microscopy-workbench/blob/79e19f488e6ef5f514ab47c4772660d840aceb9e/ALGORITHM_AUDIT.md
[audit2]: https://github.com/wuchqwq/microscopy-workbench/blob/6c24dd7385cef2ca79b59460767e7fe8278c7732/audits/scientific_algorithms_round2/ALGORITHM_AUDIT.md
[literature57]: https://github.com/wuchqwq/microscopy-workbench/blob/4141225653b41b134a76c5b2119888c01c481f54/docs/SCIENCE_FIX_LITERATURE.md
[gpa-report]: https://github.com/wuchqwq/microscopy-workbench/blob/b238f9722b31c2959c871bba210c87977d94c2a8/docs/GPA_EVIDENCE_BOUNDARY_REVIEW.md
[gpa-evidence]: https://github.com/wuchqwq/microscopy-workbench/tree/b238f9722b31c2959c871bba210c87977d94c2a8/docs/evidence_boundary_review
[gpa-fixtures]: https://github.com/wuchqwq/microscopy-workbench/tree/b238f9722b31c2959c871bba210c87977d94c2a8/tests/fixtures
[occupancy-report]: https://github.com/wuchqwq/microscopy-workbench/blob/f05b32f5ee659ce0fbab97998f6048364e56a454/docs/SITE_OCCUPANCY_REPAIR.md
[occupancy-evidence]: https://github.com/wuchqwq/microscopy-workbench/tree/f05b32f5ee659ce0fbab97998f6048364e56a454/docs/site_occupancy_evidence
[occupancy-history]: https://github.com/wuchqwq/microscopy-workbench/blob/f05b32f5ee659ce0fbab97998f6048364e56a454/tests/fixtures/site_occupancy_history.py
[topology-report]: https://github.com/wuchqwq/microscopy-workbench/blob/7b48520a92fb086dbf29572a49c580bdb7292b64/docs/TOPOLOGY_BAND_DEPENDENCE_REPAIR.md
[topology-evidence]: https://github.com/wuchqwq/microscopy-workbench/tree/7b48520a92fb086dbf29572a49c580bdb7292b64/docs/topology_band_evidence
[topology-fixture]: https://github.com/wuchqwq/microscopy-workbench/blob/7b48520a92fb086dbf29572a49c580bdb7292b64/tests/fixtures/topology_band_dependence.py
[flat-report]: https://github.com/wuchqwq/microscopy-workbench/blob/31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a/docs/FLAT_SPECTRUM_REPAIR.md
[flat-evidence]: https://github.com/wuchqwq/microscopy-workbench/tree/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/docs/flat_spectrum_evidence
[flat-fixture]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/tests/fixtures/flat_spectrum_saved.py
[occupancy-serialization]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/crystallography/structure_tools.py#L130
[occupancy-simulate]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/crystallography/structure_tools.py#L339
[occupancy-policy]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/crystallography/occupancy.py#L42
[topology-source]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/tools/image_topology.py#L86
[topology-policy]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/tools/image_topology_core.py#L29
[peaks-source]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/tools/image_peaks.py#L47
[panel-source]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/tools/image_panel.mts#L37
[gpa-source]: https://github.com/wuchqwq/microscopy-workbench/blob/e06bcd64fa2e31437b941cd8f3ddb81fe5df6ffb/ui/image-panel/gpa-evidence.mts#L37
