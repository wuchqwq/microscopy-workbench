# 科学证据准入修订方案：配准独立性与缺标定未判

状态：**仅供审查的方案，尚未实现**。不修改数值引擎、科学阈值、旧对象或旧输出。
针对第二轮审查，源码基准为 `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`，
tree `82facfce75c5909c510cb5014e228918904f5de4`。

## 要解决的具体行为

1. `registration_proposal.py` 拒绝精确重复/Friedel 和近 1 ULP 坐标，
   但没有源峰/可分辨观测身份契约。第二轮反例中，一个距 fit 峰约 0.02 FFT bins
   的人工坐标被声明为另一 HKL，仍得到 `held_out_validation_passed=true`。
   原代码明确不证明实验分辨率，所以这不是已证实的 SVD 数学错误；应修订验证语义，
   不能偷偷扩大 ULP 判断到随意选择的“科学阈值”。
2. `image_domain_compare.py` 已发现缺少物理标定，但局部 signature 比较仍写
   `incompatible`。此时物理比较根本未执行，应未判。general/twin 同类控制已经
   正确返回 `insufficient_evidence`，应保持这部分行为。

第二轮审查的原请求、原失败结果、数据/数组哈希、独立 `gpt-6-astra` 评审、
正反例与执行记录在独立审查 PR 中。本方案不把缺失的统计/分辨率证据假设成已存在。

## 建议的最小分阶段实现

### A. 首先拆开结果含义，不设计新检测器

新版本建议分别表达下列事实，字段名在实现评审时确定：

| 层次 | 允许依据 | 不允许据此推断 |
|---|---|---|
| `correspondence_geometry` | 指定坐标与 HKL 在固定 scale/DC/奇偶条件下的 fit/hold-out 残差 | 源图真的存在这个峰、统计独立、唯一物相 |
| `observation_independence` | 候选无关的源峰/分辨组身份及来源；不足时 `unresolved` | 不同测量 ID 或不同 binary64 坐标天然独立 |
| `direction_information` | 实际方向族与谐波/共轭关系 | 已分开的径向谐波就是新的角方向 |
| `statistical_or_external_validation` | 独立重复观测、合格误差预算或外部验证 | 几何残差小于任意用户容限就是统计通过 |

先保留现有算法计算几何残差；只有第一层的证据，就只返回第一层的结论。
当前人工坐标若没有独立峰来源，不自动拒绝研究者研究它，但独立性保持 unresolved。
不要把所有成功的条件比较统统改成失败；也不要把一个合法、可分辨的谐波完全否认。

该步骤应评估“移除/弱化新结果中的泛化 validation pass 布尔值”和“保留但明确绑定
到 correspondence-only 层次”两种兼容策略。实现前需确定下游消费者对旧字段的用法，
避免只改说明文字、自动消费者仍照旧把它当独立证据。

### B. 缺标定只阻止对应物理解释

对于新版本 local_signature_compare，缺少可用 real-space XY 标定或不支持的
单位时，source entry 与 relation 应明确 not_comparable / insufficient_evidence，
携带 `missing_or_unsupported_physical_calibration` 原因，没有生成候选。
pixel 比较继续可用。真正完成且不满足已声明几何约束的结果仍可 incompatible。
映射未验证等既有 not_comparable 原因也要保留，不能统一抹掉来源。

### C. 分辨率与协方差另作资格化，不塞进上面的小修订

1 ULP 是数值重复概念；FFT bin 是采样间隔；匹配半径是接受容限；定位误差与两峰
可分辨性也不同。它们不得互相替代。后续观测组规则必须用独立正负例和真实输入
模型确定，不能只让当前反例失败。先报告未知来源/未知分辨率，不制造通用常数。

GPA numerical mask、振幅门槛、reference 连通性保持原值。本轮纯噪声/双周期
反例要求限制物理解释，而不是后验提高阈值。共同标定、DC、畸变协方差需要单独的
输入契约与覆盖率实验；此方案不声称增加统计置信度。

## 历史对象：必须显式版本化

1. 不改旧 request ID、source ID、对象/数据哈希、journal、报告文字或旧状态。
2. 新输出保存明确的 semantics/algorithm version；缺版本字段的旧输出固定按旧
   规则加载和校验。特别是 `image_domain_compare.validate_references` 当前重算
   派生报告，不能简单把新 derive 用于旧对象，导致其突然 CORRUPT_OBJECT。
3. 不“升级”旧对象中的 pass/incompatible。后续解释可创建独立、有版本的 review
   annotation 或新的重分析对象，链接旧对象/输入哈希并说明原判断和新判断的差异。
4. 新分析使用新 request ID 并明确保留 previous/result lineage。重复旧请求仍恢复
   原结果，未知副作用不重放。需要清楚标记“旧科学语义”，但不伪造旧结果当时的解释。
5. 保留旧数值/验证代码的必要范围应在实现 PR 决定；不复制整个科学引擎，不放宽
   worker 哈希/验证容差，也不重新命名 source namespace 来绕过兼容问题。

## 实现 PR 必须满足的验收

- 先用已保存 b6dd907 失败快照锁定原行为；新的独立源峰准入测试不能仅检查字符串。
- 0.02-bin 假独立、近共轭、精确共轭、真实分辨的新峰、合法谐波分别覆盖；
  真正正例的 23° proper rotation 不变，错误 held-out 不影响 fit，scale/DC 不重拟合。
- 缺标定的物理关系未判，pixel 关系仍可用；真正几何不相容不被改为未知。
- 直接加载旧 JSON/CSV/journal 与旧 request recovery，原字节/hash/解释不变；
  新结果产生明确版本；缺失必要版本/版本不支持不能被猜测成最新版本。
- general/twin 的缺标定、单方向族、歧义、共同固定配准与错误候选控制保持。
- 运行受影响回归、`npm test`、独立 Python 的 `npm run test:science`；
  不用仅往返自洽测试证明科学正确，不宣称真实材料资格化。

## 不在本方案范围

新 Agent 框架、前端重写、模型训练、全图结构场强制前置、大型算法替换、
动态衍射、实际样品或未知数据的自动物相/孪晶确认。第一轮占位丢失与拓扑
重复证据仍应分别处理，不能在本方案中暗示已修复。

本 PR 只提交上述可审查方案。实现、阈值资格化和新旧对象迁移测试应另开小 PR，
不得因为合入方案就把算法或实验状态改成“已验证”。
