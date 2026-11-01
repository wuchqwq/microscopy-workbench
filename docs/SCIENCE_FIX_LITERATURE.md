# 第二轮问题的文献依据与修复选择

检索与核对日期：2026-11-02。基于重新 fetch 的 main
`b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`，tree
`82facfce75c5909c510cb5014e228918904f5de4`；未合并 #45、#53、#54、#55、#56
不作为已实现行为。本修复在独立 worktree/分支中完成，不合并、不移动稳定基线。

## 现有方法的比较与选择

| 方法 / 原始或官方来源 | 能解决什么、前提是什么 | 本 PR 的决定 |
|---|---|---|
| [Kabsch 1976](https://doi.org/10.1107/S0567739476001873)、[SciPy Rotation.align_vectors](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.transform.Rotation.align_vectors.html) | 固定对应下的最小二乘旋转；权重与噪声模型须另有依据 | 保留已有 proper SO(2) 数值内核及固定 scale/DC。修复把条件残差当独立验证的输出路径；不靠 RANSAC/自由尺度拟合让错误候选通过 |
| [CCP4 FREERFLAG](https://www.ccp4.ac.uk/html/freerflag.html)，原始 Free R 方法及相关资料见[独立评审](SCIENCE_FIX_INDEPENDENT_REVIEW.md) | 验证分组必须考虑相关/对称反射；未参与拟合不自动等于统计独立 | 借鉴证据分组原则，不把 X 射线 R-free 直接移植到图像 FFT。当前接口没有经过验证的源峰分辨组，独立验证保持不足；仍报告条件几何正例 |
| [Peters et al. 2015, arXiv:1504.06089v1](https://arxiv.org/abs/1504.06089v1) | 成分/基元改变可以产生额外 Fourier 相位，误作应变；论文分析了 GPA 适用限制 | 保留 GPA 数值字段，新增机器可读物理未判状态。没有输入成分/成像模型就不能自动减去所谓“伪应变” |
| [Pásztor et al. 2023, arXiv:2309.01584v2](https://arxiv.org/html/2309.01584v2) | 多个周期叠加可产生虚假的位移/应变；空间锁相与 Fourier 带通存在对应关系 | 不把更换为 lock-in 当作叠层问题的通用修复；增加与实际 aperture 对应的解析小相位传递信息，显式保留适用前提 |
| [Nord et al. 2017, Atomap](https://doi.org/10.1186/s40679-017-0042-5)、[官方文档](https://atomap.org/) | 原子柱 2D Gaussian 拟合与子晶格分析；需要分辨原子柱、合理初始化及归属信息 | 是适合原子分辨 STEM 的后续交叉检查方法；本次未安装、未基准验证、未替换 GPA。它不能从任意 ROI 混合周期恢复唯一物理结构。检索到的文档标为 0.4.3.dev1，不能把此网页当稳定运行版本 |
| [JCGM 100:2008，§5.2](https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf)、[JCGM 106:2012](https://doi.org/10.59161/JCGM106-2012) | 相关输入的协方差传播；决定规则和不确定度应区分 | 实现显式 signed XY scale correlation；精确折叠角不把未折叠 SD 标成实际夹角 SD。保留 deterministic matching tolerance，不推算无依据的覆盖概率 |

原始论文/官方页面作为方法依据，不作为本项目“已经正确”的证明。Peters 的原始 PDF
与 Pásztor 的全文公式/限制、Atomap 原始开放论文已读取。关于 GPA 掩膜分辨率/精度
权衡的 2023 Ultramicroscopy 论文 DOI 页面检索到，但全文请求返回 403；不把未读
全文作为本实现公式依据。未采纳尚未独立资格化的新大型算法或训练模型。

## 实际改变的行为

1. **配准证据语义 v2。** `held_out_geometry_status/passed` 只反映 fit 和 held-out
   对应的残差判定；ULP 警告不再混入该数值判断。当前 `held_out_validation_passed`
   为 null，`independent_validation.status=insufficient_evidence`。人工确认不能
   提升这个状态。精确重复/Friedel、退化、旧几何及跨模拟引用的原拒绝条件保持。
2. **局部比较语义 v2。** 缺物理标定时返回 insufficient_evidence，而非 incompatible；
   pixel 比较不受影响。原 `_entries` 保持，避免改坏 feature-field 的历史重算。
   保存记录无版本字段时按 v1 推导；未来未知版本拒绝，不猜测为最新或旧版。
3. **GPA 的数值输出与材料证据分开。** 新结果保留全部数组和原数值 mask，并增加
   `material_strain_status=insufficient_evidence` 与 aperture 的解析响应。新 read/view
   继承父对象的证据语义；旧父对象不被补写新解释。
4. **实际协方差算法扩展。** 新 calibration 可声明 `scale_correlation_xy=ρ`，
   默认 0 保持原独立轴模型；必须同时给出两个尺度 SD。对尺度 Jacobian `(jₓ,jᵧ)`，
   用 `(jₓσₓ+ρjᵧσᵧ)²+(1−ρ²)(jᵧσᵧ)²` 计算尺度方差，等价于 `J C Jᵀ`，
   且在 rank-one 共同标度误差时不会因相减舍入得到负方差。点误差和共享中心项保持。
   XY 尺度异号的共同相对缩放应使用 ρ=−1；单位转换在传播之前进行。
5. **折叠角的未判。** 精确 0°/180° 且一阶角 SD 非零时，`sigma_deg=null`，
   状态 nonlinear_fold_unresolved；原计算保存在 linearized_unwrapped_sigma_deg。
   附近提供距折叠点的 SD 倍数作诊断，没有临时定义一个“安全角度”或置信阈值。

GPA 响应公式只用于已明确限定的小相位、恒振幅、孤立且位于 aperture 中心的载波、
内部一维调制：相位增益 `exp[−(k/σ)²/2]`，`k>3σ` 时为零；中心差分另乘
`sin(2πk)/(2πk)`。名义未截断 Gaussian 空间 FWHM 为 `sqrt(2ln2)/(πσ)`。
频率单位 cycles/pixel。实际有限网格、边缘、大相位、非中心峰和截断尾部可能不同；
这不是反卷积、实测空间分辨率、SNR、无应变证明或成像模型认证。

## 保留的历史与边界

旧 register/compare 原结果不重算、不改字段、不改 module/source hash；原请求重放
返回原结果。新 compare 使用旧 register 时，嵌套快照和外层都标明来源语义版本及
历史属性，同时给出当前独立验证不足。旧 local_signature_compare 按 v1 校验，
旧 GPA/read 不注入新 assessment；新分析/新判断使用新 request ID。

本 PR 修复的是上一轮列出的证据判断、缺标定状态和误差模型表达问题。
**没有消除 GPA 的非可辨识性**，也没有建立自动噪声/叠层检测或实验准确率。
可计算的投影几何和条件相容性继续可用。第一轮的部分占位保存、拓扑重叠带重复计证、
平坦 FFT 舍入假峰不在此 PR 中修复，仍保留 #53 的未解决记录，不暗示已完成。

独立 `gpt-6-astra` 审查发现一次“几何 pass 仍混入 ULP 独立性警告”的实现问题，
已在最终实现分开并加入回归；审查过程和复核意见保留在独立报告。
实际测试、原失败及历史字节验证见 [SCIENCE_FIX_VALIDATION.md](SCIENCE_FIX_VALIDATION.md)。
