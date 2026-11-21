# macOS 按需工作台：构建与验证

基于 PR #136 的 `7076e7538efaa5a7a97d2b876e43fd53c5da0fed`，保留
[Windows 设计](../design/codex-on-demand-workbench-windows.md)的同一 Panel、
原请求、helper generation、GUI save_id 和结果回传保护。Mac 增量仅为平台入口、
标准编辑/退出菜单、Dock reveal 及 POSIX Python 选择器；没有新增科学计算界面。

## 明确本机依赖

- 普通 Node 22+。
- 现有 `desktop-runtime/package-lock.json` 固定的 Electron 45.2.1。
  本轮复用已存在的同版本依赖，未联网安装或改写该依赖。
- 显式科学 Python，最小图像流程需 NumPy/tifffile。验证复用已冻结 r5 app 内的
  Python 3.13.18；不是用户全局 Python。可选结构依赖不属于本次图像流程验收。

这是本地开发候选，非独立安装器；源码、外置盘与所声明运行时路径必须可访问。
Electron 开发运行时的 Dock/菜单应用名可能仍显示 Electron。未做 Developer ID
签名、公证或干净 Mac 安装验收。

## 按需启用（模板，不自动修改客户端）

只在明确选定本候选后，用本机实际绝对路径配置同一 stdio provider。以下路径为
示意。不要混用另一个 provider 的 Panel、
对象、保存点或工作区，不修改模型、凭据、审批或沙箱设置。

```toml
[mcp_servers.microscopy_workbench]
command = '/absolute/node'
args = ['/absolute/candidate/dist/server.mjs']
cwd = '/absolute/candidate'

[mcp_servers.microscopy_workbench.env]
MICROSCOPY_PYTHON = '/absolute/scientific/python'
MICROSCOPY_IMAGE_WORKSPACE = '/absolute/dedicated/images'
MICROSCOPY_CONTEXT_WORKSPACE = '/absolute/dedicated/contexts'
MICROSCOPY_PANEL = '1'
MICROSCOPY_PANEL_DESKTOP = '1'
```

未选择空间交互时只用普通工具。需要选区时，先查原 Panel，再对该确切身份
`image_panel_activate`；不要求研究者提供 URL/ID。保存后在同一聊天说“继续”，
先读 `image_panel_current`，再核对确切的 `image_panel_saved`，使用现有
`image_panel_show` 的 object/draft 保护回传结果。Save 本身不自动唤醒模型。

窗口附着到同一 helper，不另造科学工作区。关闭 viewer 保留 helper，以便明确
重开；测试结束后应在核实身份后正常停止本次 helper。未知请求只查原 ID。
已有 owner 时新 open 明确拒绝，不能重试新 ID 强占。Mac 的 `⌘S` 实测保存；
部分共享文案仍写 Ctrl+S，是已知提示限制。未保存时的附着窗口沿 PR 基线返回
工作台处理原编辑，未新增“放弃未保存编辑”的快捷退出能力。

## 有界本机验证

构建：`node scripts/build.mjs`。按改动运行桌面、按需 Panel、主题 UI、原请求、
所有权、草稿、保存与 HTTP 关闭的定向回归，不运行全套科学模拟。

手工原生 smoke 入口复用 `tests/codex-on-demand-windows-smoke.mjs`，现在明确支持
win32/darwin；仅生成自己的双帧 uint16 合成 TIFF。设置新的绝对输出目录和 Python：

```sh
MICROSCOPY_PYTHON='/absolute/scientific/python' \
MICROSCOPY_SMOKE_OUTPUT='/absolute/new-smoke-output' \
node tests/codex-on-demand-windows-smoke.mjs
```

操作者通过原生界面切换主题、画 ROI、`⌘S` 保存并按提示保留下一次编辑。
脚本验证相同 Panel 的保存点与原数组统计、迟到结果拒绝；不是用脚本写选区。
可重读的错误仅为既有精确只读 handoff 冲突，计算和写入不自动重放。

本提交复验了构建、按需启动/原请求的合成契约、占用拒绝、同一 Panel 的
读取和验证、菜单与 Dock 激活 API、关闭与所有权守卫。以上由自动化契约测试
覆盖。原生 smoke 可通过上述入口手工运行，需单独记录终端和原生操作回执。

NOT_TESTED：真实 Mac Codex 模型自主路由、真人可用性、真实 P1/P2 故障弹窗、
物理 Dock 点击、睡眠/系统重启恢复、原生 Python 文件选择器、干净机部署和公证。
菜单/Dock/停止 helper 的 API-port 回归不代替这些原生证据。所有示例仅验证软件，
不产生材料、缺陷或独立物相结论；既有正式 AI 外发限制继续有效。
