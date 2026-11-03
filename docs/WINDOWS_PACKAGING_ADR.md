# Windows 目录分发与独立 CLI：阶段三 ADR

状态：**提案，待审阅；不是安装包或发行资格**。2026-11-03，关联 [#92](https://github.com/wuchqwq/microscopy-workbench/issues/92)。审计源码 `00b84ae589bd581511380c4ac053841b06a7546d`，其生产代码为 `3d530db…`；#95–#99 尚未合并。本文不改变保存语义、科学算法、现有环境或主干。

## 1. 首个可验证切片

建议先做 **Windows 11 x64、普通用户、完整目录 ZIP、手动并排升级** 的目录部署资格探针，再形成内部 unsigned 试用包。暂不承诺 Windows 10、ARM64、macOS、MSI、自动更新或公开签名发行。目标是解压后双击应用或用包内固定路径 CLI；不要求仓库、系统 Node/Python、npm/pip 或 PATH 修改。程序目录应可只读；工作区由用户明确选择，原始文件只读。

**正式阶段三默认保留 TIFF、DM3、DM4 这些已有核心输入。**首个目录部署探针可先用公开 TIFF 验证路径/运行时/FFT/测量，但 TIFF-only 不能称为阶段三完成或作为发行功能缩水。当前 `requirements-dm4.txt` 明确将 RosettaSciIO 0.15.0 标为 GPL-3.0-or-later 且不 vendor/bundle；本文不擅自改该政策。推荐在正式包方案中单独审查如何随包提供该确切解码器、依赖、许可证/来源及所需履约资料，再用公开 DM3/DM4 输入验证；未解决的 DM 分发是发行阻断，不能只保留选择器后让用户安装 pip，或以“可选”掩盖。原本可选的 GPA、ASE/散射/结构工具才可明确 unavailable，不静默换引擎。

## 2. 运行时选择与版本边界

| 组件 | 拟议资格验证目标 | 已有证据 / 尚缺 |
| --- | --- | --- |
| Electron | `45.2.1` win32-x64 | 当前独立 lock 与原型探针已有证据；内含 Node `24.22.1`，不是下行 helper 的普通 Node。[官方版本](https://releases.electronjs.org/release/v45.2.1) |
| 普通 Node | `24.22.2` win-x64 ZIP | 官方提供 ZIP 与签名 SHASUMS；新版本未下载/运行，不能复用本机 `24.16.0` 的运行资格。[官方归档](https://nodejs.org/en/download/archive/v24.22.2) |
| Python，首个低变动探针 | **CPython `3.13.17`，标准 GIL、amd64 embedded** | 官方提供 ZIP，对应现有 cp313 ABI；未下载/运行，**不是发行锁**。其后还有仅源码的安全修订，正式发布必须解决下述版本差异。[官方发布](https://www.python.org/downloads/release/python-31317/) |
| 基础科学包，目标值而非发行锁 | NumPy `2.5.4`；SciPy `1.18.1`；Pillow `12.3.0`；tifffile `2026.10.15` | 版本号沿用当前验证环境。PyPI 元数据有对应 `cp313-cp313-win_amd64` 或 `py3-none-any` wheel，均非 yanked；仅查元数据，未安装、导入或验证 DLL/传递闭包。不为打包顺便升级这些版本，不混 free-threaded ABI |

现有验证 venv 为 Python `3.13.2`，不能把该目录复制后称为自包含运行时：venv 依赖 base Python，官方说明其不作为可搬移/复制环境；已有 GUI/CLI 通过也不证明可再分发目录、DLL 或干净机兼容。[venv 说明](https://docs.python.org/3.13/library/venv.html)

建议先保持 ABI，按两道门推进：

- 第一探针用官方 `3.13.17` embedded 与现有科学包版本，单独验证路径、DLL 与公开最小链。它已被 [3.13.18](https://www.python.org/downloads/release/python-31318/) 取代；后者官方说明还有 `ssl` 对受损 CA 的封禁以及其他安全修订，不能把较旧二进制宣传为已包含这些修订，也不能从离线探针成功推导发行版本合格。
- 正式发行优先评估从官方 `3.13.18` 确切源码在受控 Windows 构建机自建，保持 cp313 ABI；必须额外锁定编译器/Windows SDK、构建选项、DLL、来源和产物 hash，再验证原 wheel 闭包。本轮没有构建或完整安全差异审计。在更新的安全修订未纳入/核对前，不将 3.13.17 探针提升为发行包。不能拿旧 venv 或不明来源第三方 ZIP 代替。
- [官方 `3.14.10` embedded](https://www.python.org/downloads/release/python-31410/) 是后备路线：有当前二进制来源，对应顶层 cp314 wheels 也在元数据中；但跨 minor/ABI，须另审和补实际科学资格证据，**不是本轮默认升级**。不在 GUI/perf PR 改解释器或科学依赖，不以预期兼容代替测量。

构建前必须产生完整、不可浮动的运行时清单：来源 URL、确切版本/ABI/架构、每个输入归档和 wheel 的 SHA256、验证方式、所有传递依赖及随带 DLL/许可证。仅四个顶层版本或 `pip freeze` 不足。嵌入式 Python 的第三方依赖由构建阶段 vendor；用户机器不执行 pip。其隔离搜索路径、所需 site 行为和 DLL 定位必须实测。[Python embedded 说明](https://docs.python.org/3.13/using/windows.html#the-embeddable-package)

## 3. 目录与启动合同

以下为拟议结构，文件名表示待实现的包入口：

```text
MicroscopyWorkbench-VERSION-win-x64/
  MicroscopyWorkbench.exe       # Electron 原生窗口入口，unsigned 内测标识
  mwb.cmd                       # 参数直接传递到包内普通 Node，无 npm 包装输出
  resources/
    app/                        # 小型、正式 TypeScript 编译的 packaged bootstrap
    core/                       # 正式 dist 的 lib/tools/ui/crystallography 等真实文件
    runtime/node/node.exe
    runtime/python/             # 独立解释器、标准库、已验证 wheel/DLL 闭包
    RELEASE.json                # 本包版本、源码 SHA、各运行时/功能/格式版本
    SHA256SUMS
    licenses/                   # 项目与全部随带依赖的许可证/NOTICE/来源
```

首版 core 和 Python 资源保持真实目录。Electron 文档支持目录打包；普通 Node/Python 不具有 Electron 的 ASAR 虚拟文件系统，现有 `spawn`、相对模块路径与 Python 自身源码 hash 都要求真实资源。可以以后单独优化 shell 归档，不把 worker 路径或旧 hash 改成能“凑通过”的形式。[Electron 打包](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[ASAR 限制](https://www.electronjs.org/docs/latest/tutorial/asar-archives)

| 当前组件 | 打包适配要求 |
| --- | --- |
| `tools/desktop_launcher.mts`、`lib/desktop_backend_client.mts` | 不再依赖 checkout 的 `createRequire(electron)`；packaged bootstrap 从 `RELEASE.json` 的固定相对路径解析本包普通 Node/Python，校验包边界后传入现有合同，禁止 PATH 回退 |
| `tools/desktop_main.mts` | 当前 `process.argv.slice(2)` 是开发启动形状；需独立测试 packaged argv，不能直接改 `package.json.main` 就宣称能启动。保留 sandbox/contextIsolation、固定 IPC、精确 loopback origin 和原生关闭路径 |
| `tools/image_panel.mts`、`lib/image_panel_mcp.mts` | 其 `process.execPath` 必须仍为普通 Node；同包 provider/helper 使用包内绝对路径、原工作区和原 request_id，不让 Electron execPath 进入科学进程链 |
| `lib/image_workspace.mts`、`lib/image_probe_client.mts` | 继续启动真实 `tools/image_workspace.py`/`image_probe.py`，含 sibling imports；`tools/image_numeric.py` 读取自身源码 SHA，须原样保留 |
| `scripts/build.mjs`、`ui/image-panel/` | 复用正式编译结果及静态路由/帮助/CSP。当前 dist 还含测试/审计/Skills；发行清单须明确收集运行资源，剔除开发证据，不盲拷整个 checkout，也不漏动态需要的文件 |
| `tools/workbench_cli.mts` | `mwb.cmd` 调用包内普通 Node 的同一入口；包内默认解释器由受限适配提供，不能重复/覆盖显式参数，help/version 不依赖科学环境。保留原 stdout JSON、stderr、退出码与 query-only 恢复；不启动隐藏 Electron |

CLI 无需注册 PATH，例如未来可从 PowerShell 调用 `& 'D:\Applications\MicroscopyWorkbench-VERSION\mwb.cmd' version`。入口只传参数，不拼科学代码，不自行注册文件关联或更改系统 Python。GUI“关于”和 CLI version 应显示同一 RELEASE 身份；嵌入 Node 与普通 Node 分栏，不混报。

## 4. 用户数据、升级与恢复

- Electron profile/偏好置于本应用的用户数据目录；工作区、保存点、草稿、原执行 journals、日志和显式导出保持既有独立路径，不写只读程序目录。用户可选科研工作区，不默认搬进解压目录。
- 手动升级先正常退出所有该工作区入口，将完整新目录解压到旁边，验证清单，再打开**公开测试副本**。不覆盖运行中的 runtime，不更改全局 PATH，不自动扫描、搬移或删除工作区。
- 首版不需要修改 `analysis-workspace` schema 1。未来格式变化须先只读预检、明确兼容范围；旧 autosave 不补造为已明确保存。真正转换先备份/派生副本，完整校验后才发布有效标记；不支持版本清楚拒绝且保留原件。
- 保存失败保留编辑；保存未知、科学未知和 desktop in-flight 保留原 ID 查询。迁移/升级不能清锁、换 ID 或重放未知计算。恢复副本仍经明确恢复/放弃，不把崩溃恢复冒充用户保存。
- 回滚切回旧应用目录，并用该版本支持的工作区副本；不承诺旧版可读任意未来格式。移除应用目录只移除程序；用户工作区/导出/恢复草稿不随卸载删除。删除用户数据另走明确操作。
- 项目继续 MIT 开源，附源码 SHA 和可复现构建说明；逐项保存 Electron/Chromium/Node/CPython、wheel 与 DLL 的原许可证/NOTICE，不能只附项目 MIT。unsigned 内测不绕过 SmartScreen；签名和发布另设门槛。不加入隐藏上传、遥测、联网安装或自动更新。

## 5. 实施顺序与验收门

| 次序 | 小交付 | 通过所需证据 |
| --- | --- | --- |
| 1 | 审阅本 ADR，固定确切候选源码与功能范围 | 低变动 cp313 探针；正式包保持 DM3/DM4，先审解码器许可证与随包方式；不自动合并前置 PR |
| 2 | 完整运行时输入/许可证/哈希清单；仅目录 staging | 下载校验、锁定 wheel 传递闭包、DLL/字体/模块资源；新 Python import 与最小 TIFF→ROI FFT→measure→query 链，旧数组/hash 不变。先保留首次失败，不跑无关算法矩阵 |
| 3 | packaged bootstrap、受限路径适配与稳定 CLI | 空格/中文/只读程序目录；无系统 Node/Python/仓库、无 PATH 回退；GUI/CLI 版本一致，CLI 无隐藏窗口。保持元数据链接拒绝、正常短路径与原源文件只读合同 |
| 4 | 干净 Windows 11 x64 普通用户 + 离线验收 | 正式包须公开 TIFF、DM3/DM4 直接输入均通过；多 ROI/FFT/峰修订→保存→退出→重开；桌面完全关闭时 CLI 分析/原 ID 查询；并发草稿与结果接续。分开记录鼠标/协议/数值边界 |
| 5 | 并排升级/降级拒绝、故障和移除目录 | 旧工作区副本可读；未来格式明确拒绝；缺源/改名/缺 DLL、保存失败/未知、renderer 或 worker 一类受控中断；保留原请求与数组，移除应用不删用户数据 |

**当前全部包运行/安装/离线/升级/干净 VM 门为 NOT_TESTED**；只有源码合同、官方资料和本机只读清单检查。VM 可用性仅查 PATH 与常见安装路径，未发现可直接使用的 VBoxManage/vmrun/Get-VM，不能推论机器上绝无 VM；没有启用系统组件或启动 VM。详见 [本轮前期证据范围](validation/stage3-packaging-preflight-20261103.md)。PyInstaller onedir 是后备方案；其平台相关构建、动态导入/数据收集仍须额外证明，冻结为 exe 不自动保留现有 Python 文件/hash 合同。[PyInstaller 文档](https://pyinstaller.org/en/stable/operating-mode.html)

推荐先以**官方 3.13.17 embedded + 现有科学包版本做低变动目录探针**；正式发行则以纳入更新安全修订和保留 DM3/DM4 为门槛。须审阅的实质方案是保持 cp313 自建当前修订的构建维护成本，以及 RosettaSciIO 0.15.0 随包的许可证/来源履约方式，不再把“是否保留已有 DM 输入”当可静默删减选项。本文没有升级任何依赖、创建安装包或声称已发行。
