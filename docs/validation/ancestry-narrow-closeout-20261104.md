# 来源边界与窄窗操作：有界收尾记录

## 基线和依赖

本轮实时 main 为 `dd9b706786041c6c0a6678ff6cd4dd84dbe06a3e`，不是功能候选。main 仍要求管理员也遵守 `CI scope gate`、`F3b scope gate`；本轮未合并、移动基线或调整保护。

已有未合并链为 #110 → #111 → #117 → #118 → #119。新窄窗／文本修复基于 #119 的 `38b1b326f764cb9159ded8ffb5855514b9631597`；来源修复继续基于窄窗分支，不能向缺少这些父提交的 main 重复应用旧功能。

窄窗功能提交 `8f63481f085ee2bcb5cdd52d13c6dee9bb262def`；来源实现独立提交 `24042da0859c3aff0f3deb24c964b9d39e77419a`，已整合到 `fix/source-recheck-integrated-20261104`。整合后来源后端与独立真实协议验证的源码逐文件相同。最终文档提交和托管 CI 以 PR 精确 head 为准。

## 改了什么

- 选择和平移相邻，沿用原按钮与 V/H／空格临时平移。参考逻辑及现有组件对应见[桌面直接操作合同](../design/desktop-direct-interaction-20261104.md)。未模仿未经验证的最新 DM 内部行为。
- 理由、名称、颜色及状态回到当前有效原值时，只清除这一项未应用草稿；不清几何、已排修订、未知请求或其它 ROI 草稿。精确拥有的旧 reason-only 假 dirty 通过现有草稿确认收敛，不冒充明确保存。
- 名称／标签输入期间，350ms 定时器不应用科学标注；文本撤销留给文本编辑器。明确应用、Ctrl+S 和原受保护切换路径仍负责提交。已执行的 B 版本改回 A 仍是新的工作修改。
- 来源解析先评估已经读取到的第 65 条记录，再判断是否允许下一次祖先读取。祖先读取预算仍为 64；没有盲目扩大常数。
- 对满足严格旧保存条件的 frame=null 提供显式“重新核对来源”；只核对原对象、完整有界祖先和已有资产。来源按钮的未知响应只查本次原请求，正常保存另建保存点。普通保存、网格、PNG、标定、所有权和最终 CAS 保护保留。
- 捆绑祖先读取仅在一次恢复内复用；最终复核仍重新执行原捆绑 provider。没有跨请求缓存或新的来源数据库。中文帮助同步实际入口。

## 真正生成的长历史

使用正式 MCP 的公开 64×64 合成 TIFF、一个 preview 和 78 次真实 `image_annotate` 修订；没有手改对象 manifest 拼造来源链。保留稳定 ROI `long-source-roi`。实际记录数包含终端，不等同于“第 N 次编辑”。

| 记录数 | 准确对象 | 本轮普通／捆绑来源读取 |
| --- | --- | --- |
| 13 | `91b512847e924684900ad1f01163aa41` | found |
| 64 | `1fe8b62c3c64490a90b7b8e140756e50` | found |
| 65 | `9725ce8cefc64cd6ab0b38e20ccdbba2` | found；64 次祖先读取 |
| 66 | `d744f3c39d2c44f8a6a56efe24582693` | ancestry_budget_exhausted |
| 80 | `e74f9d7522f449798ad6f98374e53f4f` | ancestry_budget_exhausted |

旧运行时通过正常保存／关闭创建准确 65 条旧 null 保存点 `long-source-old-null-65`。新运行时启动仍保留旧 null，显式重新核对后只更新工作引用；查询原操作不重读或重算。明确保存为新点后正常重开，准确空间输入保留。丢弃工作返回同一旧 null 的受限分支由正式 Panel 合同测试覆盖，未把任意 null 当通配。

**首次实际 FFT 是 HTTP 200，不能写成未执行或没有对象。** 原请求 `panel-2aa459c5933ad43fdaf05ba801befb76-1`，FFT `cb04dd6b38b34a5f820254c8f7300c43`。冻结输入确为浮点框 `[8.25,8.25,48.75,48.75]`，计算支持范围 `[8,8,49,49]`。但独立 scientific source graph 的预算仍令执行输入 `qualification=unavailable`，原因 `Scientific source ancestry exceeds budget`。首次脚本期待 validated 的断言失败完整保留，后续没有重新计算 FFT。

