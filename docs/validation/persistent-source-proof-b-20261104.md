# #121／#126 B：持久来源证明实现与有界验收

2026-11-04。用户明确授权按 #126 的 B 方案实现，保留旧记录和原请求，不重算已有 FFT；PR 交用户审查，不合并、不移动基线。本轮无私人样品访问。

## 版本与行为

开工和交付前核对 main 为 `dd9b706786041c6c0a6678ff6cd4dd84dbe06a3e`，实时 branch API 为 `protected=true`，本轮未修改保护。交付时连接器读取详细保护端点返回 `403 Resource not accessible by integration`，未再次证明必需检查列表；两条 scope gate 的实际运行另按精确 head 检查。本分支接 #125/#127 的来源与非派发保护、整合 #126 ADR；父 PR 均保持未合并，不在缺少这些父提交的 main 上重复实现。实际受验源码 SHA、PR 依赖和精确提交 CI 在 PR 与交付消息列出，不借父提交的绿色检查证明新代码。

原 provider 对象、请求 journal 与文件仍是科学权威。新增两种元数据对象：`source_proof`、`source_proof_revocation`；证明不包含新科学数组，也不是签名或独立科学数据库。

| 操作 | 实际行为 |
| --- | --- |
| `image_source_proof`／CLI `proof-create` | 明确原请求 ID，核对完整 DAG、frame、实际 operand、输入与当前 payload 后追加证明。支持 `saved_source` 和准确既有 FFT 的 `fft_input`。 |
| `image_source_proof_info`／CLI `proof-info` | 只读、新鲜核对；不创造请求 ID，不预览或计算。分别给出本次状态、原执行资格、准确 scope 与严格复用资格。 |
| `image_source_proof_revoke`／CLI `proof-revoke` | 明确原请求追加撤回；旧证明、依赖、数组和保存点不变。完整有界撤回扫描不能确认时 abstain。 |
| GUI 记录 | “显示与高级设置 → 诊断与原请求恢复 → 持久来源证明 → 核对并记录来源证明”。既有 FFT 从“探索执行历史 → 记录输入证明”进入。记录不采用，不应用草稿。 |
| GUI 采用／替换 | 准确对象、frame、窗口、owner/CAS、草稿与租约检查后，仅改工作引用；Ctrl+S 才纳入新保存点。显式替换保留草稿，不自动重发被拒编辑。 |
| CLI `proof-adopt` | 仅关闭、干净、无恢复和未知请求的工作区；发布明确命名的新保存点。相同 new-save-id 只查询原保存，旧点不改。 |

单次证明核对使用 2,048 个唯一对象／64 MiB 元数据／256 MiB payload／110 秒总边界，最后新鲜复核计入预算；原数组、NPY、32-wrapper 等专用保护保留。不能把实际重复读取次数误当唯一对象数，也不能因为某个缓存已填入对象就跳过实际 DAG 的 64 边界。无明确 proof 的旧路径保留原行为。

证明只覆盖其准确依赖成员。R80 的证明不自动覆盖后来创建的 C81；当前版本必须明确重新核对，不自动发证。源文件当前可读性依原合同，“保留的入库身份”不冒充本次重读原 TIFF。

## 正式 MCP：不新增科学执行

对原公开 65／80 历史链与两 ROI 工作区调用**实际 stdio MCP**，同时用 Node reader、CLI 和 Panel 重开消费这些真实 provider 证明：

| 既有对象／操作 | 实际结果 |
| --- | --- |
| 80 历史记录来源 | `verified`；81 个完整依赖（包含原 source），恢复准确 frame。没有提高旧 64 常数来绕过检查。 |
| 65 链的原 completed FFT | 新证明 `basis=retrospective`，保留 `original_qualification=unavailable`，`eligible_for_strict_reuse=false`。原 history 仍 separately 显示 completed 与 unavailable。 |
| 对该 ROI 使用 `compare-rois --compute-missing` | `known_existing_unqualified`，在科学调用前拒绝替换；新增 FFT 为 0。 |
| 父／子证明与子撤回 | 子返回 revoked，父仍 verified；旧证明都保留。 |
| CLI 明确采用＋新保存点＋重复原 save-id 查询 | 正常保存；重复为 query-only。Panel 正常重开，准确 frame 与保存的 proof 引用仍在。原 null-frame 点未被改写。 |
| 旧短链已 validated 的原 FFT | `basis=original_pre_execution`，原资格 validated，严格复用资格 true；不借回溯证明升级它。 |

这一段的调用白名单仅 `image_info`、`image_result`、三个 source-proof 工具；**FFT／preview／measure 为 0**。先前 320 个原对象、journal、sidecar、保存点文件及两份公开源图哈希全部不变。

本地证据：`F:/mircograph-workbench/proof-b-evidence-20261104/existing-proof-summary.json`、`existing-proof-events.jsonl`、原 sidecar、原请求与各 remote/local 核对回执。旧持续全空白现场未在此重现，也不因此宣布其已解决。

## 定向回归与首次失败

