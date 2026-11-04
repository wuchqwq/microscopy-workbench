# Issue #122：Panel 历史 ROI 派发前拒绝

基线为 `34bedbd`。本次实现限于已存在的 historical `spatialRoiWrite`
保护，不放宽旧图写入资格、不改变 provider 接纳失败或科学 journal。

## 实现边界

- `panel-preflight.mts` 定义独立、闭合的 Panel 证明：
  `schema_version=1`、`kind=panel_action_preflight_failure`、
  `code=HISTORICAL_ROI_SOURCE`、`phase=before_scientific_dispatch`、
  `submission_state=not_submitted`、`provider_request_id=null`、
  `automatic_retry=false`，并精确关联 `action`、`expected_object_id`、
  `draft_revision` 和客户端 UUID `client_batch_id`。只允许 `mark/edit`；
  多标注 `edit-layout` 不会借用该证明。
- Panel 仅在原 historical ROI guard、调用 `journalCall` 之前生成证明。
  HTTP 序列化需要本 helper 内部 WeakMap 标记；provider 抛出的同名字段
  不能伪装成该证明。原 `last_operation` 与原请求身份保持原样。
- 前端覆盖已有标注批次、新 ROI 与观察说明的实际提交路径。只有证明
  与此次发送的批次完全一致才保留为“已明确拒绝”的本地草稿；不设为
  新科学 unknown，不自动重发，也不查询旧 return-spatial 冒充本批恢复。
  新 ROI 只释放与该次输入相同且尚无对象／请求身份的创建哨兵。
  迟到的 A 证明可以确认 A 未派发，但不能删除较新的本地 B。
- 普通 409、错误文本、传输失败、错批次／异常字段、入 journal 后失败
  均不能获得上述处理。已有 submitted/unknown、未决保存、标尺或测量
  恢复保护继续有效。后续科学派发使旧证明失效，包含直接调用的 figure-base。
- 明确“应用”或“保存”才允许一次新尝试；反复被拒绝会有界停止。
  持有未应用队列时“导出图面”也会停止。通用未应用队列提示不声称
  获得 Panel 证明；provider 原请求的 not_submitted 仍使用原有独立合同。
  草稿可明确撤回或经 NoSave 丢弃；真正未决请求继续阻止退出。
- NoSave 测试发现恢复的新窗口集合版本可能低于当前 live 版本。恢复现在
  显式传入 live revision floor，生成更高的工作集合版本，继续拒绝旧 CAS。
  默认坏快照恢复仍为 no-op；显式 floor 严格拒绝负数、非整数及溢出。
  原科学对象和 savepoint 文件不变；相机等显示元数据沿用既有保留合同。
- 内置帮助补充上述实际处理路径，并明确文本焦点的 Ctrl+Z 属于文本撤销。

## 验证与证据

本地原始日志位于任务证据目录
`F:/mircograph-workbench/preflight-lineage-evidence-20261104`，未纳入仓库。
夹具均为公开构造的受控对象，不访问原生旧 unknown 窗口或私人样品。

| 范围 | 结果与原始日志 |
| --- | --- |
| 依赖与正式构建 | `npm ci --ignore-scripts --no-audit --no-fund` PASS；最终 `npm run build` PASS，`122-npm-ci-first.log`、`122-frozen-build-final.log` |
| 实际 app handler | 受影响选择集 51/51 PASS，`122-ui-candidate-second.log`；包含精确／错误证明、迟到 A/B、普通错误和传输丢失、mark/观察说明、NoSave、真实 unknown、原文本撤销与字段基线 |
| Panel 与消费者 | 首次 101 项中 100 项 PASS，`122-panel-consumers-first.log`；剩余新增 NoSave 测试原先错误要求回退相机，按既有显示合同修正后 PASS，`122-final-three.log` |
| 新图面消费者 | 队列有界停止、后续 figure-base 原请求可查均 PASS；与修正后的 NoSave 共 3/3，`122-final-three.log` |
| 最终提示语消费者 | 最后仅复核 Save 拒绝停止、图面停止及 provider not_submitted 独立提示，3/3 PASS，`122-final-wording.log` |
| 静态／模块 | `static-ui-entrypoints` 及真实 Panel GET `/panel-preflight.mjs` 200 均在上述消费者中 PASS；`git diff --check` PASS |

Panel 消费者命令为：

```powershell
node --test dist/tests/image-panel-window-activation.test.mjs dist/tests/analysis-workspace-panel.test.mjs dist/tests/image-panel-windows.test.mjs dist/tests/workspace-controls-ui.test.mjs dist/tests/settle-workspace-ui.test.mjs dist/tests/static-ui-entrypoints.test.mjs
```

UI 选择集命令为：

```powershell
node --test --test-name-pattern='Panel preflight|text undo boundary|native reason baseline|native field baseline|direct ROI:|not-submitted recovery|pending observation|unknown|workspace' dist/tests/image-panel-ui.test.mjs
```

首败未覆盖：`122-ui-first-fail.log`、`122-panel-first-fail.log`、
`122-ui-candidate-first.log`、`122-ui-discard-diagnostic.log`、
`122-mark-nosave-first-fail.log`、`122-candidate-build-second.log`。
分别保留旧 unknown、旧 transport scope、NoSave 版本回退、观察说明／恢复 floor
与一次 TypeScript 类型编译失败。新 ROI 夹具首次预填了 dirty 说明，导致画布
创建被既有保护阻止；修正为空说明手势，不将该夹具错误当作产品或原生失败。
`122-panel-consumers-first.log` 也保留了
上述相机断言的测试错误，未把它归因为产品失败。

未跑全量科学套件或数值计算。本提交的原生鼠标／键盘验收为 **NOT_TESTED**；
后续以固定代码版本另行记录公开双 ROI 的轻量原生闭环。此报告不作物相结论。
