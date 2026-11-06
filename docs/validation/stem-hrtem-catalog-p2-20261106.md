# 冻结目录具名扩展 P2 修复（2026-11-06）

**后续复审补正：** b3688b9的82项检查没有覆盖四个新增工具原有的response_detail合同，
比较器因整体过滤而错误接受其非法变更。本次恢复及103项正负控结果见
[展示参数合同补正](stem-hrtem-response-detail-p2-20261106.md)。旧日志的82通过是当时检查范围，
不能当作这四项合同已被验证，更不能当作完整迁移通过。

基线为 `9116f1a2795a191f88de30f8b4421c425da03a07`，继续在
`integrate/stem-hrtem-20261106` 隔离分支修复。本轮只改测试、静态许可fixture和验证记录，
不改生产接口、科学核、容差、保存保护、源数组或历史对象。不推送、不创建PR、不合并到main。

## 问题与纠正

旧完整兼容测试先在原子context保存处遭遇EPERM，因此没有执行之后的目录比较。
独立review指出工具白名单遗漏 `image_column_fit`。仅解除权限也不足以使旧测试通过：
真实目录还有未被许可的 `image_statistics.reference_comparison`、
`image_spatial_atlas.cross_window` 及 `image_peaks` 截断诊断说明。

所以旧结论“只有环境阻碍”不完整：存在被环境首错掩盖的确定性测试合同缺口。
原始EPERM日志、旧提交和旧证据包不改写；本页及新HANDOFF补正其状态。

## 精确许可与接口来源

冻结输入仍是 `3790b3d57e427010f0a5cbfce8a31143a7883eef`。
STEM输入仍是 `c08abde12b7fee00c360d1963578b892bd076470`，
HRTEM输入仍是 `9cd93c1f4a9debd570e827935abaa031ed81f60f`。
通过原Git快照的源注册目录与当前构建目录比对：36个冻结工具、20个具名新增工具、56个当前工具；
10个已有工具有已知元数据差异。目录读取不执行任何工具。

静态许可位于[reviewed-catalog-extensions-v1.json](../../tests/fixtures/reviewed-catalog-extensions-v1.json)。
fixture记录源提交和文件；测试不会从候选动态生成许可。

| 许可 | 来源 | 精确范围 |
|---|---|---|
| 新工具image_column_fit | fdec3b7cdcf13ee91da0440b38757952962583ee；STEM c08abde的lib/image_workspace.mts | 加入具名新增名单，并核对完整工具定义、schema、说明；不是仅凭名字忽略schema |
| image_statistics参考参数/说明 | eb21a6d44f6b1b8678f276fc1916c438d9496962；lib/image_workspace.mts | 完整reference_comparison对象、1..8同形参考及来源文本；不改原rect/component/request字段 |
| image_spatial_atlas横竖窗参数/说明 | b1643320d8ff95d9d5a9b2aa45616fa40d48312e；lib/image_domain_contract.mts | 完整cross_window对象、四向臂长度和来源字段；不添加隐式裁切 |
| image_peaks截断说明 | eb21a6d44f6b1b8678f276fc1916c438d9496962；lib/image_workspace.mts | 只许可已审完整说明文本，不把候选峰数解释成物理完整度 |
| 组合后的image_discovery_review | 已审两线在9116f1a中的lib/image_discovery_contract.mts | 精确核对整个工具定义，包括两种显式opt-in、原请求ID及非物理确认边界 |
| 既有preview/annotation/compact/context扩展 | main 31f4f014a4293d24de72402727b1efd084fc1022；fixture逐项标注源文件，均与c08abde元数据相同 | 12个具名可选属性含上述STEM两项；检查完整schema及可选性后才从比较副本去除 |
| 既有相关说明更新 | 同上及上述STEM源提交 | 6个具名说明逐字核对，禁止任意前缀/额外承诺被吞掉 |
| 原ancestry与HRTEM导出说明 | 原已审具名validator与9cd93c1导出增量 | 保留各自完整精确校验，不泛化忽略说明或导出schema |

只有通过全部逐项精确校验，才在比较副本中归一化许可部分；随后全部原工具字段、schema、
说明及相对顺序仍与冻结目录严格相等。原目录、候选目录、生产接口和旧fixture不被修改。
20个工具的具名新增名单是固定列表，未知新增、重复或缺失都会拒绝。

## 独立源目录检查与负控

完整工作区迁移与目录比较现在调用同一个比较函数。
新增独立source-only测试从冻结Git快照提取源码，只构造注册目录并读取listTools；
明确不调用registry.call、不启动Python科学worker/Panel、不创建image/context workspace。

```text
node scripts/build.mjs
node --test --test-reporter=tap --test-name-pattern="^(named|catalog-only)" dist/tests/compiled-baseline-compat.test.mjs
git diff --check
```

这个name filter明确排除原完整迁移测试，**不重试此前被拒绝的原子硬链接动作**。
最终82项全部通过，其中77项为具名负控；失败0项。它们都是源目录或纯比较逻辑检查，
不包含被filter排除的完整迁移测试。
最终结果及完整命令见相邻 `stem-hrtem-compat-p2-evidence-20261106/HANDOFF.json`。
负控逐项覆盖所有12个可选属性的缺失、非法schema和变必填，说明的额外文字/缺失/改写历史，
两项精确新定义的缺失/重复/schema改动，以及未知工具、未知字段、原ID类型/required/额外字段政策、
原工具删除/重排、ancestry和导出拒绝条件变化。另有针对性控制：
参考上限8→9、四臂改五臂、凭空增加裁切、S2列预算256→257、去除计数来源必填、
隐式gain及把原预期坐标强制改整数均被拒绝。

本轮不重跑未改变的科学/GUI套件，不以纯目录通过宣称数据保存或迁移链通过。
此前9116f1a的科学与工具回接证据保持其原范围。

## EPERM边界与已知环境证据

先前被拒动作是在临时冻结包工作区内，用硬链接把pending-*.tmp发布为
contexts/frozen-public-analysis/00000001.json；原日志位于上一轮
stem-hrtem-integration-evidence-20261106/node-integration-v1.log。
本轮没有执行analysis_create/update、重试该测试、替换硬链接、复制保存结果或改变文件保护。

本机仅验证Windows/Node24.16.0的source-only目录比较与纯逻辑负控。
当前补丁的完整冻结包迁移、保存、重开和Panel链条仍为NOT_RUN/NOT_VALIDATED。

已知另一个输入的环境证据：[HRTEM e63592e的compiled-compatibility检查](https://github.com/wuchqwq/microscopy-workbench/actions/runs/42261193111/job/128041350067)
返回success；其版本化workflow配置为ubuntu-latest、Node22、Python3.13。
这是该HRTEM提交的既有CI结果，**不是本补丁或含STEM整合的完整兼容通过证据**。
本轮未在该环境执行新提交，不把配置中的环境外推成当前Windows权限可用。

## 与最新HRTEM的版本差距

核实PR #133当前head为 `e63592ed7b1bf94bcfcdbedf7fabaa22434a3b75`，main仍为31f4f014。
相对本整合的9cd93c1输入有4条提交：
805c5a79（Windows字体）、979a741b（桌面统计历史）、02a97f58（计数/证据提示）、
e63592ed（只对已核实关系显示源返回提示）。
它们共20个文件的差异，主要是桌面/渲染/历史与说明，没有改本次校验的MCP目录定义；
不影响本P2修复，也没有纳入本分支。不能称为已整合最新HRTEM。
