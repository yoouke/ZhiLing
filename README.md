<p align="center"><img src="app/web/img/favicon.png" width="112" height="112" alt="织灵"></p>
<h1 align="center">织灵 · ZhiLing</h1>
<p align="center">创造自己的角色，让记忆、声音与故事在日常中延续。</p>

织灵是一款面向 Windows 的本地 AI 虚拟人格应用。目标是让用户通过一个程序完成环境安装、角色创建、账号登录、插件配置和日常运行。

**当前正在重建开发，尚无本工程的新安装包。** 当前代码包含完整的基础安装与机器人运行流程；DSH 受管部署与任务桥接已接入代码，多角色、多平台等扩展仍需继续实现，不能将本仓库视为已经完成全部需求的版本。

## 使用体验

用户选择安装位置、填写 API 配置、创造或导入角色、扫码登录，由程序完成运行环境、服务、连接和能力配置。安装中断后可以继续；日常通过桌面入口上线、下线、修改设置或处理登录失效。

基础代码保留聊天、表情、语音、唱歌、长期记忆、主动聊天和 QQ 签名等能力。使用语音与记忆等服务需要对应 API 授权，真实账号及服务仍需实际验收。

创建角色时不提供固定人格。你决定名字、设定和表达方式，程序负责保存与运行。支持直接粘贴提示词或导入 Markdown/TXT 文件，导入后可编辑再保存。

基础安装完成后，状态页的「Agent 任务」提供安装并启用、重新联动、暂停服务和控制台入口。程序使用独立运行环境，日常聊天保留角色通道，任务通过 `/dsh` 触发。说明见 [Agent 任务](docs/agent-guide.md)；真实 QQ 与模型任务往返尚未验收。

## 正在建设的扩展

- DSH 任务通道的真实账号往返验收、更多引擎管理与按角色授权。
- 多人格独立存储与切换，分别管理记忆、知识、声音、账号和插件。
- 三种角色创建方式：引导讨论、直接导入、联网整合已知角色资料；区分官方设定、二创与社区梗。
- QQ、Telegram、Discord 等平台的统一连接管理；NapCat / SnowLuma 对同一 QQ 通道二选一。
- 插件安装、配置、启停、更新与按角色授权。
- 用量、预算、资源、服务状态、身份权限与审批。
- UI、主题、图标、角色资源与扩展能力 DIY。

完整约束见 [需求基线](docs/product-baseline.md)，实际实现情况见 [验收清单](docs/acceptance.md)。上述建设目标不代表当前已经可用。

## 开发与检查

基础程序使用 Python、本机 HTTP 服务与 HTML/CSS/JavaScript，在 Windows 独立应用窗口中运行。凭据使用 Windows DPAPI，本机 API 使用启动令牌认证。

Windows 环境执行：

```powershell
python -m unittest discover -s tests -t . -v
node --check app/web/app.js
```

安装包组装入口为 `build/build.py`，需要 Windows 和准备好的组件。UI 调试可运行 `python dev/fake_wizard.py`；它使用假后端，不会安装服务，不代表真实运行验收。

Windows 回归与真实引擎部署检查的范围见 [验证记录](docs/verification.md)，更新见 [更新记录](CHANGELOG.md)。

面向代码 Agent 的项目约定见 [AGENTS.md](AGENTS.md)。组件、版权和许可信息集中于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
