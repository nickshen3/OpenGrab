# OpenGrab

开源、本地运行、无任何人为限制的视频下载工具。相同技术栈复刻同类商业软件的使用体验：
**Go + Wails (WebView2) 后端 · React + TypeScript + Ant Design 前端 · yt-dlp 下载引擎**。

## 功能

- **单链接提取**：粘贴链接 → 解析标题/封面/时长/清晰度 → 选择画质下载（含仅音频）
- **播放列表**：自动识别并展开，支持单项或整列表下载
- **批量提取**：多行多链接混合解析、批量下载，无数量上限
- **任务列表**：实时进度（百分比、速度、ETA、已下载大小）、取消、清理
- **设置**：yt-dlp 引擎自动下载/一键更新、自定义下载目录、HTTP 代理

## 无限制声明

本项目没有账户体系、没有会员、没有每日次数限制、没有时长/大小上限——
解析与下载能力完全由本地 [yt-dlp](https://github.com/yt-dlp/yt-dlp)（Unlicense 许可）提供，
站点支持范围随 yt-dlp 社区更新。唯一的天花板是你的网络和各网站自身的访问策略。

## 运行要求

- Windows 10/11（WebView2 Runtime，系统一般自带）
- 首次使用时自动下载 yt-dlp.exe 到 `%APPDATA%\OpenGrab\bin`

## 开发

```bash
# 前端
cd frontend && npm install && npm run build

# 构建桌面应用（需要 Go 1.25+ 和 Wails CLI）
wails build

# 打包便携版（自动把 yt-dlp.exe 打进包里，与主程序并排放置）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1

# 开发模式
wails dev
```

## 引擎打包说明

- 便携包布局：`OpenGrab.exe` 与 `yt-dlp.exe` 并排放在同一目录，解压即用，无需联网下载引擎
- 程序启动时优先使用自带的引擎；「设置 → 检查更新」会下载新引擎到
  `%APPDATA%\OpenGrab\bin\` 并自动切换，更新不需要写安装目录权限

## 许可

MIT License（见 [LICENSE](LICENSE)）。yt-dlp 遵循其自身许可。
