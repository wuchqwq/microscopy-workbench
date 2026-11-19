# 计算后端连接检查（2026-11-19）

本页区分 Skill 的操作说明、注册的 MCP 工具、Python 依赖可导入、实际科学计算结果与物理有效性。这五者不是同一个状态。

## 使用方式

在构建后的仓库运行：

~~~sh
npm run doctor
npm run doctor -- gpa
npm run doctor -- structure
npm run doctor -- ptyrad_cli
npm run doctor -- all --no-probe
~~~

Codex 在当前已连接的 microscopy-core MCP 中调用 science_capabilities，输入示例：

~~~json
{"capability":"gpa","probe_dependencies":true}
~~~

能力名可选 all、image、gpa、topology、domains、structure、ptyrad_cli、ptyrad_engine、phasefield_pde。

- registered_not_probed：只证明 MCP 注册，不证明已安装所需 Python 包。
- dependencies_checked：规定 Python 依赖、版本和所需子模块通过；**不是**数值结果或物理正确性证明。
- tool_not_registered：当前 MCP 未注册这些工具，检查服务连接及可选模块配置。
- dependencies_unavailable：子进程/包版本/导入失败，查看 dependency_probe.error 和 checks。
- external_cli_only：PtyRAD CPU 诊断属于独立 Skill CLI，不是统一 MCP 计算执行器。

## 后端对照

| 能力 | 入口 | 限制 |
| --- | --- | --- |
| 原图、ROI、FFT、统计 | image_* | 科学输入和标定条件须逐次核对 |
| 双反射 GPA、位移与应变场 | image_gpa/view/read | 条件性的单域几何相位，不是 ptychography 波相位 |
| 投影绕数与条件性闭合 | image_topology | 不证明材料位错或唯一 3D Burgers 矢量 |
| 多尺度结构场 | image_spatial_field/domain_map/feature_field | 有界采样与候选域，非物相识别 |
| 晶体学 | 可选 structure_* | 需要配置结构工作区和 ASE/diffsims Python |
| PtyRAD CPU 诊断 | ptyrad-reconstruction Skill 的脚本 | 不直接启动重构引擎 |
| PtyRAD GPU 重构 | 独立外部环境 | 未在 microscopy-core 注册执行器 |
| 相场 PDE 求解器 | 无 | Cahn–Hilliard 等材料相场演化未实现 |

环境变量 MICROSCOPY_PYTHON 为图像/GPA Python；MICROSCOPY_STRUCTURE_PYTHON 用于独立结构后端；MICROSCOPY_PTYRAD_PYTHON 可选，仅检查独立 PtyRAD CLI 依赖，不运行 GPU 重构。使用真实数据时按各 Skill 的正式说明执行，并保留不可变对象、来源和原请求 ID；禁止由一次失败自动改用另一后端重放未知科学写入。

GPA 前应声明真实空间晶格来源、两条非共线 g 向量、合格的无窗保存 FFT、参考区域与参考假设。已有 GPA 频带的区域比较请用正式 image_method_plan（goal=peak_roi_comparison）接续，而不是重新计算一遍 FFT。

本工具只是只读部署诊断：每个 Python probe 最长 15 秒、输出上限 64 KiB，不运行科学算法、不接管外部安装，也不保证 Mac GUI、GPU 或真实材料的物理有效性。当前仓库没有将 L/P/R 或 fitter v5 视为已经注册的计算后端。

注意：安装 Skills 不会安装 MCP 或 Python 依赖。参考 [Skills 安装指南](SKILLS_INSTALL.zh-CN.md) 与 [客户端设置](CLIENT_SETUP.zh-CN.md)。
