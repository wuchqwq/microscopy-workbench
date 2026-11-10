> 来源：PR #134 精确版本 `51efc13c1ad6` 的历史说明；文中的“本轮”和旧验证数字属于原版本。
> 当前 Mac 候选、adapter v2 模态门槛和本地验证范围见 [Mac 隔离集成](STEM_MAC_INTEGRATION.zh-CN.md)。

# STEM 原图观察基线（本地候选）

本地基线解决一个有限问题：**指定预期位置与同图参考有何原始数值差异，现有测量支持到哪里，下一步值得检查什么？** 保留原预期位置、每个参考、失败与未知。强度差、通过采样检查或拟合收敛均不代表识别了元素、占位或缺陷。

## 版本与范围

本页对应本地 `baseline/stem-raw-observation-20261106` 分支，工作树
`C:\work\microscopy-workbench\stem-tool-continuation-local-20261106`。
本轮起点为 `6ec7de4740f50b3b581571338994faa746283765`；本轮仅整理入口、验证边界和保存回接证据，无算法或运行时修改。最终完整提交见本轮交付记录。

2026-11-06 经 GitHub 分支 API 核实，正式 main 为
`31f4f014a4293d24de72402727b1efd084fc1022`，是当前候选祖先；未推送、未合并本地候选。
不要把本页当成正式 main 已有全部 STEM 能力的声明。

| 层次 | 已有能力与依赖 | 版本边界 |
|---|---|---|
| 正式 main | 通用图像导入、原图数值观察、剖线、discovery/review、科学对象与请求日志、CLI/Panel 基础 | 31f4f014 |
| 继承的集成候选 | 原图参考统计、条件性 S2、共享观察与预览修正，以及其他共享/HRTEM 历史工作 | b5888c6b2cfcca2c14961ba0cf7863efa56072ad；相对 main 共180文件，不是本轮新增 |
| 已复审 STEM 增量 | 预期点证据、有限剖线与真实采样覆盖、源数组中心边界、原请求回接、只读 preflight | 0ad49d3 → 4b2ff462 → 60439db → 6b3aa872 → 941d3e9 → 88cb742 |
| 本轮整理前状态 | 上一轮准备文档，无新算法 | 6ec7de4740f50b3b581571338994faa746283765 |

记录复核确认完整 `88cb7426533575d7021c84693ead854744608d91` 独立复审通过。
b5888c6b → 88cb742 的增量为33文件；main → 本轮起点为203文件，含大量历史证据及共享改动。
这是含继承依赖的完整候选，不能将其直接描述成一个小型、纯 STEM 的主线补丁。
本轮未进行主线集成或与并行 HRTEM 合并冲突验证。

## 研究者最少需要提供什么

可以向已连接的 Agent 这样提出任务：

> 请检查这张图中我指定的预期位置为什么与这两组同类参考不同。保留原点，不吸附到亮峰。先比较原始数值和全部参考；依据结果检查参考可比性、补充穿点剖线，或停止并保留未知。不要由亮暗判断元素、占位或缺陷。

同时提供可访问的原图、明确帧/通道、模态与信号含义及其来源、预期坐标及其依据、目标区域、参考区域及认为可比的理由。信息不足时先观察或追问，不把未知改成默认 HAADF 或独立计数。坐标使用所选源帧的像素坐标；缺少标定时保持像素单位。Agent 管理内部 ID、参数文件与回接，不让研究者手工抄写对象 ID。

### 已有 MCP / Agent 路径

1. 从当前连接的真实工具目录读 schema。用 `image_open` / `image_frame` 明确原图、帧和数组身份；观察预览时按实际渲染的原请求确认送达，不伪造 ACK。
2. 使用 `image_statistics` 的显式目标与全部参考测量。已有保存结果可复用；原点与参考选择均不是自动定位或同类结构认证。
3. 需要记录观察链时，使用已有 `image_discovery(entry="manual")` 保存给定 ROI 和观察理由。用 `image_discovery_review` 绑定原始统计、已有剖线、原 `site_context`，显式选择 `include_site_continuation:true`。FFT、GPA、S2 均不是这条路径的先决条件。
4. 先读原始证据，再读 `site_observation` 和 `site_continuation`。参考冲突先检查参考；模态或信号未知先补信息；需要穿点剖线时，Agent 决定是否调用保存建议中的 `action.tool` / `action.arguments`，保留其原请求 ID。
5. 实际完成的 profile 必须与原请求、源网格、端点和采样参数匹配，才加入已有 `image_discovery_review` 并以 `previous_review_id` 接续。已有证据和所有参考全部保留。观察支持足够时可停止，物理原因仍为未知。

这是既有工具的显式接续。Panel 的“交给 Agent”不包含模型，也不会自动唤醒模型；当前 STEM 专门 GUI 操作体验未验收。当前宿主实测可通过 `functions.exec → exec_command → 既有 CLI → provider` 调用。服务端 advertise 工具，不代表宿主已把它们直接注册为原生模型工具；只读 preflight 可以检查服务目录，不能替代实际调用。

### CLI 的最小操作

先使用已配置的 Node 22.x/24.x 和独立 Python 环境，在构建后的候选目录执行：

```text
node dist/tools/workbench_cli.mjs doctor --workspace ABS_IMAGE_WORKSPACE --python ABS_PYTHON
node dist/tools/workbench_cli.mjs tool --workspace ABS_IMAGE_WORKSPACE --python ABS_PYTHON --name image_discovery_review --input ABS_REVIEW_JSON
node dist/tools/workbench_cli.mjs query --workspace ABS_IMAGE_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_REQUEST_ID
node dist/tools/workbench_cli.mjs site-followup --workspace ABS_IMAGE_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_REVIEW_REQUEST_ID
```

