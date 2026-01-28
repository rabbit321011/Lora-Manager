# Lora-Manager
这是管理SD绘图中多种多样的Lora的一个项目，用gemini+Trae Auto Mode在4小时内开发完成，之后可能会完善和长期使用。使用NodeJS为后端，PureJS为前端。
个基于 NodeJS 的本地 LoRA 模型管理小工具。
## ⚠️ 重要说明（必读）
1. **路径配置**：
   - 配置文件位于 data/global-config.json。
   - 其中 `loraRootPath` 默认设置为 E 盘。**如果你的电脑没有 E 盘或路径不符，程序启动会报错。**
   - 请在启动前务必打开该文件，修改为你本地真实的 LoRA 存放路径。
2. **存储逻辑**：
   - **注意**：本软件目前的逻辑是会将 LoRA 文件直接复制一份到管理目录，请确保你的目标磁盘空间充足。
如何运行？：
1. **安装依赖**：
   在项目根目录下打开终端，执行：
   ```bash
   npm install
2.启动程序： 双击运行 startLoraManager.cmd 或在终端执行：
  ```bash
  node server.js
