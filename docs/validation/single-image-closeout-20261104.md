# 单主图与原图—ROI—FFT 收尾

2026-11-04。用户批准按既有“单主图整理”方向完成小范围界面收尾和一次轻量 Windows 操作验收，提交 PR 审查，不自动合并。无私人样品或用户截图上传，不修改全局配置、已有故障窗口、保护规则或稳定基线。

## 版本与依赖

工作树从 #128 精确 `6fc8725deecdd7757d15d50e034742c5d27e61fa` 建立。实际 Windows 受验生产代码为 `03293c937d74490455b135abcd060e1881c38561`；后续追加旧名称测试预期、文档与保持原 validator 字节的检出属性，Python Git blob／算法代码不变。最终 PR head／CI 在交付中列出。父 #128 的两条 CI／scope gate 已按精确提交核对成功，不重复其科学算法套件。

实时 main 为 `dd9b706786041c6c0a6678ff6cd4dd84dbe06a3e`、`protected=true`，不是本候选的祖先。待审顺序：

`#110 → #111 → #117 → #118 → #119 → #123 → #124 → #125 → #127 → #128 → 本 PR`

这些父 PR 均 open、未合并，实查未见 head 漂移；#126 ADR 是已整合的旁支。#110 为 behind，后续授权集成仍须处理 main 接续和门禁，不能因为无冲突就越过“分支最新”要求。本轮未自行 rebase、合并、改保护或移动 main。依赖原始元数据见本地 `dependency-audit.json`。

## 前后变化

| 之前 | 本轮行为 |
| --- | --- |
| “保存视图”是有按钮外观的不可点击状态文字 | 以普通文字显示“空间图／FFT／数组图”等当前图像类型；保留内部 SavedViewHistory role、准确对象与恢复关系。裁剪视图不会冒称全帧原图，只有工作区保存控件表达明确保存。 |
| 左栏和执行动作都叫“测量” | 左栏“测量线”；空间线段“测量长度”，频域点“测量周期”，任意两端线段“测量倒易距离”。不改变原测量参数和科学资格。 |
| 当前 FFT 需先打开窗口菜单找来源对照 | 将原来的同一“原图与 FFT 对照”按钮移到图下，仍用同一 guarded handler／来源、草稿、owner、窗口版本与解码保护；窗口菜单保留布局操作。 |
| 已有 ROI 时提示泛泛圈区域、点峰 | 提示点击已有 ROI 或按 R 新增；当前对象名称与简短操作提示分开，完整坐标保留在 title 和原属性／科学记录。复数空间图不提示执行当前不支持的 FFT。 |
| “结果与历史”与底部“数据结果”容易混淆 | 顶部改称“分析历史”；底部保留数值结果。全被历史过滤时可一次点击“显示历史结果”，只改过滤／展开状态，不读新科学数据或采用结果。 |
| 常态下底部重复显示技术恢复和编辑说明 | 正常状态更短；未决科学请求、未知保存、应用失败和草稿继续可见，不被“图像已就绪”掩盖。面板偏好诊断仍可按需查看。 |

内置中文帮助和当前操作合同同步真实名称。主图窗口管理、测量算法、原输入、科学坐标、标定、数组、保存／恢复合同均未改。相机只在明确操作时适应；普通刷新、切窗与恢复不擅自重置缩放。

## 定向本地回归

- 锁定 `npm ci`、正式 build PASS；新 helpers 只是展示函数，原 `framePreviewRecipe`、`selectionActionReason` 等规则保留。
- 工作流 11/11 PASS，结果区 19/19 PASS；先运行 18 项相关 UI 用例通过。
- 因通用 `showDraft`／状态显示影响多种选择，再运行该 UI 文件的全部直接消费者：259 PASS／1 FAIL（5.5 秒）。唯一失败为旧测试仍期待“保存视图”，与本次有意改名不符。只更新这一文字预期，保留全帧新显示、原 source 与不复算断言；该用例定向复测 1/1 PASS。原 `ui-all-direct-first.log` 不覆盖，不把定向复测称作新的完整盲测。
- 独审发现的“未决请求可能被隐藏”和“复数空间图提示 FFT”已补负例；其余所审来源对照与历史入口未见保护绕过。

