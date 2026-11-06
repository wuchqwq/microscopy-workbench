# 指定 HRTEM 桌面增量与 STEM 的本地整合（2026-11-06）

本轮输入是已独立复审的 STEM/HRTEM 整合基线
`4fe6a51e86864f7113c3b3f693e9044f2d13eb5c`，以及指定、已审 HRTEM PR #133
`e63592ed7b1bf94bcfcdbedf7fabaa22434a3b75`。原整合已包含的 HRTEM 输入为
`9cd93c1f4a9debd570e827935abaa031ed81f60f`。

只在隔离 `integrate/stem-hrtem-20261106` 分支整合。本轮不推送、不创建 PR、
不合并 main、不部署，也不改其他工作树。提交的完整 SHA 和两个输入的完整
补丁由同轮审查包记录；本文不能代替主对话的独立复审。

## 输入范围与冲突决策

只引入 9cd93c1 → e63592e 的四条已审提交：

- `805c5a79dc4462d3de197f60ffae71f1a19a13d4`：使用已存在的 Windows CJK 字体绘制中文标注，保留旧 Latin 路径及字体缺失回退。
- `979a741b16a767fae0fee8f54283add3e99af653`：同帧已保存 ROI 原始统计历史的只读表格。
- `02a97f587f6ffffff6583b49ce45eb44d040aba9`：实际保存数量和证据范围提示。
- `e63592ed7b1bf94bcfcdbedf7fabaa22434a3b75`：只有来源关系已核实时显示回到来源的提示。

20 个继承文件、540 行新增/16 行删除。产品代码仅为上述已审差异。
唯一文本冲突是 `package.json` 的单行 `scripts.test`：两侧分别增加测试。
决策为保留两侧的全部条目及各自相对顺序，补入唯一缺失的
`dist/tests/image-panel-statistics-history.test.mjs`，不更改其余 package 字段，
不重复条目。没有科学定义、阈值、工具合同或产品范围取舍。

其他文件自动合并。审查包的 `integration-parity.json` 将所有非 package 文件的
新增/删除行与指定 HRTEM 区间逐项比较；保留 STEM 既有内容的文件不要求
整个文件等同单独的 HRTEM 分支。另核对原预期点/8 ULP 覆盖策略、源数组边界、
原请求 ID 接续、discovery、工具注册及精确兼容比较器/许可夹具均未改变。
已复审的 4fe6a51 正负控不因本轮只读 UI 增量重复运行。

## 本轮实际验证

`npm run build`：PASS。

```text
node --test --test-reporter=tap dist/tests/image-panel-statistics-history.test.mjs dist/tests/data-probes-ui.test.mjs dist/tests/image-panel-ui.test.mjs dist/tests/measurement-workspace-ui.test.mjs dist/tests/research-workspace-ui.test.mjs dist/tests/result-semantics-panel.test.mjs dist/tests/desktop-contracts.test.mjs dist/tests/desktop-lifecycle.test.mjs
python -B -X utf8 tests/test_annotation_text_rendering.py
git diff --cached --check
```

Node：370 项中 367 PASS，3 FAIL（均为实际 HTTP 请求 `fetch failed`）。
这不是全通过：新增统计历史的 token/当前对象 route，以及已有语义/联合观察的
两个实际 Panel HTTP 测试，在本轮环境未完成验证。纯逻辑的历史值、原始名称、
同帧限定、篡改拒绝、真实截断、未知/空态、UI handler、桌面合同及生命周期
测试属于这次 367 项通过范围。Python 中文/Latin/字体缺失回退：4/4 PASS。

独立最小本地服务诊断确认 Node fetch 和 HTTP 连接自身
`127.0.0.1:60036` 被运行时拒绝：`connect EACCES`。未更改网络设置、权限、
代理或端口策略。实际桌面后端依赖该回环路径，因此停止实际桌面启动，
未换环境绕过限制。这是明确的运行时阻碍，不声称 HTTP 或原生 GUI 已通过。

## 一条受限但真实的小用户路径

复用此前已获授权、已保存的合成接口案例，不新建材料数据或重算科学结果。
案例为合成重复标量纹理与已提供的闭合证据；声明 `other/stored_scalar`，
不是 HAADF 成像模拟或独立 Poisson 计数。

1. 通过真实 `workbench_cli site-followup --request-id integrated-review`，取得原请求接续参数。
2. 通过真实 `query` 查询接续的原始 request ID；不重放写入。
3. 新增 `readImageStatisticsHistory` 读取同一真实 provider 工作区中的已保存 STEM `reference_comparison` 统计。
4. 两个相互独立的新 Node 进程分别读取历史，字节一致。
5. 真实 MCP stdio 客户端读取最终 review、旧原始 review、原始统计；关闭客户端，再创建新客户端重复原 ID 只读查询。
6. 对照先前已保存的 review/统计/所有参考/独立候选报告，143 个已有文件哈希保持不变，零新增 provider 请求。

结果 PASS；完整参数、结果、均值/参考、身份和哈希在审查包
`small-user-path.json`、`history-before-close.json`、`history-after-reopen.json`。
此例 target mean 为 `-0.0034779700522875397`，两个保留参考与 target 差均为 0；
等均值不证明材料正常。历史表显示保存的 primary 统计而不伪造强度单位；
全部参考继续保存在原统计及 site observation，未删减为一个中位数。
物理结论保持 null，S2 未调用。

这是实际 CLI/stdin-stdout 工具和持久化回读路径，新增历史读取函数也被实际调用。
没有执行 HTTP、原生窗口交互或新的原生 File/Save；冷回读不冒充桌面保存/退出。
没有新的模型调用，不升级已有开发上下文模型案例为独立自主盲测。

## 用户入口与仍须验证的边界

指定 HRTEM 的桌面入口仍为 `npm run desktop -- --workspace <workspace> --python <existing-python>`；
需使用原有、已安装的 Electron。窗口内通过「分析历史 → 已保存 ROI 统计历史」，
或结果区域的「ROI 统计 → 查看已保存统计 / 历史比较」打开同帧只读表；可展开
原 object/request ID、原区域、样本数、时间及缺失单位。STEM 材料问题接续沿用
现有 MCP/CLI 的 `site-followup`，用户或宿主读取证据后决定执行下一工具或保留未知。
本轮没有新建 AI 框架，也没有新增自动物理解释。

已审 HRTEM 自身先前的桌面操作证据，见同分支继承的三份桌面验证文档；那不是
本次合并 HEAD 的实际桌面验收。本合并的原生 GUI、原生 Save/Close/Reopen 和
三个实际 HTTP 测试仍须在获准且支持该路径的环境独立验证。

此前冻结包 FileContextStore 的原子硬链接保存遭 EPERM；本轮未重试、未修改保护、
未迁移执行以规避。完整冻结包保存/迁移/重开仍 NOT_TESTED。纯逻辑兼容正负控的
既有通过不等于完整冻结包兼容通过。

真实材料有效性、独立模型盲测、人体操作体验、macOS 及新跨平台迁移均未验证。
本轮未运行 R64、NL-PCA、无关大实验、STO-stack.h5 或下载。