- 锁定 `npm ci --ignore-scripts --no-audit --no-fund`、正式 `npm run build` 通过；编译器来自 lockfile。托管 CI 另按精确 PR head 核对。
- Provider 初轮 16 项通过；最终 EPS／32-wrapper 一致性改动只补跑 4 项直接回归，没有重跑已通过的 16 项。覆盖 80 真修订链、联合 source／FFT DAG、原 sidecar 字节、撤回／损坏／未知请求、旧 unavailable、新预执行 refs。
- Node reader／CLI／冻结输入／saved-input 与直接 measurement 共享消费者：53 PASS、0 FAIL、1 既有环境门 SKIP；新 18 项全部通过。SKIP 未开启独立 Python/MCP domain-binding 环境，不算实际科学执行。
- Registry 与 transport：2 PASS，核对 proof-info 无新写请求、准确 proof ID、严格 schema 与工具注册。
- GUI 首个冻结候选：39 UI＋76 Panel／恢复／保存／窗口直接用例通过。独审随后指出失效投影的采用标记及准入拒绝恢复路径缺口；两处窄修＋普通 409 原反例共 5 项定向通过，随后准确 adopted hash 优先级另补 1 项通过。观测 hash 与已采用的 expected hash 分开，不用缓存 null 覆盖准确采用引用；原候选通过不替代这些最终回归。

保留 `provider-proof-first.log`（测试 fixture 未先确认原 preview）、联合 DAG／JS key／near-integer 首失败及 `reader-types-first.log`；后续修复不覆盖这些日志。`panel-audit-regression-first.log` 的命令／dist 路径失败也保留，不记为产品回归失败。正式 MCP 本轮首轮通过。独审发现的 GUI 问题即使服务端仍拒绝写入，也作为局部程序错误修复。

首个托管候选 `8595815fe433c0cf99614817c956227adeb083f2` 的 `compiled-compatibility` **FAIL**：冻结兼容性测试的明确新增目录漏列本次批准的三个 source-proof 工具。原基线 SHA、旧 schema／相对顺序检查和未知新增拒绝均保持；仅补这三个准确名称。原失败 run `41778558056`／job `126404589635` 与本地 `ci-compiled-compatibility-first.log` 保留。后续本地只补这项 copied-package/MCP 兼容性回归，新的托管检查按新精确提交记录，不把首个 CI 改写为通过。

该兼容性定向复测 **3/3 PASS**（31.3 秒）：在独立新 32px fixture 中由冻结版本建立原记录，再用复制的编译包读原请求、context、导出、修订测量和 Panel 资产；原字节及那一次原 FFT 保持。它没有触碰本轮已有的 65／80 链或双域工作区，也没有重复这些工作区的 FFT。`compiled-compatibility-fixed-first.log` 保留原输出。

没有手工运行无关 GPA／拓扑／散射／完整噪声矩阵。现有 CI 按仓库规则可能独立触发更广检查，不修改门禁来节省测试。

Windows 短测按用户指定交给 6.1 Terra，使用 computer-use。首次 `get_window_state` 因工具无法可靠确定当前 Chrome URL 而被策略终止；**没有点击、按键或证明派发**，不重试或绕过。故本轮证明入口／采用／Ctrl+S／帮助的原生鼠标范围均为 **NOT_TESTED**，不是产品故障证据。隔离 helper 正常关闭，原科学文件未改变；详见本地 `native-proof/native-proof-report.md`。UI 与 Panel 回归不冒充这段鼠标验收。

## 合成缺陷的有限分析

用户追加的合成测试另见 [双域投影实际分析](source-proof-synthetic-twin-20261104.md)。复用原独立教学生成器，两个 ROI 各创建一次新 FFT、记录四条 DC 测量；后续 CLI 对比全部复用。测得对应周期与预设几何一致，能提出与预设 Sigma3 投影相容的有限解释，不能从这张二维余弦教学图认证实际孪晶或物相。原失败的证据文件名冲突保留，后续只查原保存并重开，未重放科学请求。

## 保留限制与启动

- 多条历史 sidecar 仍可能各自新鲜核对证明。上述预算是**每个证明核对会话**，不承诺整个 history／CLI 操作只读 64 MiB 或固定耗时；不引入跨请求缓存来隐藏成本。
- GUI 对当前空间根显式替换；raw FFT 与频域 display 不相等时不能冒充同一根修复。返回准确空间来源再显式核对，或在关闭的准确保存工作区用 CLI 做受保护的 saved-source 引用修复。
- 真正未知请求仍只查原 ID；provider 已知失败但现有 transport 只给错误文本的更广限制，不被新 UI 推断为“从未执行”。
- 未覆盖：实际样品准确性、物相／三维孪晶认证、位错案例、Mac／Linux 原生 GUI、干净 Windows 安装升级与完整 GUI 验收。原生鼠标范围另按实际短测记录，不把 HTTP 或 DOM 替身算作鼠标。

在此 PR 分支构建后，用准确工作区和显式 Python 正常重开，不给 `--source`、不重新导入：

```powershell
npm ci
npm run build
npm run inspect -- --workspace "F:/mircograph-workbench/proof-b-evidence-20261104/synthetic-defect/workspace" --python "<ABS_SCIENTIFIC_PYTHON>"
node dist/tools/workbench_cli.mjs history --workspace "F:/mircograph-workbench/proof-b-evidence-20261104/synthetic-defect/workspace"
```

不要对未知写入换请求 ID。查询原科学请求用 `query --request-id ORIGINAL_ID`；proof-info 只读当前证明，不恢复草稿、不创建预览或重算 FFT。
