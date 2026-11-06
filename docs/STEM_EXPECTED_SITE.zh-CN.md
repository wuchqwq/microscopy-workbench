# STEM 预期位置的原始观察闭环

这是基于未合并候选 `b5888c6b2cfcca2c14961ba0cf7863efa56072ad` 的局部增量，
不代表正式 main 已有这些功能。复用现有统计、剖线、discovery/review 和请求日志；
没有新建找柱器、S2 模型、缺陷分类器或通用 Agent 框架。

## 使用者能够得到什么

对于“这个预期位置和周围相比有什么不同”，Agent 先看原图，固定问题位置及 ROI，
保留所有同图同形参考。新的 review 可提供：

- 原始目标均值、每个参考的均值与有符号差、中位数差及重叠支持。
- “低于所有／高于所有／原始均值相同／参考跨过目标”的描述。
- 预期坐标的依据，以及明确的“未做位置检测”。坐标不会吸附到最近亮点。
- 哪些原始对比得到支持，参考选择、背景/扫描/投影等解释为什么仍未排除。
- 一个可解释的下一步：检查参考可比性、补采集信息、检查原始剖线，或停止在观测层。

均值相等不证明材料正常，均值不同不证明存在缺陷。符号描述没有噪声显著性阈值，
也没有概率、SNR、占位或元素结论。参考方向一致不能证明它们等价。

## Agent 的最小接续

1. 读取准确的 source/frame/标定和图像，复用已保存状态。未知尺度仍可做像素域观察。
2. 对预期位置提出明确问题，选择固定 ROI；用现有 `image_discovery(entry="manual")`
   保存注意区域，`selection_origin` 如实填写。基础 ROI/FFT 操作不要求走此路径。
3. 调用 `image_statistics`，保留目标和 1–8 个同图同形参考及实际选择依据。
   参考来源文本是声明，不是自动验证。预期位置不是检测结果。
4. 调用 `image_discovery_review`，传入统计 evidence ID，并可附加 `site_context`：

| 字段 | 含义 |
|---|---|
| `question` | 本次材料问题 |
| `statistics_id` | 本次 evidence_ids 中准确的原始参考统计对象 |
| `expected_position_xy` | 原图 X,Y；必须在候选 ROI 内，允许小数，不重定位 |
| `position_source_text` | 实际预期位置依据及未知 |
| `modality` | haadf/adf/abf/bf/idpc/dpc_component/ptychography_reconstruction/other/unknown |
| `signal_kind` | raw_counts/stored_scalar/derived_scalar/unknown |
| `signal_source_text` | 实际通道和处理/计数含义及来源 |

5. 阅读 `site_observation`、保存预览和 `site-observation.txt`，结合原图解释。
   如加剖线，用现有 `image_profile`、原始数值和明确端点；所有采样必须在此 ROI 内
   才能附加到该 review。更大邻域应另建明确观察，不默默扩大支持。
6. 用新的请求及 `previous_review_id` 接续；旧对象不改。模态、信号或参考不足时，
   保留原始差值和未知。没有必要为得到一个标签反复计算。

`site_context` 可省略；旧 review 输入/输出和历史读取不增加这一字段。若同时附加
多份统计，必须明确选择一份，不合并、择优或静默替换参考。可附加既有 S2 证据，
但本增量只从选定原始 statistics 构建反馈，不派发、重跑或为 S2 授予物理资格。

## 保存与解释边界

原始统计及剖线仍是数值来源。review 在读取时验证原 source/frame/ROI/标定及统计，
根据原请求重建反馈，并核对 JSON、文字报告和 discovery-review 中的对应内容。
新增 JSON/文字通过既有 `image_export` 导出，原请求可由 `image_result` 恢复。
`image_info`、恢复和导出均不运行 FFT/GPA/S2。超时未知时只查原请求，不改 ID 重放。

通道及信号是调用者声明，不是 fitting 或新复核证明。声明 raw_counts 不验证独立
Poisson；积分 iDPC/重建派生图仍能作原数值比较，但不能由此建立独立计数 likelihood。
S2 仅按其原有计数、固定几何/宽度与参考条件另行显式使用，绝不是必经步骤。

这不是全图自动发现、原子位置测量、ABF/iDPC 物理适配或真实样品验证。
保存预览的文字用于阅读，科学输入仍是原数组。模态未知不阻止原始比较，也不被
转换成物理反证。停止和下一步是可检查建议，Agent 仍须根据实际问题选择行动。

## 小范围验证

开发检查覆盖同均值、弱/零目标、参考分歧、负的派生信号、输入缺失/拒绝、附加剖线、
旧 review、原请求恢复、字节一致导出及重哈希篡改拒绝。
另用五个预先固定的不同几何/三参考案例，调用实际编译 MCP，保存完整输入与响应，
重启后复核原请求，检查原对象和日志未变。仅验证工程链和原始标量答案。
不复跑 R64、去噪、物理 forward 或大随机矩阵。

定向命令：

```text
python -B -m unittest discover -s tests -p image_site_observation_test.py -v
python -B -m unittest discover -s tests -p image_point_observation_test.py -v
npm run build
node --test dist/tests/discovery-contract.test.mjs dist/tests/point-observation-contract.test.mjs
node dist/tests/site-observation-stdio-smoke.mjs <新的绝对证据目录>
```

准确执行结果、首次导出遗漏和最终证据索引见
[本轮验证记录](validation/stem-site-loop-20261106.md)。