跨 worktree 的额外旧证明读取首次 **FAIL／unavailable**：新 Python 文件 `tools/image_source_proof.py` 原来以 LF 字节签发来源证明，但 Windows 新检出在 `core.autocrlf=true` 下变为 CRLF，同一 Git blob 的字节哈希因此不同。原 proof 的严格 policy/build 检查正确拒绝了它，未改旧记录。首次回执 `proof-identity-roundtrip-first.json` 保留。

最小修复仅在仓库 `.gitattributes` 固定这个新文件 `text eol=lf`，恢复原已验证字节；不更改其他旧 validator、原 proof、hash／policy 判定或全局 Git 设置。新增 Git `checkout-index` 针对用例以单次 `-c core.autocrlf=true` 导出临时副本，与原 HEAD blob 逐字节相同，1/1 PASS。再读取原 80 链 proof `01464d80f43d4637b46998ce0c2aa591`：Node 与正式 MCP `image_source_proof_info` 均 verified、81 个依赖，原 manifest hash `80f1f164dcc2323e361b4337f64a6626126b94c7f19ef006723bedb2b4ff2d38` 不变；0 FFT／预览／测量／新证明。此处只保证该文件同版本检出一致，不扩大不同 validator build 的兼容政策。

没有手工重复 GPA、拓扑、散射、完整 FFT／噪声矩阵。CI 按仓库既有分类规则独立运行；本 PR 不修改分类或门禁来缩短等待。最终源码的精确提交 CI 另核对。

## Windows：实际鼠标／键盘

由用户指定的 6.1 Terra 使用 computer-use／Sky，在独立 profile、公开新工作区上操作仓库已有 Electron 桌面入口。复用已安装锁定 Electron 45.2.1，后台使用普通 Node v24.16.0；不是干净 Windows 安装验收。没有用 DOM、HTTP 或协议注入替代下列手势。

输入为新生成的 256×256 uint16 双余弦，X 周期 8 px、Y 周期 16 px，无物理标定；不是实际 HRTEM 或缺陷准确性样品。源 TIFF SHA-256：`e4c0d0d940f5080c36e9a9eec490b943a2db1e6c9a7433872419e386c863caed`。

| 实际操作 | 结果／边界 |
| --- | --- |
| 两个部分重叠 ROI；选择 ROI 2、移动、缩放、撤回、撤销 | PASS，有界面观察；撤回为追加标注修订，原对象保留。未把本次范围扩展为所有重叠右键消歧路径。 |
| ROI 1 → FFT 1 → 图下来源对照 | PASS，显示来源与 FFT；实际支持范围 `[30,37,130,137]`。原图对照未重算。 |
| 点峰测量 → 拖峰 → 自动重测；两端测量线 | PASS，新旧结果分开。点的条件性像素周期从 7.89114431549 改为 7.28179900589，与明确移动后的坐标对应；不是峰定位准确性或应变验收。任意两端线段的差矢量不当作 DC→晶格峰。 |
| Ctrl+S 保存 A | PASS，“正在核对保存”后“已保存并读回”；未重复提交。 |
| 返回来源，编辑 ROI 2 为 B → FFT 2 | PASS，范围 `[99,121,210,232]`，3/5 个窗口、工作区未保存。只生成第二个新 FFT。 |
| 原生退出 → 取消 | PASS，B 和 FFT 2 保留，窗口继续打开。 |
| 再退出 → 不保存 → 正常重开 A | PASS，视觉为已保存、2/5 个窗口和 FFT 1，没有自动显示／采用 FFT 2。ROI 2 的准确 A 坐标与 B 原输入由下节独立读取核验，不冒称已逐坐标鼠标复核。 |
| F1／Esc 帮助；正常关闭 | PASS。没有清除草稿或触发新计算。 |

