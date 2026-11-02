# 图像优先工作台：Windows 有限工程验收

日期：2026-11-03。范围是公开合成的 96×128 uint16 图像、同一源帧、多 ROI/FFT 的工程链路；无物理标定。故意移动峰位只验证修订与像素域重测记录，不验证峰定位准确性、材料或物理解释；亦不代表完整 GUI 验收。

## 可审查基线

| 阶段 | 最终提交 | 两项托管 CI 均为 success |
| --- | --- | --- |
| S1：有界图像子窗口集合 | [f855fef](https://github.com/wuchqwq/microscopy-workbench/commit/f855fef) | [41512780800](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41512780800)、[41512780693](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41512780693) |
| S2：受保护的活动窗口切换 | [2ef0c3b](https://github.com/wuchqwq/microscopy-workbench/commit/2ef0c3b) | [41519775686](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41519775686)、[41519775661](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41519775661) |
| S3：多 ROI 编辑与 Agent 交接 | [78ba035](https://github.com/wuchqwq/microscopy-workbench/commit/78ba035b661540165b29be666824c0ef49d32032) | [41520043958](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41520043958)、[41520043864](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41520043864) |

Windows 原生鼠标/键盘组合操作对应 [af31475640426f51156ff90af25dad509cc9261e](https://github.com/wuchqwq/microscopy-workbench/commit/af31475640426f51156ff90af25dad509cc9261e)；最终 `78ba035b661540165b29be666824c0ef49d32032` 又执行两次冷重开，第二次核对非 fit 的 455% 相机恢复，再返回空间图确认三处 ROI。不能把这些证据写成最终提交已重跑全部原生手势。

依赖栈为 [#83](https://github.com/wuchqwq/microscopy-workbench/pull/83) → [#85](https://github.com/wuchqwq/microscopy-workbench/pull/85) → [#86](https://github.com/wuchqwq/microscopy-workbench/pull/86) → [#87](https://github.com/wuchqwq/microscopy-workbench/pull/87)，均未合并；记录时远端 main 仍为 [c8e95c38c552995cc24efa5dc9d5459ec80b02c6](https://github.com/wuchqwq/microscopy-workbench/commit/c8e95c38c552995cc24efa5dc9d5459ec80b02c6)。[#84](https://github.com/wuchqwq/microscopy-workbench/pull/84) 是独立关闭修复，不在本 GUI 栈内。本报告不授权合并。

## PASS 的具体含义

- **窗口与编辑身份：** 同一源帧最多五个图像子窗口；内容点击只提升 z，不改变科学 current、选择或数组。标题移动、调整窗口大小和平铺属于展示元数据。“编辑此图”经服务端检查切换，始终只有一份活动 current/editState；其他窗口只读。未知请求查询原 ID，不自动重放。
- **多 ROI：** Windows 组合操作创建并选择三处稳定 ROI，移动/缩放后保留保存版本；八个控制点的边界行为、临时 ROI 不写 provider、零面积拒绝、保存失败与迟到结果由相关 Node/UI 合同检查覆盖。移动 ROI 不自动 FFT；FFT 的原输入视图、原频谱和整数处理窗口不被后续 ROI 修订重绑定。
- **历史与最新观察：** 返回旧 FFT 的准确输入仍保留原浮点选择；“查看最新 ROI”显式打开后来保存的三 ROI 视图。标注同 ID 但锚点已改变时，旧浮点框明确为临时选择，不冒充最新保存 ROI。旧、新测量记录在冷重开前后分别保留。
- **Agent 交接：** 只读 DTO 绑定活动对象、源帧、草稿、状态与窗口集合版本，分别表达当前浮点选择、保存观察及各 FFT 的不可变来源。空理由表示尚未说明，不能用“ROI 1”等标签补造研究理由，也不构成物相确认；草稿、pending 或未决原请求阻止正式接续。
- **冷恢复：** 最终提交的两次 owned 工作区冷重开保持保存引用；第二次恢复记录的 `scale=4.55096`（界面 455%），随后回到空间图确认三 ROI。有限冷恢复通过不等于任意 display recipe 或任意中断恢复通过。
- **窄窗口与帮助：** 在 760×800 视口打开窗口列表，实际关闭来源显示后仍保留两个 FFT 及最新观察引用；返回入口可达。原生打开、关闭“使用说明”前后，对象、选区、草稿与窗口相机状态一致。此有限可达性检查不代表整体视觉或全部窄窗口路径验收。

最终 `final-verification.json` 记录 PASS：generation 4 返回空间图后，ROI 2 的选中浮点框准确一致；正式 stdio `image_panel_current` 返回一张活动 PNG、三个窗口，multi-ROI DTO 为 validated/ready。旧、新测量的冷重开后 `image_info` 分别与之前深比较一致，前序测量、前序点和网格关系保留；A/B FFT、源帧数组哈希及原始 TIFF 哈希核对通过。非 fit 相机前后精确相等；两次冷恢复的 provider 工具调用均只有 `image_info`，无科学重算。受控 helper 正常 close 后 exit=0、注册记录为 closed/generation 4，最后一次 Chrome error/warn 列表为空；这仍不替代生产启动器 Ctrl+C 资格。

最终本地收尾相关检查为 **157 PASS、0 FAIL、0 SKIP**；此前定向组合为 **307 PASS、0 FAIL、0 SKIP**。两组有重叠，不能相加成 464 项独立验收，也不声称在最终 SHA 重跑了此前整组。

## 保存读回与保留首败

`roi2-save-timing.json` 的一次保存 trace 为 `ready`：从保存函数计时起点到操作响应约 **7156 ms**，到保存画面约 **7300.3 ms**，到最终 UI 约 **7330.6 ms**；第一次状态读回 **8.1 ms**、持久化确认 **9.5 ms**、第二次状态读回 **4.8 ms**。这是一次内部阶段记录，不是从鼠标按下开始的点击总耗时、平均延迟或性能基准。

首轮并非全部通过，原失败证据保留在本地，后续成功不覆盖它们：

- S1 曾实际覆盖已有 pending 结果；另有 UI fixture 原地共享对象导致的初败，分别修复与解释。
- Node 18 托管首败暴露 checkpoint 默认字段兼容问题；S2 Windows 路径 fixture 连续失败，随后采用与 owned registrar 一致的 canonical 路径校验。`7475e63` 的 Node 18 虽有 620 项测试且无断言失败，仍在五分钟上限取消；仅给 fixture 增加 `Connection: close` cleanup 不足。最终 `2ef0c3b` 的生产 `Panel.close` 在停止接收后调用 `closeIdleConnections`，不打断活动响应；两项真实 HTTP 回归先 2 FAIL、后 2 PASS，最终 Node 18/22 托管检查通过。取消不算 PASS，生产路径与 CI 保护未放宽。
- S3 保留 TypeScript 初次构建失败、UI fixture/临时选区旧断言与显式历史导航初败。测试替身修正不冒充生产缺陷修复，真实导航修复亦单独保留。

本地证据目录 `image-first-rois-evidence-20261103/` 留存 `final-verification.json`、`roi2-save-timing.json`、`nonfit-after-cold.metrics.json`、冷重开前后 state/MCP 摘要及新旧测量记录；相关构建、首败与测试摘要在 `image-first-windows-evidence-20261103/`。这些本地材料不随本文件提交；本次文档不提交截图、原始日志、连接文件、capability URL 或私有数据。

## 复现入口与未测范围

在相应提交安装锁定依赖并正式构建，再显式指定公开图像及独立工作区：

```powershell
npm ci
npm run build
npm run inspect -- --source "<公开合成图绝对路径>" --workspace "<工作区绝对路径>" --python "<Python 解释器绝对路径>"
```

按既有 owned helper 停止/恢复规则重开同一工作区时不再传 `--source`：

```powershell
npm run inspect -- --workspace "<同一工作区绝对路径>" --python "<同一 Python 解释器绝对路径>"
```

操作说明在界面顶部“使用说明”。未知原请求仍只查询原 ID；重开不意味着重放 FFT 或保存操作。

**NOT_TESTED：** 真实样品与物理解释、完整 GUI/真人可用性、macOS、多原图、全部显示配方，以及生产启动器 Ctrl+C 关闭资格（#84 尚未集成）。本文件为证据摘要；本次文档工作仅人工检查文字、链接格式与范围，未运行算法或重新执行验收。
