# 便捷源码安装

**只需要 Skills？** [独立 npx 方式](SKILLS_INSTALL.zh-CN.md) 只下载约 410 KiB，只需 Node，不需要 Python 或源码 checkout。下面的 Python 安装器适用于已有源码或同时安装完整工作台的情况。

[English](INSTALL.md) · [手动配置](CLIENT_SETUP.zh-CN.md)

安装器仅使用 Python 标准库，复用现有 venv、`npm ci`、构建和配置生成工具。
不会自动安装 Python/Node、修改认证、注册 MCP 或改写客户端用户配置。

## 前提与安装

- Python **3.10+**，带 venv 和 pip；推荐 **3.13**（CI 参考版本）。
- 工作台需要 Node.js **22.x 或 24.x** 及 npm；桌面选项需要 22.x 中的
  **22.12+**，或 24.x。只安装技能不需要 Node。
- 克隆或解压源码，确保目录可写；依赖安装需要访问 Python/npm 软件源。
  部分 Linux 发行版需要另装 `python3-venv`。
- 使用独立 Python，不能使用 GMS/DigitalMicrograph 管理的 Python。

本安装器目前位于草稿 PR 的候选分支，尚未进入默认 `main`：

```sh
git clone --branch publish/mac-r5-skills-r2-install https://github.com/wuchqwq/microscopy-workbench.git
cd microscopy-workbench
```

先预览：

```sh
# macOS / Linux
./install.sh --dry-run
./install.sh
```

```bat
REM Windows 命令提示符；PowerShell 中使用 .\install.cmd
install.cmd --dry-run
install.cmd
```

也可直接运行 `python3 tools/install_workbench.py`，Windows 使用
`py -3 tools/install_workbench.py`。没有 Windows Python 启动器时，直接用
Python 3.10+ 的可执行文件运行脚本。`--help` 查看选项。
入口可从其他工作目录调用，带空格的路径请加引号。

默认创建源码目录下的 `.venv`，安装图像依赖，再运行 `npm ci` 和构建 `dist/`。
现有 npm 命令会重建源码目录内的 `node_modules` 和 `dist`，不会启动服务或桌面。
`--dry-run`（同 `--check`）只检查前提与目标并打印计划，不写入、不下载、不构建。

默认拒绝已有 venv。可用 `--venv "/绝对路径/新环境"` 选择新目录，或明确
添加 `--reuse-venv` 允许修改经检查的已有 venv 中的依赖。科学 Python 依赖未全部
固定版本，因此此便捷安装不等于环境可复现性或科学有效性认证。

## 可选桌面与科学依赖

```sh
./install.sh --desktop --extra gpa --extra structures
```

按需选择：`--desktop` 复用独立 Electron 锁文件；`--extra gpa`、
`--extra structures`、`--extra dm4` 将相应依赖装入所选 venv。
DM 读取的可选 RosettaSciIO 依赖使用 GPL-3.0-or-later，本仓库不捆绑它。
安装脚本支持跨平台不等于各平台原生桌面已全部验证，参见
[桌面范围](DESKTOP.md)与[运行时支持](CI_SUPPORT.md)。

## 只安装技能

```sh
python3 tools/install_workbench.py --skills-only --skills-dir "$HOME/.codex/skills" --dry-run
python3 tools/install_workbench.py --skills-only --skills-dir "$HOME/.codex/skills"
```

```bat
py -3 tools\install_workbench.py --skills-only --skills-dir "%USERPROFILE%\.codex\skills" --dry-run
py -3 tools\install_workbench.py --skills-only --skills-dir "%USERPROFILE%\.codex\skills"
```

其他客户端请指定其真实技能目录；普通安装命令加 `--skills-dir` 可同时安装技能。
复制四个科学技能及脚本、测试、示例，并把所需 Markdown 文档放在同级隐藏目录
`.microscopy-workbench-references`。只改安装副本中的相对链接，不改源码。
搬移时一起移动这五个目录，即可保留离线相对引用。源码快照中已经缺失的历史文档
会在安装文本中明确标为不可用，并列在支持目录的 `install-report.json`，不会虚构内容。文档链接中的非 Markdown 仓库产物不会复制进客户端技能目录，
其标签提示回到源码仓库查看。

发现已有条目时默认在复制前停止。明确更新可加 `--existing-skills backup`，
旧目录会保留在所选技能根目录**之外**的同级唯一
`.skills.microscopy-backup-...` 目录（前缀按实际技能目录名生成），避免旧技能重复被发现。
POSIX 权限为 700；Windows 继承父目录 ACL，请使用私有父目录。
意外中断可能需要手动从备份恢复。安装器不对其他写入者
加锁，请关闭技能编辑器，不要并发安装。不影响其他技能；不安装可选 Materials Project 技能。

## 安装时生成独立 MCP 配置片段

```sh
./install.sh --config-output "/绝对路径/私密目录/新连接" \
  --workspace "/绝对路径/科学工作区"
```

两个参数同时提供；输出目录必须是新目录，其父目录必须已存在。先安装运行时，再复用现有
`dist/tools/prepare_plugin.mjs` 生成 `plugin-config.json`、`mcp.json` 和
`codex.toml`，不会合并进真实用户配置。加 `--extra structures` 可安装结构依赖
并开启结构工具。检查后按[插件配置说明](AUTOMATION_PLUGIN.md)自行接入。
路径使用独立参数和 JSON/TOML 字符串，保留空格。搬移源码或 venv 后请重新生成
绝对路径配置，并使用另一新输出目录。私密配置不要放进 Git。

## 验证与失败恢复

安装后按[手动配置](CLIENT_SETUP.zh-CN.md)启动 Inspector，指定真实图像、工作区
和 venv Python 的绝对路径。Windows 的 Python 位于 `.venv\Scripts\python.exe`。

任何子进程失败立即停止并返回非零状态；网络或构建失败可能留下部分 venv、
node_modules 或构建产物。修复报错后，明确复用原 venv 或选择新目录再运行。
不承诺回滚下载的运行时依赖，不覆盖已有输出配置，不要删除科学工作区来修复安装。

隔离测试：`python3 tests/install_workbench_test.py`，Windows 用
`py -3 tests/install_workbench_test.py`。测试只使用临时目录，覆盖可搬移复制、冲突
拒绝、显式备份和失败恢复，不安装依赖、不写真实客户端配置；不代表端到端净机或
原生桌面验收通过。
