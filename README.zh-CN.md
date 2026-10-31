# Microscopy Workbench

**从显微图像出发，建立可追溯、可复核的材料结构证据。**

[简体中文](README.zh-CN.md) · [English](README.md)

Microscopy Workbench 是一个开源、跨平台的**显微科学分析工作台**。它将数值分析工具、可持久保存的科学对象和本地 Image Panel 结合起来，并通过 **MCP（模型上下文协议）**和可安装的 **Skills**，让兼容的 AI Agent 能够调用同一套工具、组织科研分析流程，而不是用语言模型代替物理计算。

项目支持 **Windows、macOS 和 Linux**，不依赖 DigitalMicrograph、GMS 或独立的 `mcp-dm` 仓库。**不使用任何 AI 模型，也能直接打开图像、测量和查看结果。**各平台与科学功能的实际验收范围分别记录，不等同于全部环境均已验证。

![Image Panel 中的 R3 局部结构证据](docs/examples/r3/browser-field.png)

*Image Panel 中的 R3 结构特征场回看，使用的是公开合成测试数据。这是工作流展示，不代表真实样品精度已通过验证。*

## 目前能做什么？

- **从面板圈选的两个区域继续分析**：[人工 ROI → 晶体学证据](docs/MANUAL_CRYSTAL_WORKFLOW.md)复用同一组 FFT/测量，衔接区域观察复核与有限候选比较，无需研究者复制内部 ID。[真实浏览器、新 Agent 与恢复验收](docs/MANUAL_CRYSTAL_ACCEPTANCE.md)已在公开合成范围通过；不代表真实样品物相已经确认。

- **比较相邻 ROI 的显式候选结构**：[通用晶体学证据](docs/GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md)复用有序 FCC/BCC/HCP 或多元素结构、实际模拟及已保存的反射测量，保留不同候选、未匹配和证据不足；通用取向关系不会自动被命名为孪晶或唯一物相。

- **读取与测量显微数据**：支持限定类型的 TIFF，以及通过可选读取器导入的部分 DM3/DM4 文件；保留原始数组、数据类型、坐标轴、带符号标定和帧/ROI 选择。进行局部 FFT、峰检测与精化、倒易矢量和晶面间距测量。
- **接着研究者选定的 ROI 分析（F4b）**：首版正式路径是保存明确的 ROI 和观察理由，由 Agent 调用已有 FFT、峰测量或满足资格要求的 GPA，再绑定、复核、修订与恢复证据；不要求先建完整结构场。已验收的是公开合成输入上的软件与数值闭环，真实样品和浏览器手势仍为 NOT_TESTED。自动实空间候选为 **EXPERIMENTAL（实验性）**，可能漏掉可见异常；没有候选不代表图像正常，也不能据形态确认物理缺陷。参见[范围与局限](docs/IMAGE_FIRST_DISCOVERY.md)及[冻结验收](docs/F4B_FREEZE.md)。
- **建立结构证据并选择后续分析（F1a / F4-lite）**：生成有预算的多尺度结构场、结构域候选和有限边界支持带；追加 ROI 时复用不变的 FFT。支持精简摘要、绑定精确 manifest 的证据分页，以及带预算、理由和停止规则的下一步分析建议。
- **估计单域物理场（F2a）**：复用满足条件的已保存 FFT，恢复几何相位、二维投影位移、有限 Green–Lagrange 应变和局部极分解转动。参考选择、带符号像素度量、无效掩膜及伪应变局限保持明确。
- **检查条件性投影拓扑证据（F3a）**：从保存的 GPA 包裹相位计算显式回路绕数。v2 按严格嵌套的几何组分别评价，保留远处零绕数与不可判观测；不据此确认真实材料位错或唯一三维 Burgers 矢量。
- **比较已保存序列并回看结果**：R2 保留有来源的帧语义与 ROI 对应关系，文件序号不默认代表深度。通过本地 Panel、科学导出和 Figure Composer 查看有原始来源的证据。
- **可靠恢复分析进度**：利用科学对象、请求日志、源文件哈希、测量依赖和已支持的命名 AnalysisContext 恢复任务。GPA/拓扑保留准确的 provider 对象与请求 ID，不借用不相干的 context 角色。

### 工作方式

```text
研究者，或可选的 AI Agent + Skills
                 |
         MCP 服务（TypeScript）
                 |
         科学数值工具（Python）
                 |
         可追溯的科学工作区
            /          \
      本地 Image Panel   Figure Composer
```

Agent 可以在已有工具之间选择并组织步骤；实际数值仍由正式科学工具计算，研究者可以检查和修正结果。原生 DigitalMicrograph 集成属于**独立的同级 MCP 服务**，不是跨平台核心的运行依赖。拆仓来源及文件记录见 [MIGRATION_MANIFEST.json](MIGRATION_MANIFEST.json)。

## 快速开始：不需要 Agent

环境要求：**Node.js 18+** 和 **Python 3.10+**（使用独立的科学计算环境）。

