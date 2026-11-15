# 复用 PtyRAD 官方入门工作区

## 确认工具和版本

2026-11-15 核对作者仓库 `chiahao3/ptyrad` 的 `1ee8e51ca87cbcbe84fd5ace021315fbd92e05f5`：这里的入门工作区是 **starter kit + Jupyter notebooks + YAML 模板**，不是独立网页重构 GUI。作者另一个 [zoner](https://github.com/chiahao3/zoner) 是晶体倾转/带轴和衍射可视化工具，不替代 4D-STEM 重构或真值验证。若用户指的是其他新工作台，先核对链接，不把二者混为一谈。

以下是该版本的可核对入口；执行前以实际安装版 `ptyrad --help`、模板及源码为准，不在正在运行的环境里顺手升级依赖。

## 从新目录开始，不覆盖旧实验

在已配置的 PtyRAD 环境中，使用尚不存在的实验目录名：

```bash
ptyrad --help
ptyrad check-gpu
ptyrad init ptyrad-study
cd ptyrad-study
```

`init` 复制安装包自带的 `data/`、`notebooks/`、`output/`、`params/`、`scripts/`。**不要使用 `--force` 刷新现有研究目录**：已核对源码会先 `shutil.rmtree(dest)` 删除整个目标，再复制，而非仅更新模板。已有项目应在新目录导出，比较后只移入需要的文件。

- `params/templates/`：minimal、standard、advanced、full。从适用模板复制实验 YAML，不编辑唯一原模板。
- `params/examples/`：PSO、tBL_WSe2 演示配置。里面的数据路径、翻转、扫描步长、层距等不能直接当作自己的标定。
- `params/walkthrough/`：按需阅读单层、多层、恢复、深度重采样、探测器重采样、结果格式、超参搜索等例子，不必依次跑完。
- `scripts/download_demo_data.py`：官方演示数据下载，README 标注约 1.3 GB。只有需要隔离环境问题且磁盘/下载范围合适时才下载；正常处理自有数据不需要这一环。

## 两个入口用同一套有效配置

**交互入口**：`notebooks/run_ptyrad.ipynb`。先修改示例中的 `work_dir` 为自己工作区绝对路径，选择安装了 PtyRAD 的 notebook 内核，再检查 `params_path` 和设备。该 notebook 使用 `load_params(..., validate=True)`、`PtyRADSolver(...).run()`，不是另一种重构算法。保留参数校验，不为绕过报错轻易关闭它。

**批处理入口**：在相同工作目录、环境与配置下使用：

```bash
ptyrad validate-params params/my-study.yaml
ptyrad run params/my-study.yaml --gpuid 0
```

运行授权、GPU 可用性与耗时另行确认。`check-gpu` 只是环境诊断，不能代替实际 GPU 前向/反传和小试。保存实际解析后的参数与默认项、版本/源码提交、输入指纹、随机种子、设备、输出路径和日志；不要只保存手写 YAML。不要把 notebook 临时修改和批处理配置当成相同对照。

## 多层不是只改层数

官方 `01_multi_slice.yaml` 明确把深度正则视为稳定多层重构的重要环节；所核对版本在多层时默认启用 `obj_zblur`（除非显式关闭）。它沿 z 用 Gaussian 核建立层间联系，是模型先验/约束，不是显示后处理，也不等于数据已经提供独立深度信息。

核对实际生效的 `start_iter`、`step`、`end_iter`、`obj_type`、`kernel_size`、`std`，并记录是否同时作用于幅度和相位。`std` 的单位是**层**；换物理层距后，同一个数不代表相同物理平滑尺度。有限离散核的实际权重也要查，不仅记录 `std × 层距`。重采样层数或恢复训练时重新核对调度、层距及约束应用位置。

模板的样品经验值不是普适最优值。研究局部突变时区分整体拟合、局部对比与逐层误差；平滑/无平滑或不同调度的对照只改变明确因素，固定其他条件。不能将低训练 loss、清晰相位或平滑后的外观单独解释为真实三维结构恢复。

## 读回结果再解释

复用 `read_ptyrad_output_hdf5.ipynb` 与 `get_reconstruction_provenance.ipynb`。后者演示 `load_ptyrad`、`load_provenance_from_h5` 和 `export_hdf5_provenance_to_json`。核对对象/探针/位置、层数、尺度、迭代与运行来源；旧文件可能没有完整 provenance，缺失时标明，不补造。

按问题选用 `get_error_distribution.ipynb`、`get_affine_from_image.ipynb`、`get_local_obj_tilts.ipynb`，先读其输入和假设。输出的拟合/倾角候选仍需同区与独立证据检查。与本 Skill 的 [工作流](workflow.md) 和 [诊断](diagnostics.md)配合，不以工具运行成功代替物理验收。

## 一手来源（固定核对版本）

- [官方 README / Quickstart](https://github.com/chiahao3/ptyrad/blob/1ee8e51ca87cbcbe84fd5ace021315fbd92e05f5/README.md)
- [工作区初始化与覆盖行为](https://github.com/chiahao3/ptyrad/blob/1ee8e51ca87cbcbe84fd5ace021315fbd92e05f5/src/ptyrad/cli/templates.py)
- [官方 notebooks](https://github.com/chiahao3/ptyrad/tree/1ee8e51ca87cbcbe84fd5ace021315fbd92e05f5/src/ptyrad/starter/notebooks)
- [多层 walkthrough](https://github.com/chiahao3/ptyrad/blob/1ee8e51ca87cbcbe84fd5ace021315fbd92e05f5/src/ptyrad/starter/params/walkthrough/01_multi_slice.yaml)

以上是文档与源码核查，不代表本次运行了官方演示或完成 GPU/真实样品验收。
