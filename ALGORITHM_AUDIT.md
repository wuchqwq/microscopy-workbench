# Microscopy Workbench 科学算法专项审查

审查日期：2026-11-01，Asia/Shanghai。结论针对下面固定源码，不代表其他分支、真实样品或整个显微成像方法的验证。

**当前可以保留的是可追溯的局部数值观测和有条件的模型比较；不能据此宣称任意物相、孪晶、位错或三维结构被自动确认。** 本轮复现了两项 P1 科学证据错误和两项 P2 数值/状态错误。应先限制受影响路径，再以单独变更修复。没有修改生产算法、阈值、旧对象或稳定基线。

## 1. 审查边界、独立性与仓库状态

| 项目 | 本次核对结果 |
| --- | --- |
| 仓库 | <https://github.com/wuchqwq/microscopy-workbench> |
| 源码 SHA | `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c` |
| Git tree | `82facfce75c5909c510cb5014e228918904f5de4` |
| main 核验 | 读取 AGENTS.md 后执行 `git fetch origin main`、`git rev-parse` 和 `git ls-remote --heads origin main`；远端仍指向此 SHA。不是从历史稳定标记推断。审查期间再次查询相同。 |
| 审查分支 / worktree | `audit/scientific-algorithms`；`/Volumes/External SSD/mircograph/algorithm-audit-20261101`。接续时该独立 worktree 已存在且干净，HEAD 等于上述 main；没有在共享工作区切分支。 |
| 其他登记 worktree | 历史验收 worktree 为 detached；`shared-workspace-20261101/source` 在 `feature/shared-workspace-dual-entry`，开始时干净，HEAD 同上。仅读取状态。 |
| 未合并 PR | GitHub 连接器查询到 [#45](https://github.com/wuchqwq/microscopy-workbench/pull/45)，私有单样品 intake / validation protocol；不属于本次被测 main，也未读取私有样品。 |
| 独立审查者 | 实际调用 `spawn_agent(model="gpt-6-astra", fork_turns="none", reasoning_effort="high")` 创建 `astra_scientific_review`。模型选择调用成功；并非将主审身份改名。独立审查稿、程序与实际结果随附。 |
| 隔离 | 本 worktree 新建 `.venv` 和 `node_modules`。没有操作人机共享 GUI、运行中的服务、用户启动脚本或全局配置。 |
| 提交范围 | 审查文档、独立探针、精简原始结果与执行记录；没有生产修复。用户已明确要求创建 PR；不自动合并。 |

遵守 [AGENTS.md](AGENTS.md)：原数据只读、带符号 XY 标定显式、PNG 与科学数组分离、保留请求/结果历史；执行了 `npm test` 和独立 Python 环境下的 `npm run test:science`。既有设计说明、验收报告与 AI 评价只用于定位待核查主张，未作为正确性证明。

完整 C/D/E 独立分析见 [astra_review.md](audits/scientific_algorithms/astra_review.md)。主审亲自复查了两个 P1 的源码路径和数值反例。外部依据与版本差异见 [SOURCES.md](audits/scientific_algorithms/SOURCES.md)，实际命令、失败和留存位置见 [EXECUTION.md](audits/scientific_algorithms/EXECUTION.md)。

## 2. 算法地图：到底解决什么问题

项目合理目标是：从明确来源、帧与 ROI 出发，保存可检查、可修订的晶体学相关证据，由研究者检验解释。手工 ROI → FFT/测量是完整入口，不必先建立全图结构场。

| 实际模块 / 源码 | 输入观测量 → 预处理 → 中间量 | 输出及下游用途 | 前提与不能推出的结论 |
| --- | --- | --- | --- |
| 局部 FFT：`tools/image_workspace.py:1189,1338–1369` | 原标量数组及半开 ROI → float64，按请求先去原 ROI 均值、再 separable Hann → 未归一化负指数 DFT，fftshift complex128 | 复数组、原 ROI、频率坐标与哈希；峰、测量、GPA 的输入 | 窗口有限、采样有 Nyquist 限制；FFT 成功不证明晶格，更不等于电子衍射强度。 |
| 峰与距离：`image_peaks.detect/run`；`image_calibration.geometry/frequency_axes` | 复 FFT 振幅 → 3×3 局部极大值、DC 排除、相对阈值、NMS → 可选三点 log 抛物线插值；点对经过独立标定 | 候选 q、方向、周期、DC 角色、未知误差；atlas/field/结构比较消费测量记录 | 峰可来自噪声、重叠周期、成像传递或舍入；相对振幅不是 SNR。DC 到峰的 `d_spacing` 在此首先是 **1/投影频率模长**，不是已定 HKL 的三维晶面间距。 |
| 局部签名/结构场：`image_spatial_atlas.py`、`image_domain_compare.py`、`image_feature_field.py` | 多 ROI 的现存峰测量 → 同/反向数值相等向量合并为 family → 周期、无向角、有限 SO(2) 角假设下的一对一匹配 | sparse features、valid/ambiguous/insufficient、selected-signature 相容关系；供 domain map 和候选工具使用 | 反映所选周期、方向及阈值可见性，不独立测量相、厚度或组成；至少两个数值非共线方向不等于两个可实验分辨方向。 |
| 域与自动入口：`image_spatial_domains.py`、`image_discovery_core.py` | 同尺度窗口接触/间隔及签名 → 邻接图/connected components；或图像 Gaussian 梯度 → 局部结构张量、能量、方向分散 → 固定权重 heuristic | candidate domains / 宽支持带；或最多四个注意 ROI，供明确后续 FFT 检查 | stride 是中心采样间隔，window 是有限支持，均不是边界定位误差。结构张量测图像梯度；平滑照明、成像对比也可产生候选。没有候选不是没有缺陷。 |
| GPA：`image_gpa.py`、`image_gpa_core.py` | 已存 **无 Hann** 的实空间图像 FFT + 两个非共线 g + reference → 截断 Gaussian 掩膜、逆变换、解调相位、振幅/边界/残差/unwrap 掩膜 → `u_E` 与梯度 | 位移、F、Green–Lagrange E、polar rotation、validity masks；拓扑消费原包裹相位，不能以光滑应变图代替 | 单域且选中 Fourier 相位主要由位移引起；reference 是假设，valid 不是物理模型正确性。叠层、界面、基元对比变化会产生伪应变。 |
| 拓扑：`image_topology.py`、`image_topology_core.py`、`image_topology_legacy_v1.py` | 同一 FFT/grid/metric/bandwidth 的 fixed-g GPA → 包裹相位闭合边增量 → 每环 winding、路径质量、v2 严格嵌套分组 → `G b=-w` 及留一反射比较 | 每组投影闭合候选、未判/部分/一致性状态；可与用户 b 候选比较 | 这是投影相位净闭合量及条件位移不连续拟合；不是常规三维 Burgers 矢量或物质位错证明。D-01 目前破坏了独立反射冗余门槛。 |
| 晶体与衍射：`crystallography/{geometry,indexing,hexagonal,orientation,structure_tools,reflection_compare}.py` | 显式测量/DC/标定，或用户 CIF/extXYZ 晶胞/位点/占位/取向 → 倒易几何、有限 HKL/结构候选、diffsims 运动学模型 → 理论反射表 | 保留匹配/未匹配/歧义反射、实验投影周期与模拟三维 d 的区别；给有限候选比较使用 | `uvw @ A` 为实空间方向，HKL 用倒易基；cycles/length 不含 2π。理论结构不是实验组成，kinematic intensity 不是 HRTEM FFT intensity。E-01 会丢失部分占位。 |
| 取向/孪晶与跨方法：`twin_geometry.py`、`general_evidence.py`、`registration_proposal.py`、`image_method_policy.py`、`image_active_analysis.py` | 明确候选及共用配准、相邻/重叠 ROI，或已存 GPA 质量、预算、显式回路 → 有限比较/规则停止/下一步建议 | conditional compatible/incompatible/insufficient；有来源的动作建议与账本 | 不是统计证据融合、自动物相或三维界面识别。新 artifact/新请求不增加独立证据；已测同一 FFT 的多个模块高度相关。 |

另外存在 `image_sequence` 的整数互相关 ROI 映射、`crystallography/detection.py` 的独立衍射 spot/中心估计与传统索引 CLI、native/DM 文件导入和数值 probe/profile 等辅助入口。本轮有源码定位但没有独立全面数值验证；这些入口不能借用相近 FFT/GPA 测试获得资格。

信息来源必须保留这五层区别：

1. **实际观测**：原始采样数值、坐标、ROI、DFT 复数、选中峰的位置、路径相位差。
2. **标定和用户假设**：nm/pixel、轴符号、DC（对导入衍射标量）、source domain、reference 区域、模型成立理由。有效格式和来源不等于独立校准。
3. **算法先验**：窗口/滤波宽度、阈值、非共线/条件数、回路分组、候选列表、相位 unwrap、预算规则。
4. **模拟信息**：晶胞、HKL、基元、占位、散射模型及取向的预测；不能回写成测得的材料身份。
5. **可支持结论**：指定条件下的投影周期、相位/位移模型及有限候选相容性；不是唯一物理解释。

## 3. 按严重程度排序的可复现问题

分类：①数学/代码错误；②实现正确的方法局限；③超适用范围；④输出解释过强；⑤证据不足；⑥可选改进。下列四项是本轮发现的实际问题，后面的局限单独列出。

| ID / 优先级 | 分类 | 具体后果 | 处置 |
| --- | --- | --- | --- |
| E-01 / P1 | ①③ | extXYZ per-site occupancy 在保存后消失；部分占位模拟与全占位相同，甚至重新获得 full-occupancy FCC 孪晶准入 | 修复前不信任含显式占位属性的该路径；需显式保存/准入与历史版本方案 |
| D-01 / P1 | ①④ | 同一 Fourier band 被稍微移动中心重复提取后，误计为第三方向并 `redundancy_validated=true` | 修复前不能仅凭该标志把两方向拟合升级为冗余拓扑证据 |
| A03 / P2 | ①④ | 平移后的单脉冲由舍入产生峰；63×63 反例进入 valid 两方向特征场 | 对纯数值峰增加有数学依据的突出度/舍入审查；不能把 valid 当晶格资格 |
| A02 / P2 | ①④ | 相同未标定 ROI 的 physical signature 比较返回 incompatible | 缺标定应 not_comparable / insufficient，不能视为物理反证 |

### E-01：部分占位被静默替换

位置：`structure_tools.load_structure` 145–185；`atoms_data/from_data` 129–142；`simulate` 334–337、381–383；`twin_geometry.qualify` 74–84。最小输入为带 `Properties=species:S:1:pos:R:3:occupancy:R:1` 的 extXYZ。

两 Cu 位点 `(0,0,0)`、`(1/2,0,0)`，占位 `[1,.5]` 与 `[1,1]`：独立手算 `F100/fCu=1−occ₂`，应分别有基元强度 `.25` 与 `0`。实际 public `open→simulate` 的整个反射表完全相同，部分占位的 ±100 消失。另一个 FCC4、一点占位 .5 的例子，直接 `qualify` 拒绝，public `open→orient→twin_orient` 却接受。不是 PNG 归一化造成的差异。

科学影响是改变消光、候选可见反射和模型适用性。原文件哈希保存正确不能弥补解析属性丢失。完整源文件、哈希、请求/响应、参数和外部依据见 [独立复现 E-01](audits/scientific_algorithms/astra_review.md#e-01--p1-extxyz-partial-occupancy-discarded-before-simulation-and-twin-admission)。

建议先 fail closed 地拒绝未支持的显式部分/冲突占位，或规范保存逐位点占位，再由模拟和孪晶使用相同门槛。本轮不新增部分占位模拟。旧对象缺字段不能推定全占位；纠正必须从保留的原 source 建立新对象与版本，关联旧结果但不改写它们。

### D-01：重叠 Fourier 掩膜制造“冗余证据”

位置：`image_topology._source_bundle_records` 110–140 只合并 exact/conjugate 相等的 g；`image_topology_legacy_v1._direction_families` 97–110 只判近数值平行；294–333 的留一拟合将其升级。v2 仍复用该核心。

256² 图像 `cos(2π·.125x−θ)+cos(2π·.125y)`，`θ=atan2(y−127.5,x−127.5)`，只有两个生成载波。GPA1 选 `[(.125,0),(0,.125)]`；GPA2 选 `[(.125,.004),(0,.125)]`；共同 σ=.014，固定 reference `[50,50,75,75]`，回路 `[75,75,182,182]`、`[60,60,197,197]`。

重复掩膜支持重叠 94.12%，权重归一化内积 .97969；中心仅移 1.024 bins。实际完整 saved-worker 链得到三 direction families、`b≈[8,0]`、全部 leave-one-out 通过、`redundancy_validated=true`、`projected_topological_evidence`。改变解调中心只增加一个闭合积分为零的平滑相位斜坡；代数留一检验无法证明取得了新反射。

预期保留每个诊断量，但最多为 two-reflection constrained candidate，不能声称第三独立反射。完整反例及正对照见 [独立复现 D-01](audits/scientific_algorithms/astra_review.md#d-01--p1-same-fourier-reflection-counted-as-redundant-topology-evidence)。建议新增跨 GPA 的 direct/conjugate Fourier 支持独立性策略，保守策略可以拒绝不同 band 的交叠；更宽松策略需要独立的分辨率依据。需要新版本，不能改写 v1/v2 的既有解释。

### A03：单脉冲的数值平坦谱被检测为晶格签名

位置：`image_peaks.detect` 36–49 用 `amplitude > local_minimum` 的严格浮点比较排除平坦谱；`image_domain_compare.py:261–274` 只把峰截断作为主要可用性标志；`image_feature_field.py:104–127` 可据此标 valid。

最小反例：63×63 float32 数组，除 `[y=20,x=25]=1` 外全零，`window=none, subtract_mean=false, max_peaks=12, threshold_rel=1, refinement=none`。解析 DFT 为一个单位模长复指数，任意位置都应没有局部振幅峰。实际振幅 peak-to-peak 仅 `1.1102230246251565e-15`，却得到四峰、两 family，`selection_limit_reached=false`，public spatial_field 为 `valid`。相同脉冲在原点返回零峰；64² 平移脉冲返回 12 峰/截断。**平移不应制造谱的幅度极大值。**

见 [edge_probes.py](audits/scientific_algorithms/edge_probes.py) `shifted_impulse` 与 [原版实际结果](audits/scientific_algorithms/evidence/edge-probes-r2-summary.json)。阈值 1 是合法的最高相对阈值，不是调低阈值诱发；默认 .05 的平移反例也观察到峰，只是截断使下游更保守。

这会把舍入起伏作为科学测量入口。峰目前标 hypothesized，field valid 也有免责声明，因此不是“自动确认物相”的错误；但不满足源码对 constant-magnitude spectrum 的明确排除意图。建议对数值突出度给出与精度/变换误差相关的准入定义并版本化；保留旧检测记录。不要以放宽或为此样例拟合一个任意 SNR 门槛替代分析。

### A02：缺标定被输出为“不相容”

位置：`image_domain_compare.vectors_in_domain` 65–69 正确发现缺少 active scale；`_entries` 270–271 却设 `geometry_status="incompatible"`；`derive` 301–306 输出 `status="incompatible"`。

最小反例：64×160 图像 `2cos(2πx/8)+cos(2πy/8)`，ROI `[0,0,64,64]` 与 `[32,0,96,64]`（也测了非重叠第三 ROI）。同一 atlas、tolerance=.001：pixel 比较 `compatible_signature`，physical 比较因没有标定而 `incompatible`。原始 reason 仍写明缺标定；数值没有伪造，但机器消费者可把 status 当物理反证。

预期 physical 为 `not_comparable` 或 `insufficient_evidence`，保留 pixel 观测；不是断言两个签名不同。见 [main_probes.py](audits/scientific_algorithms/main_probes.py) `field_scope`、[原版结果](audits/scientific_algorithms/evidence/main-probes-r2-summary.json)。`general_evidence.assess_side` 对同类缺标定已经返回 insufficient，问题局限于 local signature 状态传播。

建议为新比较增加明确 unavailable 原因/状态，并对历史对象读取保持旧语义；如修改重建验证规则，必须有显式版本分支，不可让既有对象突然因重算状态不同被判损坏。

## 4. 已核查合理的设计及独立依据

| 检查 | 本次证据与结果 | 限定 |
| --- | --- | --- |
| FFT 符号、原始 ROI、奇偶/矩形坐标、去均值/Hann 顺序 | 33×41 与32×40，四种预处理组合；逐 bin 用独立矩阵有限 DFT/余弦 Hann 公式核对，最大绝对误差 `6.99e-12` | 未把 NumPy FFT 当自身真值；对 float32 实际观测求真值，未以量化前信号偷换输入 |
| signed anisotropic metric / 2π | `(sx,sy)=(.02,-.03)`，q=(5/64,3/64) 得 `(3.90625,-1.5625)` cycles/nm，周期 .2376900328666 nm；翻符号改方向，尺度×10 周期×10；不含2π | 这是给定标定下的几何；错误标定仍会给出错误物理数值，来源文本不是校准证明 |
| 实际坐标翻转/90° rotation | 分析式预期 q 在 X flip 为 `(-qx,qy)`；数组 rot90 为 `(qy,-qx)`；实际 saved FFT 峰吻合 | 共轭 ± 不是两份独立观测 |
| DC 和数据域 | 非 DC 点对保留 geometric period 而不给 d_spacing；缺 scale 不填物理单位；显式 reciprocal scalar 不能经 FFT+反向声明进入 GPA | 纯 FFT 工具可执行数学变换，不表示合格晶格输入 |
| ROI/域的保守边界 | 间隔32 px 的同纹理窗口在 domain_map 为 unknown；只改变第三载波振幅使 family 3→2 时，partial match 保持 unknown | 重叠 ROI 相关；图连接分量只证明逐边相容。手算链 AB/BC 相容而 AC 不相容也已复现 |
| GPA 数学 | 独立已知 `F⁻¹=[[31/32,1/32],[0,33/32]]`、signed anisotropic metric；F/E/rotation 最大误差在 `5e-14` 内；另测14.25°刚体转动 E≈0（误差<6.8e-14）；fixed_g 保留均匀形变，fit_reference 移除它；缺第二载波拒绝 | 有限 Eulerian 定义与原论文 infinitesimal 解释分开；不是绝对应变、真实材料或大形变全域资格 |
| winding/掩膜 | 解析 atan2 漩涡得到 `G b=-w`、b=[8,0]；反向回路改变 raw sign 而 canonical b 保持；路径零振幅使 unavailable；±漩涡同时包围给零净 winding；v1全局与v2分组及环带新增反号相位奇点的差别分别保留 | 零净 winding 不能排除多个缺陷；合成分组测试不是旧对象全档案回放；D-01 冗余准入另有缺陷 |
| 晶体几何与匹配 | oblique direct-cell orientation 与独立基一致；固定晶格参数 F[001] 候选；HCP 两位点复数和；100个3×4矩阵穷举匹配真值；+60°[111] symbolic Rodrigues | 不等于所有 HCP/noisy index search、全 crystal/twin worker 路径均已通过 |
| 模拟坐标 | public open→orient→simulate 的27°旋转 cubic cell 保持 Cartesian basis，q 与独立 HKL/3.6 实验室坐标吻合 | diffsims0.7.0 运动学近似；不验证实验强度、厚度或动力学效应 |
| 跨方法停止 | 缺 seed 要信息，unknown request 停止并指向原请求，冲突 topology 保留并停止；没有物质缺陷确认标志 | 停止策略是有限启发式，不是完备科学决策系统；D-01 说明 shared source 绑定仍不够 |

## 5. 不能靠修小 bug 消除的方法局限

| 条件 / 反例 | 分类 | 可计算值为何不能相应解释 |
| --- | --- | --- |
| 混叠 | ②③ | `cos2π(.625x+.125y)` 与 `cos2π(-.375x+.125y)` 在整数采样上相同（本例误差<5.1e-14）；连续周期1.5689 px和表观周期2.5298 px无法仅从样本区分。不能证明没有更高频结构。 |
| 相近双周期、有限窗 | ② | 两个真实载波相距 .6/96 cycles/pixel，48/96及none/Hann四种设置都只给一对主峰，中心随窗口变化。插值精度不等于分辨率；局部峰数不等于结构成分数。 |
| contrast-only GPA | ②③ | 固定载波上改变 quadrature 对比权重、真实生成模型位移为零，得到 Exx约−1.94%至+2.05%。这不是符号 bug；不同物理模型产生同一图像相位，掩膜有效不能辨别它们。 |
| contrast vortex / 重叠域 / 多缺陷 | ②③ | winding 可以是成像/基元对比的相位奇点；闭合量是净值，穿越不同域不满足单一 G 的模型。真正3D Burgers、位错线方向、深度不可由此唯一恢复。 |
| 两个“数值非共线”方向几乎平行 | ②⑤ | 本例 `[.1,0],[.2,1e-9]` 仍通过 field 数值 rank；不代表实空间有限窗口能分辨其方向。此 field 本来只是描述性特征；不能借此绕开 GPA/twin 更严格的模型准入。 |
| 结构张量/自动候选 | ②⑤ | 常数和该固定白噪声没有候选，但无晶格的平滑 Gaussian blob 有4个注意 ROI；同载波 amplitude dip 也可漏检。注意候选不等于缺陷分类，lag correlation 不是晶格/噪声检验。 |
| 有限投影结构匹配 | ②③ | 已执行 F cubic a=.4nm生成的三个向量同时接受 P cubic a=.2nm替代候选；输出正确保留非唯一性，未称化学物相已识别。候选同投影、不同基元或深度仍可相容。未匹配模拟反射可来自有限成像传递/检测，也可反驳候选；不建立可见性模型时既不能忽略成独立支持，也不能硬作排除。 |
| 自由注册或候选相关拟合 | ③④风险 | 低层 comparison 可应用显式scale/rotation/translation；若每个候选用同一组点拟合再用同点“验证”，即循环论证。高层 general/twin 固定 scale1、DC0与共用配准的限制合理；存在参数不等于参数有独立依据。 |

物相、HRTEM/STEM/ptychography 图像 FFT、SAED 等数据形成机制不同。本代码已经限制几何比较并保留 simulated intensity 而不直接拟合实验 FFT intensity；应继续维持。即使 full-occupancy bug 修好，也不能把运动学消光/强度看作厚样品电子衍射的无条件真值。

## 6. 历史负结果与主动策略的证据解释

本轮核对了 [F4b 原比较 CSV](docs/examples/discovery/primary-comparison.csv)，保留其原始定义与失败：64px automatic image-first 对 amplitude dip 和15° orientation interface 都漏检；128px field 对 dip 也漏检，对 orientation 给两个支持带。手工选择带有已知真值辅助，不是自主策略胜利。[事后尺度诊断](docs/examples/discovery/scale-diagnostic.json) 不能替换主比较。

新独立 dip 探针使用另一条明确余弦公式，同样输出0候选；它是新失效例，不冒充历史实验的复跑。没有后验改阈值使它通过。

核对 [method-loop 原比较](docs/examples/method-loop/actual-comparison.csv) 与 [后续性能记录](docs/examples/method-loop/performance-closeout.csv)：主动策略在部分 smooth/noise 情况少执行科学调用；positive/contrast 路径没有增加不同的科学证据，且额外决策/追溯成本使其更慢。后续同一记录中 positive active约15.72s、fixed约5.04s。不能把跨运行不同输入成本的数字混作单一速度比较。

本轮没有重做完整随机化、等预算策略 benchmark：**NOT_TESTED**。现有小样本只能支持特定止损/少调用的收益，不能证明通用检测率、定位精度或信息增益优于简单流程。保留手工 ROI→局部 FFT/测量的直接流程，主动策略继续作为可检查的可选建议。

## 7. 尚无充分证据、继续保留和修复计划

**NOT_TESTED**：真实样品/原子真值、仪器校准误差和传递函数、厚度/多重散射、3D结构/真实Burgers、实验强度模型、广泛噪声/窗宽/混合域参数扫查、GPA 大变形与各类断开掩膜的失效概率、统计置信区间、完整 noisy HCP/index search 完备性、所有 constrained registration/general_compare/twin_compare 的 saved-worker 路径、legacy v1 全档案字节级回放、GUI 手势和 Windows 资格。本轮不从合成数值验证宣称真实材料准确性通过。

| 模块 | 建议 |
| --- | --- |
| 显式 ROI FFT、signed calibration、DC 测量 | 继续保留为可追溯观测；周期先按投影/采样解释，校准另证 |
| 峰/field/domain | 修 A03、A02；在此之前逐项检查输入/峰突出度；valid 只表示有限几何记录，不是晶格/域确认 |
| automatic discovery / active sampling | 继续 EXPERIMENTAL，保存所有候选和漏检；不强迫全图 field、不宣传普遍收益 |
| GPA | 保留单域、选定反射和参考下的相对证据；界面/低幅/叠层/成像变化无独立依据则未判 |
| topology | 原始 winding 与投影候选可以保留；修 D-01 前严格审查 Fourier 独立性，不依赖冗余布尔量提升结论 |
| crystal simulation / twin | 修 E-01；明确 full occupancy、给定结构、已限定运动学范围。有限几何相容不等于真实物相/孪晶确认 |
| 方法替换 | 本轮没有证据支持全面重写或更换数值后端。任何放宽阈值、替换方法须另立假设、对照、迁移与验收方案 |

最值得优先处理的三项工作：

1. **修复结构科学属性保存/准入**：覆盖 extXYZ/CIF info与arrays、占位冲突、open→reload→simulate/twin；先拒绝未支持情况，建立旧对象显式重分析方案。
2. **修复拓扑反射独立性**：跨 saved GPA 检查 direct/conjugate Fourier 支持；新版策略必须同时通过 D-01 负例、真实第三载波正例、exact alias、harmonic、历史读取。
3. **补齐观测资格与未判语义**：A03 的数值平坦谱/平移不变性、A02 的缺标定状态；以预注册噪声/混周期/窗口系列约束规则，不为单例放宽门槛。随后才评估有限候选与主动策略的实验收益。

这三项都应各自小 PR；审查提交和修复提交分开。对象 schema、evidence policy、algorithm version 有变化时先提交迁移设计。旧请求、输入哈希、结果和解释不改写；新版通过新的请求/对象表达，显式关联旧证据。

## 8. 当前可信任务与必须未判的边界

**在本轮合成证据覆盖范围内可信**：明确实标量图像/ROI 的有限 DFT、坐标/标定换算和 DC 几何周期；已检查峰的描述性局部签名；单域且相位来源假设成立时，相对于给定 reference 的 GPA 数值；合格路径的包裹相位净 winding；本次测试的完整占位立方候选的取向及保留反射坐标（不含普遍模拟完备性或强度准确性）。它们适合给研究者提供可追溯的检查材料。

**应未判**：缺/冲突标定、低幅或无效路径、未分辨或截断峰、反射来源不独立、混合域/投影叠层、候选歧义、模型/成像假设无法支持，以及本轮尚未验证的真实样品适用性。原始观测可保留，不应把缺证据写成排除结论。

**算得出也不能这样解释**：FFT周期≠唯一晶面/HKL或物相；field标签≠真实材料结构域；GPA彩色应变≠已证实材料弹性应变；整数winding/拟合b≠真实三维Burgers或位错；有限候选匹配≠唯一物相/孪晶/三维界面；多模块复用同一FFT≠多份独立实验支持。