`tool --input` 是 Agent 保存的当前 schema 参数文件；实际返回值必须回读。
CLI 支持本路径的 statistics/profile/discovery/review；S2 不在此 CLI allowlist。
MCP 插件配置中的 `workspace_root` 的 **images 子目录**才是该 provider 的 image workspace；CLI 的 `--workspace` 应指向这一相同目录，不猜测最近的目录。

`site-followup` 是只读准备操作：它查询原 review 与其规定的 profile，验证真实回执后返回 `data.next_tool_call`，不执行测量或 review。
Agent 检查后再使用现有 `tool`/MCP 调用。未知、已失败、错误端点或旧版本会保留原因，不伪造成功。
`review_arguments_prepared` 只表示参数准备完成；若曾尝试执行该回接，先按其原请求 ID 查询结果，不另建 ID 重放。

## 采样、保存与恢复约束

有限线段必须在8 ULP算术舍入范围内经过**原**预期点，且实际 nearest 样本包含其半开像素单元及沿线两侧的不同样本，才报告最小一维覆盖。ROI 内的一条偏离剖线、端点或过稀采样不算完成；它们仍保留为证据。
8 ULP 是保守的算术政策，手画线常需要再补一次精确穿点剖线；Agent 可直接采用穿原点的明确端点。不得为提高通过率移动原点或放宽容差。

自动建议仅尝试原点±2像素、5样本、width1、nearest，先水平再垂直，同时检查源中心坐标 `[0,width-1] × [0,height-1]` 及原 ROI 的实际采样支持。两轴均不支持时没有可执行建议。这个局部支持检查不能证明空间分辨率、定位、噪声显著性或物理解释可靠。

“保存”在本路径指 provider 的不可变对象、原请求日志、导出及明确工作区身份。保留原数据路径、精确 workspace、source/frame/review 对象和原请求 ID；关闭 CLI/MCP 后在相同 workspace 查询原 ID，恢复已有记录，不重算。GUI 显式 savepoint 与 provider 持久化是不同合同，本轮没有 GUI 保存重开体验结论。旧版本按原派生规则读取，不改旧坐标、ID、数组或建议；需要新版能力时明确创建链接的新 review。

## 依赖与验证清单

`requirements-images.txt` 声明 NumPy、Pillow、tifffile、SciPy；基础路径不依赖 DM/GMS。
当前证据使用 Node24.16.0、Python3.13.2、NumPy2.2.6、Pillow11.2.1、tifffile2026.3.3。
`doctor` 只检查基础 NumPy/Pillow/tifffile 导入，不能证明全部声明依赖或可选方法资格。
DM3/DM4 的 RosettaSciIO、GPA/结构模拟等仍是各自独立的可选依赖；本轮未安装或更改环境。

| 验证层 | 状态 | 证据及边界 |
|---|---|---|
| 确定性建议与真实工具回接 | PASS（既有证据复用） | [回接](https://github.com/wuchqwq/microscopy-workbench/blob/51efc13c1ad6d933155beac341148cb1ebbf2fc9/docs/validation/stem-site-followup-20261106.md)、[源边界](https://github.com/wuchqwq/microscopy-workbench/blob/51efc13c1ad6d933155beac341148cb1ebbf2fc9/docs/validation/stem-profile-source-bounds-20261106.md)；包括错误/失败回执、边缘与旧版本 |
| 本轮保存、关闭重开、原 ID 及历史只读恢复 | PASS | 9个已授权保存的合成案例，18次独立 CLI 读取，2个先后新建并关闭的真实 MCP 客户端；475文件未变、零新科学请求 |
| 开发上下文模型实际选择/调用/回读/停止 | PASS（原生记录复核） | [宿主记录](https://github.com/wuchqwq/microscopy-workbench/blob/51efc13c1ad6d933155beac341148cb1ebbf2fc9/docs/validation/stem-host-surface-20261106.md)；不是独立盲测，没有另起模型服务 request ID |
| 独立自主盲测、真实材料有效性、STEM GUI 体验 | NOT_TESTED | 不用固定脚本、合成测试或服务目录代替 |
| 本轮主线集成、并行 HRTEM 集成、远程 CI | NOT_TESTED | 本轮仅本地文档整理；没有推送或合并 |

本轮回读涵盖一致差异且含偏离旧剖线、参考冲突、未知通道、历史 continuation1、无 opt-in 的 site2、缺少原 profile、已失败回执、错误端点回执及开发上下文模型保存记录。另以原请求ID独立回读历史 site_observation1，完整派生结果与旧证据相同，未添加continuation字段；不重新生成身份冒充旧对象。
命令、逐案例状态、旧版本37文件保护和访问限制详见[本轮收敛记录](https://github.com/wuchqwq/microscopy-workbench/blob/51efc13c1ad6d933155beac341148cb1ebbf2fc9/docs/validation/stem-baseline-convergence-20261106.md)。

S2 仅在模态、独立计数解释、固定位置/几何、宽度与参考条件有来源证据时可选。派生 iDPC、重建图、float存储都不能自动当作独立 Poisson 计数。本轮无 S2 调用、R64 重跑或新科学数据处理。

**结论：在上述原图观察范围内，已有代码与保存接续具备开始受控真实材料 E2E 的工程条件；本轮整理须经独立 review。真实材料 E2E 尚未执行，也未达到“真实材料验收通过”的结论。**
后续真实材料任务须先核实输入模态、来源许可与元数据，并遵守实际有效的数据权限和审批要求。本基线没有执行真实材料端到端验收。


Publication note: machine-specific paths above are generalized examples. Replace them with your own local paths.
