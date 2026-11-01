# #54 双入口、保护边界与真实 Agent/MCP 验收计划（只读审阅）

审阅日期：2026-11-02。审阅者本次只读，不启动服务、浏览器、模型或科学任务；未读用户配置内容或认证文件，未修改共享工作树。本文中的历史PASS是待复核的历史记录，不是本轮已执行结论。

## 固定源码及变更范围

- main `b6dd9075dc730deec24c0f87a0ec3a3cee127d1c`。
- #54 `a6233f48dffbceea64d337fb8c4028ab489249cb`，现有共享工作树 `shared-workspace-20261101/source`。
- 当前审计工作树 `scientific-result-contract-20261102` 基于 #64 `7f0e523ba287de11c0913abd68f553655f008182`；其生产算法是 #63。
- 实际读取 #54 相对 main 的 diff：13 文件、752 additions/33 deletions。生产变更集中在 `tools/image_panel.mts`、`ui/image-panel/{app,research-workspace,roi-observations}.mts` 和一个类型 re-export；其余为四组测试、Skill增量和两篇文档。**#54没有增加独立Agent启动器、模型客户端、科学阈值、数组格式或科学算法**。
- 其有界内容值得在独立集成树合入验证，不应把未合并 #54 当作 #63 已有能力。尤其新三层语义的 Panel 更新须保留交互 epoch/草稿版本/待接纳机制。

以下源码位置均指固定 #54，除另行注明。

## 实际保护机制地图

| 风险 | 实际实现 / 位置 | 行为与边界 | 可复用回归 |
|---|---|---|---|
| dirty draft、手势、未提交annotation | `ui/image-panel/roi-observations.mts:155–171` `interactionGate()`；`app.mts:369–384` | `blocked/unknown/ready` 是交互快照，不是科学资格或锁。缺必要dirty/gesture flags→unknown；pending edit→blocked。交接前再次检查。 | `panel-roi-handoff.test.mjs:135+`；`research-workspace-ui.test.mjs:51+` |
| 保存尚未落盘/保存失败 | `tools/image_panel.mts:192–205,239`；`app.mts:377–378` | 普通draft可100ms合并写；明确handoff确认 `confirm_persistence:true` 同步写既有journal后才回执。失败留draft并报error，不新增科学对象。 | `image-panel-draft-transport.test.mjs:101+` 三项真实helper HTTP测试 |
| 人类在handoff GET/图片decode期间操作 | `app.mts:34–36,135,205,230,247–269,308,354–384` | 单调interactionEpoch捕获动作、失败动作、取消手势、选择改变。检查 object、draft revision、Panel/helper/generation；迟到读不能清除新的人类选择。epoch只是浏览器内bookkeeping，不是科学版本。 | `image-panel-ui.test.mjs:630+` 的 delayed read/action lost response/new selection/decoding race |
| late AI result | `tools/image_panel.mts:369–393`；`app.mts:230,247–269` | 已保存结果可成为pending；dirty、gesture或新draft使 `image_panel_show` 返回queued，保留科学结果，不覆盖当前选择。原presentation request可查询。 | `image-panel-concurrency.test.mjs:20,30`；`image-panel-ui.test.mjs:681+` |
| 接纳时版本过期 | `tools/image_panel.mts:240`；`app.mts:354–361` | `accept-result` 拒绝旧draft revision（409）；本地读/接纳也守护新的编辑。不把点击accept当作授权覆盖点击后编辑。 | `image-panel-draft-transport.test.mjs:123+`；UI accept/discard delayed tests |
| 未知科学请求 | `tools/image_panel.mts:357`；现有 original-ID journals | `recover`只读原request，不改ID再提交。交接gate看到last_operation submitted时blocked。收到原结果≠当前视图或当前解释。 | `image-panel-numeric-recovery.test.mjs:24–47`；`image-panel-ownership.test.mjs:78` |
| 错标定/新标定与旧比较 | `lib/panel_crystal_evidence.mts:127,146,185,190–210`；`tools/image_panel.mts:399–408` | 精确calibration依赖必须一致；校准改变产生sticky过期原因，浏览旧源不能洗掉。未知尺度允许pixel工具，不能当物理比较条件已具备。**物理上错误但内部自洽的用户标尺不能靠单图自动识别**。 | `image-panel-crystal-evidence.test.mjs:47,56,121,162` |
| 人工改峰后沿用旧测量 | `tools/image_panel.mts:302–328`；`lib/panel_crystal_evidence.mts:146–187` | 重测绑定确切annotation/source、留previous_measurement；sticky `latest_measurement_refs` / pending anchors使旧comparison needs_review。不是所有旧引用自动过期/清除；必须明确修订受影响科学结果。 | `image-panel-crystal-evidence.test.mjs:94,112`；`domain-measurement-binding.test.mjs` |
| 重开与helper归属 | `lib/panel_crystal_evidence.mts:212–231`；Inspector/owned manager | comparison快照重开为restored_unvalidated，需要provider重验；Panel逻辑ID、helper generation/能力凭据明确。未知launch不能开第二helper。 | `image-panel-ownership.test.mjs:24–108`；crystal evidence:131,147,157,179 |

