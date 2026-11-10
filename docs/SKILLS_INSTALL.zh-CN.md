# 用 npx 轻量安装四个科研 Skills

[English](SKILLS_INSTALL.md) · [完整工作台安装](INSTALL.zh-CN.md)

**不需要 npm 账号、发布 npm 包、Git、Python，也不必下载整个仓库。**
只需要自带 npm 的 **Node.js 22.x 或 24.x**。仓库提供约 **410 KiB** 的可复现
npm 压缩包，**零运行时依赖，没有安装生命周期脚本**。包设为 private，防止意外
发布到 npm。当前仍是草稿 PR #135 的候选版本，不是正式 Release。

## macOS / Linux

先确认客户端实际使用的 Skills 目录。下面以 Codex 为例：

```sh
npx --yes --ignore-scripts --package="https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/publish/mac-r5-skills-r2-install/packages/skills/microscopy-scientific-skills.tgz" microscopy-skills --skills-dir "$HOME/.codex/skills" --dry-run
```

检查目标路径后，**删掉 `--dry-run`** 再执行，就会安装。

## Windows

PowerShell 用 `npx.cmd`，避免 `npx.ps1` 被 PowerShell 脚本执行策略拦截：

```powershell
npx.cmd --yes --ignore-scripts --package="https://raw.githubusercontent.com/wuchqwq/microscopy-workbench/publish/mac-r5-skills-r2-install/packages/skills/microscopy-scientific-skills.tgz" microscopy-skills --skills-dir "$env:USERPROFILE\.codex\skills" --dry-run
```

检查后删掉 `--dry-run` 安装。命令提示符 CMD 中，将路径写成
`"%USERPROFILE%\.codex\skills"`。路径含空格时保留引号。安装后重启 Agent，
或刷新它的技能发现。其他客户端使用它自己的 Skills 目录。

**固定版本：** 上例指向会变化的开发分支。要可复现，将 URL 中的
`publish/mac-r5-skills-r2-install` 替换为你已在 GitHub 审阅的 **40 位完整 commit SHA**。
不要用没有来源限定的 `npx microscopy-scientific-skills`，本项目没有发布同名 npm 包。
npx 会执行项目代码，请先审阅来源并固定可信版本。

也可使用 `npm exec --yes --ignore-scripts --package="URL" -- microscopy-skills ...`。
`--dry-run` 仅保证技能安装器不写目标目录，**npm 仍可能下载并缓存包**。
`--ignore-scripts` 禁用 npm 生命周期脚本，不会禁用你明确要求执行的安装命令。
该包不安装任何注册表依赖、Python 包、Electron 或科研依赖；npm 仍使用正常缓存，
也可能发出它自己的元数据请求。

## 下载一次，离线安装

从选定 commit 下载 `packages/skills/microscopy-scientific-skills.tgz`，之后：

```sh
npm exec --yes --ignore-scripts --offline --package="/absolute/path/microscopy-scientific-skills.tgz" -- microscopy-skills --skills-dir "/absolute/client/skills"
```

Windows 用 `npm.cmd` 和实际 Windows 路径。空 npm 缓存也可离线安装，因为没有依赖。
也可解压后直接运行 `node package/install.mjs --skills-dir "客户端 Skills 目录"`。
`--help`、`--version`、`--list` 分别查看帮助、安装器版本和技能名称。

安装器源码在 `packages/skills-installer/`，打包脚本为 `tools/build_skills_npm.py`。
包内 `manifest.json` 包含所有安装文件的 SHA-256，可检测损坏，但不能证明一个连同
清单一起被恶意修改的包可信，因此仍应固定并审阅来源 commit。

## 安装内容与边界

Skills 版本 **0.6.1-r2**，安装器版本 **0.6.1-r2.1**：

- `microscopy-router`
- `microscopy-observe-revise`
- `microscopy-automation`
- `crystallography-compare`
- `.microscopy-workbench-references`，仅参考文档，不是第五个技能

迁移时将五个目录一起移动。安装副本中的本地 Markdown 链接已改写；历史缺失文件和
未打包的非 Markdown 文件会明确标注，并列在支持目录的 `install-report.json` 中。
不包含可选 Materials Project Skill，也不会修改 MCP、模型、账号、认证、客户端
配置、shell 配置或其他 Skills。

**装 Skills 不等于装科研运行时。** 技能可以立即被发现，但调用 provider 的功能仍需
[安装工作台和连接 MCP](INSTALL.zh-CN.md)。自带 Python 辅助脚本只在实际运行时才需要
Python 及其声明的依赖。安装成功不代表原生桌面验收或真实材料精度验证。

## 升级、备份与恢复

默认遇到已有同名目录会在复制前停止。确认要升级时，在命令末尾加
`--existing-skills backup`。旧目录保存在 Skills 目录**外部**的同级唯一备份目录
`.skills.microscopy-backup-...`，前缀随实际目标目录名变化。POSIX 权限是 700；
Windows 继承父目录 ACL，请选择私有父目录。不会替换符号链接目标或条目。

先关闭技能编辑器，不要并发安装。此安装器不是并发写锁。普通复制失败会尝试回滚，
但强制结束进程或系统中断可能需要手动恢复；替换前会打印备份路径。恢复时停止客户端，
移开受影响的新目录，将对应备份移回原位置，再刷新技能发现。确认可用前保留备份。

## 维护与验证

修改源文件后运行 `python3 -B tools/build_skills_npm.py` 并一起提交压缩包。
`--check` 检查产物是否与源码一致；`python3 -B tests/skills_npm_test.py` 执行合同测试。
打包仅用 Python 标准库，采用 UTF-8/LF、排序路径和固定归档时间/所有权。
该压缩包是可审计的软件分发产物，不是私人数据或科研证据归档，体积限制为 1 MiB。

[安装 CI](../.github/workflows/installers.yml) 在 Windows、macOS、Linux 和 Node 22/24
覆盖可复现构建、文件校验、空缓存离线 npm、空格/中文路径、预览、冲突、备份、损坏/
路径逃逸拒绝，以及 PR head SHA 对应真实 GitHub URL 的安装。POSIX 符号链接测试单独
执行；Windows 不要求符号链接权限。这不是全新机器科研依赖安装、GUI 或真实材料验收。
