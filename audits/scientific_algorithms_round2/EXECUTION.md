# 第二轮实际执行记录

源码和 tree 见 [主报告](ALGORITHM_AUDIT.md)。这份记录不是测试计划。
所有运行在独立 worktree 内，Python 为本地 `.venv/bin/python`。
使用 `uv venv .venv`，随后安装 `requirements-gpa.txt` 与
`requirements-structure-tools.txt`，`npm ci`。实际依赖完整记录见
[packages.txt](evidence/packages.txt)；NumPy 2.5.4、SciPy 1.18.1、
scikit-image 0.26.0、ASE 3.29.0、diffsims 0.7.0。

| 实际命令/组 | 结果 | 原始记录 |
|---|---|---|
| `.venv/bin/python audits/scientific_algorithms_round2/probe_gpa_uncertainty.py` | 7 组观察检查完成，0 harness/assertion failure；包括 6 个带宽设置、20 个固定噪声种子、200,000 次误差采样 | [完整概要](evidence/gpa-summary.json)、[原请求与输出哈希账本](evidence/gpa-request-ledger.json) |
| `.venv/bin/python audits/scientific_algorithms_round2/probe_missing_calibration.py` | 第一轮 A02 在同一 main 重现；不是新增发现或“预期正确行为” | [概要](evidence/missing-calibration-summary.json)、[完整原请求/比较输出](evidence/missing-calibration-original-comparisons.json) |
| `.venv/bin/python audits/scientific_algorithms_round2/crystal/probe_saved_crystal.py` | 完成 32 次原始 worker 调用；正例、错误候选/迹线、held-out 反例 | [独立报告](crystal/REVIEW.md)、[概要](crystal/evidence_summary.json) |
| `probe_admission_controls.py <main-run-directory>` | 18 次控制调用：缺/错尺度、旧配准、共轭、退化、无 held-out、单族 | 同上，完整记录在 `crystal/evidence/` |
| `probe_tolerance_sweep.py <main-run-directory> <controls-directory>` | 五个预先声明容限、固定错误尺度源；实际调用与结果见脚本及原报告 | `crystal/evidence/`，不作为独立统计验证 |
| `npm test` | 400 项：395 PASS、5 SKIP、0 FAIL | [原日志](evidence/npm-test.txt)；包含 build |
| `npm run typecheck` | PASS，exit 0 | [原日志](evidence/typecheck.txt) |
| `MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:science` | PASS，exit 0；signed calibration→FFT→测量→导出/direct DFT→重启恢复 | [原日志](evidence/science.txt) |
| `.venv/bin/python -m unittest discover -s tests -p 'test_image_gpa*.py'` | 28 PASS | [原日志](evidence/gpa-unit.txt) |
| 同上，`-p 'test_crystal_qualification.py'` | 11 PASS | [原日志](evidence/crystal-unit.txt) |
| 同上，`-p 'test_twin*.py'` | 35 PASS | [原日志](evidence/twin-unit.txt) |

`PASS` 对审查脚本的含义是“声明的数值检查或边界反例被复现”，不是“算法对该数据
有物理准确性”，更不是已修复。例如缺标定得到 incompatible 是被成功保存的失败结论。
现有测试与独立探针分开统计，不能用测试总数替代科学覆盖率。

原始完整存储（TIFF/NPY、manifest、对象、原始请求/输出）保留在忽略目录：

- `analysis/algorithm-audit-round2-gpa-1793547814561473000/`。
- `analysis/algorithm-audit-round2-missing-calibration-*`，具体路径见概要。
- 晶体主运行 `analysis/algorithm-audit-round2-crystal-20261101-234148/`，
  以及独立 controls/sweep 目录，精确路径和 SHA 见独立概要。
- `analysis/algorithm-audit-round2-checks/`：全部实际终端测试日志。

[raw-artifact-hashes.json](evidence/raw-artifact-hashes.json) 固定主审完整 summary、
requests 与执行日志的原字节 SHA256。request-ledger 保留每个原请求、对象身份和文件
哈希；`response_sha256_canonical` 以 JSON `sort_keys=True,separators=(',',':'),
ensure_ascii=False` 编码，不冒充原字节哈希。GPA summary 保留反例的原 report、
数组哈希和解释；所有合成源文件运行后再次校验未变。

晶体目录另保存字节不变的反例请求、worker response、journal、报告与哈希清单；
617 个已记录主运行文件在后续 controls 后校验未变。大数组不提交 Git，脚本能
在新目录重新生成；输出对象 ID/时间戳会变化。

失败尝试没有删除：晶体第一次使用不支持的 float64 TIFF，第二次使用超出有界
UVW 合同的 100；旧脚本和错误响应保留于原目录。随后仅调整测试输入格式/索引到
接口允许范围，在新目录执行，未改生产阈值。主审 `python -m pip freeze` 因 uv
环境没有 pip 失败，改用 `uv pip freeze --python .venv/bin/python` 成功；这是环境
枚举问题，不是科学测试失败。科学探针首轮全部完成。

NOT_TESTED：跳过的 5 项、真实样品/仪器、GUI/真实模型会话、完整 MCP 传输、
统计覆盖率、动力学模拟等，不从这些日志推断已验证。范围详见主报告。

交付检查：所有提交的 JSON/gzip 可解析，探针 Python 语法和报告相对链接检查通过，
原始源码目录相对于固定 SHA 没有差异。`git diff --check` 唯一提示为原始
`evidence/typecheck.txt` 日志末尾空行；为保留原日志字节未作格式化，非代码错误。
