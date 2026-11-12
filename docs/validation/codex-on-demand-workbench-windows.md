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

若 `image_panel_current` 明确返回只读交接版本冲突，脚本最多尝试读取 12 次，重读间隔 200 毫秒。其他错误保留并立即终止。保存、计算、结果回传和结果未知的操作均沿用原请求处理。

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
npm run test:desktop
node --test dist/tests/runtime-registry.test.mjs dist/tests/runtime-stdio.test.mjs
node --test --test-concurrency=2 dist/tests/image-panel-ownership.test.mjs dist/tests/image-panel-draft-transport.test.mjs dist/tests/analysis-workspace-panel.test.mjs dist/tests/image-panel-http-close.test.mjs
node --test dist/tests/image-panel-ui.test.mjs dist/tests/scientific-skills-contract.test.mjs
python -B tools/build_skills_npm.py --check
python -B tests/skills_npm_test.py -v
git diff --check
```

真实 loopback 传输测试需要 Windows 进程能够连接本机 `127.0.0.1`。纯 UI 状态测试核对主题改变时请求、ROI、草稿、viewport 和图像渲染操作没有变化。它们不替代 Electron 窗口与可见主题的验收。

`npm test` 和 `npm run test:desktop` 都包含按需 Panel 契约、桌面激活契约和 smoke 只读重读测试。Standalone provider smoke 的 Node CI 通过 `npm test` 运行这三组回归。上面的 `node tests/codex-on-demand-windows-smoke.mjs` 是手工启动的原生 Windows 验收，需要操作者在窗口内编辑和保存 ROI。

## 本轮验证记录

| 范围 | 结果 |
| --- | --- |
| Windows TypeScript 构建 | PASS，Node 24.16.0，桌面依赖固定为 Electron 45.2.1 |
| 桌面、stdio、主题 UI、Skills 等定向自动测试 | P2 前 421 项 PASS。P2 最终构建的激活、保存点回读与 renderer 失效负例 11 项 PASS |
| 本机 loopback 的 Panel 所有权、草稿、工作区保存与 HTTP 关闭 | 首次在沙箱中遇到 `connect EACCES 127.0.0.1`。获准后指定的 47 项 PASS。单独的静态 UI 图谱传输检查也遇到相同的沙箱限制，未计入通过数 |
| Skills 安装器与可复现包 | 7 项 PASS，2 项 Windows symlink 场景按设计跳过。包可复现 |
| Windows 实际 GUI，首次 smoke | FAIL。独立 Electron 窗口已显示，重复激活复用了原窗口。随后 `image_panel_current` 在只读交接期间遇到版本冲突，首次脚本将其视为终止错误 |
| Windows 实际 GUI，同 Panel 接续 | PASS。通过隔离 core stdio 重连仍运行的原 Panel，完成双主题切换、ROI 保存、保存点回读、结果回传和未保存编辑保护 |
| Windows 实际 GUI，干净关闭与重开 | PASS。明确保存第三个 ROI 后关闭窗口，再激活同一 Panel。窗口消失期间 helper 仍可读，重开后仍是原 helper、源帧、保存点与不可变科学资产 |
| smoke 只读重试 | `test:desktop` 的 61 项测试 PASS，其中 4 项覆盖成功重读、次数上限、非目标错误和计算与写操作只提交一次 |
| 实际 Codex 会话与真人可用性 | NOT_TESTED。实际宿主加载、模型自主调用与真人可用性待验收 |
| macOS | NOT_TESTED。此分支供后续 Mac 适配与验证使用 |

早期 Skills 合约检查在 Windows checkout 的 CRLF 行尾上失败。测试读入时统一行尾后，该检查在定向自动测试中通过。

Windows 实测用 Computer Use 操作了独立 Electron 窗口中的双帧合成 TIFF。灰黑与浅色主题显示同一帧和原 ROI，切换前后的图像对象、clean PNG 哈希和坐标映射一致。原窗口和 helper 在首次 smoke 退出后保持运行，接续只重连该 Panel。首次重连在沙箱中遇到 loopback EACCES，随后接续在可访问本机 loopback 的环境中通过。版本冲突来自产品的只读一致性检查，首次 FAIL 来自 smoke 把这一明确可重读的错误当作终止条件。

在浅色主题新增并保存 ROI 2 后，`image_panel_current` 确认工作区为 `clean`，`image_panel_saved` 读回该确切保存点和对应的 immutable view。第 2 帧的 ROI 统计与独立合成数组真值一致。结果回到同一 Panel 后，当前工作态变为 `dirty`，保存点仍有效。

在灰黑主题新增 ROI 3 后，基于旧 view/draft 的迟到结果被拒绝，新 ROI 和原保存点均保留。存在未保存编辑时，原生关闭提示阻止关闭，返回原窗口后 ROI 3 仍未保存。随后显式保存 ROI 3，确认工作区为 `clean`，再关闭并重开同一 Panel。三个 ROI、源 TIFF 与不可变资产哈希、provider 请求记录和 AnalysisContext 均保留。负例覆盖的是计算完成后、迟到展示前的编辑。数值计算与编辑重叠、helper 停止和 renderer 崩溃后的原生恢复弹窗均为 **NOT_TESTED**。

注册方式参见 [OpenAI Codex MCP](https://learn.chatgpt.com/docs/extend/mcp)。
