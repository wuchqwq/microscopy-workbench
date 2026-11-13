# Microscopy Workbench

**安装包含 PtyRAD 的五个科研 Skills。** 在 Windows、macOS 或 Linux 上用 Node.js 22 或 24 运行[零依赖 npx 安装器](docs/SKILLS_INSTALL.zh-CN.md)。可以用克隆仓库里的压缩包，也可以指定已审阅的 GitHub 提交资产。

**由 AI 协助分析、研究者在循环中引导的晶体学工作台。**

[简体中文](README.zh-CN.md) · [English](README.md)

Microscopy Workbench 是一个开源工作台，用于从显微图像建立可追溯的晶体学证据。AI Agent 通过 **MCP（模型上下文协议）**和可安装的 **Skills**，调用明确的科学工具，自动完成有边界的分析。研究者提出问题，选择或修正区域与测量，复核不同解释，并判断证据能够支持什么。

本地 Image Panel、结构化 CLI 与 MCP provider 共用保存的科学对象和请求日志。**不用 AI 模型也能查看图像和测量。**核心支持 Windows、macOS 和 Linux，不依赖 DigitalMicrograph、GMS 或独立的 `mcp-dm` 仓库；原生桌面和各平台的实际验收范围更窄，分别记录。

## 如何一起工作

1. **打开并观察。**明确真实来源、帧或数据集，查看原始数值、带符号标定和未知信息。
2. **引导分析。**选择一个或多个 ROI。使用观察/Agent 路径时保存观察理由或问题，将准确上下文交给已连接的 Agent。基础 ROI → FFT 不要求填写理由或先明确保存工作区。
3. **让 Agent 完成有边界的工作。**在输入身份核验通过时复用已有 FFT 和测量，运行相关数值工具，比较给定结构假设，或提出带预算的下一步观察。
4. **复核并修正。**对照来源图与 FFT，查看未匹配证据，调整保存的 ROI 或峰位，再明确从修订记录继续。
5. **保存并接续。**保存分析工作区，保留原请求 ID；重开或查询已有结果后，再决定是否开始新计算。

“交给 Agent 继续”准备的是供已连接客户端使用的显式交接，不包含内嵌聊天，不选择模型，也不会自动唤醒 Agent。参见双语[工作流程](docs/WORKBENCH_WORKFLOW.zh-CN.md)和 [Agent 使用说明](README.agent.zh-CN.md)。

## 已有能力

- **从图像出发探索。**读取支持的 TIFF 和可选 DM3/DM4 输入，查看数值、剖面及带标定或纯像素测量。在同一源帧保存多个可编辑 ROI，并排保留来源、ROI 与 FFT，返回 FFT 当时的准确输入，而非后来选择的区域。
- **FFT 与反射证据。**计算局部 FFT，定位和精化数值峰候选，保留倒易矢量、间距、不确定度和未匹配观测。数值极大值不自动成为可靠反射。
- **显式晶体学比较。**使用给定结构和满足资格条件的 ASE/diffsims 操作，在已保存区域间比较有限结构与取向假设。各工具在自身范围内保留 FCC/BCC/HCP、多元素和投影多解。一般关系不会自动成为孪晶或已识别物相。
- **由人引导的自动化。**MCP 工具和 Skills 组织 ROI、FFT、测量、有边界结构场和增量分析。正式的图像优先观察路径从研究者给定的 ROI 和理由开始。自动实空间特征提案仍为 **EXPERIMENTAL（实验性）**，可能漏掉可见变化。
- **条件性物理场与拓扑证据。**经典单域 GPA 在明确参考假设下给出投影位移、有限应变与转动；已保存的包裹 GPA 相位可用于条件性投影绕数证据。有边界的孪晶和跨方法工具保留相容、多解、缺少信息与停止结果。
- **共用分析工作区。**GUI、CLI 和 Agent 读取同一套 provider 记录。明确保存、执行历史、受保护恢复和来源证明元数据保留输入身份。回溯建立来源证明不会把原本不合格的 FFT 升级为可严格复用。
- **本地复核与导出。**在明确帧语义下比较序列，将科学数组、表格与显示图分开导出，并组合出图。Windows 桌面开发入口复用已有 Panel；无界面的 CLI 不需要 Electron。

[当前状态](docs/DEVELOPMENT_STATUS.zh-CN.md)区分已经实现的功能与实际做过的验证。各方法及验收报告保留原日期与限制。

## 快速开始

**便捷安装入口：**[macOS / Linux / Windows 安装与独立技能安装](docs/INSTALL.zh-CN.md)。先运行 `./install.sh --dry-run` 或 `install.cmd --dry-run` 预览；不会自动修改 MCP 或认证配置。

使用 **Node.js 22.x 或 24.x**，以及独立的科学计算 Python 环境。**推荐 Python 3.13，也是 CI 参考版本**。科学工具仍声明支持 Python 3.10+，但该下限尚无持续 CI 验证；可选配置注册器需要 3.11+。参见[运行时支持](docs/CI_SUPPORT.md)。

在 macOS/Linux 的新 checkout 中运行：

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

