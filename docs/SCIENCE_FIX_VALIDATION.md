# 科学证据修复：实际验证与未完成边界

本文件记录实际执行，不把文献、代码审查或 existing tests 当作实验准确性证明。
方法选择见 [SCIENCE_FIX_LITERATURE.md](SCIENCE_FIX_LITERATURE.md)，独立
`gpt-6-astra` 的文献/实现审查见 [SCIENCE_FIX_INDEPENDENT_REVIEW.md](SCIENCE_FIX_INDEPENDENT_REVIEW.md)。
固定基准 SHA/tree 均在文献说明中。本 PR 是 #55/#56 之后独立的实现，不合并那些 PR。

## 可复现的独立验证

环境：独立 `.venv`，`uv pip install --python .venv/bin/python -r requirements-gpa.txt
-r requirements-structure-tools.txt`，`npm ci`。实际 Python 3.13.18、NumPy 2.5.4、
SciPy 1.18.1、scikit-image 0.26.0、ASE 3.29.0、diffsims 0.7.0；完整 freeze 在证据包。

```sh
.venv/bin/python tests/test_scientific_evidence_semantics.py
.venv/bin/python -m unittest discover -s tests -p '*domain_compare_test.py'
.venv/bin/python -m unittest discover -s tests -p 'test_image_gpa*.py'
.venv/bin/python -m unittest discover -s tests -p '*feature_field_test.py'
.venv/bin/python -m unittest discover -s tests -p 'test_image_topology*.py'
npm test
npm run typecheck
MICROSCOPY_PYTHON="$PWD/.venv/bin/python" npm run test:science
```

实际结果：新回归 **9 PASS**；local comparison **14 PASS**；GPA **28 PASS**；
feature field **6 PASS**；topology **54 PASS**，合计 **111**。
`npm test` **395 PASS / 5 SKIP / 0 FAIL**（400 项，含 build）；
typecheck、science smoke 均 PASS。五项跳过仍是跳过，未转述成通过。

新回归包含：23° 解析旋转与错误 held-out、0.02-bin 伪独立/近共轭、1-ULP
几何正例与独立性未判分离、精确 Friedel 拒绝、无 held-out、显式共同/部分相关
signed 标度、150,000 次独立前向 Monte Carlo、nm/Å/radian 与不同轴单位转换、
0°/180° 折叠、GPA 慢变及带外解析位移、保存的噪声/混合周期和旧比较读取。
Monte Carlo 的样本分布/种子在代码中固定；并非仪器噪声估计。

GPA 未变更数值内核，未把伪应变数组删去或改零。对于旧反例，改变的是可供
程序读取的物理证据状态和带宽解释；这不表示算法已经能识别所有噪声或分离叠层。

## 实际完整 worker 链与旧版本

`tests/fixtures/science_fix_saved.py` 来源于独立审查 #55 的解析 fixture；保留原
代码 SHA，只改目标仓库/输出选择，以及将条件几何断言适配到新字段。
不调用待测函数产生真值。每次保留 32 次实际 worker 原请求/输出/错误流和源数据。
同一组真实 worker 调用分别在未改生产源和当前生产源运行，均完成：

- open → orient → simulate → signed calibration → FFT → 实际峰测量 → register
  → compare → general_compare/twin_compare。
- +23° 正例、错误 parent/parent 候选、90° 错误迹线、跨模拟使用配准拒绝、
  错误 held-out 不改变 fit、冲突请求与结果恢复。
- 仅两个源余弦的 tetragonal 伪 held-out：原结果独立 pass=true；新结果
  geometry_pass=true、independent pass=null、status=insufficient_evidence。
  原角度与残差保持，不改采样/对应/容限。

在一个独立的、由原 worker 新生成的 synthetic legacy workspace 上，
`tests/fixtures/science_fix_history.py` 使用当前 worker 做 **17 次**恢复/读取/重复
原请求/新比较，验证 **5 个真实旧 register/compare** 原结果相同，
**619 个原始文件字节/哈希不变**。新 compare 使用旧 proposal 后保留历史 true，
嵌套与外层明确来源版本为 1，当前 independent_validation 仍不足。

复现时提供冻结旧源码的独立 checkout，不能把当前代码标作 legacy：

```sh
MICROSCOPY_TEST_REPOSITORY=/absolute/frozen-b6dd907-checkout \
MICROSCOPY_TEST_OUTPUT=/absolute/new-legacy-run \
  .venv/bin/python tests/fixtures/science_fix_saved.py
MICROSCOPY_TEST_OUTPUT=/absolute/new-current-run \
  .venv/bin/python tests/fixtures/science_fix_saved.py
.venv/bin/python tests/fixtures/science_fix_history.py \
  /absolute/new-legacy-run /absolute/new-history-check
```

另用当前 worker 只读访问 #55 当时生成的原始 GPA/read/local comparison，
**8 个旧对象**准确恢复，无新语义注入，两个旧 workspace 的 **172+85 个文件**
校验未变。缺标定的旧 incompatible 仍是原记录；新请求才返回未判。
CI 回归另覆盖版本专属重算、恢复与新 pixel/physical 请求，不依赖本机旧路径。

## 原失败、执行材料与审查纠正

原反例在 #55 中已保存。本次另对原生产源码运行新契约回归，保留 FAIL/ERROR
日志：既有行为不满足新契约，且当时有一个 NumPy scalar 不符合 JSON number
合同的测试输入错误。修复版初跑只有这个测试输入错误；随后仅将测试输入转为
Python float，原日志和初稿测试均保留，未放宽生产类型或数值容差。
这些缺字段/契约失败不能当作八个独立科学算法缺陷。

独立审查发现初稿的 geometry_pass 仍混入 1-ULP 独立性警告，已拆开并加入回归。
最后增加单位/各轴度量转换控制，九项新回归通过。所有旧输出保留。

精简原始证据和哈希在 [science_fix_evidence](science_fix_evidence/)：
原始执行日志/回归失败保留为 gzip，解压字节与清单 SHA 对照；关键原请求/输出
另存证据包，保留新旧值而不改旧结果。较大的生成数组/对象库保留在本 worktree
忽略目录 `analysis/scientific-evidence-fix/`；测试能在新目录重新生成。

## NOT_TESTED / 不声称已修复

真实样品/仪器准确性、噪声与叠层自动识别、完整畸变/定位协方差、概率覆盖率、
Atomap/峰对算法实际性能、动力学散射/图像传递恢复、三维唯一性、GUI 操作及模型
理解均 **NOT_TESTED**。这里没有宣称“科学问题全部解决”。
第一轮 #53 的占位丢失、重叠 GPA 拓扑证据重复计数、平坦谱舍入峰仍需各自修复，
本 PR 不对其静默改变算法或旧 v1/v2 语义。
