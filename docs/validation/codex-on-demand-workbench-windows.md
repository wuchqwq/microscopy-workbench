# Windows 按需工作台 · 启用与复核

[设计与范围](../design/codex-on-demand-workbench-windows.md) · 基线 `c77ba4f710bd6b85334ecef7c98e8045e51e71e0`

## 在隔离目录运行

从仓库根目录运行以下命令。Node 使用普通可执行文件，Electron 使用仓库 `desktop-runtime/package-lock.json` 固定的版本。Python 需要现有独立图像环境的依赖。下文绝对路径均为示例，执行前请替换为本地路径。

```powershell
npm ci
npm run build
npm run desktop:install
New-Item -ItemType Directory -Force analysis | Out-Null
$env:MICROSCOPY_PYTHON = 'C:\path\to\independent-venv\Scripts\python.exe'
$env:MICROSCOPY_SMOKE_OUTPUT = Join-Path (Resolve-Path analysis) 'codex-windows-gui-review'
node tests/codex-on-demand-windows-smoke.mjs
```

输出叶目录须尚未存在。脚本开启自己的 core stdio 进程，生成双帧合成 TIFF，使用隔离的 `images` 和 `contexts`，并打印界面操作提示。证据位于输出目录的 `calls.ndjson` 与 `report.json`。日志中的 Panel 能力令牌会被遮盖。运行的 Electron 窗口仍用工作台内的保存功能。只关闭窗口会保留同一个 helper，便于继续核对。

## Codex 注册示例

在受信任的 Windows 本地项目中，用新的完整 core 入口取代该项目内相同用途的注册。先用隔离的图像及上下文路径验证，或者在停用原 core 进程并确认无未决请求后复用原来的成对路径。科学工具、Panel 与 AnalysisContext 始终由下述同一 MCP 提供。结构或执行模块原有配置可按项目使用范围保留。

```toml
[mcp_servers.microscopy-core]
command = 'C:\path\to\node.exe'
args = ['C:\path\to\microscopy-workbench\dist\server.mjs']
cwd = 'C:\path\to\microscopy-workbench'
startup_timeout_sec = 20
tool_timeout_sec = 300

[mcp_servers.microscopy-core.env]
MICROSCOPY_PYTHON = 'C:\path\to\independent-venv\Scripts\python.exe'
MICROSCOPY_IMAGE_WORKSPACE = 'C:\path\to\verified-core-workspace\images'
MICROSCOPY_CONTEXT_WORKSPACE = 'C:\path\to\verified-core-workspace\contexts'
MICROSCOPY_PANEL = '1'
MICROSCOPY_PANEL_DESKTOP = '1'
```

审阅后可把以上 TOML 放入对应项目的 `.codex/config.toml`。在新会话用 `/mcp` 核对同名 core 包含 `image_open`、`image_panel_open`、`image_panel_activate`、`image_panel_current`、`image_panel_saved`、`image_panel_show` 及 `analysis_read`。若项目和用户范围同时注册同名服务，先核对实际生效的是预期构建及工作区。可用随源码的 [Skills 安装器](../SKILLS_INSTALL.zh-CN.md)先预览。仅在负责人批准替换已安装 Skills 后执行实际安装。

```powershell
python -B tools/install_workbench.py --skills-only --skills-dir "$env:USERPROFILE\.codex\skills" --existing-skills backup --dry-run
```

后续真实 Codex 验收使用同一合成图像，分别发起一个直接只读问题和一个需要研究者画选区的问题。核对实际模型调用日志、可见原生窗口、研究者保存后说“继续”、同一 Panel 的已保存选区回读和结果回传。日志需记录 provider、Panel、工作区、保存版本。配置步骤和 smoke 入口本身不能验证这段真实会话。

## 恢复操作

