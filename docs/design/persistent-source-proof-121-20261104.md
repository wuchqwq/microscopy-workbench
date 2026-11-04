# ADR 草案：#121 持久来源证明（B，待审阅）

状态：用户已选择“B，先设计”；**尚未授权实现本合同**。本 ADR 不含源码或历史数据变更。基础为 `34bedbd82f614243e7274ee4cd75ad1e5dc08e97`、#121/#108 及现有 bounded-source-recheck 设计；下列入口、结构和测试均为拟议内容。

## 决定与边界

在现有 provider 对象与请求 journal 内追加版本化来源证明。**原 provider 对象、原执行 journal 和实际文件仍是唯一科学权威。** 证明是一次完整验证的派生收据，不能创造数组、标定、ROI、物相结论，也不是另一套科学数据库。不引入签名密钥、全局配置或 Agent 框架；“签发”仅指原 provider 按现有提交合同写入可校验的元数据对象。

目标是稳定表达准确来源及历史资格，减少语义重建和重复 RPC；首版不承诺固定耗时或常数 I/O。SHA-256 绑定不是数字签名，持久收据不能单凭自己的 hash 保证依赖文件此刻仍未改变。**必须继续检查的 payload 不因证明存在而免检**，不以性能目标更改科学保护。

## 最小存放选择

| 存放方式 | 影响 | 建议 |
| --- | --- | --- |
| 现有 `objects/<id>/object.json` 元数据对象＋原 `requests/<request_id>.json` | 沿用原 provider 的提交、身份/哈希、查询和失败恢复；GUI/CLI/MCP 共用同一权威。只追加小元数据，不复制数组。 | **推荐。** 新增专用 proof 类型/操作须经此 ADR 确认，不另建 registry/数据库。 |
| 现有 Panel journal 中追加 reference-only proof JSON | 容易绑定一次 GUI 操作，但跨 helper/CLI 的发现、验证、撤回更复杂；Panel 文件不能自行升级为 provider 权威。 | 可作操作回执；不推荐作为共享证明的最终权威。 |

工作区只保存所采用 proof 的准确 ID/manifest hash 引用。证明正文、撤回事件、原对象均不可原地修改；新版本指向旧版本，不按 mtime 选“最新正确证明”。

## 证明内容与信任合同

首版只支持单一源帧的 `saved_source` 和 `fft_input` 两种明确用途，不做通用证明框架。共同字段包括：schema/policy 版本、validator 源码/build SHA、签发时间与依据、准确 root 对象/manifest/creator journal 哈希、准确父 proof ID/manifest/root、完整依赖集合及边、验证完整性和实际预算统计。

依赖必须绑定 frame、source 对象及原源文件身份记录、科学数组 hash/dtype/shape/坐标域、网格身份、完整有符号标定/作用域/来源及其 hash。FFT 用途另绑定原浮点 ROI、实际整数 support、预处理配方、实际 provider operand、原 FFT/request、原 sidecar 路径及 hash。不存在的字段明确“不适用/未知”，不得补造。源文件当前是否必须可读依原 provider 合同；“原入库身份记录”不得冒充“本次重新读取了源文件”。不扩大私人数据访问范围。

三类义务分开：Panel `frame_path`、完整科学依赖 DAG、实际 operand/网格绑定。找到 frame 只完成第一类，不能签发 `fft_input` 完整资格；现有 operand 32-wrapper 等专用限制不顺手放宽。初次为旧链发证前必须在明确有界预算内验证全部必需依赖，再新鲜复核全部证据；建议沿用 reader 的 2048 对象／64 MiB 元数据总边界，最终复核也计入调用总预算，数组/单文件上限不调整。预算耗尽不产生完整证明；64 只是可采用的块大小，不能充当跳过剩余祖先的理由。

读取时必须验证 proof 自身的 provider 提交与 hash、用途和 validator policy、父 proof/依赖图闭合与无环、撤回状态，以及准确请求/输入/网格绑定。所有原合同仍要求检查的 manifest、creator journal、源文件、PNG、数组和标定 payload，仍须新鲜核对。只能在已完整证明的边界内复用语义推导；不能仅重读根、仅比较时间戳或信任复制的 `validated:true`。若未来希望免除某类祖先 payload 重读，必须另行审阅不可变性与失效模型，本 ADR 不授予该例外。

## 签发、查询与采用时序

| 阶段 | 必须满足 | 允许的变化/终态 |
| --- | --- | --- |
| 明确请求 | 保存原 proof 操作 request ID；冻结 root/父证明/原执行/输入哈希；GUI 当前操作另冻结草稿、窗口、保存及 owner 版本。 | 只记录原请求意图；不预览、不 FFT。 |
| 完整核对 | 全部必需 DAG、frame/operand、数组、标定、float/support/recipe；达到任一总预算/时限、缺失或错误即停止。 | `checking`；不是可复用资格。 |
| 新鲜复核与最终 CAS | 用原 qualified reader 重新读取所有已采用证明及必需文件，校验冻结哈希；重验 provider 写入权限及相关输入版本。GUI lease 若绑定本请求也须重验。 | 失败则 abstain；不修改旧对象/保存点。 |
| provider 追加提交 | 沿用现有写入准入、不可变对象与请求结果 journal。 | `proof_completed` 或原操作 failed/unknown；响应丢失只查原 ID，不重发。 |
| GUI/CLI 查看或采用 | 核对返回 proof ID/hash；采用进入原工作区 owner/CAS 与待接纳机制。 | proof 已存在不代表 GUI 已采用。新编辑可阻止采用；已完成 proof 保留为历史。 |
| 明确保存 | Ctrl+S 将选定 proof 引用纳入新保存点；关闭子窗仅关显示。 | 不保存/取消按原合同处理工作编辑；已提交 proof/原科学执行仍保留，不冒充已保存分析。 |