正常截图尺寸为 1429×907。首次边框拖动未改变尺寸，窄窗原生范围当时 **NOT_TESTED**，记录保留。随后只做窄窗定向复测，没有重复 ROI／FFT／测量／保存：系统窗口菜单 Size 与右边拖动后，Sky 返回 **755×907 像素截图**；这不是已确认的 CSS 视口或外窗尺寸。该尺寸下文件菜单／保存项可见，帮助可鼠标打开关闭，属性抽屉可关闭。精确 **760×800**、该尺寸下的 Fit／科学编辑仍 **NOT_TESTED**。保留的 472% 相机使图像局部在可见框外，未把它认作缩放 bug，也未强制重置。

三次隔离桌面启动均正常关闭；未操作旧故障窗口。原生操作记录在本地 `native/native-report.md`，截图来自工具观察，没有导出／上传用户截图。

## 独立只读保存／来源核对

用现有 Node reader 读取本轮实际 provider journals、sidecar 与保存点，没有发出科学写请求：

- FFT 1 `642177b4034848599ac5ecd182404838`；原请求 `panel-a9b0be15b5bed10724f83debe069a756-7`。
- FFT(B) `677785410049483c92af93d1b8770003`；原请求 `panel-83a66ee7e18fb9fa1e0f23e79eec50d4-15`。两条均 completed／validated，原浮点框与实际 support 分开保存。
- A 为 `save-97380668-7de8-4f00-bd9e-b17ee20b58e9`，revision 1，保存点 manifest SHA-256 `3638158420313f9316c6f7e96a62038d6b6d56420a81936e195e64dbac69b252`。不保存、重开和窄窗查看后字节不变。
- B sidecar 的稳定 ROI ID 和几何与实际 B source 完全相符，几何与 A 同一 ROI 的保存几何不同；B FFT／request 不在 A 快照中。B 原执行仍可读取，不冒充 A 的结果。
- 新峰测量 `904df545c43d457a97b307d06a61d26f` 为 current，准确引用旧 `9a8096a36095433f9762a19f00198ae6`；旧条目为 historical，旧字节保留。无物理标定，未填造 d-spacing。
- 最终仍为 **2 个 FFT 原请求、2 个 FFT 数组**；不保存以后新增科学对象为 0。55 个已完成对象／请求／保存点文件及源图 hash 均不变。

本地完整证据：`F:/mircograph-workbench/single-image-closeout-evidence-20261104/`。含第一轮日志、各 stage hash、`final-readonly-contract.json`、真实冻结输入、保存点、原生报告与依赖审计。生产科学记录仍由工作区权威保存，不另建证明库。

## 启动、恢复及遗留

从本 PR 的 source worktree 使用普通科研 Python，正常重开本轮工作区（不要再给 `--source`）：

```powershell
npm ci
npm run build
npm run desktop:install
npm run desktop -- --workspace "F:/mircograph-workbench/single-image-closeout-evidence-20261104/native-desktop-workspace" --python "<ABS_SCIENTIFIC_PYTHON>"
```

已有锁定桌面运行时可复用，不必重新安装。浏览器查看可用 `npm run inspect` 指定同一 workspace／Python，须先正常关闭原桌面写入所有者；浏览器关闭提示不代替原生退出三选项。科学结果未知仍只查原请求，保存未知用“查询原保存”。

保留：精确 760×800 原生范围、该窄窗 Fit 与完整历史筛选鼠标路径、真实用户易用性、原持续全空白现场、长历史批量证明读取性能、实际样品科学准确性、安装发行／升级恢复。本轮不因此新增算法或宣布完整 GUI／真实样品验收通过。
