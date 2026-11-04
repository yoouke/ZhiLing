# 验证记录

日期：2026-11-04（北京时间）。以下是本工程自己的运行记录，不沿用废弃工程的结论。

## Windows 回归

Windows Server 2025 runner 执行 Python 完整测试和 JavaScript 语法检查。新增 Agent 后完整回归为 **118 项**，包括安装恢复、配置导入、DPAPI、凭据脱敏、服务与本机 API、原文人格保留、中文快捷方式、部署期间冲突操作保护、空白角色成品配置，以及实际 Windows EXE 图标和中文产品属性。

- [118 项 Windows 原生检查成功记录](https://github.com/yoouke/ZhiLing/actions/runs/41756104737)
- [持续集成列表](https://github.com/yoouke/ZhiLing/actions)

中文快捷方式使用实际 Windows Shell Link 保存，测试读取真实文件中的 Unicode 参数，同时核对目标程序、图标和工作目录。不是只检查文件名存在。安装器资源测试读取实际 PE 图标字节，并调用 Windows 版本信息 API 核对产品名与原始文件名。

Agent 接口测试启动本机 HTTP 服务，确认错误令牌与过期认证文件不能通过健康检查；它是协议边界测试，不是 DSH/QQ 真实消息验收。

## 真实引擎部署

[Agent deployment smoke 第三次运行](https://github.com/yoouke/ZhiLing/actions/runs/41749681239)成功。对应代码提交：`a7c80c83fd771502036c53b1e0e72096fe8c33a6`。

| 组件 | 验证版本 |
| --- | --- |
| 独立 Node | 24.22.2 |
| DSH | 0.2.1-rc.5 |
| pnpm | 10.28.2 |
| 任务桥接组件 | 0.3.23 |
| Python | 3.12.10 |
| Windows | Server 2025 runner |

实际执行了：从官方地址下载 Node 并核验 SHA-256、安装引擎与插件、准备通信端插件文件和受管配置、创建独立引擎数据目录与工作目录、启动真实引擎进程、验证插件身份与 Bearer 认证，最后停止引擎进程。此前另一轮真实部署也已成功。

这项检查不调用模型、不登录 QQ、不运行 AstrBot 通信服务。通信端验证的是插件文件及默认配置已经准备好；不能将其写成 QQ 已收到任务执行结果。

## 尚未验收

- Win10/11 干净系统的整包安装、独立窗口交互及卸载。
- QQ 扫码、主人真实身份、登录恢复与风控失效恢复。
- 真实模型执行任务，QQ 原通道接收结果、文件和审批。
- 语音、唱歌、长期记忆等外部 API 的真实授权运行。
- 多人格、SnowLuma、多平台和其余扩展，见 [验收清单](acceptance.md)。

本工程尚未发布新的 Windows 安装包。CI 的成功不能替代上述账号、模型与桌面验收。
