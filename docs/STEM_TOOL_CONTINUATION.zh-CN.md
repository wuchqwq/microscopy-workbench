# 从预期位置问题接到下一工具

本轮基线为已审查的 `4b2ff462dec75902be6215fbb6ba6bf0d6c5d969`，仅在独立本地
分支新增小范围接续，尚未合入正式 main。问题限定为：“这个预期位置为什么与可比
参考不同，目前还缺哪项原始观察？”输出不能确认空位、元素或占位。

## 接口盘点与本轮缺口

| 已有接口 | 实际能力 | 本轮处理 |
|---|---|---|
| MCP `image_statistics` / `image_profile` | 原数组统计、全部参考及宽度一的最近邻剖线 | 直接复用，不换算法 |
| `image_discovery` / `image_discovery_review` | 精确来源/ROI/标定绑定，历史、原请求恢复，版本2剖线覆盖检查 | 增加显式可选的调用参数和回接模板 |
| Agent + microscopy-automation Skill | 可由连接的宿主选择现有工具，不需要新控制器 | 给出读结果→选择→执行→复核的具体指引 |
| `mwb tool` / `query` | 已有 schema 验证、持久调用意图及原ID恢复，但原 allowlist 缺少上述四个观察工具 | 只开放这四个既有工具，不增加新CLI命令或自动执行器 |
| `image_method_plan/next/step` | 现有范围是 GPA/投影拓扑，含预算与恢复 | 不改成通用 STEM 框架 |
| `qualify_discovery_agent.py` | 既有 fresh-model 验证器主要允许 FFT 路线，默认不含统计/剖线 | 未运行，不冒称已经验证新的AI自主路线 |
| Panel / workspace / AnalysisContext | 有原图、ROI、线、统计及显式交接；没有本轮STEM期待点表单/结果槽，context角色也不应伪装复用 | 不加新槽或注册表；本轮重开指provider对象/原请求，不是GUI保存点资格 |

## 可操作路径

使用已连接的 Agent 时，研究者提供原图、明确预期位置及其依据、参考选择依据和问题；
也可由 Agent 根据有来源的观察提出位置。Agent 管理内部ID、JSON和请求，不要求用户
逐步抄写它们。Panel 交接不自动唤醒模型，本轮没有增加GUI按钮或自动点击路径。

1. 复用准确 source/frame/ROI，保存 discovery、原始统计及所有已有剖线。
2. 调用 `image_discovery_review` 时，使用原有 `site_context` 并明确设置
   `include_site_continuation:true`。省略时保持旧输出；这不是所有 review 的必选项。
3. 先看原始证据，再读 `site_continuation`。参考互相跨过目标时请求检查参考；模态/
   信号未知时请求信息。原始数值仍保留，不强迫选择一个数值模型。
4. 若状态为 `tool_proposed`，`action.tool` 与 `action.arguments` 是现有
   `image_profile` 的完整参数（含已保存的原请求ID）。方向仅为优先水平、否则垂直
   的最小支持选择，不是最大信息增益或材料方向识别。宿主仍选择是否执行。
5. 只在 profile 的 kind、request_id 和已知完成结果匹配时，将结果 object_id
   追加到 `after_success.arguments.evidence_ids`。原统计、全部参考和旧剖线不删除。
   再调用其中的 `image_discovery_review`，保留 `previous_review_id` 链接。
6. 查看新 review 的实际覆盖及原因。达到最低观察支持后，可停止在原始对比；物理
   原因仍未知。若新剖线仍不合格，停止并检查原因，不能循环自动重测到满意为止。

工具接续不会由报告偷偷执行。动作原ID已存在于保存的 review，执行器仍遵守现有
provider/CLI journal；超时未知时查该ID，不换ID重放。回接模板在取得新profile前
不是完成结果，也不能直接少附一条证据就当已经补查。模板保留原候选及上下文。

CLI 的相同路径复用现有命令，Agent 可生成每次调用的精确输入文件：

```text
node dist/tools/workbench_cli.mjs tool --workspace ABS_WORKSPACE --python ABS_PYTHON --name image_discovery_review --input ABS_REVIEW_JSON
node dist/tools/workbench_cli.mjs tool --workspace ABS_WORKSPACE --python ABS_PYTHON --name image_profile --input ABS_SAVED_ACTION_JSON
node dist/tools/workbench_cli.mjs tool --workspace ABS_WORKSPACE --python ABS_PYTHON --name image_discovery_review --input ABS_LINKED_REVIEW_JSON
node dist/tools/workbench_cli.mjs query --workspace ABS_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_ID
```

CLI各次进程退出后仍可查询原结果。显式导出包含 `site-continuation.json/.txt`、原始
复核报告和 provenance；原科学数据仍在 provider workspace。CLI 的预览回执需按现有
合同明确确认，回执不等于看过像素。MCP示例客户端已有收到结果后的回执逻辑。

## 保守政策的操作代价

8 ULP几何政策保持不变。手画线只要没有精确经过名义点，或像素边界/稀疏采样不足，
就可能再收到一次覆盖提示；数据和剖线不丢弃，但增加检查、绘线或测量的工作。
本轮通过给出穿过原点的精确端点，减少重新手画的负担，不通过放宽距离来提高通过率。
拟提线为原点±2像素、5个样本；水平不合格才考虑垂直。接续版本2同时检查请求坐标在源数组
中心范围 `[0,width-1]×[0,height-1]` 内，以及 nearest 实际采样在原ROI内；两者都满足才能
提出工具调用。若两轴都失败，`needs_supported_profile` 保留逐轴原因，要求明确提供受支持的
穿点线、适当修订ROI和测量或补充图像支持；仅改ROI不一定能解决源边界问题。不移动原点、
裁切或补边。证据已达8条时也不丢旧证据。
已有复核历史达到8次上限时，在测量前停止，不自动清空历史来制造新的接续额度。

旧版本1的建议按原语义只读恢复，其中可能仍有不能执行的边界剖线。需要继续时先显式创建
关联的新版本2 review，不改写旧建议，也不重放已经失败或结果未知的旧请求。

这只是最低一维采样支持；5点剖线不足以保证估计柱宽、处理所有重叠或区分扫描伪影。
需要更大邻域时另建有明确依据的观察。S2始终是另行显式选择，要求成像模态、计数解释、
固定几何、宽度及参考条件；本轮不派发S2，也不把它设为通用门槛。

## 三层验证

确定性建议、实际既有工具接续与真实AI自主选择分别记账。脚本执行工具链只能证明
前两层；没有新鲜模型独立选择工具的实际记录，就保持第三层 NOT_TESTED。
准确命令、正反例与原请求重开证据见[验证记录](validation/stem-tool-continuation-20261106.md)。
源数组边界修复及真实调用证据见[边界回归记录](validation/stem-profile-source-bounds-20261106.md)。
