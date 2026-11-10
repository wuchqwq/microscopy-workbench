# STEM 预期位置接续的局部 GUI 适配合同

本页说明本轮新增 `lib/panel_stem_continuation.mts`，不是原生验收结果。Provider、数值实现和已有对象/原请求日志保持原合同；没有新增科学算法、自动执行器或模型调用。最终原生 PASS/FAIL/NOT RUN 由整合报告另列。

## 研究者任务与现有依赖

研究者明确给出：原图/帧、预期源像素点及其依据、目标矩形、**全部**1–8个同形参考矩形及可比依据、有限问题、模态/信号及其来源。原点是给定先验，不是拟合位置，不吸附亮峰。模态或信号未知必须保留 `unknown`；`stored_scalar` 不等于独立 Poisson 计数。这里不调用 `image_column_fit`/S2，也不把已给位置称为系统发现。

沿用 `image_statistics`、`image_discovery(entry="manual", selection_origin="researcher")`、`image_discovery_review`、`image_profile`、`image_info`、`image_result`、`image_export`；基础数值依赖 NumPy/Pillow/tifffile。SciPy 是现有图像依赖，但本接续不新增优化器/FFT/GPA。CIF/ASE/diffsims 属于独立能力，不在此接续内。

`image_statistics.reference_comparison` 必须保留所有同尺寸同源参考、实际来源文本；返回每个参考完整统计、目标减各参考值、参考中位数差异及重叠。`image_discovery_review.site_context` 选择该统计，并保存原预期点、问题及模态/信号说明；`include_site_continuation:true` 是显式 opt-in，不派发下一个工具。

## 可供共享入口串行集成的 API

`StemStudyInput` 字段：`object_id`(当前准确源帧或其wrapper)、`frame_object_id`、`shape_yx`、`target_rect`、`reference_rects`、`reference_source_text`、`expected_position_xy`、`position_source_text`、`question`、`modality`、`signal_kind`、`signal_source_text`。几何是原数组坐标，不是PNG像素。完整输入应作为工作区接续状态保存；引用科学对象不复制或篡改它们。

- `readStemStudyInput(raw)`：保留精度、参考次序和源坐标；拒绝重复/越界/不同形参考、非有限点或目标外原点。原字段使用副本，后续UI编辑不改冻结请求。
- `stemStudyMissingConditions(raw)`：列出未知模态/信号和缺失解释，供可继续的界面状态使用；未知模态/信号不妨碍保存原始数值证据。
- `stemStatisticsArguments(input, requestId)`：现有 statistics 的精确参数，全参考不截断。
- `stemDiscoveryArguments(input, requestId)`：现有 manual discovery 参数；单独保存原请求，不隐藏预览ack或输入门槛。
- `stemReviewArguments(input, discovery, statistics, requestId, profileIds=[], previousReviewId?)`：匹配源图/帧/尺寸、唯一目标候选、原统计/全参考/依据；绑定所有旧剖线。超过8项证据明确停止，不丢证据。
- `stemReviewPresentation(review)`：原样投影已保存 provider 结果。逐项显示参考值和差值，不能仅展示中位数。显示参考冲突、每条剖线覆盖、缺失条件、来源和物理结论未知；不重新计算或挑选参考。
- `stemProfileCall(review)`：仅在保存的v2 `tool_proposed` 建议上返回原 `image_profile` 调用。返回的 `request_id` 已由provider保存，不能换一个“重试”ID。此函数不执行调用。
- `stemLinkedReviewCall(review, completedProfile)`：核验已知完成的原profile回执（kind/request/source/grid/hash/dtype/shape/端点/nearest/width1/5样本），只在完整旧证据列表后追加该profile，保留 `previous_review_id`、原点和原回接请求ID；不派发请求。

Helper 不是科学来源证明或完整payload verifier。服务端仍必须通过现有provider读取与原请求核对，不能仅因本地helper接受输入便认定证据合格。

## 工作流与取消/恢复边界

1. 图上显式指定预期点、目标、全部参考；显示角色和原坐标，补充问题/依据。`unknown`字段保持未知，不以像素亮暗推断模态。
2. 明确执行原数组统计，保存原请求身份；再建立manual discovery并绑定review。每个阶段单独保留准确状态：未提交/正在等原请求/已知失败/已完成。中断后查询原ID，不重放整条链。
3. 已保存review返回：`needs_reference_review` 先查全部参考；`needs_information` 补缺失条件；`tool_proposed` 可由研究者点击执行原建议剖线；`needs_supported_profile` 不移动原点、不裁切填充；`stop_at_observation` 停在原始数值观察。报告自身不会秘密执行。
4. 执行建议前先核对建议原请求是否已尝试。未知时仅查询；已知完成时复用同一回执。成功profile后显式接回原证据；保留所有旧参考、旧/新剖线以及历史review，不将未接回称为完整观察。
5. 查看/导出/保存/退出/原位置重开只读取既有对象和原请求；导出副本不等于可继续研究的工作区保存。导出报告的数值与来源来自provider，不由UI重新写一份“科学结果”。

## 三个有区别的既有公开合成案例

仓库 `tests/image_site_observation_test.py::ExpectedSiteReview.fixture` 和 `tests/image_site_continuation_test.py` 已有完全确定的64×64 float32标量案例。它们是软件/原数组行为fixture，不是STEM成像、材料或计数有效性验证。已有固定目标 `[20,20,25,25]`，全部参考 `[[4,4,9,9],[40,40,45,45]]`，原点 `[22.25,22.5]`；亮邻点 `[27,22]` 明确不得替代原点。原生整合可复用这些公开构造在专用样例目录生成的小型TIFF，保留构造来源，不读取用户数据。

| 案例 | 原始支持的独立算术预期 | 现有provider预期接续 |
|---|---|---|
| 可接续：目标4，参考10/10，已声明HAADF+stored_scalar | 每个参考差-6；原点不变 | `tool_proposed`：已存原请求建议 `[20.25,22.5]→[24.25,22.5]`，5样本nearest/width1；显式执行与回接后covered/stop_at_observation，物理原因仍未知 |
| 参考冲突：目标5，参考2/8 | 单项差+3/-3；中位数差0不能掩盖冲突 | `needs_reference_review`，无可执行剖线，不删除任一参考 |
| 条件不足：目标4，参考10/10，模态unknown | 原数值和全参考仍可显示；缺少真实通道 | `needs_information`，保留可继续状态，不静默设HAADF、不跑S2 |

这是固定既有工具接续，不是AI自主研究或盲测。三例实际GUI/保存退出重开结果由父协调工作统一留证；本模块的纯测试不能替代它们。

## 针对性验证

新增 `tests/panel-stem-continuation.test.mjs` 覆盖完整精度/参考次序、8参考上限、未知条件、原点不吸附、准确源/目标/参考绑定、逐项参考冲突呈现、保存原剖线ID、已完成回执核对和完整旧证据追加。测试不构造科学成功响应冒充provider，不执行模型。构建及这些测试由共享集成方串行运行；本子任务未运行构建、原生GUI或数值套件。

专用输入准备脚本：`tools/prepare_stem_continuation_fixture.py --output NEW_ABSOLUTE_DIRECTORY`。它仅按上述既有公开构造写3张64² float32 TIFF、各自条件文件与SHA receipt，不导入provider，不创建工作区、统计、discovery、review或profile。输出目录必须不存在，中断后检查现有输出而不是覆盖重跑。实际运行与GUI接续由共享集成方串行完成；本子任务只编写脚本，未运行。
