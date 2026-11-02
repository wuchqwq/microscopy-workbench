# Issue #78 工程修复与独立复核记录

## 实时基线与 #77

本轮开始重新 fetch origin 并读取 GitHub：main 为
`f884b921f24444135a801014ff47a13d857f07ce`；开放 PR 为 #45、#77。
main 的两条 push CI 成功。#77 为开放、非 draft、未合并，HEAD 为
`d0c2558c6dd404e87f3db2347d2f3ae4b8f2e111`。

#77 全部补丁仅含 worker 的两行条件继承和一个定向测试。
`scientific_grid_identity` 来自 `render_base` 已有字段；缺失时不添加。
Panel 的科学网格和渲染映射严格比较未修改。后端 annotate 先保存不可变新修订，
Panel 随后检查是否允许自动接纳，最后浏览器才加载/显示结果。这三个状态不同。
已修正原 PR 描述中“no saved object”的不成立推断，未改写原失败证据。

复用 #77 精确提交的成功 CI：
[Standalone #118](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41445520460)、
[F3b #52](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41445520545)。
未在本地重复完整科学套件。

独立增加两项本地有界 worker 检查，均 PASS：

1. 公开合成 FFT 的两次峰修订保持 grid/panels；原 FFT 数组与旧对象 manifest
   字节不变；旧测量仍可读，新 remeasurement 同时引用旧测量与新标注修订。
2. 不带 grid 字段的空间 render base，连续 annotate 后仍不产生该字段。

第二项验证的是字段缺失分支，不冒充完整历史版本迁移矩阵。另在本 PR 的受控
Panel transport 测试中，对 changed grid、changed render mapping、missing identity
分别确认：provider 已保存返回对象，Panel 409 拒绝接纳，原显示对象不变且原请求
回执仍可查询。这不是复原先前那次鼠标失败的完整后端记录。

结论：#77 无阻断代码问题，可以合并；本轮没有执行合并。既有 Windows 拖峰证据
属于先前那轮实测，本轮没有把它重新标成一次新的拖峰验收。

## P1：一次基线与一次修复后 Windows Chrome 实测

测试环境 Windows x64，Node v24.16.0，独立 Python 3.13.2。只新建公开合成
uint16 周期纹理 TIFF 和隔离工作区。鼠标实际框选 ROI，浏览器点击保存。
基线与候选使用不同工作区，原失败状态、请求和对象保留。

| 阶段 | 基线观察 | 修复后观察 |
| --- | --- | --- |
| 保存请求到 HTTP 响应 | 5967.9 ms；包含后端执行和 Panel 准备，不能当作精确落盘时刻 | handler 起点到 action response 6073.5 ms |
| 第一次 `/api/state` | 约 3.5 ms | 约 5.7 ms |
| 最终草稿确认 | 普通草稿发布，允许 100 ms 合并持久化 | 现有 `confirm_persistence:true`，确认约 18.9 ms |
| 第二次 `/api/state` | 约 3.9 ms | 约 5.2 ms |
| 最终状态 | 列表自动显示 1 处观察，无需刷新；提示曾停在 `draft_save_pending`，后来 Agent 按钮可用 | handler 起点约 6217.3 ms 进入最终同步 UI 更新；显示已保存并读回可接续，列表/按钮一致，无需刷新 |

基线时序由 Chrome Network 单调时钟记录；修复后由同一浏览器保存函数内的
`performance.now()` 诊断记录。起点和测量方法不同，不作前后性能优劣比较。
`final_ui` 是最终同步 DOM 更新入口时间，不是显示器物理呈现时间；浏览器随后
独立读到最终文本和可用按钮。两次样本不能作为耗时上限或产品性能保证。

确定性原因：第二次普通 draft 发布与上一草稿的 dirty/gesture 状态相同，会进入
100 ms 合并持久化；紧随的 readback 可合法看到 pending。旧代码把该瞬态写成
最终提示。另在两次读回期间，原 `busy` 已结束，观察理由输入不应提前解锁。

修复沿用已有协议：区分 submitting / verifying / handoff；提交回执前不说已保存；
保存后明确尚在核对；锁定理由直到流程结束；最终使用显式持久化确认并保留两次
`observationReadback`；仅在身份/锚点/理由/来源/标定吻合后应用读回状态。
读回失败、新编辑或标定变化仍拒绝旧的可接续结论，不重放保存请求。
诊断仅写既有性能面板的有界本次时间戳，不增加后台遥测或科学工作区字段。

## P2、P5、P6

- P2：`dirty()`（包含 orphaned draft）决定是否展示放弃草稿及草稿处理提示；无
  草稿时只有“有新结果等待查看 / 查看保存结果”。手势和保存中禁用接纳。当前
  pending 合同没有可靠 producer 身份，因此使用通用措辞，不从 request ID 推断
  Agent。服务端 pending 判定和显式接纳逻辑保持原样。
- P2 浏览器复测：通过协议使用旧 revision 注入同一保存对象的 pending，再在
  真实浏览器观察并点击。无草稿时不显示放弃草稿按钮，点击后 pending 消失。
  这是协议注入＋浏览器操作，不是一次真实模型提交或跨网格自动接纳测试。
- P5：Chrome 原始安全日志复现 `app.mjs:827` 的 inline style 违规，根因是
  `renderAnnotationsSVG()` 的交互标签 `style="cursor:move"`。改为外部 CSS 类。
  修复后的框选、保存和标注重绘期间未捕获该违规；未据此宣称所有 GUI 控制台无错。
- favicon 原 403 是自动请求没有 Panel token，落入 API 认证路径；新增精确的
  GET `/favicon.ico` 空 204 响应。Host 检查、API token 和完整 CSP 保持原值。
- P6：帮助和当前有效的启动说明统一 `npm run inspect -- ...`。源码先 build，
  已构建包直接运行；package 的 inspect 脚本分别解析到正确入口。真正的
  `--help` 现在直接输出帮助并以 0 退出，不启动科学工作区。历史验收报告保留。

## 定向回归记录

`npm run build` PASS，包含仓库的三层 TypeScript 检查；`git diff --check` PASS。

最初运行下列 8 个 Node 文件：image-panel-ui、image-panel-presentation、
image-panel-presentation-transport、research-workspace-ui、inspector-panel-registration、
resumable-observations、panel-roi-handoff、user-workflow。
结果 **165 PASS / 1 FAIL / 1 SKIP**。FAIL 是新手势测试在 requestAnimationFrame
刷新前断言按钮状态；补上 harness 的 `flush()` 后修正，原失败不抹去。

之后加入三项 grid/adoption 回执检查，定向重跑改动的 image-panel-ui 与
image-panel-presentation-transport：**102 PASS / 0 FAIL / 1 SKIP**。
其余六个文件生产代码未再变化，复用首次成功结果。新增显式持久化检查并运行
image-panel-concurrency：**5 PASS / 0 FAIL**。

SKIP 为既有 opt-in 的 real-MCP figure-display restoration；没有将它记为通过。
轻量 `npm run inspect -- --help` 及真实合成数据启动均 PASS。
没有手动重复运行完整 FFT/GPA/拓扑/结构模拟或噪声矩阵套件。

## 保留的范围与后续复测

P3/P4 方案见 [导航和窄窗口设计审查](GUI_NAVIGATION_OPTIONS_20261102.md)。
本轮实测了 GUI FFT 后的当前会话返回、源帧 fallback、760×800 抽屉及收起/适应；
没有修改导航历史、来源引用结构或整体布局。

NOT_TESTED：新的 #77＋本 PR 组合提交上的全套鼠标拖峰/重测/关闭重开；首次
Agent FFT 和重开后的全部来源链；新模型端到端分析；真实实验样品；物理准确性；
macOS；全部 GUI 控制台；真人长期易用性。Issue #71 仍是部分验收，不关闭。

Windows 后续可按以下步骤复测，不需要私有样品：

1. build 后在新工作区启动公开合成 TIFF；真实鼠标框选并填理由。
2. 保存时确认“正在提交”与“已保存、核对交接中”有区分；不要再次提交原请求。
3. 在高级设置的性能诊断记录本次 `observation_save.elapsed_ms`；两次 readback
   均有 start/end，最终 ready 前按钮应禁用。失败保留原 request ID 和草稿。
4. 确认列表、理由、来源与 Agent 按钮无需刷新即可一致；通过 MCP 读取同一 Panel
   核对 interaction gate、稳定 annotation ID、原锚点及标定引用。
5. 分别在无草稿、显示草稿、重连 orphaned draft 和进行中的手势下接收 pending；
   只有明确接纳才能切换保存结果，后到结果不能抹去新编辑。
6. 在获准整合 #77 后，复用保存 FFT 做峰修订和重测；核对旧对象/原数组不变，
   再测试返回保存空间观察、刷新及正常关闭重开。各入口分别记录 PASS/FAIL/NOT_TESTED。
