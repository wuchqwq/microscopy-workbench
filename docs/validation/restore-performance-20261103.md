# 保存状态恢复：重复读取诊断与最小优化

本记录基于 `00b84ae589bd581511380c4ac053841b06a7546d`（功能源码为 `3d530db…`）的隔离 worktree。原生 NoSave 的约 62 秒观察上界、旧 15 秒 timeout FAIL 与旧现场均保留；本次不从旧 mtime 推导内部耗时。

## 实际链与改动

`prepareAnalysisRestore` 先遍历保存引用，随后显示准备、逐窗 PNG/网格校验、帧祖先与空间返回关系反复请求相同 `image_info`。每次读取都会经现有 provider 新起 Python worker。公开 fixture 的基线恢复请求 38 次，实际仅涉及 7 个不同对象。

仅在一次恢复资格核对的 `AsyncLocalStorage.run` 调用链中去重已成功读取的完整回复。兄弟 HTTP 请求（例如 `/api/window-asset`）使用自己的新 provider 读取，不参与或污染该集合。回复对消费者独立 clone；失败不缓存，作用域不跨保存、导航或下一次恢复。没有持久缓存、新科学库或新 worker 协议。

保留的回复上限为 128 个、32 MiB。超出保留预算的读取继续走原来的 uncached 路径，不跳过资格核对，也不新增拒绝。提交前，每个**已保留**回复都由原 provider 再读取一次，完整 metadata/PNG 必须相同；原 hash、数组、网格、身份及路径检查仍执行。失败或变化保留当前工作状态与保存指针。最后的同步提交边界、CAS、所有权、原请求 ID 和未知执行不重放规则不变。

## 公开合成输入成对实测

使用真正独立、原路径合法的 provider 工作区：3 个源 ROI、一个已有 FFT 和点测量、两个窗口及明确保存 A。两次测量均先停放一条未保存说明 B，再恢复 A；基线和最终 ALS 运行时先分别冻结。只执行既有读取与工作元数据操作，不重做 FFT 或测量。

| 范围 | 基线 | 最终 ALS 版本 | 状态 |
| --- | --- | --- | --- |
| Panel 明确保存状态重建（`createImagePanel`，不含 Inspector/Electron 启动） | 40.758 s；43 次 image_info | 20.208 s；19 次 image_info | PASS，单次配对 |
| `/api/workspace discard` | 34.049 s；38 次 image_info | 15.137 s；14 次 image_info | PASS，单次配对 |
| 每个阶段不同对象数 | 7 | 7 | 全部仍由 provider 核对 |
| 每次科学写工具调用 | 0 | 0 | 没有计算重放 |
| 全部 14 个 provider 文件实际 SHA | 前后一致 | 前后一致 | 含原数组、manifest 和 PNG |
| 保存 ID、选择、帧、窗口与来源状态 | 与优化后完全一致 | 与基线 deepEqual | B 说明丢弃、A clean |

证据在本地独立目录 `recovery-performance-evidence-20261103`：`baseline-v4-dirty-receipt.json`、`optimized-als-v2-dirty-receipt.json`、`paired-final-receipt.json`。这是 provider/HTTP 工程取证，不是原生鼠标延迟或真实材料准确性验收。秒数受运行环境与并发负载影响，不承诺任意工作区固定倍率；仍需为不同对象启动原 provider，慢等待尚未消除。

## 定向回归与首次失败

- 正式锁定 `npm ci`、TypeScript build PASS。
- 四个直接消费者文件（restore read set、analysis workspace Panel、Inspector registration、Panel windows）54 PASS。包含同一对象重复读取次数、fresh 回复变化拒绝、provider/hash 失败、不缓存失败、保留预算回退、并发 HTTP asset 隔离、B/working 字节与 A 保存指针保留。补入错误后下一次明确恢复使用新作用域的断言后，两个直接文件 18 PASS；数量有重叠，不相加。
- 独立冻结版本的 controlled HTTP provider 拒绝负例 PASS；兄弟 asset 读取没有复用恢复 scope，拒绝后 B 和 working 字节不变。该证据属于协议注入，不是实际鼠标动作。
- 原版读取次数回归首 FAIL 保留：简单 fixture 对 A 重读 5 次，目标为一次初核与一次 fresh 复核。`first-count-failure.log` 不被后续成功覆盖。
- 尝试复制旧公开工作区的性能 fixture 被原路径保护正确拒绝（`Image result escapes workspace`）。未改 manifest 路径冒充合法迁移；改为在新目录通过真实 provider 生成 fixture。保留 `baseline-receipt.json`。
- `baseline-v2` 被作者错误地并行 build 删除运行中 dist 打断，保留 worker 文件暂缺的设施 FAIL；之后所有测量运行时先冻结，未操作用户窗口或结束其他任务。
- 中间 global-cache v1 存在跨 HTTP 请求作用域缺陷，已被独立静态审查指出并改为 ALS；其 `optimized-v1` 速度不作为最终合格证据。没有伪造旧 global 版本的经验首 FAIL。

未运行无关 FFT/GPA/拓扑/散射或噪声矩阵。最终原生鼠标保存/NoSave 速度、主窗等待反馈、任意大图与任意来源故障仍需分别实测；本补丁没有提高 deadline、取消输入保护、放宽 CSP 或科学校验。
