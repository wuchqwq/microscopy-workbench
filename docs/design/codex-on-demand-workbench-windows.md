# Codex 按需打开 Microscopy Workbench · Windows 首轮方案

## 基线与起点

- 本轮在独立 checkout 中基于 `c77ba4f710bd6b85334ecef7c98e8045e51e71e0` 实现。
- 验证起点为 Windows 上先前注册的 `microscopy-core` 候选 `0aa8302d`，其注册显式设置 `MICROSCOPY_PANEL=0`。另一个 `microscopy-images` 注册使用独立工作区，其 Panel、对象、请求和上下文无法与 core 互换。本轮自动测试通过隔离的 core 测试入口验证。
- 基线的 `image_panel_open` 先记录原请求，再为指定 immutable view 启动隐藏 loopback helper。它已有 GUI AnalysisWorkspace 和保存、恢复保护，并返回 URL 与保存视图 PNG。基线的原生 Electron launcher 从 source/workspace/frame 启动自己的 inspector。接入已有 Panel 的原生路径由本轮实现。基线 Codex research-host 用于由工作台发起的独立宿主适配。

## 最小实现

1. 在同一个 core MCP 中选定已准入的 source、显式 frame 和已保存 view。仅在缺少视图时生成预览。已有 ROI 从已保存 view 和标注带入，保留已存在的结果和请求 ID。使用 `image_panel_open` 建立 Panel 并保存其原 request_id，已有同一 Panel 则直接用其身份。
2. 新增 Windows 可选的 `image_panel_activate`，通过 manager 的 owned connection 与实际 helper generation 读取并核对 Panel。输入只接收明确的 panel_id 与 request_id。以 Electron 原生 BrowserWindow 展示该 Panel 的现有页面，延用桌面安全设置。窗口附着到已有 helper，窗口中保存与 MCP 回读访问同一个 Panel、workspace 和 immutable 对象。激活工具不切换 view，切换仍经现有 `image_panel_show` 比较及草稿保护。用户不需提供 URL 或内部 ID。
3. 一个逻辑 Panel 只维持一个 native viewer。再次明确激活使其显示、还原并请求焦点，不刷新现有 renderer。以窗口就绪确认和观察到的焦点分别报告；Windows 可能拒绝抢占焦点。已失效的 renderer 即使留有可见窗口，也拒绝激活。窗口关闭需尊重页面未保存保护，关闭干净 viewer 后保留 helper，使用同一 Panel 重新打开。正常停止或异常恢复仍由现有 owned helper 恢复协议处理。旧 helper 确认停止或 renderer 确认失效时，原生对话框向用户说明已落盘和仅留在窗口内的内容差异，由用户明确选择是否退出。单次超时或通信失败不能开放该退出路径，窗口也不自动刷新或接到新 helper generation。
4. 激活原请求落入现有 Panel journal。取消后只停止等待。超时按原请求核对，不自动重发或启动另一个 helper。明确已完成的激活之后，新的聚焦动作使用新请求。桌面运行时由受控本地安装提供，缺少时给出明确错误。
5. Router 仅在用户需要定位、核对或修改 ROI/峰，或交互对照会影响研究判断时主动启动。只读元数据和可以直接计算、回答的问题继续走普通工具。Router 保留原 source/frame/view/ROI、panel_id、helper generation、GUI save_id，以及存在时的 AnalysisContext ID/修订。AnalysisContext 是原参考任务；GUI AnalysisWorkspace 保存是独立的、可核对的 savepoint。继续时先读 `image_panel_current` 获取 live 状态，再调用 `image_panel_saved(panel_id, save_id)` 验证磁盘上确切的 savepoint 和 provider 引用，并用同一 provider 读 immutable view。ROI、源、帧或校准变化后重新判断依赖，保留原结果。结果以已有 `image_panel_show` 回到同一 Panel，并绑定计算前的 object 与 draft revision；计算期间发生的修改继续受原有拒绝或排队语义保护。读取 AnalysisContext 当前修订，只有经确认且适用的引用更新才用现有 CAS。
6. 最短接续动作是研究者保存后在同一聊天说“继续”。本轮未建立或获授权将 Panel Save 绑定到当前桌面聊天的宿主通道。官方 App Server 的 `turn/start` 面向持有线程并主动发起的客户端。本实现不调用该接口或内部聊天协议。
7. 保持现有工作台布局，在工具栏提供深浅主题切换。深色采用中性灰黑，浅色采用干净的中性底色。使用现有 UI 表面样式和轻量本地偏好，主题变化只涉及呈现。画布上的原始像素、显示映射、选区坐标、标注和保存对象契约继续走原实现。

改动限于现有 Panel manager/模块及 Windows 桌面接入、router 的 continuation 指引、聚焦测试和运行文档。优先用同一 MCP stdio 进程的原入口验证。额外验证 GUI 上的 ROI 保存，且同一进程回读保存版本后从相同 source/frame 做一个最小数据操作。

## 验收与启用

- TypeScript 构建。运行相关 Panel ownership、runtime catalog/stdio、draft 和 workspace 测试。用定向负例验证 helper 活着或状态未知时保留关闭保护，以及确认停止后的显式恢复退出。使用合成图像，核对源 SHA、frame、保存视图与 ROI 坐标，记录原始日志。
- 在隔离的 core workspace 中跑真实 stdio tools/list 和 tools/call。检查无 GUI 的普通查询、原生窗口显示与聚焦、重复激活、界面编辑与保存、同一 Panel 回读与结果送回、关闭重开或拒绝旧修订。保存深浅主题的实际桌面证据，并核对切换时图像对象、显示映射、选区和保存内容。协议测试、测试脚本、实际桌面窗口和研究者本人操作各自记录。
- 实际 Codex 宿主加载和真实模型自主选工具各自验收。注册示例、已完成检查和未测项见[启用与复核](../validation/codex-on-demand-workbench-windows.md)。
- macOS 后续沿用 provider 和 Panel 契约。独立验证 Electron/签名打包路径、单实例与 macOS activate/dock 行为、用户焦点、睡眠/重启恢复和现场 MCP 配置。此轮 Mac 实测为 NOT_TESTED。

宿主参考为 [OpenAI Codex MCP](https://learn.chatgpt.com/docs/extend/mcp) 与 [OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server)。
