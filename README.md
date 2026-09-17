# 行程日历提醒（Calendar Reminder）

一个基于 Electron 的轻量 Windows 桌面应用：像日历一样记录行程，**每次开机自动启动**，并提醒你今天还有哪些计划没做。窗口大小严格限制在半屏以内，计划整齐排列，增删改流畅带动画。

![界面截图](docs/screenshot.png)

## 功能特性

- **月历视图**：周一开头的中文月历，有计划的日期显示彩色圆点（蓝色待办 / 红色逾期 / 绿色完成）
- **计划管理**：按天整齐列出，支持添加、勾选完成、双击标题修改、滑动删除，可设置具体时间和备注
- **每日提醒**：
  - 开机（以及每天第一次打开）自动汇总通知：今天几项待办、几项逾期、下一项是什么
  - 到点弹出 Windows 系统通知，每条计划只提醒一次
- **开机自启**：设置里一键开关（基于系统登录项，无需手工配置）
- **半屏限制**：默认占屏幕一半，且最大只能放大到屏幕的 50%，不会遮挡整个桌面
- **后台托盘**：点 × 默认最小化到系统托盘继续运行，托盘菜单可查看待办数量
- **本地存储**：所有数据保存在本机 JSON 文件，无网络请求，无账号

![添加计划与设置](docs/screenshot-settings.png)

## 环境要求

- Windows 10 / 11
- 开发需要 Node.js 18+（推荐 20）与 npm

## 下载安装（免开发）

前往 [Releases 页面](https://github.com/Ayh2007/calendar-reminder/releases/latest) 下载：

- `CalendarReminder-Setup-1.0.0.exe`：安装版
- `CalendarReminder-Portable-1.0.0.exe`：绿色便携版

> GitHub 会把附件名中的中文替换为短横线，因此发布到 Releases 上的文件名使用英文；本地 `npm run build` 生成的文件仍是中文名。

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式启动
npm start
```

国内网络安装 Electron 较慢时可使用镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 打包成 exe

```bash
# 同时生成安装包和便携版（输出到 dist/）
npm run build
```

产物：

| 文件 | 说明 |
| --- | --- |
| `行程日历提醒-安装包-1.0.0.exe` | NSIS 安装程序，可选安装目录、创建快捷方式 |
| `行程日历提醒-便携版-1.0.0.exe` | 单文件绿色版，双击即用 |

## 使用说明

1. 启动后点击右上角齿轮，确认「开机自动启动」已开启
2. 点击「添加计划」，输入内容、选择时间（不选时间则为全天事项）和备注
3. 完成后点击左侧圆圈勾选；逾期未完成的计划会标红
4. 关闭窗口默认隐藏到托盘，右键托盘图标可以真正退出
5. 设置中点击「打开数据目录」可以找到数据文件 `calendar-reminder.json`，便于备份或迁移

## 数据存储位置

```
%APPDATA%\行程日历提醒\calendar-reminder.json
```

便携版的数据位于运行目录对应的用户数据目录中，可通过「打开数据目录」直接定位。

## 项目结构

```
├── package.json              # 应用与 electron-builder 配置
├── scripts/
│   └── generate-icon.js      # 纯 Node 生成 PNG 图标，无图片依赖
├── assets/                   # 应用图标与托盘图标
├── docs/                     # README 截图
└── src/
    ├── main/
    │   ├── main.js           # 主进程：窗口、自启、托盘、通知、IPC
    │   └── storage.js        # JSON 文件存储（原子写入 + 损坏备份）
    ├── preload/
    │   └── preload.js        # contextBridge 安全桥
    └── renderer/
        ├── index.html        # 界面结构
        ├── styles.css        # 样式与动画
        └── app.js            # 日历渲染、计划 CRUD、提醒调度
```

## 技术栈

- [Electron](https://www.electronjs.org/) 31
- 原生 HTML / CSS / JavaScript，零前端框架依赖
- [electron-builder](https://www.electron.build/) 打包（NSIS + portable）

## 发布到 GitHub

```bash
git init
git add .
git commit -m "feat: 行程日历提醒 v1.0.0"
gh repo create calendar-reminder --public --source=. --push
```

之后可在 GitHub Releases 中上传 `dist/` 里的两个 exe 供下载。

## License

MIT
