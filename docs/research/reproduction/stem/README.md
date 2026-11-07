# STEM 原样复现源档案

这是事后整理的六文件原样归档，供未来重建数据使用；不是预注册，也没有运行生成器、审计、模型、测试或安装。来源均属于历史候选 `03ea9534c34e606295b851637d6e9e03b35bcab5` 的独立实验材料。未修改科学代码、参数或协议。逐文件来源、字节数和 SHA-256 见 [manifest.json](manifest.json)，六个源/副本哈希均相同。

完整人工检查、受限字段扫描和独立复核未发现用户绝对路径、内部会话正文/ID、凭据或原私有日志路径。官方 PyPI HTTPS 地址为协议公开来源。此结论仅覆盖这六个文件；未来生成的请求日志、执行元数据和异常 traceback 可能包含运行机器路径，不能自动一起公开。

## 文件与依赖

| 文件 | 用途 |
|---|---|
| `physical/run-03/simulate-r3.py` | 原物理生成器，原 SHA-256 `e35499c9881d2fe0d1487a68c5f2d7b8c8699c5e50f30039ce75acd27bab83fb` |
| `physical/run-03/protocol.json` | 同目录冻结协议，原 SHA-256 `d04fcc2dd57b090ad97370edc605c95801554496d2371ccd42f115c9a99382d2` |
| `physical/audit-physics.py` | 对生成后的数组、结构和收敛结果作独立复算；会写审计结果 |
| `physical/versions.txt` | 原 64 包版本记录，无本地路径或私有包地址 |
| `point/run-controls.py` | 原 39 组固定位点高斯强度代理生成和 worker 对照 |
| `point/frozen-protocol/controls-plan.json` | 原代理计划，故意与生成器分目录保存 |

物理环境记录为 Python 3.13.2，官方 PyPI binary wheels，abTEM 1.0.11、ASE 3.29.0、NumPy 2.5.4、SciPy 1.18.1、pyFFTW 0.15.1、Dask 2026.8.0、tifffile 2026.10.15 等；精确列表见 `physical/versions.txt`。这是独立实验环境，不改变产品依赖。

点代理需完整项目 checkout 的 `tools/image_workspace.py` 和 `tests/preview_test_support.py`，本归档不另复制工具引擎。使用精确候选 03ea 的 `requirements-images.txt`：NumPy >=1.23,<3，Pillow >=10.1,<13，tifffile >=2023.7.10,<2027，SciPy >=1.10,<2。物理版本记录含 Pillow 13，不能直接当作点代理产品环境的已验证替代。所选六文件没有原点代理环境的精确全量锁文件，这是保留的复现缺口。

## 未来运行必须使用 fresh copy

**不要在本 staging、原证据目录、受版本控制的 checkout 或任何已有输出目录执行。** 先复制需要的源文件到另一个全新可写目录，记录新环境和新执行；下面仅说明布局和未来命令，本轮没有执行。

物理 fresh copy 保持：

```text
fresh-physical/
  audit-physics.py
  versions.txt
  run-03/
    simulate-r3.py
    protocol.json
```

生成器以脚本目录为 ROOT，CWD 不影响输出位置；`protocol.json` 必须和脚本同目录。未来可用独立环境的 Python 执行 `run-03/simulate-r3.py`；随后在该新副本执行 `audit-physics.py`，默认审计其旁的 `run-03/`。审计需要完整生成输出，六个源文件本身不足以审计历史结果。

生成器创建 `assessor/`、`raw/`、`potentials/`、`controls/`，保存结构真值、数组、势场、噪声、收敛结果及 execution/events/summary/failure JSON。已有 `assessor/` 时明确拒绝；其他残留目录也可能导致 mkdir 失败。JSON 结果使用覆盖写，events 使用追加。审计器**没有覆盖保护**，会写 `run-03/assessor/physical-audit.json`；只在新生成结果副本上使用。

`protocol.json` 的 blind_host 是历史计划字段，两份 Python 源均不发起模型调用。原物理正式盲检因数值门失败保持 NOT_TESTED。源代码保留原 225 点、10% 门槛和原科学参数；新执行结果不能替换或抹除历史 run-03 的 10.034456% FAIL。

点代理 fresh copy 需如下兄弟目录：

```text
fresh-point-parent/
  point-observation-fix/        # 完整项目 checkout，精确03ea候选
  point-observation-evidence/
    run-controls.py            # 仅复制这个生成器；不要预放controls-plan.json
```

原代码从脚本父目录下的 `point-observation-fix/` 导入 worker 和测试支持。它会自行写 `controls-plan.json`；同目录已经有该文件就立即拒绝，因此冻结计划单独保存在 `frozen-protocol/`，不应复制进新运行目录。生成器还会创建 `inputs/`、`assessor/`、`controlled-provider/`，写调用 JSONL。新计划可与归档计划比较，但不为使哈希或结果相同修改代码/参数。

点代理为固定 ROI 标量高斯强度对照，目标和参考由评估者给定；不是物理 STEM、自动位点搜索或盲检识别率。没有复制任何模型启动脚本、会话、原私有日志或既有生成数组。未来运行需要另行记录结果与环境，这次归档没有新增科研执行。
