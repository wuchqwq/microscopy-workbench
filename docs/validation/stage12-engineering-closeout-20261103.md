# Microscopy Workbench 阶段一、二工程验收记录

> 候选源码与四层 PR 的精确提交托管 CI 已核对。最终 Windows 原生保存、FFT、拖峰重测、不保存恢复、FFT 保存退出后重开返回及 760×800 报告呈现分别记录；首次失败与未测范围保留。不合并或移动 main／验收基线。本文仅使用公开合成输入和隔离工作区，不含私人样品资料、访问令牌或原始日志内容。

## 版本与交付边界

| 项目 | 精确版本 / 状态 |
| --- | --- |
| main 核对值 | `c8e95c38c552995cc24efa5dc9d5459ec80b02c6`；本轮不移动 |
| 当前组合候选完整源码 SHA | `3d530db2b284e3729798a619ac7654cebde53955`，正式构建 PASS；精确 head 托管 CI 全绿 |
| 原生操作的源码范围 | 早期 `deb40ff63daf86bd7312351a9dbe28ed63465cb5`；窄窗与 headless 记录 `4f99267e6180298e32938855648fa153fca8872d`；下表新增最终原生记录 `3d530db…`。按行标明，不混成一次运行 |
| `4f99267…` → `3d530db…` | 包含报告序号／折叠来源呈现及桌面等待期限、在途请求、等待期冻结、只读状态 loadedRevision 修正；未改变数值算法 |
| 当前桌面关闭修订 | 已独立复核、构建及托管 CI 通过；3d 实际 Cancel 后单次 NoSave 完成退出 0；停在 FFT 原生保存退出、正常重开并返回空间图亦完成。慢操作仍列限制 |
| 精确源码 CLI 证据 | `4f99267…` 三 FFT 全复用、显式坐标测量及原 ID 查询／重复；`3d530db…` A2／B2 持久化纯只读补验 PASS，未重复科学计算 |
| 前期工程范围验证版本 | `68952785ce639e56988aaadba1325e89abecad70`；28 个相关 Node 文件，465 PASS，仅限其记录范围 |
| 交付 PR | [#95](https://github.com/wuchqwq/microscopy-workbench/pull/95) → [#96](https://github.com/wuchqwq/microscopy-workbench/pull/96) → [#97](https://github.com/wuchqwq/microscopy-workbench/pull/97) → [#98](https://github.com/wuchqwq/microscopy-workbench/pull/98)，按共用保存、GUI、CLI、桌面分层；均未合并，仍依赖未合并的 #94 及其前置栈；精确 heads 见 CI 表 |

这是阶段一、二的工程基线候选，不是完整 GUI、真实样品科学准确性或阶段三安装验收。项目保持 MIT 开源；第三方依赖遵循各自许可证。

## 已实现的操作合同

- 同一源帧的分析工作区整体明确保存；工作编辑、明确保存点和不可变科学执行记录分开。原图只读。
- ROI 默认选择，内部移动、控制点缩放；一次手势一次撤销。Delete 只针对画布中明确选中的 ROI，文本焦点或无选择不会全删。
- 临时 ROI 可直接 FFT。峰修订后保留当前自动重测规则，追加新结果，旧测量仍独立保留。
- 子窗关闭只关闭显示。退出有修改时“保存／不保存／取消”；保存失败、未知请求或新编辑保持打开。未知执行查询原请求，不自动重放。
- 恢复副本未决定时允许查看、相机和面板偏好，但新语义编辑或计算需先恢复或明确放弃副本。不同 C/D 遗留副本冲突时保留原件并拒绝覆盖。
- 每图侧栏、设置分组及结果区开合与合格相机一起恢复；偏好不使科学分析变脏。旧记录缺字段时明确使用默认，不补造历史偏好。
- 独立 Electron 窗口、原生菜单和 headless JSON CLI 共用既有 provider、保存合同与原执行记录；没有第二套科学数据库或 Agent 框架。

## Windows 公开组合操作记录

以下记录按源码区分实际原生窗口、浏览器、API 和 CLI 读回；不从程序状态、鼠标动作或坐标测量推导材料物理结论。

| 项目 | 状态 | 证据与实际范围 |
| --- | --- | --- |
| 原生入口可见，三 ROI，明确保存 A0 | PASS | 本轮隔离公开工作区；`native-final-deb-A0-read1.json`、`native-final-deb-A0-read2.json` |
| ROI2 → FFT，来源图窗保持可见 | PASS | `native-final-deb-roi2-FFT-first.json`、`final-deb-source-and-fft.png`；该截图显示上一已核对底图，标注尚待加载，不能作为 full asset 已加载证据 |
| 完整来源保存资产加载终态截图 | PASS | 后续真实 FFT(B) 的 `final-deb-B-fft-full-source.png` 补齐；不把更早的底图占位截图改称已加载终态 |
| FFT 点标记与首测 | PASS | `native-final-deb-peak-measured.json`；测量 `e3ab26b55c00416483e67b3013c10a43` |
| 拖峰 → 自动重测 | PASS | `native-final-deb-peak-drag.json`、`native-final-deb-peak-remeasured.json`；新测量 `35d544a5b81340fb89f2f5de902b470c`；原 FFT 数组哈希保持相同 |
| 返回对应空间图 → 明确保存 A1 | PASS | `native-final-deb-save-A1-confirmed.json` 和负责人后续 AX 终态观测：已显示对应空间图及正确 ROI；`save-f34709e4-377d-4f7a-a4a2-c40fafb6fe84`，保存修订 3，读回 clean。`native-final-deb-return-spatial.json` 只是仍在读取中的首次采样，单独不证明返回终态 |
| ROI1 移动、缩放及一次手势一次 undo/redo | PASS | `native-final-deb-B-move-complete.json`、`native-final-deb-B-resize.json`、`native-final-deb-B-undo-complete.json`、`native-final-deb-B-redo.json` |
| 无选中 Delete 不全删；删除后 undo 恢复 | PASS | `native-final-deb-B-delete-complete.json`、`native-final-deb-B-delete-undone-complete.json`；当前 B 为未明确保存工作编辑 |
| CLI 在 GUI 停留未保存 B 时读取保存 A1，比较三个 ROI | PASS（限定范围） | 原命令 completed：`native-final-a1-gui-draft-20261103`，ROI2 原 FFT 复用、ROI1／3 补算；两行缺少选峰／测量保持 `needs_point_selection`。首脚本计算前已核对 B 的对象和精确浮点几何，但在末尾误断言处提前结束，未落盘完整初始 hash receipt |
| CLI 验收脚本要求 ROI2 至少两个 current measurements | FAIL | 验收期望错误：新测量应 current，旧测量应作为历史独立读取。首失败保留于 `native-final-cli-gui-1793669110458/summary.json`；不能据此直接判算法或程序失败 |
| 原 completed CLI ID 查询及重复调用不重算；旧／新测量分别可读 | PASS（只读补验） | `native-final-cli-gui-readonly-1793669256014/receipt.json`：一条 current 新测量与一条历史旧测量分别经正式 CLI 读取；沿用原 completed comparison 和 child request，新增对象 0。补验前后 B 的对象、选区、编辑状态及内容 hash，全部旧对象 manifest／数组，以及 A 保存点／指针不变；B 精确匹配负责人计算前记录。该补验不冒称首脚本未执行的 hash 断言已通过 |
| 未保存 B → FFT(B) → 返回空间图 | PASS | `native-final-deb-B-FFT-first.json`、`native-final-deb-B-return-confirmed.json`；原 FFT `ec93b9dc817a4417bc9439597df9fa4f` 绑定 B 的原始 float `[15.89207524667346, 14.034002603447595, 47.64088689192594, 46.26752396355174]`；返回终态经实际原生操作与读回核对，不用首次 loading 采样冒充终态 |
| 原生退出三选项 → 取消 | PASS | `final-deb-native-close-dialog.png`、`native-final-deb-close-cancel.json`；实际 Cancel 后窗口和未保存 B 保留 |
| 原生“不保存”首轮等待 | FAIL，保留 | `deb40ff…` 在 15 秒客户端期限发生 timeout；当时不重放 discard，不因后续成功删除首失败。后续 3d 等待／在途保护修订及实测另列 |
| 原“不保存”迟到结果查询 → clean close | PASS（后续恢复步骤） | `native-final-deb-discard-timeout-query.json` 首次查询仍为 dirty；`native-final-deb-discard-late-query.json` 后续确认 A1 clean、工作修订 37。随后原生 clean close 会话退出码 0。没有杀进程、换 ID 或重放。该步骤不能把前一行超时体验改为 PASS，也不替代 3d 新修订的实际原生步骤 |
| 精确 `4f99267…`、无本工作区桌面 owner 的 CLI 全复用与测量 | PASS | `native-final-cli-headless-1793669827582/summary.json`：`native-final-a1-headless-20261103` 三 FFT 全复用、新 FFT 0；原 comparison 重复和原 FFT 查询均新增对象 0；显式 `[[0,0],[0.125,0]]` 工程向量测得 8 px，仅第一次测量新增一个对象，原请求查询及同 ID 重复新增对象 0。原 GUI 两条测量 hash、全部旧对象／数组和保存 A1 均保持，前后没有 GUI owner；8 px 不是已认证真峰或材料周期 |
| 丢弃后 FFT(B) 科学来源仍可读，未纳入 A1 | PASS | 最终 headless `history` 为原请求 `panel-5198f1b1543b9653882b3b688fb03c91-12` 返回 validated／completed 输入，原请求查询确认原 `ec93…` FFT；保存 A1 不含该 B FFT。临时／历史执行没有被冒充成保存分析 |
| 早期候选重开后的完整接续 | NOT_TESTED（原范围） | 早期 152px 差异已定位为 304px 抽屉未恢复，不把旧观察包装为新版本 PASS；3d 的 A2／A3 新版恢复另列，不能覆盖原范围 |
| 早期 F1／帮助菜单“使用说明”手势 | NOT_TESTED（原范围） | 早期未取得最终组合证据；3d 实际 F1／Escape 证据见后表 |
| `4f99267…` Chrome 760×800 窄窗口 | PASS（入口可达性） | 通过浏览器视口能力设置并实读 `innerWidth=760, innerHeight=800`；实际点击收起属性、适应画布、窗口列表→既有 FFT→返回原 ROI 均完成，无新 FFT。保存按钮可见可达，但本项没有点击保存；不是原生窗口尺寸验收。截图 `final-4f-narrow-source-settled.png`、`final-4f-narrow-fft.png`。展开抽屉仍遮挡部分图像，需要收起／适应画布，不作整体易用性通过 |
| `4f99267…` 窄窗口中文帮助与状态不变 | PASS | 实际打开“使用说明”并按 Escape 关闭，焦点回到 `open-usage-help`；前后对象、选区、编辑状态、保存点与最后操作均一致。`final-4f-narrow-help.png`、`native-narrow-4f-report-open.json`、`native-narrow-4f-help-closed.json` |
| 窄窗口对照报告可读性 | 首次 FAIL → 已修；新版限定 PASS | 实际报告选项同前缀、长 ID 与重复英文说明占满表格。首图 `final-4f-narrow-comparison.png` 保留；呈现小修 `588f0b14712c4ed2d2caebfb79a018b4bb8bd692` 的 9 个定向用例通过；3d 的独立 760×800 复测另列，不覆盖首失败 |

### 当前 `3d530db…` 原生与持久化记录

| 项目 | 状态 | 证据与实际范围 |
| --- | --- | --- |
| 重开 A1 的原几何与逐图面板偏好 | PASS | `native-final-3d-reopened-A1.json`：实际原生打开后，来源视图 `22dd1ace13f140b39e8422cfe759c808`，A1 保存修订 3、clean、工作修订 37；原 ROI 几何／选择恢复，source 为 properties、settings/results 关闭，已有 FFT 为 side none。不是停在 FFT 重开后的完整返回验收 |
| F1 打开中文使用说明 → Escape 关闭 | PASS | 实际原生手势，`final-3d-native-help.png`；不由菜单实现或浏览器旧证据推断该动作 |
| 新报告默认三行可见 → 明确采用报告 | PASS（普通原生窗口） | `final-3d-native-compact-comparison.png`：比较选项可区分，报告顺序区域 1／2／3 与中文状态可见，完整 ID／浮点来源／不确定性可展开；实际明确采用 `native-final-a1-headless-20261103`。760×800 的独立视觉另列 |
| 实际鼠标保存 A2，保存过程与终态反馈 | PASS（采样范围） | 点击“保存工作区”后，首次状态读取仍为 saving；后续 UI 显示“分析工作区已保存／已保存并读回”，第二次状态读回 clean，`save-1b2b5b45-8e81-4f0f-bee4-b97c8e52bf0a`、保存修订 4。原选区保留；采样时间见下表，不推断精确后端提交／UI 翻转延迟 |
| A2 后移动 ROI1 为未保存 B2 → FFT → 首测 → 拖峰自动重测 | PASS | `native-final-3d-B2-move.json`、`native-final-3d-B2-FFT-first.json`、`native-final-3d-B2-first-measure.json`、`native-final-3d-B2-remeasured.json`；原 FFT `8efcaff194274d1dbd654eb358d34211`，首测 `32442f0497cb48679e500b41fdd1428d`、新测 `32d2fddde0744243987a8a7915402589`。两测量的科学网格与 FFT 数组 hash 相同；坐标修订并未重写科学数组 |
| B2 FFT 返回对应空间图 | PASS | `native-final-3d-B2-return-confirmed.json`：实际返回来源 `ae1be484a9ad4d6bb630fba538646fec`，B2 原 float 选区 `[14.68028854265619, 13.791645299988167, 43.520812098267214, 42.87452171511973]`，A2 仍为保存修订 4，当前工作 dirty |
| 真正原生 Cancel 后再次单次 NoSave | PASS（保存语义与退出） | `native-final-3d-close-cancel-confirmed.json`、`final-3d-close-question.png`、`final-3d-discard-native-complete.json`：Cancel 后实际确认主窗重新 enabled 且 B2 保留，随后再次关闭并仅点击一次“不保存”。等待期间实际主窗 disabled，原操作完成、会话 32189 退出码 0；没有重放 discard、强杀或操作用户试用窗口。耗时／冻结仍是下述限制 |
| 原 45 文件及 B2 新执行记录保留 | PASS（限定文件集合） | `final-3d-immutable-before-B2-FFT.json` 及两个后续 immutable-after 记录：45 个原文件 hash 全部保持。`final-3d-B2-execution-files-during-discard.json` 的 9 个 B2 FFT／视图／测量文件，经后续纯只读验证仍全部一致；不扩展为工作区所有可能文件的全面审计 |
| NoSave 后精确 A2／B2 的正式 CLI 只读补验 | PASS | `final-3d-persisted-readonly-1793672193808/receipt.json`：A2 三 ROI 的 frame／float／processing support 与原 A1 相同，保留明确采用的报告；B2 source／FFT／两测量未纳入 A2。两测量正式 `image_info` 均可读，网格一致，实数组 SHA 为 `f73a2b70a3627d957dd3b638b98556ac0a0d836ab1ae8e60b90f9e884173be8b`；原 B2 请求的 history 为 validated／completed、float 输入吻合。前后 A2 保存点／指针／working 字节和全部 provider manifest ID/hash 不变，无新科学对象或计算 |
| 不保存后正常重开 A2 | PASS | `native-final-3d-reopened-A2.json`：clean、保存修订 4，无恢复副本；恢复原三个 ROI，source 相机与 `ui_panels` 和 A2 保存记录完全相同。B2 执行仍是历史，不作为 A2 结果 |
| 停在 FFT → 原生保存退出 → 正常重开 FFT → 返回空间观察 | PASS（公开合成输入） | 已有 ROI2 FFT 仅改标记颜色为橙色，未做新 FFT／峰重测；实际 Alt+F4 后单次“保存”，会话 52138 退出 0。CLI 读回 A3 `save-cdfe6279-5535-43d9-a323-7497f2bc1c49`、修订 5。正常重开会话 65852 的 `native-final-3d-reopened-A3-FFT.json` 和 `final-3d-reopened-A3-FFT.png` 确认 FFT `0db27a66460040438ac97ac41625a1eb`、橙色、点坐标及面板恢复；实际“返回空间观察”到 source `22dd…`，原 ROI2 精确 float 与三个 ROI 保留，仍 clean；证据 `native-final-3d-A3-return-space.json`、`final-3d-A3-return-space.png`。随后 clean close 退出 0 |
| 新版 760×800 默认三行、展开来源与关闭按钮 | PASS（Chrome 视口，非原生尺寸） | 实读 `innerWidth=760`、`innerHeight=800`；`final-3d-narrow-comparison.png` 显示三个比较行，`final-3d-narrow-comparison-expanded.png` 显示展开的真实 ID／float 来源，纵向滚动保留，关闭按钮可达。实际关闭后对象、selection、edit、savepoint 和 last_operation 不变：`native-final-3d-narrow-before-report.json`／`native-final-3d-narrow-report-closed.json`。并未重新采用历史报告或执行计算；不是整体布局／易用性验收 |
| 新版 760×800 返回来源图与 Fit | PASS（收起弹层后） | 报告关闭后“结果与历史”弹层仍展开，首次返回尝试没有导航、报告又打开；保留 `final-3d-narrow-return-first-observation.json`，不把该次尝试写成成功。明确收起弹层后确认 hit target 为 `return-spatial`，实际返回正确 source／ROI2，`native-final-3d-narrow-return-confirmed.json` 为 clean A3。返回会恢复来源图的 properties 偏好，收起属性后“适应画布”可看完整三个 ROI：`final-3d-narrow-source-fit.png`。临时视口已 reset、仅关闭自建 tab；PTY 控制器按原 API 明确关闭 clean 工作区、正常 drain，退出 0，没有重演旧 stdin 设施失败 |
| A2／A3 文件闭合独立核对 | PASS（8 项文件读回） | `final-3d-A3-file-closure-1793673004226/receipt.json`：A2 source 与 A3 FFT 的 camera／ui_panels／selection／标注坐标与准确保存记录一致；A3 Return 的空间相机对应冻结输入 context，原 ROI2 float 与三个 ROI 一致；已采用报告保留，B2 source／FFT／测量不在 A3 引用中。该补验不调用 CLI／provider／科学计算；45 个旧文件 hash 复用原有 receipt，不能冒充另跑一次完整 hash 审计 |

保存 A2 的实际采样（UTC）：

| 采样 | 时间与状态 | 证据 |
| --- | --- | --- |
| 鼠标点击 | 开始 `02:04:22.393`，点击调用返回 `02:04:22.518` | `final-3d-save-mouse-times.json` |
| 第一次状态读取 | 开始 `02:04:28.054`，采样完成 `02:04:28.093`，状态 saving、仍引用 A1 | `native-final-3d-save-A2-read1.json` |
| UI 终态采样 | `02:04:38.389`，显示“分析工作区已保存／分析工作区已保存并读回” | `final-3d-save-UI-clean-observation.json`；另保留 `final-3d-save-UI-busy-observation.json` 的范围备注 |
| 第二次状态读取 | 开始 `02:04:46.819`，采样完成 `02:04:46.853`，A2 clean、保存修订 4 | `native-final-3d-save-A2-read2.json` |

这些是离散观察，不是后端精确提交时刻或 UI 精确翻转时间，不能将时间差直接称为保存延迟。

当前 NoSave 仍有性能／可用性限制：慢操作期间主窗冻结，约 45 秒附近的 working 文件更新时间只是辅助观察；`02:13:17.486Z` 点击至 `02:14:19.280Z` 首次观察已无本工作区窗口，仅给出这次采样区间的上界。`working.json` 的 `02:14:02` mtime 不能作为精确提交 trace。单次操作最终完成且记录保留，不等于交互已流畅；早期 `deb40ff…` 15 秒 timeout FAIL 永久保留。

最终原生“保存并退出”的点击为 `02:24:04.793Z`，`02:24:27.332Z` 首次观察已无本工作区窗口，也仅是采样上界。A3 的磁盘保存点与正常重开分别核对，未从窗口消失单独推断保存成功。冷重开在就绪前没有主窗，准备较慢；不能用最终成功忽略启动等待。早于 ready 的一次 observer API 读取收到 ECONNREFUSED，没有发出写入、重放或据此删除占用记录。

窄窗仍有可用性限制：展开属性会覆盖部分图像，需要收起并 Fit；“结果与历史”弹层在报告关闭后仍保持展开，会遮住下方导航。完整来源展开后需要纵向滚动。本轮没有作整体布局或多源图像导航重构，研究者体验仍由用户审查。

## 定向工程证据与首次失败

| 验证范围 | 状态 | 限定证据 |
| --- | --- | --- |
| 面板偏好 UI／队列／保存恢复／后台合同 | PASS | `d4127aa…` 上新增 6 用例，4 个直接受影响 Node 文件 257 PASS；`panel-preferences-affected-node-final.log`。不是原生鼠标证据 |
| `side` 数组被字符串强转接受 | FAIL → 已修复 | 首次两边 2 FAIL：`panel-preference-side-dto-first-failures.log`；修复后正式 build、2 reader PASS：`panel-preference-side-dto-corrected.log` |
| 独立恢复 C 被后续崩溃 D 覆盖 | FAIL → 已修复 | 原失败保留；`bab348e…` 独立 6 个定向负／正例 PASS，含前置零派发、原件保留及明确恢复／放弃后放行 |
| 启动被拒绝却退出码 0 | FAIL → 已修复 | `desktop-startup-exit-independent-first-failure.log` 保留；正式 build 后 4 新 Node PASS。`final-startup-refusal-37cd7e5.log` 在原被保留测试工作区拒绝 PANEL_CLAIM_RETAINED，实际原生确认后退出码 1；这是 `37cd7e5…` 的负例，不冒称旧工作区恢复成功，也未在最终 head 重复运行未改路径 |
| Windows 普通短路径与 junction 边界 | PASS | 独立静态审查及作者定向证据：普通别名可用，原路径各组件链接仍拒绝；不等于所有恢复路径均通过 |
| 旧测试工作区的未发布／foreign claim | HOLD | 原件保留，不删除、不手动解锁、不据 PID 消失重放；新公开验收工作区是隔离试验，不能作为旧工作区已恢复的证明 |
| 窄窗验收控制器 stdin 提前关闭 | TEST_INFRA_FAILURE | 控制器未以 PTY 启动，无法发送计划内的退出指令；`narrow-controller-stdin-first-failure.json` 保留。先经既有 API 明确关闭 clean A1，再核对 PID、命令与父子关系，仅停止本次测试控制器 22556，provider 34836 自行 EOF drain。不是产品正常退出证据，没有操作用户试用进程 |
| A3 补验脚本读取旧 receipt 格式 | TEST_INFRA_FAILURE → 补验 PASS | `final-3d-A3-file-closure-1793672970045/receipt.json` 保留首 FAIL：错误假定旧 receipt 有 `.files`。实查真实字段 `checked_files:45/status:PASS/mismatches:[]` 后独立补验 8/8 PASS；未改产品、未把该脚本错误判作科学失败 |
| `57c2fa9f0a67869e40e3c94da69ac23760ffc5ff` 的兼容 FAIL/HANG | FAIL → 已修复 | 首失败和挂起记录保留；后续显式单 C 恢复与初始化清理修正不能覆盖旧失败。受控测试进程清理不包括用户 GUI |
| 科学算法大套件 | NOT_TESTED | 本轮未改 FFT/GPA/拓扑/散射算法，不重复运行无关科学或噪声矩阵 |

上述数量各自对应具体源码与范围，不能相加充当精确候选全部回归。局部构建或非锁定补充编译器不能替代托管 `npm ci`。

历史 `cli-native-proof-smoke-result.json` 已覆盖公开 Windows CLI 的导入、选帧、预览、FFT、测量、查询和重复；其中 `source_sha256` 是输入文件哈希，并非代码 SHA，且保存点由测试 API 合成。它只复用为历史入口范围证据，不冒充最终源码的原生保存或精确提交验收；本轮没有为凑数量重做导入／FFT 链。

## 托管 CI

| 轮次 | CI scope gate | F3b scope gate | DM4 reader | 处理 |
| --- | --- | --- | --- | --- |
| 首轮 | FAIL 记录保留 | 按原记录 | 按原记录，#98 补充记录另存 | `first-hosted-ci-summary.json`、`first-hosted-ci-pr98-dm4-addendum.json`；不覆盖首次失败 |
| 第二轮四个 PR 的精确 heads | 4 FAIL | 4 PASS | 4 PASS | `second-hosted-ci-summary.json`；Windows journal 路径及 UI 分层依赖另行修正，没有为合并关闭门禁 |
| 第三轮四个精确 heads | 4 PASS | 4 PASS | 4 PASS | `third-hosted-ci-summary.json`：8 个 scope gates、16 个 Windows／Ubuntu、Node 18／22 Node jobs 全部成功，每个 Node job 的远端 `npm ci` 成功。重复取消的 run 单独保留，不计作成功；只覆盖原第三轮 heads，不覆盖后续修订 |
| 第四轮 #97／#98 新精确 heads | 2 PASS | 2 PASS | 2 PASS | `fourth-hosted-ci-pr97-summary.json`、`fourth-hosted-ci-pr98-summary.json`：两 PR 各自四组 Node／远端 npm ci、DM4 及两 gate 全部成功；未重跑旧精确已过 CI，没有为合并关闭保护。#95／#96 继续复用未改变的第三轮精确 head 证据 |
| main push 验证 | NOT_TESTED | NOT_TESTED | NOT_TESTED | main 未合并／移动，不能用 PR CI 冒充主干通过 |

| PR | 当前精确 head | CI scope / F3b | 对应该 head 的正式 run |
| --- | --- | --- | --- |
| #95 | `8f62d58f82b330dc197576a3e44d1cfc063a6244` | PASS / PASS | [provider](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41559526253)、[F3b](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41559526330) |
| #96 | `e027ef4386c57a1580293192a1dd911e7ab2543d` | PASS / PASS | [provider](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41559528085)、[F3b](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41559528082) |
| #97 | `588f0b14712c4ed2d2caebfb79a018b4bb8bd692` | PASS / PASS | [provider](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41562368397)、[F3b](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41562368503) |
| #98 | `3d530db2b284e3729798a619ac7654cebde53955` | PASS / PASS | [provider](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41563507711)、[F3b](https://github.com/wuchqwq/microscopy-workbench/actions/runs/41563507505) |

最终独立只读核对另存 `final-independent-head-ci-check.json`：上述四 head、八条成功 run、16 个 Node job 与四个 DM4 reader 均吻合；重复取消的 run 不计 PASS。实时 branch GET 可见 main 仍为表中 SHA、protected=true，两个 required contexts 为 CI scope gate／F3b scope gate。完整 protection 接口返回 403，因此不声称本次重新验证了 strict／管理员等完整策略；没有获取缓存凭据、重跑 CI 或修改保护。PR 元数据及 ready_for_review 的正常工作流触发与旧精确提交的已通过证据分开，不用新的自动运行覆盖首失败。

## 启动、帮助与恢复

开发机试用依赖普通 Node、明确选择的科学 Python，以及独立锁定的 Electron 运行时；不是自带环境的安装包。Electron 安装使用 Node ≥22.12；headless 核心保留 Node 18 下限。

```powershell
npm ci
npm run build
npm run desktop:install
npm run desktop -- --workspace "F:\Public workspace" --source "F:\Public fixtures\periodic.tiff" --python "F:\Scientific Python\python.exe"
```

正常重开用相同工作区与 Python，省略 `--source`。无参数 `npm run desktop` 使用原生选择器。菜单“帮助 → 使用说明”或 F1 可打开中文帮助，关闭帮助不会清空草稿、改选区或计算。

```powershell
npm run desktop -- --workspace "F:\Public workspace" --python "F:\Scientific Python\python.exe"
node dist/tools/workbench_cli.mjs --help
node dist/tools/workbench_cli.mjs version
node dist/tools/workbench_cli.mjs inspect --workspace "F:\Public workspace"
```

保存未知用“查询原保存”；科学未知请求用“查询上次原请求”或 CLI `query --request-id ORIGINAL_ID`。查询不是重放授权。恢复副本需“恢复未保存编辑”或“放弃未保存恢复副本”明确决定；不要手工删除占用记录或原请求文件。

## 验收边界与遗留项

| 尚缺项目 | 当前状态 | 最终补证 |
| --- | --- | --- |
| 3d 停在 FFT 的关闭／保存／重开／返回空间图 | PASS（上述操作） | A3 正常重开 FFT、实际返回 ROI2 后 clean close；不是所有退出／导航路径全绿 |
| 面板开合恢复及 canonical camera 一致 | PASS（A2 source／A3 FFT／冻结来源） | 精确文件与实际操作共同核对；不扩展到任意旧归档、任意屏幕尺寸或未知引用 |
| CLI 旧测量历史、原 ID 查询／复用与未保存 B | PASS（限定范围） | 首脚本错误期望仍为 FAIL；只读补验与 `4f99267…` headless receipt 已补齐，各自限制如上，不把证据混成同一次全流程 |
| 当前四层 CI 终态与 PR head | PASS（上述 exact heads） | #95／#96 精确旧 head 未改变，#97／#98 新 head 第四轮成功；精确 SHA 与 run URL 已填，主干仍未合并 |
| `4f99267…` Chrome 760×800 窄窗口与帮助可达性 | PASS（限定入口） | 实际操作与状态不变证据已补；原生相同尺寸、整体易用性及新报告呈现的最终视觉复测另列 |
| `3d530db…` 新报告的 760×800 实际视觉 | PASS（限定入口与可读性） | 真正 760×800 Chrome 视口下默认三行、展开来源、关闭及返回／Fit 已补；弹层遮挡、抽屉覆盖与慢启动仍如实列限制，不替代用户易用性审查 |
| 用户审查与合并授权 | NOT_TESTED | 不自动合并或移动基线 |
| 真实样品、材料周期／取向准确性、完整 GUI | NOT_TESTED | 本记录仅公开合成输入，不构成真实样品科学验收；没有上传私人数据 |
| 干净 Windows 安装、签名、升级及断电恢复 | NOT_TESTED | 阶段三范围，不因开发机启动成功提前宣布完成 |
| 最初试用中的来源图持续空白／加载中 | NOT_REPRODUCED（同一故障） | 当前公开合成输入的来源完整资产与重开已实际显示；已有有界加载、校验过的底图与错误重试路径。没有原故障的同一现场，不能从公开流程成功反推原故障根因或宣称所有资产／解码路径通过 |
| 重叠 ROI 命中、文本焦点 Delete 等全部原生手势 | NOT_TESTED（完整手势集合） | 相关交互有定向状态测试，本次实际完成选择、ROI1 移动／缩放／undo／redo、删除与无选择 Delete；未实际执行的重叠命中及文本输入手势不由程序测试冒充 |

工程修复、交互设计、测量不确定性、科学方法局限和物理不可辨识性继续分开表达。当前观察与几何测量不构成唯一物相、应变、孪晶或缺陷确认。