```bash
git clone https://github.com/wuchqwq/microscopy-workbench.git
cd microscopy-workbench
npm ci
npm run build

python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt

npm run inspect -- --source /absolute/path/to/image.tiff \
  --workspace /absolute/path/to/new-workspace \
  --python /absolute/path/to/microscopy-workbench/.venv/bin/python
```

请将示例路径替换为实际的**绝对路径**。启动后终端会给出本机私有的 Panel 地址，使用期间保持进程运行。Windows 可使用 `py -3 -m venv .venv`，Python 路径改为 `.venv\Scripts\python.exe`。不同系统的配置及支持格式见[安装指南](docs/CLIENT_SETUP.md)。

使用可选的 GPA，以及拓扑分析所需的上游 GPA 记录时，在**同一个独立 Python 环境**中安装：

```bash
.venv/bin/python -m pip install -r requirements-gpa.txt
```

开发验收可运行 `npm run typecheck`、`npm test`；将 `MICROSCOPY_PYTHON` 设置为 Python 解释器绝对路径后，可运行 `npm run test:science`。可选科学检查包括 `npm run test:gpa`、`npm run test:topology` 和 `npm run test:integration:f4-gpa`。

### 接入 AI Agent

可以将编译后的 MCP 服务接入兼容客户端，也可以安装包含 MCP 和 Skills 的本地插件。使用 Agent 与否，不影响已有科学工具和 Panel 的独立运行。具体见 [客户端配置](docs/CLIENT_SETUP.md)、[自动化插件安装](docs/AUTOMATION_PLUGIN.md)和 [Agent 使用说明](README.agent.md)。项目不会暗中选择模型、配置密钥或修改客户端授权策略。

## 当前进度与科研路线

**本版本已实现**：R2/R3 证据工作流、F1a 多尺度结构场、F4-lite 有预算的增量分析、F2a 经典 GPA，以及 F3a 带版本区分的投影相位绕数证据。[开发状态](docs/DEVELOPMENT_STATUS.md)记录了审查基线及验收边界。历史验收报告中的分支状态属于当时记录，不会被改写为新的实验结果。

**当前增量**：[F3b 投影孪晶证据](docs/PROJECTED_TWIN_EVIDENCE.md)保留有限相容与歧义；[F4-full 首个跨方法闭环](docs/CROSS_METHOD_ANALYSIS.md)可根据已保存 GPA，提出补充相位分量、条件性拓扑检验、请求信息或停止，保留全部尝试预算及原请求。[验收记录](docs/F4_CROSS_METHOD_ACCEPTANCE.md)区分实际 MCP 通过与新模型受客户端审批策略阻塞。结构域／孪晶／多帧自动路由、Encoder 训练及仪器控制不属于本增量；参见[路线 #16](https://github.com/wuchqwq/microscopy-workbench/issues/16)。

**仍未验收**：已记录的真实 GUI 手势流程、全套 GPA/拓扑 Skill 的新模型独立使用、真实样品准确性，以及对应功能的中断注入。数值、协议或 HTTP/PNG 测试不能替代这些检查；GUI 延后验收不阻塞独立科学方法开发。

## 科学边界

本项目仍是**科研软件**，不是能够自主控制显微镜、通用自动判相或完成全部材料结构判断的系统。当前不包含 ptychography 重构、通用自动孪晶/位错确认或实时显微镜控制。缺失的标定不能凭空补出；局部反射几何相容也不能直接证明物相、缺陷或三维结构。合成数据测试通过不等于真实样品精度得到验证。

原始科学数据、显示图像和人工标注保持独立；保存的结果保留来源、单位、候选假设和未知/多解状态。旧 v1 拓扑回执保留原解释，显式新请求才产生 v2 修订。

## 文档导航

| 内容 | 文档 |
| --- | --- |
| 安装与 MCP 接入 | [客户端配置](docs/CLIENT_SETUP.md) · [自动化插件](docs/AUTOMATION_PLUGIN.md) |
| 本地图像与交互 | [Image Panel](docs/LOCAL_IMAGE_PANEL.md) · [研究者检查器](docs/RESEARCHER_DATA_INSPECTOR.md) |
| 结构场与序列 | [R3 结构特征场](docs/SPATIAL_DOMAINS.md) · [多尺度结构域](docs/MULTISCALE_DOMAINS.md) · [R2 序列分析](docs/SEQUENCE_PLUGIN.md) |
| 主动分析与物理场 | [主动分析](docs/ACTIVE_ANALYSIS.md) · [经典 GPA](docs/CLASSICAL_GPA.md) · [投影拓扑](docs/PROJECTED_TOPOLOGY.md) |
| 晶体学与出图 | [晶体学工具](docs/STRUCTURE_DIFFRACTION_TOOLS.md) · [Figure Composer](docs/FIGURE_COMPOSER.md) |
| 状态与验收 | [开发状态](docs/DEVELOPMENT_STATUS.md) · [F4/GPA 集成](docs/F4_F2A_INTEGRATION.md) · [F3a 验收](docs/F3A_ACCEPTANCE.md) |

## 开源协议

[MIT](LICENSE)。欢迎提交可复现的问题、科学反例和范围清晰的 Pull Request。