之后只查询该已完成原请求，恢复现有 FFT、准确返回 65 条空间输入、明确保存两窗并正常关闭重开。最终 raw FFT 与 FFT 请求都只有 1 个；未通过的执行输入资格仍未通过。该跨 Panel／执行输入／CLI 的深历史合同单列 [#121](https://github.com/wuchqwq/microscopy-workbench/issues/121)，最小方案见[来源设计](../design/bounded-source-recheck-20261104.md)，本轮没有实施较大证明结构变更。

旧未优化阶段从日志事件间隔估计约 221,290ms／198 次元数据调用，**不是鼠标点击计时**。捆绑复核优化后，65 条保存点初始化 16,571ms／14 次调用，两窗重开 20,205ms／18 次调用；分别含 3／5 次完整捆绑读取。完整祖先与资产复核仍然执行。这不是全面性能基准。

## 窄窗与原生证据边界

实际 Windows 原生操作者使用 `gpt-6.1-terra` 和官方 computer-use／Sky。任务专用启动副本仅设置窗口内容尺寸并作一次尺寸补偿；其余生产 renderer、preload、CSP、菜单和科学后端不变，不提交该启动副本。系统实际报告 **761×801**，不冒充精确 760×800。精确 760×800 是独立 DOM 几何测试范围。

首次旧版原生操作保留理由 Ctrl+Z 后假 dirty。`5823e8d` 定向复测确认：左栏选择→平移→ROI，理由→打开帮助／Esc→文本 Ctrl+Z 回空，Ctrl+S 显示“已保存并读回”；属性标题和关闭叉最终可见。原生与 DOM 均不能证明所有裁切现场同因，没有据此猜改 CSS。隐藏性能诊断增加视口／面板／叉的几何数字，不含样品文字。

该复测又暴露名称输入的 350ms 自动应用；历史保护在派发前拒绝，但前端误当 unknown。只查询一次原请求实际落到旧 return-spatial，正常退出仍被阻止；没有重放或强制结束旧窗口。该误分类与退出死路单列 [#122](https://github.com/wuchqwq/microscopy-workbench/issues/122)。`8f63481` 阻止文本编辑期间的定时提交，不能宣称已修所有显式历史编辑拒绝的恢复合同。最终独立新公开工作区原生复测另记增量，不覆盖这次失败。

最终 `8f63481` 独立新公开工作图、实际 761×801 原生增量 PASS：创建一个 ROI 并 Ctrl+S 建立基线；名称追加临时后缀后保持焦点 **2 秒**，没有 unknown；Ctrl+Z 回原名，状态恢复，Ctrl+S 再次保存读回；属性叉一次关闭可用，Alt+F4 正常退出。没有 FFT 或测量。根 agent 独立检查科学 journal：只有创建 ROI 的 **1 次 annotate 请求／1 个 annotate 对象**，最终名称 `ROI 1`，保存点不含临时后缀。没有把名称输入和撤销当作新的标注版本。该轮未复测历史来源图名称，不以新工作图成功覆盖旧现场。

## 定向回归及原始失败

| 层 | 结果与命令／范围 |
| --- | --- |
| 正式构建 | 窄窗及组合候选分别 `npm run build` PASS；早期 gesture 类型缺失、来源整合 TS 首败保留。依赖由锁文件 `npm ci` 安装。 |
| 来源边界 | `node --test dist/tests/panel-frame-resolution.test.mjs dist/tests/panel-restore-reads.test.mjs dist/tests/panel-source-recheck.test.mjs`，36 PASS，含 22 个解析、7 个恢复读取、7 个实际 Panel 合同测试。 |
| UI 组合 | 首次合并相关 baseline／历史／抽屉／观察／来源选择运行 32 PASS；增加定时器修复后只测 `text undo boundary|source recheck UI`，7 PASS。二者有重叠，不相加包装总数。 |
| 理由组件 | 23 PASS；实际 app 消费者 20 PASS，后续独立权威保护 1 PASS；文本定时器首败 2 PASS／2 FAIL，修后 4 PASS，相关消费者 15 PASS。部分覆盖重叠。 |
| 真实 provider | 上述 13／64／65／66／80、旧 null、新保存点、唯一 FFT、原请求恢复、准确返回与正常两窗重开；协议操作，不冒充原生手势或科学准确性。 |
| 独立审查 | 来源后端 bundle 重新验证、异步后 CAS、旧 null／discard 窄分支、原请求与科学保护只读复核未发现阻断；未重复已通过套件。 |

测试名称以仓库实际测试文件为准；保存本地首次 foreign-query 断言差异、discard 首败、缺少 readQualified 的旧模块首败、真实 FFT qualification 断言失败。后续针对性成功不覆盖原失败。没有手动跑 FFT/GPA/拓扑/散射/噪声矩阵，也没有通过隐藏失败或删除测试取得 PASS。

根 agent 独立重新计算哈希：长历史原 244 个科学 objects／requests 文件全部不变，最终 248 个仅包含本次唯一 FFT 增量；原始 TIFF、origin、旧 null 和此前新保存点均有对账。原生旧试验的 37 个科学文件全不变且总数仍 37。原现场、日志和完整请求保留本地，未上传图片或私有资料。

本地证据根：`F:/mircograph-workbench/ancestry-narrow-evidence-20261104`；最终原生记录 `native-text-final-operator.md`，独立核对 `native-text-final-reconciliation.json`，旧失败查询与被阻止关闭 `native-original-query.md`。组件首败另在 `F:/mircograph-workbench/narrow-native-ui-evidence-20261104`，定时器首败在 `F:/mircograph-workbench/text-undo-evidence-20261104`。本报告是公开合成输入的工程证据摘要。

## 启动和恢复

在最终组合 worktree 用普通 Node >=22.12 安装桌面开发运行时；科学 Python 沿用明确提供的环境。首次启动仍须指定只读源图，已有工作区正常重开省略 `--source`。

```powershell
npm ci
npm run build
npm run desktop:install
npm run desktop -- --workspace "ABS_SAVED_WORKSPACE" --python "ABS_SCIENCE_PYTHON"
```

帮助入口为右上“使用说明”或桌面“帮助 → 使用说明”／F1。未知保存查“查询原保存”，未知科学请求查原 ID，不换输入、不重发。65 条旧 null 仅在显式核对成功后另存新点；超过范围保持原图和记录，只读说明原因。`node dist/tools/workbench_cli.mjs inspect --workspace "ABS_SAVED_WORKSPACE"` 仍受独立 CLI 来源预算约束，不能保证长链 CLI 已可用。

**NOT_TESTED／待查：** 真正精确 760×800 的原生窗口；其它 DPI／缩放和原持续全空白现场；超过预算的完整来源证明与 CLI 科学复用；旧 unknown 窗口的正常恢复（#122）；私人样品科学准确性；阶段三干净安装、升级与崩溃恢复；全部 GUI 或人类易用性验收。本轮不宣称真实样品或完整 GUI 验收通过。
