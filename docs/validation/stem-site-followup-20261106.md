# STEM 只读回接准备：验证记录

基线 `6b3aa872039400dd8c4a0e9f4383e888a34045f4`；隔离工作树
`C:\Users\13471\Documents\ChatGPT\mircograph-workbench\stem-tool-continuation-local-20261106`，
独立分支 `feat/stem-site-followup-20261106`。仅本地提交，不推送、合并或修改 HRTEM。

## 选择的缺口与最少操作

现有 MCP 已能读取 review、执行剖线并创建关联 review；CLI 已能调用这些工具并按原 ID
恢复结果。已保存建议也有完整原请求 ID、原位置和回接模板。但剖线完成后，操作者仍须
人工核对回执、抄入新 object ID 并保留完整旧证据；此前端到端脚本自己承担了这一步。
本轮只将这一确定性的接线工作接入现有 CLI，没有增加模型、数值方法或执行框架。

研究者向已连接的 Agent 提供原问题和保存的 review 请求引用即可；原图、预期位置来源、
模态和可比参考仍需事先明确。Agent 管理内部 ID 与参数文件，不要求研究者逐项编辑 JSON。

1. 从原 review 的实际证据判断是否需要继续；若选择测量，使用其保存的原剖线参数和 ID。
2. 剖线完成后，运行下述 `site-followup`，读取原 review 和它指定的原剖线回执。
3. 仅当 `data.phase=review_arguments_prepared`，宿主可检查并采用
   `data.next_tool_call` 中既有 `image_discovery_review` 的完整参数。
4. 回接完成后检查实际 coverage 和剩余未知；保存 workspace 位置及原回接请求 ID。
   重开通过原 ID 查询，不重建分析。参考冲突、输入信息不足或支持不足则先处理具体原因。

```text
node dist/tools/workbench_cli.mjs site-followup --workspace ABS_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_REVIEW_REQUEST_ID
node dist/tools/workbench_cli.mjs tool --workspace ABS_WORKSPACE --python ABS_PYTHON --name image_discovery_review --input ABS_PREPARED_ARGUMENTS_JSON
node dist/tools/workbench_cli.mjs query --workspace ABS_WORKSPACE --python ABS_PYTHON --request-id ORIGINAL_LINKED_REVIEW_REQUEST_ID
```

`site-followup` 只调用 `image_result`，不提交测量、创建 review、写入 CLI intent 或改变旧记录。
它核对原请求与 kind、原选择对象、源数组 ID/hash/shape/dtype、原始 scalar、端点及采样设置，
再从保存模板复制全部旧证据并追加匹配的已完成剖线；用既有 schema 验证结果参数。
源数组边界、ROI 支持、8 ULP 和实际 coverage 检查仍由已通过复审的现有实现负责。

`review_arguments_prepared` 只表示参数准备完成，**不能证明回接尚未执行**。若回接已经尝试，
应查询其原 ID；不得换 ID 重试未知结果。辅助入口不判断信息增益，也不决定是否派发工具。
旧 continuation 版本1保留历史，不生成调用，需显式创建关联的当前 review。
缺失、未知、失败或不匹配的原剖线结果没有 `next_tool_call`。

## 验证结果与完整案例

| 层次／检查 | 结果 |
|---|---|
| 确定性回执核验与参数准备 | PASS，CLI 测试文件25项通过，含5项新测试及异常分支 |
| 实际既有工具接续 | PASS，完整 CLI 三案例及 MCP/CLI 共用 workspace 的两案例 |
| 真实 AI 自主选择 | NOT_TESTED，没有独立运行时模型决策事件 |
| 真实材料有效性 | NOT_TESTED，输入均为已知数值的 scalar 合成图 |
| 保存、导出、原 ID 重开 | PASS，关闭并重建 MCP 客户端／CLI 新进程查询，原对象、请求及 CLI intent 不变 |
| 原已接受历史 | PASS，读取真实版本1与版本2记录；无旧文件修改或新请求创建 |
| 独立真实反例回执 | PASS，已失败的原剖线与已完成但端点不匹配的原剖线均保留，不生成回接 |
| CI 注册辅助检查、构建 | PASS |

CLI 正例：原位置 `[22.25,22.5]`，目标均值4，参考均值10和10，差异均为-6。
保留旧偏离剖线，实际执行原建议的五点穿点线；只读入口从回执生成关联 review 参数，
实际调用后 coverage 为 covered，两个剖线分别保留 `[not_verified,covered]`，物理结论为 null。
参考冲突案例：目标5、参考2和8，保留 +3/-3 两种差异，入口返回原参考检查提示，无工具调用。
模态未知案例：原始差异仍保留，返回补充信息提示，无工具调用。

