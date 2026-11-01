# 外部依据与约定（第二轮）

查阅日期：2026-11-01。只把原始论文、官方方法文档和实际源码作为方法依据；
文献不替代本项目的独立数值验证。晶体/配准来源另见 [独立评审](crystal/REVIEW.md)。

| 来源 / 版本 | 用于核查什么 | 约定和证据边界 |
|---|---|---|
| [JCGM 100:2008，§5.1–5.2](https://doi.org/10.59161/JCGM100-2008E)；[BIPM 官方版本目录](https://www.bipm.org/en/web/guest/publications/guides) | 一阶误差传播必须包含共享输入导致的协方差 | 本实现声明点坐标独立、XY 标度误差独立，同一中心和标度在多个点之间共享。审查核对这个声明模型，不把未知误差补成零。未将其当作覆盖概率证明。目录另列 2026 非线性修订；本轮未逐条审查修订，不能称符合全部最新标准。 |
| [JCGM 101:2008](https://doi.org/10.59161/JCGM101-2008) | 用独立随机输入向前传播测量分布 | 合成正态输入、固定种子、200,000 次；输出 SD 与一阶式比较。该输入分布是本测试假设，不是仪器噪声测定。 |
| [Peters et al., arXiv:1504.06089v1 (2015)](https://arxiv.org/abs/1504.06089v1) | 基元/成像对比变化可引入额外 Fourier 相位，产生无真实晶格应变的 GPA 结果 | 本轮的双周期投影叠加是另一个独立构造，未声称完整复现论文样品或其成像模型。共同点仅是几何相位不一定全部来自位移。 |
| [scikit-image 0.26 `unwrap_phase`](https://scikit-image.org/docs/0.26.x/api/skimage.restoration.html#skimage.restoration.unwrap_phase)；其中原始算法 Herraez et al. (2002) | mask、非周期边界、确定性 rng；解包裹存在常数规约 | 本环境实际 0.26.0；GPA 外层另做残差环、断口、参考连通分量筛选。库保留 mask 不是物理单域认证。 |
| [NumPy 2.5 `gradient`](https://numpy.org/doc/2.5/reference/generated/numpy.gradient.html) | 内部二阶中心差分与轴顺序 | 实际 2.5.4；代码先计算像素坐标导数，后用带符号 XY 度量变换 F。对解析连续导数的差异同时含差分和带通误差，不能把二者混为算术错误。 |
| [Hÿtch, Snoeck & Kilaas (1998), DOI](https://doi.org/10.1016/S0304-3991(98)00035-7) | GPA 原始方法书目与两条非共线 Fourier 分量的背景 | DOI 获取全文失败，本轮不声称重新逐式阅读全文。实际方法检查依靠上述官方实现文档、已读原始 Peters 论文和独立解析例；有限变形式在主报告直接推导。 |

独立解析模型：`X(x)=x-u_E(x)`，因此 `F=dx/dX=(I-∂u_E/∂x)^−1`，
`E=(FᵀF-I)/2`。实图为两条实余弦，选取正频支后的相位为 `-2πG u_E`；
`G` 单位 cycles/pixel。没有用待测 GPA、simulation 或 registration 生成真值。

Gaussian 小相位传递近似为 `exp[-(k/σ)^2/2]`，只在带内解释。
项目还在 `3σ` 截断；`k>3σ` 的边带被直接删除，不能把未截断 Gaussian 公式
当作该实现此处的精确真值。真实空间分辨率亦不等于输出数组的像素间距。
