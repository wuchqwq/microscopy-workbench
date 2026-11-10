# 内部研究接续：复用导出与原工作区重开

本页是本轮源码只读核对与集成约束，不是新包原生验收通过报告。0.1.10 及旧证据冻结；所有新增操作仅在本轮隔离工作区进行。未调用模型、未改客户端或安全设置、未安装依赖。

## 已存在的导出能力与缺环

| 研究者要带走的内容 | 现有实现 | 不能声称的能力 |
| --- | --- | --- |
| 原图／ROI／带保存标注的测量图、科学数组与来源 | `tools/image_panel.mts` 的 `export` action → 原 `image_export`；`tools/image_workspace.py` export 分支 | PNG不是原数组，导出副本不是可继续分析的工作区保存 |
| HRTEM 保存频带比较 | `image_export` 已复制 `method-decision.json`、`peak-comparison.txt`、可用 PNG 和 provenance | 比较报告不包含父 GPA 全部幅值／mask 数组；需要时单独导出准确 GPA 对象 |
| STEM 预期位置证据及后续剖线状态 | `discovery_review` 导出已有 `discovery-review.json`、`candidate-review.txt`、`site-observation.json/.txt`、`site-continuation.json/.txt` | 研究者补充的预期位置、参考与条件不是自动发现；观察不确认元素／占位／缺陷 |
| 对应数值 | `ui/image-panel/measurement-workspace.mts` 的测量 CSV／TSV，`data-probes.mts` 的 `exportProfileCSV` 与 `profile-csv`；科学导出含 `statistics.json`、`statistics-comparison.json`、`profile.csv`、NPY | 组合图版不自动汇编任意测量表；不能从PNG反推科学数值 |
| 原图／ROI／测量标注图与剖面图版 | `figure-composer.mts` + 既有组合图版入口，2×2或1×3，SVG／PNG／`composition.json` | `composition.json` 依赖原工作区对象及干净底图，不是独立可携带的完整研究项目 |
| 单幅论文图 | `figure-export.mts` → `clean.png`、`annotations.svg`、`annotated.png`、`figure.json` | 配方和放大显示不增加分辨率，不替代科学数据与研究状态 |

现有主工具栏科学导出只导出 `current.object_id`。新增 HRTEM／STEM 结果卡片需要把**所选准确保存结果**交给同一个 `image_export`，保留 `journalCall` 原请求记录；无需另造格式、复制数组或重跑比较。`output_dir` 必须是现有父目录下的新子目录，已有目录或符号链接拒绝覆盖；禁止写入不可变 `objects/requests`。

## 关键条件、数值和历史能从哪里查

科学导出的 `manifest.json` 保存 `scientific_object`、`display_object`、`user_context`、`xy_calibration`、`calibration_review`、显示映射及文件SHA256。`provenance.json` 沿不可变父对象、比较输入、来源／标定链保存对象记录，当前有64对象上限；超过上限应报告，不截断成看似完整报告。

测量CSV含保存结果／原输入／原请求、源坐标、ROI、标定身份与修订、标定来源、当前／历史状态及数值。用户应在测量列表明确选行；若需要历史，先显式开启“包含历史版本”，不能把默认当前行导出称为全部历史。剖面CSV包含源坐标、数组索引、距离／物理单位、样本值、dtype、结果／请求ID及采样方式；没有物理标定时不应制造物理轴。

支持范围与缺失条件优先复用 HRTEM `peak-comparison.txt`、STEM `candidate-review.txt`／`site-observation.txt`／`site-continuation.txt`，不靠手写解释替代 provider 原结果。应一并保留示例条件、人工来源声明及准确引用对象。图版可帮助阅读，但完整条件与未验项仍见这些报告和数值记录。

## 最小研究记录操作与证据

