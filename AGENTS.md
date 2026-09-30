# AGENTS.md

> Codex / AI 协作规则。  
> 目标：在完成需求的前提下，尽量少读无关文件、少消耗 token、少做无关修改。

## 项目定位

这是一个 macOS 菜单栏 App，用于 V2EX 自动领取每日签到奖励。

用户只需要登录一次 V2EX，之后 App 会常驻菜单栏，并按设定时间自动执行领取。当前推荐使用 App 内置定时能力和“开机启动”开关，不优先使用旧的 launchd 方案。

技术上可按 Electron + Node.js + Playwright/Chromium 项目处理。

---

## 优先阅读顺序

处理任务时，默认只读这些文件：

```text
AGENTS.md
README.md
package.json
src/
launchd/
```

如果任务不需要，不要读取整个项目目录。

---

## 核心目录说明

```text
src/
  main.js              # Electron 主进程、窗口、菜单栏、IPC、应用生命周期
  preload.js           # 主进程和渲染进程桥接
  claim.js             # 自动领取奖励核心逻辑
  login.js             # V2EX 登录、会话、Cookie 相关逻辑
  v2ex-service.js      # V2EX 请求与业务封装
  settings.js          # 配置读写
  launch-agent.js      # macOS 开机启动 / launch agent 相关
  utils.js             # 通用工具

src/renderer/
  index.html           # 页面结构
  renderer.js          # 前端交互逻辑
  styles.css           # 页面样式

launchd/
  com.rayma.v2ex-auto-reward.plist.template
                         # 旧 launchd 方式，仅作参考

data/
  settings.json         # 运行配置，可能包含本机状态；谨慎读取
  profile/              # Chromium/Electron 用户数据，默认不要读

logs/
  YYYY-MM-DD.log        # 运行日志
  debug-*.html          # 调试页面快照
  debug-*.txt           # 调试文本快照
```

---

## 默认禁止读取的大目录

除非用户明确要求，或者任务必须排查这些内容，否则不要读：

```text
node_modules/
dist/
build/
data/profile/
logs/
```

原因：

- `node_modules/` 是第三方依赖，体积极大。
- `dist/` 是打包产物，不是源码。
- `build/` 主要是图标和构建资源。
- `data/profile/` 是 Chromium/Electron 用户数据，体积极大，且可能包含 Cookie、Local Storage、缓存等敏感信息。
- `logs/` 只在排错时读最后几十行或关键词附近内容。

---

## 常用命令

### 安装依赖

```bash
npm install
npx playwright install chromium
```

### 开发模式启动 App

```bash
npm run app
```

### 打包 macOS App

```bash
npm run build:mac
```

打包产物通常在：

```text
dist/V2EX自动领奖励-*.dmg
dist/mac/V2EX自动领奖励.app
```

### 单独测试底层逻辑

```bash
npm run login
npm run claim
npm run claim:show
```

运行任何命令前，先查看 `package.json` 里的 `scripts`，不要凭空猜命令。

---

## 功能事实

当前 App 支持：

- 查看当前状态
- 手动立即领取一次
- 打开浏览器执行领取
- 重新登录 V2EX
- 设置每天几点自动执行
- 设置开机后自动启动
- 打开日志目录

默认设置：

```text
默认执行时间：08:00
默认开机启动：关闭
```

注意：

- 当前登录方式是 App 内部登录窗口，不再依赖额外弹出的 Playwright 浏览器窗口。
- `npm run app` 开发模式下，Electron 不能稳定注册 macOS 开机启动；开机启动应在打包后的正式 App 中验证。
- `launchd/` 里的 plist 是旧方案参考；除非用户明确要求恢复 launchd，否则优先维护 App 自己的定时和开机启动能力。

---

## 按任务选择最少文件

