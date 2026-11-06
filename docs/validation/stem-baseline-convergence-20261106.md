# STEM 原图观察候选收敛记录（2026-11-06）

本轮将已复审代码整理成有限的本地工程基线，提供[统一入口与最小路径](../STEM_BASELINE.zh-CN.md)。
本轮只有文档变更，没有修改算法、MCP/CLI实现、测试、HRTEM或历史科学记录。没有推送或合并。

## 精确版本

- 工作树：`C:\Users\13471\Documents\ChatGPT\mircograph-workbench\stem-tool-continuation-local-20261106`。
- 本轮隔离分支：`baseline/stem-raw-observation-20261106`。
- 本轮基线：`6ec7de4740f50b3b581571338994faa746283765`，开始时干净。
- 已独立复审的实现：`88cb7426533575d7021c84693ead854744608d91`。主对话已确认复审和原生模型turn核验通过；本轮修正此前“待复审”的过时状态。
- 正式main：`31f4f014a4293d24de72402727b1efd084fc1022`，本轮经GitHub分支API核实，是本地候选祖先。
- 继承候选：`b5888c6b2cfcca2c14961ba0cf7863efa56072ad`，相对main共180文件；其后至已复审实现共33文件。main至本轮基线共203文件。完整历史仍保留，未把继承的共享工作算成本轮新增。

最终完整HEAD、逐文件清单与bundle见相邻证据目录 `stem-baseline-convergence-20261106/HANDOFF.json`。
本地origin是另一本地克隆，不把它当成正式main；没有执行fetch、rebase、merge或push。
未核验当前远程CI或并行HRTEM集成状态，不声称该广泛候选可直接发布。

## 本轮实际检查

```text
node ../stem-baseline-convergence-20261106/baseline-readback-audit.mjs ABS_EVIDENCE_DIRECTORY
python -B -X utf8 ../stem-baseline-convergence-20261106/verify-baseline.py
git diff --check
```

使用当前已构建的同版本CLI/MCP与原已授权合成数据。每次CLI独立退出，MCP客户端先关闭再新建。
这里验证provider持久化与请求恢复；没有用GUI Save/Close/Reopen代替，也没有声称GUI已测。

| 保存案例 | 原ID query | 只读site-followup的真实状态/阶段 |
|---|---|---|
| 开发上下文模型保存的review | completed，原点、全部参考、完整site结果相同 | completed / stop_at_observation |
| 一致差异、保留偏离旧剖线、已补穿点线 | completed | completed / stop_at_observation |
| 参考冲突 | completed | completed / needs_reference_review |
| 未知通道/输入语义 | completed | completed / needs_information |
| 历史continuation1 | completed，原版本未改 | unavailable / needs_current_review |
| site2但未选择continuation | completed，没有自动添加字段 | unavailable / needs_site_review |
| 缺少规定的原profile | completed（review存在） | outcome_unknown / needs_original_profile_outcome |
| 规定原profile已失败 | completed（review存在） | failed / needs_original_profile_outcome |
| 已完成回执但端点不匹配 | completed（review存在） | unavailable / profile_receipt_mismatch |

九个案例共18次独立CLI读取，另有2个新建真实MCP客户端按原ID读取；475个对象/请求/CLI意图文件前后hash不变、零新科学请求。
所有案例的 `next_tool_call` 均为空，符合各自已完成、未知或拒绝状态。可执行成功接续的实际调用证据复用941d3e9已接受记录，不把本轮只读审计当成又一次测量。

另以旧site_observation1的原请求 `site-6` 查询，原对象 `a3999fe495c24f82bd9d6d3eb02e37f2`、完整site结果仍与历史证据相同，未添加continuation；该workspace37文件hash未变。
这是旧fixture的真实独立CLI回读，不是重建或修改旧对象。

本轮文档检查核对本地链接、代码块、实际既有CLI allowlist、doctor导入范围，以及已保存的真实tools/list schema。
初次辅助检查误将 `reference_rects` 当作statistics顶层参数而失败；核对schema后修正检查为
`reference_comparison.reference_rects`，复测通过。实现及历史对象没有因此改动。

完整回执：`readback-audit.json`、`legacy-site-v1-readback.json`、
`document-contract-check.json`，以及对应stdout/stderr与可重跑审计脚本。
这些是工程恢复检查，不能冒充研究者体验验收或模型自主盲测。

## 复用与未运行

科学/运行时代码与88cb742完全相同。本轮复用其既有证据并记录hash，未重跑不受影响的套件：

- 已接受源边界回归：Python continuation9项、coverage11项及实际MCP边缘/角部调用。
- 已接受site-followup回归：Node CLI25项、实际CLI/MCP正反例、原ID与历史兼容。
- 已接受preflight增量：Node9项、实际initialize/tools/list54工具及科学workspace无副作用记录。
- 主对话核验的原生开发上下文模型turn：`01a1b104-4a37-76b0-b91f-d60dd54dfa42`，逐步选择、调用、回读与停止。它带开发上下文，不是独立盲测。

本轮未运行：新科学测量、R64、NL-PCA、全套测试、GUI、独立模型盲测、真实材料E2E、远程CI及主线/HRTEM集成。
S2资格没有重新验证，仍为另行显式、条件有据才可选；无默认调用。

## 访问限制与数据状态

本轮只读Git状态查询曾访问下列历史仓库路径，运行时均返回
`fatal: cannot change to '...': Permission denied`：

- `F:\mircograph-workbench\microscopy-workbench`
- `C:\Users\13471\Documents\Codex\2026-11-04\task-7\integration-main-31f4f014-s2-review-v1`

这些目标的HEAD/branch/status查询未执行成功，没有写入。检查新消息后没有针对这些路径的新授权，
因此未重试、未读取其.git绕过、未提权。当前候选历史与正式main由允许的当前克隆和GitHub连接核实；
外部两棵工作树的实时未提交状态仍未知，不影响本轮隔离文档收敛，但不能据此宣称并行工作树干净。

STO下载准确操作为浏览器单次
`acceptanceTab.playwright.getByRole('link',{name:'STO-stack.h5',exact:true}).downloadMedia()`，
目标 `https://zenodo.org/records/8190744/files/STO-stack.h5?download=1`，
此前返回 `E:\web download\STO-stack.h5`，此前已核实完整大小及MD5。
本轮没有再下载、处理、复制或访问该科学文件。

用户后来明确说“我批准”，主对话原样转交；本轮也从可读消息确认其上下文对应STEM下载事项。
原卡 `Sentinel_213c514dd37c8191929a2bc68f65a4ff` 仍无可见回复或反应，因此书面批准与卡片机制状态分别记录。
没有把批准扩展到安装、设置、权限或其他下载，也没有再次申请审批；如后续存在强制确认机制，仍需按其实际状态处理。

## 是否可以进入下一阶段

在明确的原图观察与保存接续范围内，现有工程条件已就绪，可在本轮独立review后冻结为真实材料E2E的起点。
需要面对的下一项证据缺口是模态合适的真实输入上的研究者任务和界面体验，而非继续堆合成矩阵或新增算法。
真实材料有效性、独立自主盲测及GUI仍为NOT_TESTED；准备完成不等于材料验收通过。