MCP/CLI 正例沿用右边界 `[59,20,64,25]`、原点 `[61.25,22.25]`：MCP 实际完成有效垂直剖线，
CLI 只读准备回接，MCP 执行既有 review，最后导出、关闭客户端并重开；全部通过。
角部 `[61.25,61.25]` 无可用轴，入口保留 needs_supported_profile，不发起测量或回接。
五案例的完整初始/最终 review、原 profile/request ID、输入、源 TIFF、全部参考差异、导出及
读操作前后校验保存在 `cli-followup-v2/` 和 `mcp-followup-v2/`。

另用两个独立合成工作区，首次显式提交错误端点请求：一个超出源中心范围而失败，另一个
完成但偏离所保存建议。CLI 实际读取原失败/完成回执，分别返回 failed/unavailable，均无
next_tool_call，原文件不变；完整反例在 `negative-receipts/results.json`。没有重放失败请求。

正例在首次剖线派发前额外检查了缺失结果：入口返回 outcome_unknown 且无调用。
测试驱动器独立知道自己尚未尝试该剖线，随后仅首次派发保存的原请求；**不能由查询缺失
推断可以重试生产中的未知请求**。同一已执行 CLI 调用再次调用时只查询原请求。
回接后再次准备仍只产生相同参数，不表示允许重新执行；重开最终 review 则保留停止状态。

## 命令、失败与修正

从工作树运行，TEMP/TMP 显式指向相邻证据目录的 `tmp`，`PYTHONUTF8=1`。
输出目录必须为新的绝对路径。CI 辅助 unittest 使用 `PYTHONPATH=tests`。

```text
npm run build
node --test dist/tests/workbench-cli.test.mjs
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/cli-followup-v2 --site-followup
node dist/tests/site-continuation-entry-smoke.mjs ABS_EVIDENCE/mcp-followup-v2 --mcp --source-bounds --site-followup
python -B -X utf8 -m unittest ci_scope_test.ScopeTests.test_point_observation_checks_are_in_actual_execution_lists -v
python -B -X utf8 ABS_EVIDENCE/check-historical.py ABS_EVIDENCE
python -B -X utf8 ABS_EVIDENCE/check-negative-receipts.py ABS_EVIDENCE/negative-receipts
git diff --check
```

首次 Node 检查24通过、1失败：新增 parser 测试引用了另一测试的局部变量；修正后25项通过。
首次两个实际入口检查在缺失剖线查询处失败：真实 provider 抛出 outcome_unknown 诊断，
而 mock 返回状态对象；当时已安全停止，没有生成或派发回接，但结构化提示缺失。
修复为沿用既有 CLI 错误分类，将原诊断保存在 original_outcome；新增异常回归后，
新目录中的两条实际路径均通过。旧失败工作区、failure.json 和日志保留，没有重放其中的请求。

证据根为相邻 `stem-site-followup-evidence-20261106`。`node-cli.log` 和两个未带 v2 的目录
记录首次失败；`node-cli-final.log`、`cli-followup-v2.log`、`mcp-followup-v2.log`、
`ci-registration.log`、`historical-reads.json/.log` 记录通过结果。
`negative-receipts.log` 及对应工作区记录独立反例通过结果。
`entry-freeze-v2.json` 冻结修正后的实现与入口测试；后续只完善文档、Skill 和资产构建。
CI 复用现有空间分析 job 的 CLI/MCP smoke，并显式启用 --site-followup，不新增验证框架。

## 真实 AI 接续的限制

本环境 PATH 未发现 `codex`，常规用户 bin 位置也无 CLI。现有
`qualify_discovery_agent.py` 依赖该 CLI，且默认工具集针对 FFT/peaks，未提供本回路所需
STEM 入口。本轮未启动模型、安装新模型/客户端、修改全局配置/认证，也未调用不明应用二进制。
检查结果及启动器 hash 在 `real-agent-capability.json`。

当前开发 Agent 的判断与脚本测试不等于独立科学运行时的模型选择。实际 MCP/CLI 调用均由
脚本驱动，只验证接口接续；真实自主决策仍需合适运行时、明确工具范围和独立模型事件证据。
GUI 新按钮／自动唤醒、远程 CI、其他平台、全量测试、真实材料、S2、R64、NL-PCA 和大实验
均未运行。此前已通过的数值/覆盖测试不重复跑；本轮 Python 科学模块字节未变，受影响入口
已用真实数据读写边界验证。全部结果停留在原始观察，不推断缺陷、元素或占位。