#54 `roi_handoff.interaction_gate` 是附加字段，原schema_version仍1；其中 `draft_persistence` 缺失是旧runtime可选场景，不等于新helper已经确认持久化。Skill要求旧字段缺失时读取底层状态而非推断ready（`references/shared-workspace.md:28+`）。新语义层不应拿该gate作为测量/物理有效性。

## 作者身份与观察通道

普通保存ROI用annotation的 `note` / `status`（`tools/image_panel.mts:269`、`roi-observations.mts:239`），并没有认证过的通用actor枚举。MCP调用本身也不证明某条ROI是人还是AI提出；注释 `user_confirmed` 不是材料真值。

特别不能挪用已有 `research_observation.authority` 作通用Agent分析笔记：`tools/image_workspace.py:1481–1498` 将它严格限定为 `kind=twinning_present`、`authority=user_confirmed|synthetic_fixture`，且其语义是caller-reported statement，不是认证或科学证明。Agent普通工作假设不能伪装成这两种authority。可先用既有 `source_text`/annotation note明确写“Agent提议”、实际源与理由；若要结构化，需由主合同设计一个附加字段，保留旧authority定义。

## 现有真实模型启动器：能复用的骨架与不能照搬的任务

已实际执行的只读可用性检查：

- `command -v codex` → `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`
- `codex --version` → `codex-cli 0.166.0-alpha.5.1`
- `codex exec --help`确认支持 `--ignore-user-config`、`--ephemeral`、`--json`、`--sandbox read-only`、`-C`、`-o`、stdin prompt以及`--model`。没有读取auth、全局config内容或发模型请求；身份可用、额度和模型可调用性仍NOT_TESTED。

`tools/qualify_manual_crystal_agent.py:228–280` 已具备明确独立配置、仅本次CLI覆盖、MCP allowlist、提供确切Skill文本、新请求前缀、逐事件MCP日志、原科学文件哈希前后对照和query-only fresh recovery。`tool_events():128–148` 可检查实际MCP tool calls/image blocks和非MCP动作；这是测试启动器，不是产品Agent框架。

但是它**不适合直接作为本轮自主选择的验证**：

1. operator_input（:113–127）要求恰好两ROI/两候选/物理尺度，无法测缺标定自由像素分析。
2. prompt（:248–249）硬编码exactly two ROI、最多2 FFT、固定窗/mean/refinement、强制atlas和晶体比较链；测的是按给定规程操作，不是读图后自主选方法。
3. ANALYSIS_TOOLS（:23–30）缺 `image_fft`、`image_peaks`、`image_peak_measurements`、`image_annotate`、`image_remeasure`、`image_context`，不支持自由有界选择与修订记录。
4. provided Skills（:233–237）没有router、peak-quality和#54 shared-workspace参考页。
5. prompt明确“不打开browser”；tool image返回不等于GUI可见。浏览器必须作为另一个真实验收面向执行和记录。

`qualify_method_agent.py:20–38` 的 `mcp_settings` 设置本次isolated provider/tool allowlist及每工具approval=approve。`approval_policy=never`本身不会授权仍需approval的MCP写入。复用时必须记录这是**本次已授权合成测试的有界工具配置**，不能当默认宿主已配置好/已授权的证明，不能更改全局注册或借此绕过实际工具拒绝。禁止使用dangerously-bypass类选项。当前实际用户已授权本轮独立合成测试，没必要自动要求其参与每次写操作。

## 推荐最小集成方案（未执行）

1. 从主线程审阅后的语义实现SHA创建另一个integration worktree/branch；只在那里合入固定 #54 SHA，逐文件审核冲突。保持当前共享`shared-workspace-20261101/source`、启动脚本、GUI不变。基于未合并依赖创建小集成PR，不更新main/tag。
2. 构建完整dist，创建**一个全新科学workspace root**与本次connection。两模式使用同一个 `workspace_root/images`，可有两个明确Panel ID；各自read/return到原Panel，不按最近窗口猜。#54旧验收用了分开workspace（记录:138–144），不能代替此项新要求。
3. 用现有prepare_plugin生成本次独立配置，不全局注册/安装：

```sh
node /absolute/integration/dist/tools/prepare_plugin.mjs --python /absolute/locked/venv/bin/python --workspace /absolute/new-acceptance/workspace --output /absolute/new-acceptance/connection --structures
```

`--structures`仅为有限候选比较场景所需；配置被显式传给stdio server。真实科学图像源及hidden truth不得放入共享开发工作区。

4. GUI-first由已有Inspector使用**同一images子目录**，人类帧编号从1开始：

```sh
node /absolute/integration/dist/tools/researcher_inspector.mjs --source /absolute/public-fixture/source-A.tiff --workspace /absolute/new-acceptance/workspace/images --python /absolute/locked/venv/bin/python --frame 1
```

