# STEM/HRTEM 隔离整合记录（2026-11-06）

本轮把两条已审输入在新工作树中整合，保留双方原有接口、历史派生规则、原请求恢复和导出。
这是本地工程整合；没有推送、创建PR、合并到main或部署，也没有新增真实材料或桌面验收结论。

**独立复审补记：** 9116f1a的EPERM是首个可见失败，不是完整兼容测试的唯一问题；
后续目录断言还存在image_column_fit及STEM具名扩展许可遗漏。
该P2的修复、负控和未测边界见[目录许可补正](stem-hrtem-catalog-p2-20261106.md)。
旧命令和日志保留历史事实，不据此宣称解除环境阻碍即可通过整个测试。

## 精确输入与隔离

- STEM：`c08abde12b7fee00c360d1963578b892bd076470`。
- HRTEM PR #133：`9cd93c1f4a9debd570e827935abaa031ed81f60f`。
- 共同main：`31f4f014a4293d24de72402727b1efd084fc1022`。开始时通过GitHub GET核实，main及PR head均匹配指定输入。
- 整合工作树：`C:\Users\13471\Documents\ChatGPT\mircograph-workbench\stem-hrtem-integration-local-20261106`。
- 独立分支：`integrate/stem-hrtem-20261106`。从STEM输入创建，合入精确HRTEM输入，最终提交保留两者作为父提交。
- HRTEM本地另有`805c5a79dc4462d3de197f60ffae71f1a19a13d4`（Windows字体）和
  `979a741b16a767fae0fee8f54283add3e99af653`（桌面统计历史）两条未推送提交，明确排除；未覆盖或重建其工作树/dist。
  结束时该独立桌面分支另前进到`02a97f587f6ffffff6583b49ce45eb44d040aba9`（计数与证据范围提示），
  此第三条也明确排除；结束时main与PR133远端仍匹配指定输入。

完整最终HEAD、相对每个输入及main的diff、文件清单和审查包见相邻
`stem-hrtem-integration-evidence-20261106/HANDOFF.json`。
STEM输入本身包含共享工程实现、条件性S2和研究归档，相对main是27提交/209文件；
不能把最终整合描述成仅有几个冲突文件，也不能把历史归档改称新的科学验证。

## 十项冲突决策

预检以三方文本比较发现5文件/10个冲突块；实际Git merge把相邻imports/FIELDS合成一个区域，
因此有9个Git标记区域。以下按10项原始意图分别记录，全部保留两侧有效行为。

| 项 | 文件/位置 | STEM意图 | HRTEM意图 | 解决与依据 |
|---|---|---|---|---|
| 1 | README.agent.md / Scientific routes | 预期点、参考与采样的原图观察入口 | 已存GPA波段比较与候选路线 | 并列保留两个入口，不把GPA设为STEM观察门槛 |
| 2 | lib/image_discovery_contract.mts / review说明 | raw统计/剖线、固定预期位置及非物理判定边界 | 明确review导出的报告/文本/PNG与单独GPA导出 | 保留STEM说明并补入HRTEM导出句，保留EXPERIMENTAL、无隐藏计算及无缺陷确认边界 |
| 3 | 同上 / 参数 | 可选site_context/include_site_continuation | 可选candidate_assessment及调用方实空间依据 | 取参数并集，各自schema与显式opt-in不变，不增加必填项或默认报告 |
| 4 | microscopy-router/SKILL.md | H0/S0默认、条件性S2、按问题选工具 | 已存fixed_g波段入口，不要求所有单峰观察先过GPA | 并列保留；选择来自问题与前提，不新增通用算法门禁 |
| 5 | image_discovery.py / imports | package/script两种site模块导入 | 同两种模式的candidate assessment导入 | 同时保留各自导入路径，不隐藏缺失依赖 |
| 6 | 同上 / FIELDS | site_context与include标记 | candidate_assessment | 只合并既有字段白名单；未知字段仍拒绝 |
| 7 | 同上 / 新review保存 | 保存site观察及接续旁证 | 保存candidate_result、预览旁注及可读文本 | 两个独立条件分支都执行；只对新review生成各自原有输出，不给旧对象补字段 |
| 8 | 同上 / 旧review校验 | 从原数组/请求重建site v1/v2及continuation v1/v2 | 按原请求的显式候选参数及保存版本重建candidate_result | 按原candidate opt-in调用一次_evidence，随后分别执行双方校验；不以新算法重判旧值、放宽容差或重跑科学 |
| 9 | image_workspace.py / 来源模块 | site及column-fit模块身份 | GPA兼容、summary兼容及候选模块身份 | 同时记录全部模块；不改写历史provenance/数组/ID |
| 10 | 同上 / 导出文件选择 | 原图参考统计、profile、S2及site旁证 | saved-band报告/文本及candidate可读文本 | 显式文件选择并集，原不覆盖/标定/哈希检查保留；报告不冒充父GPA数组导出 |

