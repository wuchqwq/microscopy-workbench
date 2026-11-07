# 新增工具 response_detail 合同遗漏修复（2026-11-06）

基线：`b3688b9885c856e23c5ed39fd99708d701c912e8`。
工作树与分支仍为隔离的stem-hrtem-integration-local-20261106 /
integrate/stem-hrtem-20261106。本轮只修改测试和记录，没有生产代码、科学约束或fixture许可变更，
不推送、不创建PR、不合并。

## 已复现的问题与最小修复

b3688b9将具名新增工具从最终冻结旧工具比较中滤除，却漏掉9116f1a原有的四项展示参数检查：

- image_spatial_field
- image_domain_map
- image_analysis_candidates
- image_field_extend

先加入新正负控、保留旧比较器执行：四个合法合同通过，16种非法修改均被错误接受，
所以负控报Missing expected exception。red日志共21项：4通过、16负控失败，
加上失败父测试计为17失败。这是确定性测试漏洞，不是权限或科学计算失败。

修复在过滤之前逐个检查四个工具的response_detail完整参数定义，并要求required为数组、
response_detail非必填。预期schema复用已审静态fixture中的image_info.response_detail；
源码目录核对确认六个工具的该定义一致：
type=string，enum=[full,compact]，原有完整展示说明保持。没有从被测候选动态生成许可。

每个工具分别有一个合法正例及四个负例：参数缺失、type=number、枚举变为full/summary、
加入required。旧有具名许可、S2及review完整schema和原字段严格比较保持。

## 对重构移除检查的审计

对照9116f1a的原目录检查区块，逐项核查新增工具名单、preview恢复参数及说明、
Panel拒绝说明、annotation字段/可选性、六个response_detail、ancestry、导出说明、context角色。

- image_info/image_result的展示参数已由静态精确schema及可选性检查覆盖。
- preview/annotation/Panel许可比原来更窄；原始ancestry与导出validator源码未变。
- 三个新context角色的许可schema与真实冻结atlas引用schema一致，原atlas仍受最终精确比较。
- 完整流程在目录比较前后的代码均与9116f1a相同，保存保护未改动。
- 本次未发现另一个具体丢失的原有检查；唯一确认的遗漏是上述四工具。

机器可读逐项证据见相邻证据目录removed-check-audit.json。此审计不等于执行完整迁移流程。

## 实际验证与未测边界

```text
node scripts/build.mjs
node --test --test-reporter=tap --test-name-pattern="^(named|catalog-only)" dist/tests/compiled-baseline-compat.test.mjs
git diff --check
```

最终103项通过、0失败，包含新增四正例/16负例及原82项。
这是Windows/Node24.16.0的源注册目录/纯比较逻辑检查，科学工具调用为0，
不创建image/context workspace、不启动Panel或模型、不执行文件硬链接。

之前被EPERM拒绝的原子保存及完整冻结包保存/迁移/重开测试没有重试，
也没有绕过限制、修改保护或替换为脚本假保存；该范围仍为未验证。
旧日志及旧证据包保留。没有重跑R64或无关科学、GUI、模型套件。

本轮保持既有整合输入及其版本差距，不并入任何新HRTEM/桌面提交。
最终完整HEAD、精确diff、正负控日志和审查包见相邻
stem-hrtem-response-detail-p2-evidence-20261106/HANDOFF.json，待主对话独立复审。