由获准的CUA/browser入口打开其返回URL并做实际ROI保存；如果浏览器拒绝该origin，停止此浏览器面向，标NOT_TESTED。不换浏览器/协议/HTTP脚本来绕过拒绝。可继续独立HTTP/DOM科学保护测试，但必须分开标签。

5. 基于现有启动器新增一个**opt-in验证入口**（不是生产runtime）：提供router、automation、peak-quality、shared-workspace；公开任务只包含原始源/已有Panel、研究问题、材料背景（如有）、操作预算和需要遵守的公共规则，不给ROI/峰答案。允许读图后选择ROI与参数；新科学请求保留先写ID。至少允许普通image读/FFT/peaks/measure/annotate/context及panel current/show，必要时structure候选比较。原程序选项骨架：

```text
codex exec --ignore-user-config --skip-git-repo-check --ephemeral --json --sandbox read-only -C /absolute/fresh-agent-output [scoped mcp_server overrides] -o /absolute/fresh-agent-output/final.txt -
```

独立启动器只需模式A(Panel ID)/模式B(source path)/继续(原引用)三个输入形态、工具选择范围和事件收集；无需新增通用调度器。终端退出码不是科学或行为PASS。

6. 模式A：保存人类ROI/理由 → fresh Agent第一条有效科学动作前读取真实current/roi_handoff → 有理由选择工具和候选 → 新current后show/记录解释 → 浏览器人工修峰并保存 → **另一fresh Agent或明确continue任务**读current/latest measure，修订受影响测量，保留旧FFT/原请求。Agent对新峰不得回到旧measure ID。
7. 模式B：给可访问原图，Agent open→frame→preview→panel_open；测试控制器通过获准browser实际打开返回URL（不把model建议打开当已打开）。Agent提出ROI并保存为Agent提议；浏览器人工修改，模型再读。与A共享上述provider workspace，无复制旧registry来绑定。
8. 竞态分层：实际MCP计算+人类变更后旧show返回queued可验证**迟到呈现**；只有确实在worker计算尚未结束时编辑才可宣称真实计算并发。人为延迟一个响应不能称为真实worker并发。沿用DOM/HTTP延迟回归独立验证边界，不假造实时model流。

## 最小新夹具与九类场景

不必引入全部#65的大证据包。复用已冻结生成器或复制其小fixture并记录SHA；独立ground truth放模型不可见的评估目录，原图文件以中性代号命名，不包含period/weak/noise等答案标签。实际预览允许模型看图，这是观测输入；精确频率、匹配指标和评分类别不进prompt或tool payload。额外给出的物理尺度属于明示观测条件，不是隐藏解答；不能为某候选事后重配。

- 清晰、弱峰/大量候选、近双频、纯噪声、混合周期：固定同一公开分析问题和小预算；不提示属于哪类，也不指定正确FFT bin。评价自主动作的依据与解释边界，不要求命中真值。
- 缺标定：工具确实无active calibration；像素分析继续，物理量保持未知。
- numerical valid但物理未评估：让实际保存对象产生该状态，模型读新三层字段，不给预制正确解释。
- 改峰：选保存measure来源→浏览器实际拖动→provider修订→Agent读最新；old/new ID、anchor、grid hash和recovery事件作oracle。
- 两候选投影均相容：给有限显式候选及已声明来源/取向；hidden oracle独立证明该合成观测下两候选均相容，但不告诉Agent“这题答案是双相容”；检查其实际调用后保留歧义。

可用GUI自动化扮演操作员，但报告应称“自动化研究者角色操作”；本轮不要求真实研究者参与。若用HTTP直接写编辑，只能称合成操作员/控制器事件，不能写“人工浏览器修正完成”。

必须保存：每轮实际prompt/Skills及SHA、MCP events与arguments/result references、所有原request/outcome、源和旧对象文件前后hash、首次current与展示前current、selected ROI/peak actor自报来源、模型最终解释、审阅者独立评分。hidden truth和评分不得进入任何模型输入；检查events不存在shell/file/web访问，而不仅依赖“不看答案”的提示。

## 建议执行清单与剩余架构边界

本轮新集成树应至少重跑 `npm ci`、typecheck/build、完整Node tests；重点套件：`image-panel-ui`、`image-panel-draft-transport`、`image-panel-concurrency`、`panel-roi-handoff`、`research-workspace-ui`、`image-panel-crystal-evidence`、`image-panel-ownership`、`domain-measurement-binding`、`image-panel-numeric-recovery`、`runtime-transport-parity`、`compiled-baseline-compat`。Python按主语义变更路径运行；`npm run test:science` 和实际formal MCP链需独立解释，不把mock测试数相加为端到端次数。

不要求SDK替换、实时协同数据库、全局锁或自动唤醒模型。旧#54文档中的SDK实验是单独HOLD项，本次没必要引入。现在可开展“真实模型在给定工具工作区内有理由选择→保留条件解释”的资格化；默认产品宿主自动发现/唤醒、物理可靠率、GUI易用性和真实样品真实性仍须分别标明。本只读审阅没有发现必须重写架构才能做这次有界验证的理由。
