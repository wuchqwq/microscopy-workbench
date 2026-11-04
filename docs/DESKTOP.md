# Windows 桌面开发机试用入口

这是阶段二的独立窗口和生命周期实现。它复用现有 TypeScript Image Panel、Inspector 与科学 provider，不是独立科学引擎。项目保持 MIT 开源；Electron、Node、Chromium 等依赖保留各自许可证。

## 安装开发依赖与启动

使用普通 Node **22.12+（22.x）或 24.x**安装单独锁定的 Electron 开发运行时。核心 Node/CLI 支持 **22.x 与 24.x**；核心 `npm ci` 与 Node CI 不下载或运行 Electron。参见[支持范围与轻量 CI](CI_SUPPORT.md)。

```powershell
npm ci
npm run build
npm run desktop:install
npm run desktop -- --workspace "F:\Public workspace" --source "F:\Public fixtures\periodic.tiff" --python "F:\Scientific Python\python.exe"
```

无参数 `npm run desktop` 依次用原生文件选择器选择分析工作区、首次打开的原图和科研 Python。已有工作区复用原始源/帧绑定；多数据集、复杂数组需按现有 Inspector 的显式 `--dataset`、`--plane-axes`、`--plane-indices`、`--component` 选择，不猜缩略图或轴。

正常重开使用同一目录和 Python：

```powershell
npm run desktop -- --workspace "F:\Public workspace" --python "F:\Scientific Python\python.exe"
```

本轮仍依赖开发机的普通 Node 和指定 Python 科学环境。原图只读。没有依赖自带的安装包、签名、自动更新或干净 Windows 安装资格；这些属于阶段三。不要把源代码 checkout 的启动成功写成安装验收通过。

## 操作与退出

原生“文件 / 编辑 / 分析 / 窗口 / 帮助”菜单调用 GUI 已有的同一动作。保存是整个分析工作区；图片导出不是保存。Delete 仍受画布焦点和明确 ROI 选择保护，不从菜单绕过限制。“使用说明”离线读取现有帮助，不触发科学计算。

点击应用关闭或“退出”时，界面先完成工作编辑发布和本地传输，后台再读取真实工作区状态。有修改时显示“保存 / 不保存 / 取消”；保存失败、新修改、未知结果或未完成发布均保持窗口。保存后后台再次检查，最后以准确工作版本执行关闭，不能仅凭 renderer 回答“成功”关闭。

“不保存”的元数据恢复采用有界 150 秒等待。超过预算仍保留原 command_id 和工作版本，操作可能迟到完成；不会重放或允许第二次丢弃／关闭。再次退出先查询同一原操作，执行中或结果未知保持打开；原操作完成或明确失败后，本次只报告结果，请通过“显示与高级设置 → 诊断与原请求恢复 → 检查 Agent 结果”按既有保护读回当前视图，再明确决定。查询不会修改工作区，失败不等于未执行。

“不保存”遵循共用工作区合同：恢复上次明确保存点，已经完成的科学执行记录和原 request_id 保留。不能借退出或换窗重做未知请求。OS 强制终止、断电不能保证弹窗；草稿恢复与明确保存分开。renderer 中断时后台保留，提示重新载入；不静默重算。

## 进程、安全和版本边界

普通 Node 启动器把自己的准确可执行路径传给 Electron；Electron 再以该 Node 启动本应用拥有的后台。既有 `StdioImageClient` 仍处于普通 Node 中，其 `process.execPath` 不会误指 Electron。后台通过有界 JSON 管道汇报生命周期元数据，科学计算仍走既有 MCP/provider/journals，不把图像数组或 PNG 搬到原生 IPC。

renderer 开启 sandbox/contextIsolation/webSecurity，关闭 Node integration/webview/insecure content；preload 只允许固定的菜单动作订阅，检查同一窗口、主 frame 与准确本机页面。禁止任意导航、新窗口和权限请求。不开放文件系统、shell、通用 IPC 或任意 tool 执行能力，不放宽现有 CSP、token 或 Origin 检查。sandbox preload 用经过正式 TypeScript 编译的 `.cts` → `.cjs`，不是未检查脚本。

正常关闭等待本应用后台 drain，不按进程名/端口扫杀，也不终止其他 CLI 工作。父进程管道异常断开走异常恢复关闭，不冒充用户保存或丢弃。未知结果继续按原 ID 查询。

根 `package.json` 提供开发启动脚本；独立 `desktop-runtime/package-lock.json` 固定 Electron。基础 `dist/` 科学包不包含 Electron 二进制；阶段三再定义可再分发产物。不得在用户电脑自动执行 npm/pip 安装或修改全局 PATH。

## 定向验证

```powershell
npm run build
npm run test:desktop
```

Node 测试覆盖参数/中文空格路径、精确 URL/权限边界和退出状态机：取消、保存失败、新编辑、未知结果、重复关闭、丢弃及最后版本冲突。它们不需要 Electron。

原型首次实际启动探针发现 ESM 入口顶层等待 `app.whenReady()` 会阻止 ready 到达，已改为注册 ready 回调；此首次失败单独保留。安全探针仅检查实际可读取的安全偏好；Electron 45 不返回非安全项 spellcheck，不能把该字段缺失误报成 sandbox 失败。

`tests/desktop-runtime-probe.mjs` 是另行明确运行的 Electron 安全启动探针，检查实际进程偏好和 sandbox preload 加载；不属于 headless CLI。真实鼠标操作和组合保存/FFT/恢复证据另外记录，不能从状态机测试推断已经完成所有桌面验收。此处只报告公开合成输入；真实样品的物理准确性、代表性和干净机安装需分别验收。

本轮独立 Windows 探针：Electron **45.2.1**、嵌入 Node **24.22.1**、sandbox/contextIsolation/webSecurity 均 true，nodeIntegration/webviewTag/allowRunningInsecureContent 均 false，preload_error=null，退出码 0。它只证明这个锁定运行时与沙箱 preload 可启动，不证明完整工作区生命周期、真实鼠标操作或干净机安装。初次依赖下载挂起、ESM ready 死锁和探针字段假设失败均独立保留；官方 ZIP 经锁包自带 SHA256 核对后，使用本轮局部缓存完成独立 `npm ci`。

依据：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)、[沙箱 preload](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[窗口 API](https://www.electronjs.org/docs/latest/api/browser-window)，访问日期 2026-11-03。正式实现固定版本并做本机探针，不把网页说明当实测结果。
