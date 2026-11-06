# STEM 宿主工具面与实际执行记录

基线 `941d3e9fd11e9d200c919fad30a18c30b97041e0`，隔离工作树
`C:\Users\13471\Documents\ChatGPT\mircograph-workbench\stem-tool-continuation-local-20261106`，
分支 `feat/stem-host-preflight-20261106`。本地提交，不推送、合并或修改 HRTEM 算法。

## 实际发现

| 层次 | 本轮证据 | 不能据此推出什么 |
|---|---|---|
| 当前宿主原生工具 | 可见工具目录没有原生 image_* 工具；现有 functions/exec 执行接口可用 | 不等于项目工具不存在，也不等于禁止已授权的 CLI 调用 |
| 显式本地 MCP 服务 | 实际 initialize/tools/list 返回54个工具，包含统计、剖线、review及回执工具 | 不证明宿主已经注册、放行或展示给模型，也不证明后端科学执行成功 |
| 旧 source 模式启动器 | 静态白名单缺 statistics/profile/preview_acknowledge | 不能只补一个 Codex CLI 就宣称 STEM 自主链路可用 |
| 当前真实开发 Agent | 通过已有执行接口逐步选择工具、读取真实结果、决定停止并保存/回读 | 带历史与实现上下文，不是独立、无历史或盲测科学 Agent |
| 原生模型事件认证 | 本活跃 turn 的 read_thread 只返回入站委派，未暴露模型名/服务请求ID | 本地桥接日志本身不能认证模型作者；不能宣布独立自主资格 PASS |

当前实际可用路线是 `functions.exec -> exec_command -> 现有 Workbench CLI -> provider`。
直接原生 MCP 注册未建立；本轮没有修改注册、全局设置、认证或权限，也没有安装软件、
创建凭证或调用不明应用二进制。CLI 是可用路线之一，不再将 Codex CLI 当作唯一 AI 宿主。

旧 qualification prompt 对其新科学模型限制为仅 MCP、不得 shell；本轮没有修改该限制或
用桥接冒充该资格通过。当前开发宿主本身允许本地执行，因此仅报告这一不同范围的实际试验。

## 已交付的工程增量

现有 `qualify_discovery_agent.py` 增加独立 `--preflight` 模式：

```text
python -B -X utf8 tools/qualify_discovery_agent.py --preflight --config ABS_PLUGIN_CONFIG --output ABS_FRESH_DIRECTORY
```

无需 Codex CLI，不接收 source/handoff，不启动模型。复用现有 StdioImageClient，给它增加
可选的字面 serverArgs，以 `plugin_server --config` 连接明确配置的实际服务。默认客户端
行为保持原样。配置只读且限制16 KiB，输出目录必须新建；只调用 initialize 与 tools/list，
保留原响应和 schemas，列出预期点回路缺少的工具，并显式写明 host visibility 未建立、
backend/model 未验证、scientific_tool_calls=0。不把目录清单作为执行或自主资格。

预期工具集包含显式 preview_acknowledge：人工/Agent 收到实际渲染后应按原渲染请求确认，
不能把成功保存、服务端生成预览或猜测的窗口当作送达凭据。实际试验保留了这一操作。
`--preflight` 不会更改旧 source/recovery 模式的白名单或模型启动行为。

## 当前宿主的小案例：执行过，但自主资格仍待独立核验

问题为“这个原预期位置为何与可比参考不同；现有原始观察能支持什么，值得继续测量还是
应保留未知？”采用此前允许的64x64 float32标量合成图的只读副本。原点 `[22.25,22.5]`，
主ROI `[20,20,25,25]`，两参考 `[4,4,9,9]`、`[40,40,45,45]`。modality 仅声明 haadf，
signal 为 stored_scalar；不声称真实材料、独立 Poisson 计数或已定位亮柱。

当前 Agent 分次提供参数，调用之间读取实际返回，没有执行预写的测量步骤循环：

1. 选择只读打开源文件；目录实际返回单帧64x64灰度数组，再显式选 frame 0。
2. 选择原始统计与全部参考；实际返回目标4、参考10和10、两差异均为-6。
3. 基于方向一致的原始差异，选择短穿点剖线补充最小邻域支持：
   `[[20.25,22.5],[24.25,22.5]]`，nearest、width1、5样本。实际样本为 `[4,4,4,4,4]`。
