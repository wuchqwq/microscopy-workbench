# 独立科学 provider：客户端配置

[简体中文](CLIENT_SETUP.zh-CN.md) · [English](CLIENT_SETUP.md) · [工作流程](WORKBENCH_WORKFLOW.zh-CN.md)

这是 Windows/macOS/Linux 的当前安装入口，不要求 GMS、DigitalMicrograph 或旧 mcp-dm checkout。历史技术文档可能保留拆分前的 `DM_IMAGE_*` 示例；本服务使用下方 `MICROSCOPY_*` 配置。产品名称变化不应改写保存的对象格式或既有协议身份。

## 独立环境

使用 Node 22.x 或 24.x，以及独立的 Python >=3.10 环境，推荐 CI 参考版本 3.13。可选配置注册器要求 Python >=3.11。准确范围见 [CI 覆盖与资格限制](CI_SUPPORT.md)。用该环境的 Python 安装[图像依赖](../requirements-images.txt)，解释器、仓库和工作区都使用绝对路径，不使用 GMS Python。新 checkout 中例如：

```sh
npm ci
npm run build
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-images.txt
```

Windows 使用 `py -3 -m venv .venv`，再运行 `.venv\Scripts\python.exe -m pip install -r requirements-images.txt`。这些是明确由用户执行的配置命令，不表示 Agent 已自动安装依赖。

## Codex stdio 配置

先检查所用客户端支持的 MCP 配置和已有 provider，保留已有条目与审批策略，不重复追加 `microscopy_core` 表。以下是模板，不是用来覆盖用户完整配置的文件。使用前替换全部路径：

```toml
[mcp_servers.microscopy_core]
command = "/absolute/path/to/node"
args = ["/absolute/new-checkout/server.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 180

[mcp_servers.microscopy_core.env]
MICROSCOPY_PYTHON = "/absolute/new-checkout/.venv/bin/python"
MICROSCOPY_IMAGE_WORKSPACE = "/absolute/scientific-workspace"
```

Windows TOML 字符串可使用正斜杠绝对路径，例如 `C:/Program Files/nodejs/node.exe`、`C:/work/new-checkout/server.mjs`、`C:/work/new-checkout/.venv/Scripts/python.exe` 和 `C:/analysis/my-workspace`。macOS/Linux 使用实际 Node 和虚拟环境的绝对路径。引号保留空格；这些只是例子，不假定某台机器有这些目录。

也可以先检查已有名称和所装 CLI 的 `codex mcp add --help`，再使用明确的环境选项。**先私下保存完整配置副本，不只是哈希。**某些 CLI 版本添加一个服务时会重新序列化已有 MCP 表，包括省略空值或默认字段。操作后核对全部原条目和审批设置；工具可用不证明原配置未变。副本存放在仓库外，不发布其内容。参见[官方 MCP 配置参考](https://developers.openai.com/codex/mcp/)。

按客户端要求重启或重连。核对连接公布的是 `microscopy-core` 与 `image_*`，不是 `dm_*`。仅成功 tools/list 不构成科学任务，也不证明模型实际收到了图像。

`MICROSCOPY_CONTEXT_WORKSPACE`、`MICROSCOPY_STRUCTURE_WORKSPACE` 和 `MICROSCOPY_STRUCTURE_PYTHON` 均为自选。需要结构任务时才安装[结构依赖](../requirements-structure-tools.txt)。Materials Project 是独立可选 provider，不是默认图像依赖。API key 不写入仓库文件、命令日志或聊天。

### 可选：只追加的注册器

编译后的插件入口提供只追加注册器，作为上述直接 `microscopy_core` stdio 模板的**替代路径**。二选一，避免为同一科学工作区意外配置两份服务。注册器使用 Python >=3.11，不改变科学运行时的 Python 要求。按[插件配置格式](AUTOMATION_PLUGIN.md)准备明确的私有 JSON，先检查 dry run：

```sh
python3 tools/register_codex_mcp.py --node /absolute/path/to/node \
  --plugin-config /absolute/private/plugin-config.json
```

添加 `--apply` 才实际注册。工具保留已有 TOML 字节，写入前私下备份，检查中途编辑，拒绝同名不同配置。它不调用 `codex mcp add`，不修改审批策略、不安装 Skill，也不覆盖其他服务。非默认客户端配置用 `--config` 指定。应用时关闭其他配置编辑器；这些检查不能锁住所有外部写入者。已有完全匹配条目时不修改。工具只能避免新的保留缺口，不能重建过去只保存了哈希的旧配置。

POSIX 系统的备份目录/文件模式为 700/600。Windows 应将客户端与备份目录保留在用户私有继承 ACL 内，POSIX mode 位不构成 Windows 访问控制。注册器拒绝把备份放进 Git checkout。

## 无模型 GUI 与首次检查

```sh
npm run inspect -- --source /absolute/input.tiff --workspace /absolute/new-workspace --python /absolute/venv/bin/python
```

Windows 使用对应的带引号绝对路径。保持本机进程运行，打开其私有 loopback URL，不分享 token。支持的 TIFF 类型有限，见 [Inspector 指南](RESEARCHER_DATA_INSPECTOR.md)。

开发检查按 [AGENTS.md](../AGENTS.md)，根据实际 diff 与受影响合同选择。`npm test` 提供可移植检查；配置独立 Python 后，`npm run test:science` 运行保留的合成数值/HTTP smoke。这些完整命令不要求在每次纯文档改动后执行。

普通客户端实际视觉接收与完整浏览器手势分别验收。[数组/ROI/剖面指南](IMAGE_NUMERIC_INSPECTION.md)及随附截图是绑定来源的合成示例，不是新的平台或样品证据。

需要 Agent 自动分析时，再按[插件指南](AUTOMATION_PLUGIN.md)安装选定的 Skills，阅读 [Agent 使用说明](../README.agent.zh-CN.md)。工作区与 MCP provider 必须指向同一实际科学数据；不要拿相同路径文字代替核对身份。

DM 可在满足条件的 Windows 宿主上作为独立同级 provider 安装。不要使用旧 DM-only PowerShell helper 注册本服务，也不要设置 `DM_MCP_BACKEND=images`。仓库改名不授权搬迁尚未核实保存路径与身份的旧科学工作区。

公开截图保持原文件名与字节；部分历史 `.png` 名称实际包含 JPEG，浏览器会识别真实格式。它们是 UI 证据，不是原始科学数组，哈希记录在迁移 manifest 中。本次文档更新不重编码这些资产，也不宣布新的验收。
