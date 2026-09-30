# V2EX 自动领奖励

这是一个 macOS 菜单栏 App。你只需要登录一次 V2EX，之后它会常驻在菜单栏里，每天按设定时间自动领取签到奖励。

## 现在怎么用

1. 安装依赖

```bash
npm install
npx playwright install chromium
```

2. 打开 App

```bash
npm run app
```

3. 在 App 里点击“登录 V2EX”
4. 在 App 弹出的登录窗口里完成登录，然后直接关闭这个窗口
5. 回到 App，把时间设成你想要的自动执行时刻

时间现在可以直接在界面里改，像普通 App 一样选 `08:00`、`09:30` 这种格式，然后点“保存时间”。

## App 里能做什么

- 查看当前状态
- 手动立即领取一次
- 打开浏览器执行领取
- 重新登录 V2EX
- 设置每天几点自动执行
- 设置开机后自动启动
- 打开日志目录

## 做成可双击打开的 App

如果你不想每次从终端启动，可以直接打包成真正的 macOS 安装包：

```bash
npm install
npm run build:mac
```

说明：
`npm run build:mac` 现在会在打包完成后自动清理旧版本的 `.dmg`、`.blockmap` 和构建中间文件，只保留当前版本安装包，减少磁盘占用。

打包完成后，生成的文件会在：

- `dist/V2EX自动领奖励-1.0.0.dmg`
- `dist/mac/V2EX自动领奖励.app`

推荐直接双击 `.dmg`，然后把 App 拖进“应用程序”文件夹。

## 默认设置

- 默认每天 `08:00` 自动执行
- 默认不开启开机启动

## 日志位置

- 运行日志：`logs/YYYY-MM-DD.log`
- 调试页面快照：`logs/debug-*.html` 和 `logs/debug-*.txt`

## 备用命令行

如果你后面还想单独测试底层逻辑，也可以继续用：

```bash
npm run login
npm run claim
npm run claim:show
```

## 旧的 launchd 方式

项目里还保留了 [launchd/com.rayma.v2ex-auto-reward.plist.template](launchd/com.rayma.v2ex-auto-reward.plist.template) 作为旧方案参考，但现在更推荐直接用 App 自己的定时能力和“开机启动”开关。

说明：
如果你现在是用 `npm run app` 这种开发模式启动，Electron 不能稳定注册“开机启动”，所以界面会提示这个开关要在打包后的正式 App 里使用。这不是 V2EX 权限问题，而是 macOS 对开发态应用和登录项注册的限制更严格。

另外，“登录 V2EX”现在已经改成 App 内部的登录窗口，不再依赖额外弹出 Playwright 浏览器，所以使用上会更接近正常软件。
