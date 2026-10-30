# 首次真实样品：私有数据准备与独立验收

对应 [Issue #43](https://github.com/wuchqwq/microscopy-workbench/issues/43)。
第一阶段交付名称是 **DATA_INTAKE_READY**，只表示模板、只读预检与规程可用。
本阶段已执行范围见 [准备阶段验收记录](REAL_SPECIMEN_INTAKE_ACCEPTANCE.md)。
实际样品可用性、独立晶体学解释、真实样品准确性均为 **NOT_TESTED**。
这不是 `REAL_SPECIMEN_PASS`。GUI 手势、新模型 Skill 理解及专属中断注入继续由
[Issue #40](https://github.com/wuchqwq/microscopy-workbench/issues/40) 独立跟踪。

## 先准备一张图

优先选你熟悉的一张原始二维高分辨 TEM/STEM 图，保留两侧晶域和相邻界面上下文，
有原数组、标定来源和独立解释。一个样品即可验收流程，不必先凑齐正负三组。
只有单域或少量条纹也可以做有限观察或“应当未判”控制，不能据此强行确认孪晶。

请准备以下文件；未知项填 `null` 或 `"unknown"`，不要估填：

| 文件 | 最小内容 |
| --- | --- |
| 一份原图 | DM3/DM4，或保留原数组的无损 uint16/有限 float32 灰度 TIFF；不使用截图、带标尺烧录图或归一化 PNG 代替原图 |
| 原始元数据/采集记录 | XY 带符号标定、单位、原点、标定来源/可信度/不确定度，成像模式、电压、扫描方向、厚度/离焦等已知条件；翻转、裁剪、重采样、滤波和重构历史 |
| 独立参照 | 已索引衍射、第二带轴、可解释的原子堆垛等文件及判断依据；记录标注者匿名 ID、坐标和投影歧义。可先缺，但物理验收须保持未判 |
| 候选结构资料（条件性） | 实际材料/成分依据、参考 CIF 或带来源的晶格参数、带轴/母晶取向依据；不清楚就不进入 F3b |
| 权限与选区说明 | 明确允许读取的本机文件/目录、允许保存派生物的位置、发表状态；建议两侧 ROI 和界面线，注明来源与坐标系 |

**你当前只需准备一张有权使用的原数组图、已知标定/采集记录，以及尽可能独立的晶体学依据，
并明确本机读取和派生保存范围；缺少的材料会逐项保留为 unknown。**

## 私有目录约定

推荐将案例置于仓库外的用户指定私有目录。也可使用本仓库已忽略的
`private/specimens/case-001/`。工具只接受 Git checkout 中的 `private/` 子目录；
拒绝链接/junction、绝对成员路径和 `..`。每个案例另带全忽略的 `.gitignore`。
`.gitignore` 不能阻止 `git add -f`，提交前仍须人工检查暂存文件。

```text
private/specimens/case-001/
  manifest.json       匿名元数据与相对文件引用
  protocol.json       分析前预注册方案
  reference.json      独立参照；盲验时由参照保管者另行保管
  verdict.json        A/B/C 分层结论与证据索引，初始 NOT_TESTED
  raw/                用户放置原图；只读，不覆盖或修改
  reference/          采集记录、衍射、CIF 等，保持原件
  derived/            仅经用户明确允许的新派生文件与坐标映射
  reports/            新建预检 JSON，不覆盖旧报告
  runs/               预注册副本、调用记录和正式 provider workspace 的引用
```

这些文件及报告全部私有。不得提交原图/派生图、源哈希、私有元数据、作者身份、
实验账号、绝对路径、真实测量和运行日志。公开仓库只包含空模板、公开合成生成器
和通用使用说明；空模板可分享，填写后的 manifest **并非自动脱敏**。
预检不会联网、上传或调用 MCP，也不会创建新的科学 workspace/journal。
后续分析复用现有 image/structure provider 的科学对象和恢复日志，`runs/` 只索引它们。

## 可执行的准备与只读预检

在独立 Python >=3.10 环境安装现有 `requirements-images.txt`；DM 文件另需
`requirements-dm4.txt` 的固定 RosettaSciIO 0.15.0。不使用 GMS Python。
以下命令从仓库根目录执行，`python` 应指向该独立环境：

```powershell
python -B tools/specimen_intake.py init --case-dir private/specimens/case-001 --case-id case-001
```

初始化只创建新目录和模板，已有目录会拒绝。用户授权后，把有权使用的文件放到
`raw/`、`reference/`，填写 manifest，并将 `permissions.local_read_authorized` 设为
`true`。模板默认 false；不会因文件存在就默认授权。`public_upload_authorized`
默认 false，本工具无上传接口，公开分享须另行明确授权。

`files` 恰有一项 `primary_image`；其他可为 `independent_evidence`、`reference_cif`、
`acquisition_metadata`、`derived`。每项有唯一 `file_id`、相对 POSIX 路径和 SHA-256。
`original_array` 是提供者声明，预检不能认证文件是否确为仪器原始输出。
`shape`/`dtype` 是原数组而非截图；`array_axes` 不得从文件名推断。
对 TIFF，shape/axes 描述所选原始页，另在报告记录页数；对 DM 描述所选 dataset 的完整
原数组，选面 shape 单独保留。页数不赋予时间/深度含义，`frame_semantics` 未知就保持 unknown。
匿名 `case_id` 与各模板一致，不能放姓名或课题信息。

选择规则对照当前实际 MCP schema（不是新工具输入）：

| 输入 | manifest 的 `selection` | 后续正式工具 |
| --- | --- | --- |
| TIFF | 显式零基 `frame_index`；其他选择为 null | `image_open(source_kind=tiff)` → `image_frame(frame_index=...)` |
| 2D DM3/DM4 | `frame_index:0`、显式零基 scientific `dataset_index` | `image_open(source_kind=dm3/dm4)` → `image_frame` |
| 多维 DM | 再提供原数组轴序号 `plane_axes:[Y轴,X轴]` 和逐轴 `plane_indices`，选中轴填 null，其余显式索引 | 同上；不展平、不猜时间/深度轴 |

DM scientific dataset 索引遵循现有 reader 的显式缩略图排除规则，不能按文档标题或
“最新图”选择。未知目录结构/数据集时，先记录缺失；预检不自动选择唯一数据集。
本阶段只支持真实标量二维选面；复数、RGB、其他 dtype/布局明确拒绝或留待现有工具的
独立适用性判断。独立 NPY 不是 `image_open` 的新来源类型，本阶段不自动转换或添加支持。

```powershell
python -B tools/specimen_intake.py preflight --case-dir private/specimens/case-001 --report reports/preflight-001.json
```

未带 `--report` 时，预检只读且不创建文件；控制台只显示状态，不打印路径、哈希或元数据。
详细报告只能显式写入案例的 `reports/` 下全新 JSON。若已存在，使用新报告名。
预检不回填 manifest。预期哈希未知时，第一次报告保存 observed SHA-256，
经提供者核对后手动填回 manifest，再用新报告名复检；这只是建立基线，不证明采集来源。

| 返回码 / 状态 | 含义和下一步 |
| --- | --- |
| `0 / READY_FOR_PROTOCOL_REVIEW` | 本次声明与文件读取/标定语法检查完成，可以审阅预注册方案；没有物理结论 |
| `2 / PARTIAL` | 缺哈希、原数组声明、轴/域或标定等。阅读报告；已成功读到的像素仍可在明确限制下探索，禁止把缺失量补成物理值 |
| `1 / BLOCKED` | 未授权、缺文件、解析/截断、哈希/声明冲突、非法选面、非有限值、超预算、非法坐标或标定冲突等。先解决原因；不能忽略失败继续验收 |

哈希以 1 MiB 块读取；单文件上限 4 GiB，选面上限 4,194,304 像素及 64 MiB，
TIFF 目录链上限 4096 页，JSON 上限 2 MiB/文件，文件清单上限 32 项。
检查选面预算后才解码，TIFF 不整栈加载；DM 复用现有 lazy catalog/选面 reader。
读取前后核对源哈希，不能声称原子快照、并发写保护、完整文件格式认证或峰值内存资格验证。
格式库解析标签仍有其自身开销，本工具面向已授权的本地科研输入，不是恶意文件隔离器。
未选页不做像素数值验收；CIF/独立参照只校验文件存在和哈希，不认证其科学内容。

标定采用 `physical(index) = pixel_zero + index * signed_scale`，XY 分别记录，
允许负号与非方形像素。不把 DM raw origin 当物理零点。TIFF resolution 不直接等于
样品长度单位。已声明标定与可用 DM 存储标定冲突时阻塞并交由研究者解决；
本工具不激活、覆盖或修订正式 calibration。未知不确定度保持 null。
预检的 nm/angstrom 白名单仅用于本首轮实空间案例，不扩大正式工具的单位范围。

如确需转换，必须先明确选择来源、帧/选面及输出位置，另建派生 TIFF/NPY 和记录：
原/派生哈希、dtype、轴、裁剪半开区间、翻转/转置/重采样矩阵与插值、标定变化、软件版本。
原件保持不变；显示 PNG 不参与数值分析。此工具不执行转换。

## 单样品最小盲验证闭环

盲验是人工角色和文件访问安排，不是本脚本实施的访问控制。参照保管者先准备
`reference.json` 和独立证据，密封其 SHA-256；分析者运行前不看物理标签。
没有第二人时，可先封存先验解释、完成输出再解封，明确标为未实现人员独立盲验。
协议与 verdict 是人工审阅模板，不是脚本自动执行/验证的工作流。

1. **预检并冻结输入。** 保留所有失败报告。确认来源真实/模拟/工具生成，保存
   原图/元数据哈希、数据集/帧/选面、域/标定来源、版本与代码提交。
   用户明确指定允许的读写范围后才进入真实数据第二阶段。
2. **运行前完成 `protocol.json`。** 记录问题、相容/非孪晶/证据不足等竞争假设、
   源坐标 ROI、界面、参考区/g、允许工具与全部参数、禁止操作、调用/FFT像素总量/
   墙钟/参数尝试预算、A/B/C 门槛、带单位容差及独立依据，时间戳和 manifest/密封参照哈希。
   `DRAFT`、空容差或空门槛不能进入相应定量验收；未掌握量保持 unknown，降低可作出的结论范围。
   冻结到全新文件并记录哈希，后续修改单独 amendment，不能覆盖失败或追着结果改阈值。
3. **做最小正式工具链。** 保存 request_id 后提交 `image_open` → `image_frame` →
   按条件 `image_calibrate` → 一个明确 ROI 的 `image_fft` → 测量/信息/导出。
   下一步按问题和支持条件选择 F1、F2a、F3a 或 F3b，不要求全部运行。
   参数以当前 [image schema](../lib/image_workspace.mts)、[GPA](../lib/image_gpa_contract.mts)、
   [topology](../lib/image_topology_contract.mts)、[structure schema](../lib/structure_workspace.mts) 为准。
   calibration 改动须显式新修订、重绘和重测；复用未变的 FFT，不修改历史数组。
4. **至少一条有意义的反例或未判。** 可在同图预先指定混域/低信号/仅一条方向区域，
   检查是否保留 insufficient；或预注册一个错误界面方向，检验界面相容性是否拒绝。
   后者只是条件假设的否证控制，不是独立真实非孪晶负样品。
   若图中没有合适控制，可使用独立公开合成拒绝控制，但明确真实同图控制仍 NOT_TESTED。
5. **保存、恢复、独立复核。** 检查 JSON-RPC error 与 MCP isError；超时后只查询
   原 request_id（`image_result`/`structure_result`），不重放未知副作用。
   用新客户端恢复原对象，重开导出数组核对 dtype/轴/标定/有效掩膜和哈希，原图前后哈希一致。
   保留原始 JSON、NPY、CSV、全部未匹配反射、有效掩膜、预算（含失败尝试）、版本、
   request/object/calibration IDs 与参数；不要以 PNG 外观替代数组校验。
6. **冻结输出后解封参照。** 将 A/B/C 各自结果写入全新 verdict 副本并引用证据。
   PASS、FAIL、NOT_TESTED 各自限定范围；保留物理 UNDETERMINED/条件性 compatible。
   首次失败与纠正后的新尝试并存，不由后一次 PASS 覆盖。

| 层级 | 最小核对 | 不足时 |
| --- | --- | --- |
| A 工具执行 | 实际读原数组、原请求恢复、重开导出、源不变 | FAIL 或 NOT_TESTED；预检本身不证明 MCP 恢复 |
| B 几何/数值 | 独立标定/坐标检查、固定且有依据的容差、手算/独立代码或有文档方法对照；拟合点与留出反射分开 | 条件性自洽或 NOT_TESTED；另一软件同图热图只作方法对照 |
| C 独立物理解释 | 独立衍射/第二投影/堆垛依据、成像条件与歧义核查、盲验安排与参照来源 | 保持 NOT_TESTED/UNDETERMINED；A/B PASS 不能升级 C |

## 方法适用性先于 PASS

F1 可用于局部频谱/结构域候选，不命名物相。F2a 要求明确单域实空间图、已有
64–512 像素/轴的 **无窗** FFT、两组非共线 g、带来源的局部参考；Hann FFT 不合法。
未知物理标定最多得到图像坐标量；跨成分界面、扫描/厚度/离焦可引入伪应变。
GPA 几何相位不是重构图像本身的 phase 值。

F3a 使用同一 FFT/网格/metric/mask 的 saved `fixed_g` GPA，显式有方向的嵌套回路；
保留无效路径、零绕数和分组。零绕数不等于无缺陷，不能直接给唯一三维 Burgers 矢量。

F3b 仅限理想、满占位、单元素 conventional FCC4/diamond8、显式 Σ3 {111}、
有来源母晶取向的一次投影；需要独立物理尺度与有区分力的方向/反射。
不要用纯元素 CIF 替代实际多元素样品。取向/边缘投影假设和有限方向门槛照旧，
单方向、投影简并、缺界面/标定或超范围时保持 HOLD/insufficient。
预检 route_screening 只是声明筛查，不是科学资格；最终由正式工具验证。
有限 compatible 不是唯一三维孪晶或原子相干界证明。

参见 [开发状态](DEVELOPMENT_STATUS.md)、[F2a 验收](F2A_ACCEPTANCE.md)、
[F3a 验收](F3A_ACCEPTANCE.md)、[F3b 验收](F3B_ACCEPTANCE.md)、
[有限方向修正](F3B_REVIEW_CLOSEOUT.md)。不更改科学算法、容差、旧对象或冻结 R3 基线。

## 无实际数据的离线 dry-run

只用仓库已公开的 [F3b cosine fixture](../tests/fixtures/twin_f3b/README.md)：

```powershell
python -B tools/specimen_intake.py dry-run --case-dir private/specimens/public-dry-run-001
python -B tests/specimen_intake_test.py -v
```

dry-run 要求全新目录。生成合成 TIFF/CIF/truth、填好一个带负 Y/非方形标定的
synthetic manifest 并保存只读预检报告，不运行 FFT/GPA/diffsims，不接触私有样品。
重复运行拒绝覆盖。预检测试另覆盖截断、错误哈希/轴/选面/标定、权限、路径、
超预算、原/派生混淆、未知标定和可选 DM reader。成功仅说明准备逻辑可运行。

第二/第三个案例再补独立正例、普通非孪晶界面负例和应当未判对照；同预算比较
误报、未判率与端到端耗时，不能预设主动策略更优。本阶段没有真实样品或 GUI 验收。