自动合并的workflow、ImageWorkspace适配器及discovery合同测试也经过检查。
workflow额外在已有topology作业登记新的共享review回归；没有增加执行框架或新的宽泛CI作业。

## 接口组合的小修

合并后的schema允许调用方显式选择两个报告。旧STEM接续模板只认识site输入，
若机械拼接，会在链接的新review中丢掉原candidate_assessment。
本轮仅在原请求确有该字段时，把它原样深拷贝进after_success；
两个独立报告继续各自校验，不混合其科学解释。原来不含该字段的请求输出完全不变，
旧派生版本号、8 ULP、有限线段、实际nearest支持、源中心边界及原请求ID均保持。

新的组合测试仅把既有显式合成纹理重复为2×2参考支持；原256像素候选与FFT不变。
真值记录明确这一步和参考相关性。最终用例明确标为other/stored_scalar，它不是真实HAADF图，
也不用于成像真实性或材料识别验证；较早工程试跑的caller-declared标签保留于原证据，不充当模态资格。

## 已运行验证

```text
node scripts/build.mjs
node --test dist/tests/discovery-contract.test.mjs dist/tests/workbench-cli.test.mjs dist/tests/method-loop-contract.test.mjs dist/tests/compiled-baseline-compat.test.mjs
python -B -X utf8 -m unittest discover -s tests -p test_hrtem_stem_review_integration.py -v
python -B -X utf8 -m unittest discover -s tests -p test_hrtem_baseline_closeout.py -v
python -B -X utf8 -m unittest discover -s tests -p ci_workflow_test.py -v
node dist/tools/smoke_hrtem_baseline_closeout.mjs
node ../stem-baseline-convergence-20261106/baseline-readback-audit.mjs ABS_NEW_AUDIT_DIRECTORY
node ../stem-hrtem-integration-evidence-20261106/shared-mcp-recovery.mjs ABS_INTEGRATION_EVIDENCE
```

其余Python定向loader的精确模块/类和环境见HANDOFF与各日志：

- 新组合用例2项通过：两个报告、真实profile接续、完整证据、导出/回读；分别非法的site/candidate仍拒绝，失败原ID回读保持失败。
- HRTEM closeout3项通过，涵盖六个A/B案例、拒绝、保存、导出及原ID。
- site观察/接续及兼容模块初跑35项：31通过、4因未指定原交接根跳过。随后定位原已授权交接包，仅补跑这4个原包类，全部通过；不是用合成替代原包。
- CI workflow7项通过，新组合回归已加入既有作业。
- Node38项中37通过，1个冻结旧包完整兼容测试受运行时硬链接权限阻断，不能记成通过。
- 实际MCP六份A/B导出及关闭后新客户端恢复通过；原始文件保持。
- 组合案例实际CLI只读回接准备与原linked ID查询、MCP导出及冷重开通过，141个原文件未变。
- 六份真正既有HRTEM A/B结果冷回读通过，526文件未变；旧结果没有新增site字段。
- 既有STEM九案例回接/拒绝及冷重开通过，475文件未变；另回读真正的site_observation1，
  派生值保持、无新字段，42个工作区文件未变。

首轮组合测试仅有测试调用方错误：成功辅助client不接受已知failed回执。产品已正确保留failed；
修正测试为直接核对原失败回执后复测2/2通过，首错日志保留。

## 权限受阻项与未验证范围

本地fetch不能启动MSYS sh（NtCreateDirectoryObject 0xC0000022），核查确认没有生成引用；
未重试或提权。改为native Git pack-objects只读导出精确9cd93c1及index-pack导入，
未改HRTEM源引用或工作树。SHA-only的bundle命令另报空bundle，未生成输入包。
node_modules junction也被运行时拒绝；确认目标不存在后复制现有依赖普通文件，无安装或权限修改。

冻结旧包测试在临时public-workspace的contexts/frozen-public-analysis中执行
pending-*.tmp → 00000001.json的硬链接时收到EPERM。测试在此中断，后续旧包catalog/工作区/Panel
验收未到达。没有重试此受阻测试，没有把硬链接换成普通拷贝来伪装原子保存通过，也没有修改测试门禁；
完整错误见node-integration-v1.log。可以继续独立review整合补丁，但该测试范围仍未完成。

本轮不验证真实材料有效性、独立模型盲测、桌面GUI体验或远程CI；
不把MCP/HTTP记录或Chrome页面当作桌面验收。未运行R64、NL-PCA或无关大实验，
未改科学核、物理容差或旧记录。后续推送须先独立review通过并收到指令。