将示例路径替换为真实的**绝对路径**。保持 Inspector 运行，打开终端给出的本机私有地址。Windows 使用 `py -3 -m venv .venv` 创建环境，Python 路径为 `.venv\Scripts\python.exe`。支持格式、明确的数据集/平面选择和安全 MCP 配置见[客户端配置](docs/CLIENT_SETUP.zh-CN.md)。

需要 GPA，或拓扑分析所需的上游 GPA 记录时，在**同一个**科学环境安装可选依赖：

```bash
.venv/bin/python -m pip install -r requirements-gpa.txt
```

结构模拟需要单独说明的[可选依赖](docs/STRUCTURE_DIFFRACTION_TOOLS.md)。仅打开图像时，无须安装全部可选包。

### 选择入口

- **本地图像复核：**使用上述 Inspector，不要求 Agent。
- **AI 协助分析：**连接 MCP provider，安装选定的 Skills 或 [MCP + Skills 插件](docs/AUTOMATION_PLUGIN.md)。Agent 使用同一套保存的科学记录和受保护的 Panel 操作；项目不会暗中选择模型、配置密钥或修改客户端审批策略。
- **Windows 桌面开发试用：**参见[桌面配置](docs/DESKTOP.md)。Electron 运行时使用独立 lockfile，要求 Node 22.x 中的 22.12+ 或 24.x。这不是干净机器安装包。
- **无界面分析：**使用[结构化 CLI](docs/CLI.md)，执行明确的 provider 命令，比较保存的 ROI，读取执行历史和操作来源证明。
- **PtyRAD 重构：**使用独立 Skill 及其 CPU CLI 检查原始 4D-STEM 衍射、比较旋转候选、从相位切片测量表观倾角。配置和运行重构需要另行准备 PtyRAD 环境。 [PtyRAD 中文 CLI 手册](skills/scientific-agent/ptyrad-reconstruction/README.md)

## 状态与科学边界

当前代码的 Skill 包包含 PtyRAD 诊断工具和重构流程。历史上，PR #131 整合了至 #130 的已审查工作台功能，PR #135 加入了轻量安装器。各平台和真实样品的验证范围，以对应验收记录中的版本和操作为准。 [工作台整合](https://github.com/wuchqwq/microscopy-workbench/pull/131) · [轻量安装器基线](https://github.com/wuchqwq/microscopy-workbench/pull/135)

本项目是用于显微分析和独立 PtyRAD 诊断的**科研软件**。重构由单独配置的 PtyRAD 运行。物相、孪晶和位错判断需要超出局部频谱和投影几何的证据。实时显微镜控制在本流程范围之外。

原始数组、显示图和标注保持独立。保存的结果保留来源、假设、单位、修订及未知/多解。合成数值测试、DOM/HTTP 测试、Agent 试验、原生鼠标操作、平台支持和真实样品物理准确性属于不同证据范围；其中一项通过不代表其余通过。

开发时遵循 [AGENTS.md](AGENTS.md)和[定向回归](docs/CI_SCOPED_REGRESSION.md)，按改动层及受影响合同选择测试。纯文档修改检查格式、链接和所述合同，无须运行无关的完整数值套件。

## 文档导航

| 从这里开始 | 简体中文 | English |
| --- | --- | --- |
| 研究者与 Agent 的工作循环 | [工作流程](docs/WORKBENCH_WORKFLOW.zh-CN.md) | [Workflow](docs/WORKBENCH_WORKFLOW.md) |
| 安装与 MCP 客户端 | [客户端配置](docs/CLIENT_SETUP.zh-CN.md) | [Client setup](docs/CLIENT_SETUP.md) |
| Agent 职责与恢复 | [Agent 使用说明](README.agent.zh-CN.md) | [Agent guide](README.agent.md) |
| 当前主线与验收边界 | [开发状态](docs/DEVELOPMENT_STATUS.zh-CN.md) | [Development status](docs/DEVELOPMENT_STATUS.md) |

详细方法：[图像窗口](docs/IMAGE_FIRST_WINDOWS.md)、[人工 ROI → 晶体学证据](docs/MANUAL_CRYSTAL_WORKFLOW.md)、[结构比较](docs/GENERAL_CRYSTALLOGRAPHIC_EVIDENCE.md)、[多尺度结构场](docs/MULTISCALE_DOMAINS.md)、[主动接续](docs/ACTIVE_ANALYSIS.md)、[GPA](docs/CLASSICAL_GPA.md)、[投影拓扑](docs/PROJECTED_TOPOLOGY.md)、[投影孪晶证据](docs/PROJECTED_TWIN_EVIDENCE.md)、[跨方法接续](docs/CROSS_METHOD_ANALYSIS.md)、[序列](docs/SEQUENCE_PLUGIN.md)、[Panel 恢复](docs/INSPECTOR_PANEL_RECOVERY.md)和 [Figure Composer](docs/FIGURE_COMPOSER.md)。

## 开源协议

[MIT](LICENSE)。欢迎提交可复现的问题、科学反例和范围清晰的 Pull Request。
