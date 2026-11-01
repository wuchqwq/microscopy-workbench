# FFT 峰质量：16 项来源与规则的独立核对

审阅日期：2026-11-02。结论：草案适合指导有界分析；这些来源没有为本项目建立二维电镜 FFT 的逐峰检测概率、分辨资格或物相认证。以下“可借用”是原则迁移，不能代替项目验证。

## 审阅对象与当前实现

- 主执行者从实际 ZIP 字节独立计算的 SHA-256：`69a7d747aaff30d6a711ec5f23a03159afcfe2209833637b36522a91d9a6add0`。主执行者也逐项验证 ZIP 内 SHA256.json；子审阅者读取解压文本。
- 实际阅读：相邻 worktree 的 `analysis/peak-quality-draft/01_Literature_and_Protocol_Draft.md`（v0.1）；文本独立计算 SHA-256：`e96f74173aa1dcd7644d4f85a5ca838f40379652031271faaf7822666cfc9072`。文本与附件是不同对象，不声称二者字节一致。
- 历史参照：[#61](https://github.com/wuchqwq/microscopy-workbench/pull/61)。草案引用固定源码 `31e0edeca7a9e07b8ec575e0781dfea5dec1ab0a`；当前审阅 HEAD 为 [#63](https://github.com/wuchqwq/microscopy-workbench/pull/63) 的 `3d59c2b5`（本地短 SHA `3d59c2b`）。PR 编号来自任务上下文；源码结论来自本地文件阅读。
- [当前 `image_peaks.py`](../tools/image_peaks.py) 的 `numerical_contrast()` 纳入完整 FFT（含 DC）的幅度尺度和二范数；这是修正大背景舍入影响的版本化准入策略。源码明确 `certified_fft_error_bound=False`、`individual_peak_resolution_established=False`、`statistical_or_physical_validity=False`。全图邻域幅度起伏通过，不能认证每个返回峰。
- `peak_table` 的 `sampled_amplitude`、`local_median_amplitude`、`local_peak_to_median_ratio` 是描述量；`localization_uncertainty_bins=None`、`status="hypothesized"`。`min_separation_bins` 是非极大值抑制参数，不是已验证的两峰分辨阈值。`refinement_note` 记录局部插值方法，不提供置信区间。以上均可直接连接现有 Skill，无需修改算法或依赖。

## 来源—假设—规则对照

“全文片段”指拿到全文并阅读所列部分，不代表通读全部推导。动态文档版本是网页展示值，不是本项目安装版本。访问与阅读记录见 [source_audit.json](peak_quality_evidence/source_audit.json)。

| 编号与一手来源 | 本次实际阅读／版本 | 支持的规则及不能外推的边界 |
|---|---|---|
| R01 Harris (1978), DOI `10.1109/PROC.1978.10837`；[原论文公开镜像](https://web.mit.edu/xiphmont/Public/windows.pdf) | 原论文 PDF 摘要、引言及有限观察/窗的段落；原草案 UNR 镜像超时，IEEE 页为访问验证。 | 有限长谐波分析中的主瓣、旁瓣、强弱邻频取舍，可指导窗敏感性对照。1D 窗性能表不认证二维显微峰间距阈值；加窗也不总能改善分辨。 |
| R02 [SciPy Spectral Analysis](https://docs.scipy.org/doc/scipy/tutorial/signal.html#spectral-analysis) | 官方 v1.18.0；有限时长正弦、加窗、补零、归一化段落。 | 补零加密频率取样；幅度与功率密度归一化不同。将其移到二维时必须记录离散窗、轴、顺序与缩放，不能凭更密网格声称新增观测支持。 |
| R03 [find_peaks](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.find_peaks.html)／[peak_prominences](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.peak_prominences.html) | 官方 v1.18.0；参数、Notes、突出度算法。 | API 输入为 1D；局部极大值、突出度、宽度是不同描述，噪声会移动极大值。只能借定义区分量，不可把当前二维峰/局部中位数比称为 SciPy prominence、SNR 或显著性。 |
| R04 FFTW [accuracy comments](https://fftw.org/accuracy/comments.html)／[methodology](https://fftw.org/accuracy/method.html) | 官方两页正文；页面未标发布版本。 | 误差依赖实现、精度和平台；基准用超过 40 位十进制精度的 FFT 作前向误差参照，且说明基准仅支持 1D。这不证明 PocketFFT 任意二维输入的逐点误差界，也不认证当前固定系数。 |
| R05 abTEM [Images.poisson_noise](https://abtem.github.io/doc/reference/api/_autosummary/abtem.measurements.Images.html#abtem.measurements.Images.poisson_noise)／[Noise 示例](https://abtem.github.io/doc/user_guide/walkthrough/scan_and_detect.html#noise) | 官方动态 API 与示例；网页未核实 release/tag。 | 剂量、像素面积、强度归一化共同决定 Poisson 均值，API 有 seed。可用于合成模型接口对照；任意 TIFF 灰度不能直接解释为电子计数或剂量。无需新增 abTEM 依赖。 |
| R06 Foi 等 (2008), DOI `10.1109/TIP.2008.2001399`；[作者稿](https://webpages.tuni.fi/foi/papers/Foi-PoissonianGaussianClippedRaw-2007-IEEE_TIP.pdf) | 全文片段：摘要、§I–II、裁剪模型式(29)；文件标记 TIP-03364-2007-FINAL。 | RAW 光学传感器模型有互相独立的 Poisson 与 Gaussian 部分，裁剪产生非线性响应。可借信号相关方差与偏置/增益/裁剪分账；不能视为特定电子探测器或重建图的已校准噪声模型。 |
| R07 Cheng & Schwartzman (2017), DOI `10.1214/16-AOS1458`；[作者预印本 v2](https://arxiv.org/html/1405.1400v2) | 阅读 v2（2014-05-07）摘要、§2.1–2.3、条件峰高分布段落；[PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6746560/) 本会话为 reCAPTCHA，子审阅者未取得期刊正文；主执行者独立取得 PMC 摘要和引言（见补记）。 | 模型要求正峰信号、平滑后平稳遍历 Gaussian 随机场及可微/协方差条件；局部极大值选后条件分布与多重检验有关。FDR 控制为指定渐近条件下的结论。FFT 幅度/功率不自动满足该模型；STEM 是算法名。 |
| R08 Rife & Boorstyn (1974), DOI `10.1109/TIT.1974.1055282`；[NASA 原论文条目](https://ntrs.nasa.gov/citations/19740062423) | 书目与摘要；条目明确没有可下载全文。 | 有限个含噪离散观测的单一复正弦、ML/CRLB 及门槛行为。支持“精密定位与分开两峰是不同问题”的方法提醒；未核对具体噪声假设/公式，不移植成二维定位误差或通用两峰界。 |
| R09 NIST TN 1297 [Appendix A](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-law-propagation-uncertainty)／[§2](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-2-classification-components-uncertainty) | 官方 1994 版内容的网页；A.1–A.3 与 §2。 | 测量模型包含重要不确定度贡献；一阶传播包含协方差。未知定位误差不能置零，标定误差不是总误差；一阶传播也不是非线性/病态情形的无条件保证。 |
| R10 Peters 等 (2015), DOI `10.1016/j.ultramic.2015.05.020`；[作者稿 v1](https://arxiv.org/html/1504.06089v1) | v1（2015-04-23）摘要、引言、§2 式(7)–(10)；出版社页 403。 | 多子晶格基函数变化可贡献额外 GPA 相位；固定额外相位与空间变化的相位需区分。支持保留非应变解释；不能声称所有 GPA 都失效，也不提供本软件错误率。 |
| R11 Pásztor 等 (2024), DOI `10.1088/2053-1583/ad3cea`；[作者稿 v2](https://arxiv.org/html/2309.01584v2) | v2（2023-09-06）摘要、引言、§II；[作者条目](https://arxiv.org/abs/2309.01584)列期刊 2D Mater. 11 035017 (2024)。 | STM/moiré 多个基本晶格贡献及滤波可产生误导的位移/应变图。可借相位解释歧义原则；未逐项验证 TEM 对比传递、样品厚度或本软件实验性能。 |
| R12 Ophus–Ciston–Nelson (2016), DOI `10.1016/j.ultramic.2015.12.002`；[作者稿 v1](https://arxiv.org/html/1507.00320v1)／[机构期刊记录](https://escholarship.org/uc/item/58r1897p) | v1（2015-07-01）摘要、引言、方法前提；期刊记录核对；出版社直访 403。 | 漂移产生线性/非线性扫描畸变，校正使用两幅或更多正交扫描图。支持把扫描形变与加性噪声分开；不是单图无条件校正或自动采集方案。预印本题名/作者顺序与期刊记录有差异，应分别标版本。 |
| R13 SciPy [binomtest](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binomtest.html)／[proportion_ci](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html) | 官方 v1.18.0；Bernoulli 检验、alternative、exact 区间说明。 | 可核对冻结条件下独立同分布试验的二项区间。不能把重复处理/共轭峰当独立试验，或把某生成条件误率区间外推到实验样品。单/双侧 API 操作见下文。 |
| R14 Welch (1967), DOI `10.1109/TAU.1967.1161901`；[作者机构摘要](https://research.ibm.com/publications/the-use-of-fast-fourier-transform-for-the-estimation-of-power-spectra-a-method-based-on-time-averaging-over-short-modified-periodograms)／[SciPy welch](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html) | 原论文摘要；官方 v1.18.0 实现文档；未读原论文全文或实现源码。 | 分段、加窗 periodogram 平均用于 PSD 估计。可作独立基线候选；对单轴运算的支持不等于二维局部图像估计器验证，且 PSD 不保留原复数 FFT 的全部相位用途。 |
| R15 Thomson (1982), DOI `10.1109/PROC.1982.12433`；[SciPy DPSS](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.windows.dpss.html) | 官方 v1.18.0 参数、Notes；[出版 DOI](https://doi.org/10.1109/PROC.1982.12433)为访问验证，原论文摘要/正文本次未核查。 | 官方 DPSS 文档支持窗的能量集中、NW、Kmax、sym/norm 约定。DPSS 生成器不等于完整 multitaper 检测器；未核查 Thomson 的 F-test，不以其背书当前峰阈值。 |
| R16 [NumPy DFT conventions](https://numpy.org/doc/stable/reference/routines.fft.html) | 官方网页显示 v2.5；Implementation details、归一化、频率顺序。 | 支持负号正变换、默认正变换不归一化及实输入共轭关系等约定。只支持写清数学问题，不能认证项目数值误差或统计资格；执行证据需记录实际本机版本。 |

## 需要修正或澄清的事项

1. **阅读范围收紧。** 不沿用“本稿已读”作为本审阅者证据。R15 本次未取得原论文摘要/正文；R08 仅摘要；R07 本次实际读的是 2014 预印本相关章节，不能称已逐项核对 2017 定稿。期刊书目年份依据 *Annals of Statistics* 45(2), 529–556；不要把 PMC 存档日期当出版年。
2. **单侧区间的操作说明。** 草案 `1-0.05**(1/32)≈8.94%` 的一侧 95% 上界正确（本稿直接二项推导，不是新论文结论）。复现可用 `binomtest(0, 32, alternative="less").proportion_ci(0.95, method="exact")`；默认 `alternative="two-sided"` 的 95% exact 上界为 `1-0.025**(1/32)≈10.89%`。选择方向必须预先声明；这不是给峰返回的置信度。
3. **解析式归属明确。** 草案 B+Aδ、均值/窗顺序、仿射频率变换及零错误上界均属本稿推导。引用 R01/R02/R16 只能说明背景原则和约定，不能写为论文已经证明本项目预处理/舍入门槛。`DFT(w(I-mean(I)))` 的非 DC 幅度一般不平坦，不能套用不加窗脉冲真值。
4. **准入与逐峰质量分开。** #63 修正完整 FFT 能量的计账范围，仍未建立逐峰显著性、定位不确定度、两峰分辨或实验可迁移性。不得由一个强峰让同表弱峰自动获得统计资格；不得把旧 `valid` 迁移为物理认证。
5. **仍待证实。** 受控噪声试验必须冻结生成模型、选择过程、匹配/错误声明定义和评价种子；1D、光学 RAW、平稳 Gaussian 随机场均需另行论证才可用于二维电镜频谱。当前文献不补足这些资格；无需本轮造新框架、追加 p 值字段或替换 FFT。

本次只新增文献审阅记录；未修改核心算法、阈值、依赖或历史对象，也未执行实验准确性认证。

## 主执行者复核补记

主执行者于同日通过网页工具取得 PMC6746560 的摘要和引言（返回文本第70–85行），核对平稳、遍历 Gaussian 噪声及选后峰高分布前提；随后尝试展开正文也遇到 reCAPTCHA，因此不宣称独立核对期刊全文推导。PMC 顶部时间标签与 issue date 不一致，期刊年份采用 2017 Apr / 45(2)。这补足子审阅者访问受限的部分，不改变不能直接移植到 FFT 幅度/功率的结论。Foi 作者稿 §I–II、SciPy find_peaks 和当前源码诊断亦独立复核。没有采用新统计公式或检测阈值。
