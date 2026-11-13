# PtyRAD 重构诊断工具

在这个目录下运行示例。`scripts/ptyrad_check.py` 提供衍射盘、旋转候选和相位层间位移三个命令，输出可复查的 JSON。用户和 Skill 使用同一入口。原始数据、候选方向和相位数组由用户提供。具体怎样从测量结果选参数见[工作流](references/workflow.md)。

## 用现有安装器复制 Skill

准备带 npm 的 Node.js 22 或 24，以及已经审阅并校验 SHA-256 的 `microscopy-scientific-skills` 本地压缩包。先用 `--list` 确认包里有 `ptyrad-reconstruction`。以下 Windows PowerShell 示例在压缩包所在目录运行，目标设为临时目录。路径变量可换成自己客户端实际使用的 Skills 目录。

```powershell
$asset = (Resolve-Path -LiteralPath '.\microscopy-scientific-skills.tgz').Path
$target = Join-Path $env:TEMP ('ptyrad-skills-' + [guid]::NewGuid())
npx.cmd --yes --ignore-scripts --offline --package="$asset" microscopy-skills --list
npx.cmd --yes --ignore-scripts --offline --package="$asset" microscopy-skills --skills-dir "$target" --dry-run
npx.cmd --yes --ignore-scripts --offline --package="$asset" microscopy-skills --skills-dir "$target"
```

macOS 和 Linux 用 `npx`，传同样的本地包绝对路径和目标路径。也可以解开可信压缩包，运行 `node package/install.mjs --skills-dir <目标目录> --dry-run`。安装器复制清单里的所有 Skill 和支持文件。Python、GPU 环境、凭据及实际重构按下文和研究流程另行准备。

同名目录默认导致安装停止，用户已有文件保留。需要替换包所管理的同名目录时，在命令末尾加 `--existing-skills backup`。旧目录移到目标的同级备份目录，可按安装器打印的路径找回。仅卸载 PtyRAD 时，将目标目录中的 `ptyrad-reconstruction` 整个移到发现目录之外，再刷新客户端。要恢复更新前的副本，可把备份里的同名目录移回原位。其他 Skill 和共享参考目录仍由各自的使用情况决定。

