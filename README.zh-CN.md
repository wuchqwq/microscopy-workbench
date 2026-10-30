# Microscopy Workbench

**从显微图像出发，建立可追溯、可复核的材料结构证据。**

[简体中文](README.zh-CN.md) · [English](README.md)

Microscopy Workbench 是一个开源、跨平台的**显微科学分析工作台**。它将数值分析工具、可持久保存的科学对象和本地 Image Panel 结合起来，并通过 **MCP（模型上下文协议）**和可安装的 **Skills**，让兼容的 AI Agent 能够调用同一套工具、组织科研分析流程，而不是用语言模型代替物理计算。

项目支持 **Windows、macOS 和 Linux**，不依赖 DigitalMicrograph、GMS 或独立的 `mcp-dm` 仓库。**不使用任何 AI 模型，也能直接打开图像、测量和查看结果。**

![Image Panel 中的 R3 局部结构证据](docs/examples/r3/browser-field.png)

*Image Panel 中的 R3 结构特征场回看，使用的是公开合成测试数据。这是工作流展示，不代表真实样品精度已通过验证。*

## 目前能做什么？

- **读取与检查显微数据**：支持限定类型的 TIFF，以及通过可选读取器导入的部分 DM3/DM4 文件；保留原始数组、数据类型、坐标轴、有来源的带符号标定与帧/ROI 选择。复数和高维数据需要明确指定分量或切片。
- **局部 FFT 与晶格测量**：进行局部傅里叶变换、峰检测与精化、倒易矢量和晶面间距测量；在安装可选结构工具后，比较指定的晶体学候选。
- **空间结构特征场（R3）**：将不同位置的 ROI、FFT、反射族和周期测量组织成稀疏、可修订的结构观测场；比较明确指定的面内旋转假设，不直接把频谱相似性当成物相或缺陷结论。
- **已保存序列的联合分析（R2）**：结合有来源的帧语义和 ROI 对应关系比较图像或重构结果；不把文件序号默认解释为深度。
- **人工回看、修订与出图**：在 Image Panel 中追溯原始图像、修改标注和峰测量，并通过科学导出和 Figure Composer 制作图表。
- **可靠恢复分析进度**：利用科学对象、请求日志、源文件哈希、测量依赖以及命名 AnalysisContext，在新会话中恢复结果；未变化的 FFT 不必重复计算。

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

开发验收可运行 `npm run typecheck`、`npm test`；将 `MICROSCOPY_PYTHON` 设置为 Python 解释器绝对路径后，可运行 `npm run test:science`。

### 接入 AI Agent

可以将编译后的 MCP 服务接入兼容客户端，也可以安装包含 MCP 和 Skills 的本地插件。使用 Agent 与否，不影响已有科学工具和 Panel 的独立运行。具体见 [客户端配置](docs/CLIENT_SETUP.md)、[自动化插件安装](docs/AUTOMATION_PLUGIN.md)和 [Agent 使用说明](README.agent.md)。项目不会暗中选择模型、配置密钥或修改客户端授权策略。

## 当前进度与科研路线

**已在 `main` 提供**：跨平台 TypeScript/MCP 运行时、Python 科学计算、图像检查及可视化、可回溯的 FFT/测量工作流、R2 序列证据和 R3 稀疏空间结构场。

**正在审查**：[F1a 多尺度结构场与结构域候选（Draft PR #28）](https://github.com/wuchqwq/microscopy-workbench/pull/28) 新增有预算的多尺度采样以及结构域、边界候选证据。其合成数值验收已通过，但**尚未合并到 `main`**，真实 GUI/浏览器交互的未验收部分也不能视为完成。

**后续计划**：[科研路线 #16](https://github.com/wuchqwq/microscopy-workbench/issues/16) 将探索预算受限的主动追加分析（F4-lite），再逐步加入适用条件明确的 GPA 位移/应变估计和晶体学缺陷证据。**当前不开展 Encoder 或基础模型训练**。

## 科学边界

本项目仍是**科研软件**，不是能够自主控制显微镜、通用自动判相或完成全部材料结构判断的系统。当前不包含 ptychography 重构、通用自动孪晶/位错确认或实时显微镜控制。缺失的标定不能凭空补出；局部反射几何相容也不能直接证明物相、缺陷或三维结构。合成数据测试通过不等于真实样品精度得到验证。

原始科学数据、显示图像和人工标注保持独立；保存的结果保留来源、单位、候选假设和未知/多解状态，不用确定性的标签掩盖证据不足。

## 文档导航

| 内容 | 文档 |
| --- | --- |
| 安装与 MCP 接入 | [客户端配置](docs/CLIENT_SETUP.md) · [自动化插件](docs/AUTOMATION_PLUGIN.md) |
| 本地图像与交互 | [Image Panel](docs/LOCAL_IMAGE_PANEL.md) · [研究者检查器](docs/RESEARCHER_DATA_INSPECTOR.md) |
| 结构场与序列 | [R3 结构特征场](docs/SPATIAL_DOMAINS.md) · [R2 序列分析](docs/SEQUENCE_PLUGIN.md) |
| 晶体学与出图 | [晶体学工具](docs/STRUCTURE_DIFFRACTION_TOOLS.md) · [Figure Composer](docs/FIGURE_COMPOSER.md) |
| 验收与工程说明 | [R3 验收记录](docs/R3_ACCEPTANCE.md) · [TypeScript 迁移完成记录](docs/TYPESCRIPT_COMPLETE.md) |

## 开源协议

[MIT](LICENSE)。欢迎提交可复现的问题、科学反例和范围清晰的 Pull Request。
