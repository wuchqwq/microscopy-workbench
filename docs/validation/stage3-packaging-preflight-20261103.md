# 阶段三打包前期核对：2026-11-03

关联 [打包 ADR](../WINDOWS_PACKAGING_ADR.md) 和 [#92](https://github.com/wuchqwq/microscopy-workbench/issues/92)。源码 `00b84ae589bd581511380c4ac053841b06a7546d`。本记录为文档/只读探针范围，不是安装包、干净 Windows 或科学准确性验收。未读取私人样品，未下载运行时/wheel，未安装、修改系统配置或触碰用户试用窗口。

| 核对项 | 结果 | 范围 |
| --- | --- | --- |
| 现有入口/运行资源 | PASS（源码核对） | 28 个固定源码/清单文件各记录 SHA256；10 项合同检查：Electron lock、普通 Node guard、固定 backend 路径、真实 Python/probe 路径、源码 hash、DM policy、正式 build 资源及尚缺 packaged argv adapter。字符串/文件核对不证明可执行闭包完整 |
| 本机科学环境元数据 | PASS（读取范围） | Python 3.13.2 amd64；NumPy 2.5.4、SciPy 1.18.1、Pillow 12.3.0、tifffile 2026.10.15。未导入科学包或执行图像计算。可选 RosettaSciIO/scikit-image/ASE/diffsims 没有安装，不把它们写成发行能力 |
| 元数据探针首次尝试 | TEST_INFRA_FAILURE，保留 | 首次脚本错误假定非基础依赖 ncempy 已安装，`PackageNotFoundError` 使探针中止；工具 transcript 保留。后续改为枚举 metadata、缺依赖明确 NOT_INSTALLED；没有改产品、安装包或将首失败覆盖为 PASS |
| 官方分发事实 | PASS（资料核对） | 2026-11-03 浏览 Electron 45.2.1 / Node 24.22.2、Python 3.13.17/3.13.18/3.14.10 官方发布与 embedded/venv/ASAR/PyInstaller 文档；具体链接在 ADR 就近列出。文档说明不等于实机行为 |
| PyPI wheel 元数据 | PASS（发布元数据存在） | 四个确切顶层版本在官方 JSON 中列出非 yanked cp313/标准 GIL cp314 amd64 wheel 或纯 Python wheel，记录其发布 SHA256。未下载验证实际文件、未解压、未解析全部传递依赖或执行 import；不能据此称 runtime lock/closure 已认证 |
| VM 只读可用性 | NOT_TESTED（干净机）；有限发现已完成 | PATH 未发现 VBoxManage/vmrun/Get-VM；常见 VirtualBox/VMware/Hyper-V module 固定路径均不存在。没有查询需提升权限的 feature、改注册表/系统设置、启动 VM 或推断其他位置无 VM |
| 新目标解释器/Node/科学包 | NOT_TESTED | 首探针 3.13.17 embedded、后备 3.14.10 embedded、24.22.2 普通 Node 和对应 wheel 均未在本轮下载、安装或运行；原开发环境成功不能替代；没有把任一版本设为发行锁 |
| 目录包 / 独立已分发 CLI / 干净 Windows / 离线 / 升级及移除 | NOT_TESTED | 尚未创建产物，无 exe/ZIP hash、签名、安装或退出/恢复实测；没有把开发机原型的旧证据改写为本轮通过 |

原始只读探针文件在本机隔离的 `packaging-evidence-20261103` 中保留：`source-inventory.json`、`local-runtime-metadata.json`、`metadata-first-failure.json`、`wheel-metadata-313.json`、`wheel-metadata-314.json`、`vm-availability.json`。不将宿主路径、原始日志、二进制或私人数据纳入仓库。

官方 wheel 元数据入口：[NumPy 2.5.4](https://pypi.org/pypi/numpy/2.5.4/json)、[SciPy 1.18.1](https://pypi.org/pypi/scipy/1.18.1/json)、[Pillow 12.3.0](https://pypi.org/pypi/pillow/12.3.0/json)、[tifffile 2026.10.15](https://pypi.org/pypi/tifffile/2026.10.15/json)。发布 hash 只是来源元数据；正式构建还须对取得的每份文件重新校验。

命令范围：`node audit-packaging-sources.mjs` 仅读取固定仓库文件并写外部 inventory；指定本地 Python 以 `-I` 读取 `importlib.metadata`；PowerShell `Get-Command`/固定 `Test-Path`，以及官方 PyPI HTTPS GET。文档提交只检查格式、链接和合同，不重复 Node/浏览器/科学大套件，不手动重跑已通过 CI。