仓库克隆中的压缩包位于 `packages/skills/microscopy-scientific-skills.tgz`。通过 GitHub 安装时，`--package` 使用已审阅且含有 PtyRAD 的固定提交资产 URL，去掉 `--offline`。 [Microscopy Workbench 仓库](https://github.com/wuchqwq/microscopy-workbench)

## 准备 Python 依赖

用自己选定的 Python 环境安装所需的库。旋转候选和标尺换算只用 Python 标准库。

```powershell
python -m pip install numpy scipy
python -m pip install h5py
python -m pip install ncempy
python -m pip install tifffile
```

`h5py` 用于 HDF5，`ncempy` 用于 DM4，`tifffile` 用于多页相位 TIFF。只处理 NPY 时可省略这三项。依赖按命令和文件格式加载，缺少相应库会给出提示。用 `python scripts/ptyrad_check.py --help` 或 `python scripts/ptyrad_check.py disk --help` 查选项。默认把 JSON 写到终端。若要保存，像下面一样在子命令前加 `--output 路径`，文件需是新路径，父目录应已存在。

## 从原始 4D-STEM 检查明场盘

把下面的文件名、对象编号、扫描尺寸和 ROI 换成实际数据。`scan4d` 的数组轴是 `[扫描 y, 扫描 x, 衍射 y, 衍射 x]`。`flat3d` 的轴是 `[扫描点, 衍射 y, 衍射 x]`，扫描 x 先变，`--scan-shape` 顺序为扫描 y、x。ROI 参数依次是 `Y0 Y1 X0 X1`，从 0 开始，上界不包含。原始 NPY 也可用相应布局读取。

```powershell
python scripts/ptyrad_check.py disk "STEM SI.dm4" --list
python scripts/ptyrad_check.py --output disk.json disk "STEM SI.dm4" --dset 2 --layout scan4d --roi 80 144 16 80 --arrays disk_arrays.npz --virtual-annulus 100 120
python scripts/ptyrad_check.py --output disk_h5.json disk scan.h5 --key /dp --layout flat3d --scan-shape 400 200 --roi 80 144 16 80
```

`--list` 也可用于 HDF5 和 NPY。它列对象或数据键、形状、dtype，轴含义仍须从采集记录核对。盘报告的 `fit_status` 可为 `CANDIDATE` 或 `NOT_IDENTIFIABLE`。把候选 `center_xy_px`、`radius_px` 和 `fit` 中的残差与均值盘叠看。重叠盘附近可按已见盘缘用 `--center-xy X Y`、`--radius-range LO HI` 或 `--radius-hint R` 缩小或引导搜索。奇偶扫描行的比较提供内部重复性检查。

`--arrays` 保存 `mean_dp`、`virtual_total` 和原始像素索引。有拟合候选时还给 `virtual_bf`。需要观察环形虚拟像时加 `--virtual-annulus INNER OUTER`，按本数据的探测角域选半径，单位为像素。环以显式 `--center-xy` 或拟合中心为圆心，输出 `virtual_annulus`。示例中的 100–120 只是输入写法。

盘心为 `[x,y]`，单位是衍射像素。绝对标尺需要独立信息。比如盘半径约 94.4 px，且有可信 `dk=0.01012653 Å⁻¹/px` 和 300 kV 电压，可以做如下换算。

```powershell
python scripts/calibration_math.py --voltage-kv 300 --bf-radius-px 94.4 --dk-angstrom-inv-per-px 0.01012653 --grid 256 512
```

## 比较扫描旋转和镜像候选

在同一 ROI 的 ADF 或虚拟扫描图上取 FFT 方向。在均值衍射图中找对应的反射盘方向。两侧都以各自中心为原点，统一成 y 向下、x 向右。若横纵像素步长不同，先换成各自的物理向量。扫描图 FFT 的频率间隔是 `1/(N×扫描步长)`，探测器方向由反射中心减盘心得到。至少需要两条有依据的非平行对应。可把另一组对应留作核查。

可用已有 ADF 图，或在 Python 里查看前一步的均值盘和环形虚拟图 FFT。下例的显示需要 `matplotlib`。

```python
import json
from pathlib import Path

import numpy as np
from matplotlib import pyplot as plt
from matplotlib.patches import Circle

report = json.loads(Path("disk.json").read_text(encoding="utf-8"))
with np.load("disk_arrays.npz") as arrays:
    dp = arrays["mean_dp"]
    scan = arrays["virtual_annulus"]
window = np.outer(np.hanning(scan.shape[0]), np.hanning(scan.shape[1]))
scan_fft = np.abs(np.fft.fftshift(np.fft.fft2((scan - scan.mean()) * window)))
fig, axes = plt.subplots(1, 2)
axes[0].imshow(dp, origin="upper")
if report["fit_status"] == "CANDIDATE":
    axes[0].add_patch(Circle(report["center_xy_px"], report["radius_px"], fill=False, color="cyan"))
axes[1].imshow(np.log1p(scan_fft), origin="upper")
plt.show()
```

每组 `--pair` 顺序是 `SCAN_Y SCAN_X DET_Y DET_X`。下面用已知顺时针 90° 的示例向量说明格式。用真实数据时填中心相对向量，方向的长度尺度在同一坐标系内应一致。

```powershell
python scripts/ptyrad_check.py --output rotation.json rotation --pair 0 1 1 0 --pair 1 2 2 -1 --check-pair -1 2 2 1
```

报告包含直接旋转和先对扫描 x 镜像再旋转两种候选，以及拟合和留出方向的角度残差。默认按无向线计算，每种手性保留相隔 180° 的解。有可追踪的有向对应时才用 `--oriented`。这里报告的是扫描方向到探测器方向的几何映射。应用到 PtyRAD 前要按实际轴、仿射和镜像约定核对。单张衍射盘没有扫描坐标，无法独立给出这项旋转。

## 从已有多层相位测倾角

输入定量相位 `[Z,Y,X]` 的 NPY，或单通道的多页浮点 TIFF。用对应检查点中的实际 `dx` 和层间距换算成 nm。`--z-range` 按原生深度索引从 0 开始，上界不包含。ROI 可重复指定，选择同一晶柱或哑铃能跨层跟踪的区域。

```powershell
python scripts/ptyrad_check.py --output tilt.json tilt phase_stack.npy --dx-nm 0.01470 --dz-nm 1.0 --z-range 11 29 --roi 24 112 24 112 --roi 24 112 150 238
```

报告给出每个 ROI 中深层相对浅层的 `[y,x]` 横移、随 Z 的斜率和 mrad 候选。`--max-step-px` 限制相邻层每轴搜索位移，`--band-nm-inv LOW HIGH` 可用已知晶格频带复核，单位 cycles/nm。检查各 ROI 的 `status` 和 `flags`，特别关注搜索触边、周期歧义和弱信号。若源模型已有倾角，先把测到的量视为当前模型的残余斜率，再结合原角、原生轴和深度方向判断总倾角。物理结论需要结构可辨、合理的配准和同区前向评价。详见[倾角诊断](references/diagnostics.md#按需估计和验证对象倾角)。

这套 CLI 读取数据、测量和输出证据。确定几何候选、生成或修改 PtyRAD YAML，以及执行重构，是[后续工作流](references/workflow.md#4-配一套基线并短跑)中的步骤。只有图像和相位堆栈时可以做测量，实际重构需要逐扫描点的原始衍射数据。

## 复现 CPU 自测

```powershell
python scripts/smoke_check.py
```

自测会把随附 CLI 复制到临时目录，在那里生成小型数据并验证真实命令。检查盘中心、半径、ROI 读回、旋转和镜像候选、已知层间位移、空相位和输出保护。可选格式依赖齐全时也会测试 HDF5、DM4 和 TIFF，缺哪个会打印 `SKIP`。结果是合成样本的输入、输出和符号检查。