4. 在调用 review 之前决定停止新测量，保留参考/采集/物理原因未知。随后创建显式ROI记录，
   即使 discovery 返回默认 FFT 候选，也未采用，因为它不能回答这里的参考可比性问题。
5. 实际预览送达后，读取其原渲染身份并确认回执；保存统计及剖线的 review，最后在新 CLI
   进程按原 review 请求 ID 回读。全部参考、原预期点和实际采样保留。

review `19c833bedb86494395c4075a95144612`，原请求 `host-trial-review-1`；统计请求
`host-trial-stats-1`，剖线请求 `host-trial-profile-1`。覆盖为 covered，物理结论为 null。
仅新增1次统计、1条剖线；没有 FFT/GPA/S2。原源 TIFF hash 为
`3dae174a1c928cf852d95fb0a729e19908cf0ea8ce5afe177b0805cde8e30b17`。
新进程回读与最终预检后，40个已有对象/请求/CLI intent 文件的字节均未变。

`material-question.json`、完整实际工具 schemas、逐步参数、bridge-events.jsonl、未经裁剪的
stdout/stderr、provider 原请求及数组均保留。bridge.py 只执行模型当次指定的工具和参数并
记录回执，不选择工具、生成后续步骤或循环。显示输出省略通用软件 provenance，原 stdout
完整保留。trial-observation-summary.json 是事后公开判断摘要，不是伪造的模型服务事件。

本轮没有启动另一个独立模型，也没有可用的模型服务 request ID。当前宿主原生身份：

```text
thread: 01a1b071-08de-76e9-8114-af8d2be3a0d5
turn:   01a1b104-4a37-76b0-b91f-d60dd54dfa42
host:   durable
title:  调研 STEM 分析路线
```

活跃期间 read_thread 只暴露入站委派；请在本轮结束后由独立 reviewer 使用原生 read_thread
的 includeOutputs=true 检查本 turn 的 agentMessage 与 commandExecution，核对实际工具选择、
参数和回读顺序。导出时排除 reasoning 项，不记录凭证或秘密。当前状态严格为
`EXECUTED_CURRENT_HOST_AGENT_PENDING_NATIVE_AUDIT`；独立新科学 Agent 自主资格仍为 NOT_TESTED。

## 验证与最小接入差距

```text
npm run build
node --test dist/tests/discovery-agent-preflight.test.mjs dist/tests/image-client-entry-env.test.mjs dist/tests/image-client-close.test.mjs
python -B -X utf8 tools/qualify_discovery_agent.py --preflight --config ABS_PLUGIN_CONFIG --output ABS_FRESH_DIRECTORY
git diff --check
```

最终受影响 Node 检查9项通过、无跳过；构建通过。变更层检查覆盖实际广告读取、错误/畸形/重复 schema、缺少回执工具、超大配置在进程启动前
拒绝、Unicode/空格配置参数按独立字面参数传递、默认环境继承及客户端关闭。真实 preflight
另用明确配置连接现有服务；最终版预检已在已有材料试验工作区上验证不修改40个旧科学记录文件。
精确测试结果、最终 HEAD 及检查文件在随附 HANDOFF.json；证据根为相邻
`stem-host-preflight-evidence-20261106`。科学 Python 和已有覆盖政策没有实现改动。

最小后续接入差距有两项，不能合并成一个“AI能用”结论：

- 若要原生 MCP，需宿主明确注册同一显式 workspace 的连接并核验实际工具范围/审批。
  旧启动器的工具范围也需按任务显式匹配，而不是从 server catalog 推断可见性。
- 若要独立科学自主资格，需宿主提供独立科学上下文及可核验的模型事件/调用记录。
  可以使用已有合适宿主，不必指定安装 Codex CLI；当前开发上下文与本地执行日志不能替代。

上述设置均未自动更改。当前材料真实有效性、独立盲测、自主负例、GUI、跨平台、远程 CI、
S2资格和完整产品验收未验证。不运行 R64、NL-PCA、无关大实验或全量套件，也不把原始差异
或数值收敛说成缺陷、元素或占位识别。