1. 在本轮隔离分析工作区打开已保存的原图、ROI及测量标注视图，检查准确来源和标定；保存明确研究条件与人工修订。
2. 从新接续面板查看准确 HRTEM 比较或 STEM 预期位置结果。通过同一 `image_export` 导出准确结果；若需要数组，另导出实际原图／ROI／GPA对象，不把报告副本当数组全量备份。
3. 用既有测量CSV、剖面CSV和组合图版生成一条可读研究记录。1×3可用原图、ROI／测量标注图和剖面；2×2可增加另一个明确保存视图。不要为了凑槽位新增科学计算。
4. 下载并保留 `composition.json`，正常保存**分析工作区**，记录save_id、对象ID／原请求ID和科学文件哈希，再正常退出并核对关联后台。
5. 在同一原位置重开工作区，从已保存入口重新查看HRTEM／STEM结果；再导入 `composition.json`，用 `/api/composition/resolve` 只读核对原对象、calibration/grid、PNG哈希，恢复布局不覆盖当前图像或草稿。
6. 再次显式导出到新的目录。新的 `image_export` 会有新的导出请求记录，但查看、布局恢复和导出不得新增FFT／GPA、统计、剖面或review科学请求。逐项比较原结果和引用、CSV／报告字节、原科学文件哈希；不能要求两个导出操作的请求ID相同。

原位置重开／组合图恢复的实际 GUI PASS/FAIL/NOT RUN 由主集成验收记录，本页不替代实机。已保存报告历史、旧参考和旧剖线不能被新的补充证据覆盖。

## 持久化集成注意

本轮最小方案不新增study槽：已完成的统计／discovery／review及比较结果由原provider对象和原请求日志持久保存；新只读catalog在同原工作区重建并用 `image_info` 重新核对，不声称它们已作为新的AnalysisWorkspace采用状态写入savepoint。未提交表单、菜单选中和计划不能称自动保存。条件不足的可继续状态必须来自明确保存的provider结果，或明确标为尚未提交，不能依赖内存冒充持久化。

`lib/panel_research_catalog.mts` 只扫描原请求／原manifest，最多8192请求和256候选；原manifest哈希、原journal和新provider读取须一致；不存在／损坏／未完成／超预算保留unavailable原因，不调用科学写工具。菜单可让用户选择命名保存结果，免手抄ID；重开菜单不重放已完成请求。

如果以后选择新增study，`lib/analysis_workspace.mts` 的 `analysisContent` 显式枚举语义内容，必须接入内容摘要、checkpoint、保存和恢复，不能只在前端内存保留。`referenceIds` 递归收集 `object_id`、`*_object_id`、`calibration_id`，命名为普通 `id`、`statistics_id` 的引用不会自动收集，需精确处理。未知请求只查询原ID，不重新提交来制造恢复成功。

组合图目前是前端布局，分析工作区“保存”不等于自动保存图版；须下载JSON再在原工作区导入。显示配方恢复可按既有入口产生新的显示版本，但不会新算FFT／测量。导出副本可带走阅读；可继续分析需保留原工作区及其对象、请求和保存点。

## CIF依赖：本轮确实缺失，入口禁用

2026-11-10 用冻结0.1.10包内Python执行仅查询命令（`-B`，`PYTHONNOUSERSITE=1`，`PYTHONDONTWRITEBYTECODE=1`），`importlib.util.find_spec` 对 `ase` 和 `diffsims` 都返回不存在；两者版本均为null。没有安装或修改运行包。

`requirements-structure-tools.txt` 要求 `ase>=3.26,<4` 与 `diffsims==0.7.0`。`lib/panel_cif_candidates.mts` 构造器实际同时检查两个模块及固定diffsims版本。`ui/image-panel/cif-candidates.mts` 根据 `provider.available===false` 禁用导入与比较，并显示缺依赖通知。这是明确缺依赖／禁用，不只是“尚未全面测试”。新候选若复用同一Python，仍需主集成确认其实际通知；本轮不安装，不新增结构算法或自动索引。

## 可复用的针对性测试

- `tests/test_hrtem_stem_review_integration.py`：既有combined report → 用户显式profile → 接回原review → 精确文本导出 → 原ID读取；测试通过mock拒绝额外FFT/GPA与S2调用。其历史或本轮执行状态须另列，不把源码存在当本轮PASS。
- `tests/test_hrtem_baseline_closeout.py`：既有六类报告、导出哈希、原结果重开与不可覆盖目标目录。
- `tests/figure-composer*.test.mjs`：已有对象／校验、全部槽位、恢复顺序与导出边界。
- `tests/measurement-workspace-ui.test.mjs` 与 `tests/image-panel-data-probes.test.mjs`：既有CSV与当前／历史状态。

本次子任务新增只读catalog、针对性journal/hash合约测试和本页文档，没有改算法、共享入口、版本或持久化代码；未构建、未跑测试、未运行GUI。主任务统一构建与执行 `tests/panel-research-catalog.test.mjs`，针对实际集成变更选必要回归，不需要重跑无关全套科学测试。
