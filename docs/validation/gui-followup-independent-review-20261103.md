# GUI 后续修复与独立操作审查

2026-11-03。公开合成输入、隔离工作区；不是实际研究者可用性研究、真实样品科学准确性或完整产品验收。本文追加证据，不覆盖[上一轮工程记录](stage12-engineering-closeout-20261103.md)中的首次 FAIL/HANG 和未测项。

## 版本与证据范围

| 项目 | 精确源码或交付 |
| --- | --- |
| 独立 Agent 首次操作 | `a11c2fd0dbf40e02b469ff9269fc5eb4ff53c15b`；冻结运行时，以截图、真实鼠标拖动和键盘操作，不用隐藏 API 或 CLI 代做科学动作 |
| 首败局部修复与原生定向重测 | `d4b48a975710c991c026fd7324fff9c58c835644`；tree 与独立修复 `cd3fcfea0f041abbb2c7dcbf313ebc465b7cd2dc` 相同；下文另列限定 PASS 与未测项 |
| 已测试的后续组合源码 | `88566a81324205bc6de9d2975cda1b4d1d9830ef`；在 `d4b48a9…` 上增加帮助默认章节／窄窗说明与保存状态呈现小修，不改科学算法；正常重开 A 等实际操作与来源资产首败分别列在下文 |
| 最终来源资产修复候选 | [PR #103](https://github.com/wuchqwq/microscopy-workbench/pull/103)，`c2cdda87150c1364e17fa7beb94e21a112937458`；生产修复为 `646effdaa7b61b46da57886edce0dd6b0b166998`。`9edfa46…` 仅补 CI／验证说明，`c2cdda8…` 再补精确兼容断言；三者 `lib/tools/ui` 生产文件字节相同。协议配对用 646，原生专项为正式 build 646／运行树 HEAD 9ed；不冒称在 c2 重做原生计算 |
| 恢复读取优化 | [PR #100](https://github.com/wuchqwq/microscopy-workbench/pull/100)，`cec6d24e6d27f1845a8a448e70a7036af3e8bbd9`；[限定计时与资格检查](restore-performance-20261103.md) |
| 右栏、菜单与窄窗局部调整 | [PR #102](https://github.com/wuchqwq/microscopy-workbench/pull/102)；已有控件保持挂载，按 ROI／点／线显示相关属性，高级设置折叠；不是导航或整体布局重构 |
| Windows 分发设计 | [PR #101](https://github.com/wuchqwq/microscopy-workbench/pull/101)，`96986ae29ed5a357d318c8640e5e1f80a69738f3`；仅阶段三 ADR，不是安装包、发行锁或干净机资格 |

首轮公开输入为 `public-synthetic-lattice-1024.tiff`，1024×768、uint16、无物理标定，SHA-256 `890310228ff5614f6a50453488e40e6f98afac57bcf3b3c794fa25b1574c5121`。三个周期区是生成数据，不代表任何材料、真峰或应变。原始报告、截图与逐项 receipt 保留在本机独立证据目录；不随文发布原始日志、访问凭据或私人资料。

## 首轮真实操作：失败仍保留

| 动作 | 首轮状态 | 实际范围与限制 |
| --- | --- | --- |
| 放大观察；三个 ROI；内部移动、控制点缩放 | PASS，限定动作 | 滚轮 52%→70%；三矩形，其中两个部分重叠；不代表所有重叠或所有图像尺寸通过 |
| 重叠 ROI 选择 | PASS，但需试错 | 画布点击选到顶层；右键无消歧菜单，最终在“属性→当前标注”选择下层；未证明完全遮盖对象内部可直接移动 |
| 删除与 Ctrl+Z | PASS，视觉恢复 | ROI1 消失并恢复；随后操作暴露下行阻断，不能把视觉恢复等同完整编辑闭环 |
| 撤销后选择另一 ROI→FFT | **FAIL** | 显示 `Stale object revision; reload before editing`；随后另一 ROI 的独立 FFT 尝试同样失败，未重放同一个未知请求 |
| 明确保存 | 未完成 | 首轮 Ctrl+S／保存按钮没有成功回执；不是保存 PASS |
| 错误现场自助核对 | FAIL，可发现性 | 找到“探索执行历史”但无本次 GUI FFT 行，未找到藏在高级设置内的原请求诊断入口 |
| F1→Esc | PASS，限定动作 | 帮助可打开关闭，未改变 ROI 或执行计算；首屏偏安装与开发启动说明 |
| 峰测量、拖峰重测、两窗 FFT 比较、取消／不保存退出与重开 | NOT_TESTED | 首次科学入口已阻断，没有用其他 session 或程序测试代替本轮手势 |

后续只读核对确认前后端实际当前标注对象相同；旧视图相机元数据写入失败仍保存在界面队列，FFT／保存准备因此提前拒绝。原工作区的七条标注请求已完成，未见本次 FFT 请求或对象。这一判断来自记录核对，**不是从界面错误或空结果区推断后端没有保存对象**。

修复只按 window/object 退役已由合格新窗口集合替换的旧相机目标；迟到拒绝不再重新阻断新目标，仍保留有效窗口失败和独立布局错误，不重放失败写入或未知科学请求。详见[局部修复与先败回归](undo-window-metadata-handoff-20261103.md)。

## 恢复与定向重测

root 在首轮交还 UI 后作了一次**受控 renderer 中断**，通过既有“界面进程中断→重新载入界面”入口恢复。三个 ROI 及当前科学对象保留；原 20 个 provider 文件 SHA-256 全部相同。随后 Ctrl+S 获得“分析工作区已保存并读回”可见回执，再 Alt+F4 正常退出，启动会话退出码 0。这属于 `a11c2fd…` 的故障恢复后保存／退出证据，**不代替首次失败链修复后的原生重测**。

同一独立 Agent 随后在 `d4b48a9…` 对原公开工作区定向重测。此时已知故障方向并读过源码，因此它是**定向重测，不是盲测或真人研究**。动作仍只经 native GUI；root 在交还 UI 后另作只读科学记录核对，两类证据不混算。

| 修复后验证 | 状态与实际范围 |
| --- | --- |
| Delete→Undo→另一 ROI 的一次 FFT→Ctrl+S | PASS，`d4b48a9…` 原生定向重测；收到明确保存并读回回执，未再现 stale revision |
| 候选点测量→拖峰→自动重测 | PASS，限定版本行为；先显示 `0.09970963372480264 cycles/pixel`，移位期间隐藏旧值并提示待重测，随后自动追加 `0.1378806893560076 cycles/pixel`，原值标为历史 |
| 两 ROI FFT 比较与来源返回 | PASS，限定操作；计算框分别为 `[609,118,918,316]` 与 `[76,103,370,316]`，两个 FFT 与来源窗并存，分别返回准确 ROI。平铺保留旧相机，需逐窗“适应”才能完整看图，仍属交互负担 |
| 原生键盘保护 | PASS，限定动作；画布 Delete 只撤回所选 ROI、Ctrl+Z 恢复；无选择 Delete 保留三 ROI；标签输入框 Delete／Backspace 仅编辑文字 |
| 保存 A→编辑 B→单次 FFT(B)→取消关闭 | PASS，`d4b48a9…`；取消后保留 B、FFT3、四窗与未保存状态，没有重复计算或保存 B |
| 再次关闭→单次“不保存” | PASS，限定正常退出；原生窗口消失，root 核对启动会话退出码 0，`normal_closed=true`，working 内容恢复 A，保存点身份未变 |
| 最终 `88566a8…` 正常重开 A | PASS，限定恢复；独立 Agent 亲眼核对三稳定 ROI、ROI1 原名／浮点框、来源＋两 FFT 共三窗，未把 B 的 FFT3 混入；root 另读回相同保存点与 clean 状态 |
| 最终 `88566a8…` 已有测量历史与当前峰 | PASS，限定可见结果；空间图历史过滤可见两测量，编辑已有 FFT1 后恢复当前峰 `0.137880689… cycles/pixel` 与未知物理标定 |
| `88566a8…` passive 来源图首次只读加载及一次重试 | **两次均 FAIL，读取超时**；保留“上一已核对底图，标注待加载”，一次“重试只读图像”后仍超时。没有再次重试、新预览或重算，不把底图可见写成完整来源对照可用 |
| `88566a8…` B 探索历史分离 | PASS，限定 GUI；历史列出三个已完成 FFT，B 的浮点框、整数处理框、原请求／FFT／输入身份可见；点击一次“查看 FFT”打开已有 B，明确未重算，未明确保存 B 或改变 A 保存点 |
| `88566a8…` F1→Esc | PASS，限定 GUI；默认展开 ROI 操作、启动章节收起，Esc 回到原界面和可见焦点；未计算 |
| `88566a8…` 刚保存状态下标签编辑的瞬态提示 | NOT_TESTED；已有 B 历史查看后工作区已 dirty，未另存或注入延迟凑齐动作；处理期间提示出现不替代该精确瞬态验证 |
| `88566a8…` Chrome 760×800 侧栏、菜单、帮助与 Fit 可达性 | PASS，root 的 DOM／Playwright 定向操作；不是独立 Agent 的 native 手势。属性／观察栏开合与 Fit、菜单操作后收起／菜单外点击／Escape、探索历史关闭、ROI 帮助默认展开与 Escape 可达；未测此尺寸下 ROI／FFT／峰编辑完整流程 |
| 最终 `88566a8…` 精确 head 托管 CI | PASS；[provider CI 41616890220](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41616890220)、[F3b CI 41616890242](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41616890242)，20 jobs 全部成功，两个 scope gate 通过。远端 Node 22 的 `npm ci` 成功、Node 926 PASS／0 FAIL；测试 merge 与 head tree 一致 |
| 来源资产修复后的原生专项 | PASS，限定两次来源→已有 FFT1 往返均无 timeout／待加载，完整底图可见，retry 0 次；没有新预览／FFT／测量／标注编辑或明确保存。单次 Alt+F4 无保存询问，root 核对退出码 0、`normal_closed=true` |
| passive 来源三 ROI 的框／标签可读性 | **FAIL，可见呈现要求**；来源当前编辑时三个 ROI 清楚，缩小后的只读来源全图未能辨出三个青框／标签，只见 FFT 计算框。原因未确认，1:1 显示未实测，不能宣称完整来源对照可用 |
| `c2cdda8…` 精确 head 托管 CI | PASS；[provider CI 41622881107](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41622881107)、[F3b CI 41622881152](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41622881152)，20 jobs 全部成功，两个 scope gate 通过；远端 Windows Node 22 `npm ci` 成功、944 PASS／0 FAIL，编译兼容 3 PASS、transport parity 1 PASS、17 Python 与正式 MCP 边界通过。测试 merge `5bdf5aa…` 与 c2 head tree 相同 |

root 只读核对新旧两测量分别引用各自的标注修订，但保留同一原始 FFT 与相同 `scientific_grid_identity`；实际 FFT NPY 的 SHA-256 与身份中的数组哈希一致。最初 20 个 provider 文件未改写；不保存退出后检查的四份既有 NPY 仍完全相同。物理标定为空，不确定性未知；人为挪动候选点只是测试修订与自动重测，不能当真峰、材料周期、应变或物相证据。

FFT(B) 的准确冻结输入仍为浮点框 `[100.95655225274989,124.06998722331186,393.97022493170596,336.64855833470887]`，实际计算整数框为 `[100,124,394,337]`；两者不混写。其原请求、FFT 和输入对象仍可读取，但 FFT(B) 与 B 输入视图均不在 A 的保存引用中。最终重开后，独立 Agent 经“探索执行历史”看见这条准确记录，并打开其已有 FFT。主动查看 B 使当前工作显示集合增加 B，顶部变为未保存；这发生在先恢复 A 之后，不是重开自动混入 B，也不等于更新 A 保存点。

`88566a8…` 原生重开中的来源资产超时是本轮新增的真实首败，必须保留；它有合格旧底图及有限等待状态，不等于用户此前“持续全空白／加载中”的同一现场，也未证明同一根因。一次只读重试仍失败，不覆盖首次超时。

root 后续以同一公开工作区和准确来源对象，通过普通 Inspector 与透明 MCP 计数 wrapper，只发一个真实资产 HTTP GET：最终返回 200，但耗时 **11,186.7277 ms**，超过 GUI 的 10 秒等待预算；该耗时不含浏览器解码。共 13 次 `image_info`，返回 PNG 251,497 bytes、3 个标注。静态链为多级标注→view→frame，逐次读调用会新起 Python；本次协议测量已证明 HTTP 读取自身就超过预算，不能把问题归咎于浏览器解码，也不声称已完成所有链路 profiling。

随后对**相同工作区、同一保存来源对象**运行相同协议 probe，生产修复 `646effd…` 返回 200，耗时 **987.9773 ms**，只用一次显式带祖先核对的 `image_info`。返回 PNG 字节相同、仍为 251,497 bytes／3 标注；五份原 NPY SHA-256 与三条 FFT 请求列表均未变。两个运行时均经既有路径正常关闭，启动会话退出码 0，没有重新计算或修订科学对象。

这是**一组有界配对协议取样**，不是真实鼠标任务时长或统计性能保证；没有把新结果覆盖旧 11.187 秒或两次原生超时。修复仍在一次 Python 中逐项使用原对象／请求／manifest／payload 资格核对，Node 保留 PNG、路径、网格与最终窗口 revision 检查，不跳过历史 parent/base/source 链、加长 GUI 超时或跨请求缓存。详见[来源资产有限祖先读取](passive-window-asset-ancestry-20261103.md)。随后独立原生专项两次实际来源／FFT 切换未再超时；它没有统一 GUI 时间戳，不能将协议秒数当作鼠标响应时间。

该局部共享边界的定向检查为 77 Node／Panel HTTP PASS、17 Python PASS 及一次正式 MCP 边界 PASS；原 5 FAIL／1 PASS 和首次 TypeScript build FAIL 保留。MCP 检查只用其临时公开合成输入，覆盖祖先 payload 损坏拒绝与原数据不变；没有开展无关算法大套件。`c2cdda8…` 的 UI／CSS 未变，因此 760×800 对 `88566a8…` 的视觉证据只复用相同界面范围，不冒充后端修复后的新原生操作。

`9edfa46…` 首次托管 CI 还暴露 frozen catalog 兼容断言未声明新 optional 参数，FAIL 日志保留。`c2cdda8…` 只对准确工具名／可选字段增加兼容投影及拒绝其他漂移的断言，不改 BASELINE 或放宽其他字段；隔离正式 build 与三项兼容检查 PASS。原兼容用例自带的一次 FFT 仅在其临时公开 fixture 中运行，不能误写为 A／B 验收工作区重算。

来源专项的剩余可见性问题不能等同资产或科学记录丢失：root 另以本地只读图像检查确认准确保存来源 PNG 含三处青框／标签，协议回复的 `annotation_count` 也是 3。缩小后线条变细是可能解释，**仅属推断，未实测 1:1**；保留 passive 可读性 FAIL，未擅自加入另一层 ROI overlay 或改导航。

专项关闭后再次只读核对：A 保存点未变，原四份 A 数组 SHA-256 均相同，三条 FFT 请求（包括 B）仍保留，`normal_closed=true`、启动会话退出码 0。main 仍为 `c8e95c38c552995cc24efa5dc9d5459ec80b02c6`；本轮 PR 待用户审查，不自动合并或移动验收基线。

`d4b48a9…` 定向操作还发现新的呈现首败：B 标签／几何提交期间，顶栏一度仍称 A 已保存。`88566a8…` 仅增加处理／待核对状态及未决保存提示，不改保存生命周期或 dirty 权威。[保存状态修复记录](workspace-save-status-20261103.md)保留原 3 FAIL／1 PASS 与修复后 23 项定向 PASS，不能把替身 HTTP 测试写成最终原生手势。帮助现在默认展开 ROI 操作，并更正 600–850 px 侧栏预留空间与更窄抽屉策略；不增加计算或导航功能。

工程定向回归为局部修复的 289 PASS／0 FAIL；tree 一致的整合版本不为凑数重跑同一套。最终组合正式 build 与四个帮助检查 PASS；保存状态的 23 项是另一局部范围，不与 289 相加包装成全产品覆盖。实际鼠标、受控故障、替身 HTTP／DOM 测试与数值算法资格分别记录。没有重复无关 FFT／GPA／拓扑／散射或噪声矩阵。

760×800 的实测观察栏左界与图像区右界均为 `440.8047 px`，侧栏在该宽度下预留空间；保存、关闭和 Fit 控件均在可见视口内。对象、选区、标注、上次操作及分析工作修订／dirty 状态前后不变，未执行 ROI 手势或 FFT。原始菜单异步展开前的中间截图仍保留，不冒充完成画面。该 Chrome 检查与 native 桌面分别计证，控制器 Ctrl+C 返回 shell 1、确认其 owned Node／Python 已停止，也不记作产品正常退出 0。

## 原生体验判断与最小改进

首轮未完成连续科研闭环，修复后的定向重测已能完成多个 ROI、FFT 对照、拖峰自动重测、来源返回及取消／不保存退出；后续重开恢复 A、只读查看 B 的真实探索历史，来源加载专项也未再超时。**已有界保存／探索闭环接通，仍未达到成熟科研桌面的连续多窗口可靠性与低负担体验**：passive 来源 ROI 缩小后不易辨认，重叠命中缺少可发现的对象选择提示；“已保存观察”与“工作区未保存”并列，Undo 文案又未准确对应删除；平铺后需逐窗 Fit，测量详情中的大段资格 JSON 压低常用信息。帮助首屏的小修已实施，其他建议没有借本轮扩大功能或架构。

## 开发机启动与恢复

在目标候选 worktree 按[桌面说明](../DESKTOP.md)完成锁定依赖、桌面运行时安装与正式 build。已有分析工作区正常重开用 `npm run desktop -- --workspace "绝对工作区目录" --python "科研Python绝对路径"`；新工作区还需明确 `--source "只读原图绝对路径"`。CLI 只读状态入口是 `node dist/tools/workbench_cli.mjs inspect --workspace "绝对工作区目录"`，不是另外一套科学存储。以上仍是开发机入口，不能冒充免安装发行包。

GUI 顶部“使用说明”或 F1 打开帮助，Esc 关闭，不清空草稿或执行计算。保存未知用“查询原保存”，科学请求未知用“显示与高级设置 → 诊断与原请求恢复 → 查询上次原请求”；保留原身份，不自动重放。有恢复副本时明确选择“恢复未保存编辑”或“放弃未保存恢复副本”，不手工删占用／请求文件。受控 renderer 中断的恢复证据只覆盖既有“重新载入界面”入口，不能泛化到断电或任意旧归档。

## DigitalMicrograph 基础能力对照

资料访问日期 2026-11-03。[原厂发布页](https://www.gatan.com/Software/Whats-New-in-Software/DigitalMicrograph-Software)当日标示 DigitalMicrograph 3.62；其他未标小版本页面不强行归属 3.62。没有启动或操作本机 DM，不由网页推断其真实手势、速度或菜单；1999 手册不作为当前 GMS 实机证据。

| 任务 | 当前 Workbench 的准确分类 | 原厂依据及范围 |
| --- | --- | --- |
| 图像、ROI、FFT 与来源窗口 | 已有；首轮 FFT 版本冲突属已有功能故障。重叠选择不顺，当前多窗限定同源帧 | [产品页](https://www.gatan.com/Products/TEM-Software/DigitalMicrograph-Software)描述工作区／显示组织；[dm5 文档](https://www.gatan.com/Software/Scripts/DigitalMicrograph-Script-Resources/dm5-documentation)列矩形、线、点、椭圆、不规则 ROI 对象，不证明各项当前入口 |
| 可编辑 Fourier 掩膜→通用 IFFT 回空间图 | 缺少通用用户工具；显示平滑或 GPA 内部 IFFT 不能替代 | [dm5 文档](https://www.gatan.com/Software/Scripts/DigitalMicrograph-Script-Resources/dm5-documentation)列多种频域掩膜；[Amorphous 原厂历史脚本（2014）](https://www.gatan.com/Software/Scripts/DigitalMicrograph-Library/Amorphous)示例使用 RealIFFT，不作 3.62 完整菜单断言 |
| 距离、周期、取向和夹角 | 距离／周期已有；向量方位角后端已有但 GUI 未显示；一般三点夹角缺少 | [DIFPack 模块](https://www.gatan.com/Products/TEM-Software/Digital-Imaging-Modules/DIFPack-Module)支持晶格间距、晶面夹角及峰细化；模块能力不等于 basic DM 必备，也不证明一般三点角交互 |
| 强度剖面与统计 | GUI 已有一像素宽最近邻直线剖面、原数组探针／统计；厚线平均及多剖面管理缺少 | [ClearView 原厂说明（2024）](https://www.gatan.com/Resources/Applications-Library/Application-Notes/Frame-Control-mode-for-optimized-imaging-and-diffraction-with-ClearView-camera)明确提到内置 histogram 和 ROI line profile，未标 GMS 小版本 |
| 多图／堆栈与输入选择 | 有限跨帧比较／序列后端已有，桌面缺通用跨源／堆栈比较入口；复杂 DM dataset／轴／分量仍缺 GUI 选择器 | [原厂序列处理脚本（2024）](https://www.gatan.com/Software/Scripts/Python-Library/Process-2D-in-situ-datasets)给出同步回放示例；[离线配置表](https://www.gatan.com/Software/Downloads/DigitalMicrograph_Free)将 player／alignment／volume 等分列 |
| 数据、显示与保存 | 工作区保存、科学 NPY、PNG、CSV 和图版导出已有；dm5 读写和广泛格式兼容缺少 | [dm5 文档](https://www.gatan.com/Software/Scripts/DigitalMicrograph-Script-Resources/dm5-documentation)分开数组、标定、metadata 和显示状态；不能据此声称已逐格式实测 |

源码能力核对指向 `lib/image_workspace.mts`、`tools/image_workspace.py`、`ui/image-panel/measurement-workspace.mts` 和 `docs/IMAGE_NUMERIC_INSPECTION.md`；“后端已有”不等同 GUI 已验收。新增能力应优先考虑角度显示、通用 Fourier 掩膜／IFFT、常用剖面与跨图比较，各自单独限定科学合同。

DM 的 DIFPack、IS Player 等许可配置不同，不能把全套 GMS 当成 basic DM 全自带。[官方离线配置表](https://www.gatan.com/Software/Downloads/DigitalMicrograph_Free)支持这一区分。显微镜／相机控制、EELS／EFTEM 等厂商采集链是当前 DM-free 内核有意排除的范围，不列为本轮基础 GUI 必做项。

## 尚未取得的资格

原持续空白现场仍为 NOT_REPRODUCED；任意旧归档、所有原生手势、真实样品周期／取向或物相准确性、macOS／Linux 桌面、干净 Windows 安装、签名、升级及断电恢复均未由本文取得资格。右栏收敛和读取提速也不等于整体交互验收。阶段三只交付 ADR，开发机 venv 和普通 Node 不能冒充可分发运行时。