| 任务类型 | 优先查看文件 |
|---|---|
| UI / 界面文字 / 按钮 / 样式 | `src/renderer/index.html`、`src/renderer/renderer.js`、`src/renderer/styles.css` |
| 自动领取失败 | `src/claim.js`、`src/v2ex-service.js`、必要时看最后几十行日志 |
| 登录失败 / Cookie / 会话失效 | `src/login.js`、`src/v2ex-service.js`、必要时看 `data/settings.json` |
| 设置时间不保存 / 配置异常 | `src/settings.js`、`src/main.js`、`src/renderer/renderer.js` |
| 菜单栏、窗口、托盘、IPC | `src/main.js`、`src/preload.js`、`src/renderer/renderer.js` |
| 开机启动 | `src/launch-agent.js`、`src/main.js`、必要时看 `launchd/` |
| 打包 / dmg / app 问题 | `package.json`、`README.md`、必要时看 `dist/builder-effective-config.yaml` |
| 依赖 / 脚本问题 | `package.json`、`package-lock.json` |
| 日志排错 | 只读 `logs/` 中相关日期文件的最后 50-100 行 |

---

## 搜索规则

优先精准搜索，不要全项目扫。

推荐：

```bash
rg -n "关键词|函数名|报错信息" src package.json README.md launchd
```

需要扩大范围时，必须排除大目录：

```bash
rg -n "关键词" .   --glob '!node_modules/**'   --glob '!dist/**'   --glob '!build/**'   --glob '!data/profile/**'   --glob '!logs/**'
```

看日志时优先：

```bash
tail -n 80 logs/YYYY-MM-DD.log
```

有明确报错时：

```bash
rg -n "ERROR|failed|失败|cookie|login|claim|reward|once" logs/YYYY-MM-DD.log
```

只读取命中位置前后少量上下文。

---

## 修改规则

1. 先定位相关文件，再修改。
2. 优先小补丁，不要大重构。
3. 不要为了风格统一而格式化整个文件。
4. 不要无故升级依赖。
5. 不要无故修改 `package-lock.json`。
6. 不要修改 `data/profile/`。
7. 不要把 Cookie、Local Storage、登录态、日志里的敏感信息输出到回复中。
8. 如果必须读 `data/settings.json`，只提取必要字段，并避免泄露隐私。
9. 修改后说明改了哪些文件、为什么改、怎么验证。
10. 如果没有自动测试，给出最短人工验证步骤。

---

## 验证规则

优先使用项目已有脚本。

常见验证路径：

### UI 或主进程修改后

```bash
npm run app
```

人工检查：

```text
1. App 是否能启动
2. 菜单栏图标是否正常
3. 窗口是否能打开
4. 按钮点击是否有响应
5. 日志是否出现明显报错
```

### 登录相关修改后

```text
1. 启动 App
2. 点击“登录 V2EX”
3. 在 App 内部登录窗口完成登录
4. 关闭登录窗口
5. 回到主界面确认状态是否更新
```

### 领取逻辑修改后

```bash
npm run claim
# 或
npm run claim:show
```

也可以在 App 里点击“立即领取”验证。

### 打包相关修改后

```bash
npm run build:mac
```

人工检查：

```text
1. dist/ 是否生成 dmg
2. dist/mac/ 是否生成 app
3. 正式 App 中开机启动开关是否可用
```

---

## 回复格式

回复用户时尽量短，按这个结构：

```text
结论：
改动：
验证：
注意：
```

不要输出整份源码。  
不要解释 Electron/Node 基础知识，除非用户要求。  
需要用户补充信息时，只问一个最关键的问题。

---

## 用户给需求时的理想格式

用户最好这样提需求：

```text
目标：
现象：
复现步骤：
报错/日志：
希望修改：
不要动：
```

示例：

```text
目标：修复自动领取失败
现象：点击立即领取后提示未登录
复现步骤：启动 App -> 已登录 V2EX -> 点击立即领取
报错/日志：只贴最后 80 行
希望修改：只改登录状态判断
不要动：UI、打包配置
```

---

## 本项目最省 token 的工作流

1. 用户只给目标、现象、关键日志。
2. AI 先读 `AGENTS.md`、`README.md`、`package.json`。
3. AI 用 `rg` 定位关键词。
4. AI 只读相关函数附近内容。
5. AI 小范围修改。
6. AI 用最短命令验证。
7. AI 只汇报关键改动和验证结果。

这比让 AI 读取完整目录、完整日志、完整依赖更可靠，也更省 token。