- 请求失联时保留原工具、原参数、原 request_id。用同一个 ID 查询原激活或原 Panel 打开的结果。若仍未知，停在查询；可按实际桌面状态检查是否已有该窗口。原 Panel 状态用 `image_panel_current` 读回。
- 窗口关掉且 helper 仍运行时，在已确认上一次激活结果后，用新 request_id 明确激活同一 panel_id。原生 viewer 只显示该 helper 的 UI，关闭或重开 viewer 不负责停止或启动科学 provider。
- 若激活返回 `renderer_gone`，说明旧窗口的显示进程已失效。关闭旧窗口，在原生提示中确认退出，再显式激活同一运行中的 Panel。已写入工作区的记录继续可用，未落盘的界面编辑可能丢失。需要时由研究者选择原有恢复路径。
- helper 停止时，根据已有 owned Panel 证据和 checkpoint 使用 `image_panel_resume`。若旧窗口提示原 helper 已确认停止，可在了解仅留在窗口内的编辑可能尚未落盘后，明确选择退出旧窗口。已写入工作区的记录由原恢复流程处理。确认新的 helper generation 后再激活。一次超时或暂时无法连接时，先核对状态并保留旧窗口。
- 若 live 状态显示未保存、恢复待选或请求未知，在工作台处理原编辑或查询原保存。重新读取同一 Panel 的 live 状态并核对确切 save_id，再通过 `image_panel_saved` 取保存内容。送回结果仍走 `image_panel_show` 的 object/draft 比较。

工具栏可切换灰黑与浅色主题。原生附着窗口使用临时会话，窗口进程重启后从默认灰黑主题开始。主题偏好属于界面，保存点、图像映射和 provider 请求继续沿用各自原有契约。

## 检查命令

```powershell
npm run build
node --test dist/tests/codex-on-demand-panel.test.mjs dist/tests/desktop-panel-activation.test.mjs dist/tests/runtime-registry.test.mjs dist/tests/runtime-stdio.test.mjs dist/tests/desktop-contracts.test.mjs dist/tests/desktop-lifecycle.test.mjs
node --test --test-concurrency=2 dist/tests/image-panel-ownership.test.mjs dist/tests/image-panel-draft-transport.test.mjs dist/tests/analysis-workspace-panel.test.mjs dist/tests/image-panel-http-close.test.mjs
node --test dist/tests/image-panel-ui.test.mjs dist/tests/scientific-skills-contract.test.mjs
python -B tools/build_skills_npm.py --check
python -B tests/skills_npm_test.py -v
git -c core.whitespace=cr-at-eol diff --check
```

真实 loopback 传输测试需要 Windows 进程能够连接本机 `127.0.0.1`。纯 UI 状态测试核对主题改变时请求、ROI、草稿、viewport 和图像渲染操作没有变化。它们不替代 Electron 窗口与可见主题的验收。

## 本轮验证记录

| 范围 | 结果 |
| --- | --- |
| Windows TypeScript 构建 | PASS，Node 24.16.0，桌面依赖固定为 Electron 45.2.1 |
| 桌面、stdio、主题 UI、Skills 等定向自动测试 | P2 前 421 项 PASS。P2 最终构建的激活、保存点回读与 renderer 失效负例 11 项 PASS |
| 本机 loopback 的 Panel 所有权、草稿、工作区保存与 HTTP 关闭 | 首次在沙箱中遇到 `connect EACCES 127.0.0.1`。获准后指定的 47 项 PASS。单独的静态 UI 图谱传输检查也遇到相同的沙箱限制，未计入通过数 |
| Skills 安装器与可复现包 | 7 项 PASS，2 项 Windows symlink 场景按设计跳过。包可复现 |
| Windows 实际 GUI | NOT_TESTED。原合成样本窗口启动审批仍未返回执行结果。可见窗口、双主题实际操作、ROI 保存接续、结果回传及恢复弹窗尚未实测 |
| 实际 Codex 会话 | NOT_TESTED。新工具加载、真实模型自主选择与研究者实机操作仍待验收 |
| macOS | NOT_TESTED。此分支供后续 Mac 适配与验证使用 |

早期 Skills 合约检查在 Windows checkout 的 CRLF 行尾上失败。测试读入时统一行尾后，该检查在定向自动测试中通过。

注册方式参见 [OpenAI Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)。