签发与工作区采用是两个提交边界：若 provider 已提交而 GUI CAS 拒绝，应明确“证明已记录、未采用”，不能说“没有生成对象”。只读查看与导出均不自动采用；打开或关闭帮助不触发发证。

## 状态、继承与失效

| 状态/变化 | 行为 |
| --- | --- |
| 没有 proof、旧格式或未知 policy | 现有结果可按原资格查看；不提供新复用资格，不推断没有结果。 |
| 已完整校验且 scope 匹配 | 才可 `eligible_for_exact_scope`；证明不是物理解释或真峰认证。 |
| 新标注/显示修订，同一科学网格 | 可引用准确父 proof；仍核对新 root、改变字段及原必需 payload，生成新 proof。不能复制父资格布尔值。 |
| ROI、配方、标定、DC/峰或测量几何改变 | 原证明保持原历史用途；当前用途重新核对。旧 FFT/测量不改，不自动重算。 |
| frame/grid/array/dtype/坐标域改变 | 不继承当前资格；按新准确输入完整签发。几何相同或仅 support 相同不能跨网格复用。 |
| 缺失、损坏、错绑定、依赖环、预算/中断、父 proof 无效 | abstain，保留具体原因和原 request；不 fallback 到猜测来源或新预览。 |
| 代码升级 | schema/policy/build 分开记录。只有代码中明确声明兼容的旧 policy 可继续验证；不因版本号接近自动信任。修正检查漏洞时要求重新签发，旧收据保持可读。 |

“对当前 scope 不适用”与“证明被撤回”不同。撤销/撤回采用，只恢复工作区的引用，不删除已提交证明。确认错误证据则由 provider 追加撤回事件，绑定准确 proof ID/hash、原因和请求。共享 reader 必须查询原 provider 的完整、受界的状态；状态不可确认就 abstain。依赖被撤回的子 proof 不再可复用，但原数组、执行及历史收据保留。初版复用现有对象/journal 查询，不建立第二个可变真相表；若状态扫描超过边界，返回不可确认，不声称未撤回。

## 旧 unavailable、迁移与 CLI

旧 sidecar 的资格、null 哈希、原字节和 request ID 永不重写。默认只读迁移，不在打开工作区、history、轮询或重开时自动发证。只有研究者明确“核对并记录已有输入证明”才为准确旧对象/已完成 FFT 签发独立 `current-proof`，标记 `basis=retrospective`：保留 `original_qualification=unavailable`，另记本次观察到的哈希和验证时点。**本次哈希不冒充原预执行哈希**；若原 float/实际请求/数组/标定绑定无法重建，则不合格。原请求 unknown 时先查询原请求，不能以新 proof 掩盖它。

GUI/CLI/MCP 均分别返回：原科学执行状态、原证据资格、本次 proof 状态、工作区采用/保存状态。查找结果区分 `verified`、`known_existing_unqualified`、`proven_missing`、`unavailable`；准确旧执行已完成但 proof 不合格时，`--compute-missing` 不得把它当 missing 补算。显式发证不创建新 FFT；仅同整数 support、相近浮点框或后来同几何 ROI 不是原归属证明。

只有准确候选范围完整核对完，才可报告 `proven_missing`；扫描被预算、缺失或读取错误截断时报告 `unavailable`，不自动补算。首版建议 retrospective proof 仅供明确查看和采用当前来源证据，默认不进入严格预执行证据的自动复用分支；若要允许 CLI 自动复用这类证据，应另行确认政策并在报告中持续披露其 retrospective 依据，不能只保留一个 `validated` 布尔值。

## 后续最小阶段与拟议验收

1. **先审本 ADR 与 proof schema/状态合同。** 确认 provider 对象存放、必需重读范围、父证明/撤回语义、旧 unavailable 的显式当前证明；不先开发通用索引。
2. 在独立工作树实现 provider 元数据签发/原 ID 查询及纯 reader；复用现有准入、对象/journal、路径/hash/数组验证。新旧普通/bundled 路径一致，保留未支持与预算状态。
3. 接 Panel、冻结输入读取、CLI/Agent 和工作区采用；只在真实入口可用后更新中文帮助。

拟议定向验收：公开真实 65/80 及更长链；DAG 旁支、跨块/父 proof 环；缺失、祖先 payload/PNG/creator journal 损坏；错 frame/calibration/float/support/recipe；unknown/撤回/不兼容 proof；发证后文件改变；最后 CAS 新草稿/切窗/owner 变化；响应丢失按原 ID 查询；保存/不保存/正常重开；旧文件/sidecar/request/hash 不变；known_existing_unqualified 不触发 FFT。明确区分受控测试、正式 provider、原生操作与科学准确性。这些验收均为 **NOT_TESTED（仅方案）**，不构成实现或实测 PASS。
