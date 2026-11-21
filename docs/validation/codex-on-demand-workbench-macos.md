# macOS 按需查看器

已有工作台 Panel 时，可在原图及工作区仍可读取的前提下显示或聚焦其
Electron 窗口。此功能需要显式设置 `MICROSCOPY_PANEL_DESKTOP=1`，保留
`MICROSCOPY_PANEL=1`，并使用项目的 Electron 开发运行时。没有开启时，原
Panel 工具保持原有入口。

先用 `image_panel_current` 核对已登记的 Panel，再用其确切 ID 调用
`image_panel_activate`。保存本次请求 ID。超时后只能查询原请求的窗口回执。
窗口可见与真正获得系统焦点分别报告。

窗口附着到原 helper。关窗时保留原 Panel 和已保存的工作区。查看器保留未保存
编辑保护。再次从 Dock 激活时，只显示身份、代次与地址均匹配的原窗口。

研究者保存后，在同一连接用 `image_panel_current` 读取当前保存点，再由
`image_panel_saved` 核对确切的 `save_id`、provider 引用和读回修订。保存或
聚焦均不会主动唤醒模型。

构建后用 `npm run test:desktop` 验证合成保存点、请求恢复、窗口和关闭契约。
`npm run test:compiled:compat` 继续检查原工具目录和已保存工作区。契约测试使用
Electron 接口替身，本机 Dock 与窗口需要单独的原生验收记录。
