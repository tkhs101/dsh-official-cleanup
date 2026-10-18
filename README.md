# dsh-official-cleanup

清掉 DSH Web 界面里用不到的官方入口，并把「官方模型 API 上传 Session Log」钉死为关闭。

当前版本 `0.2.0`，适配 **dsh 0.2.1-rc.2**（manifest 里用 `engines.dsh = ">=0.2.1-rc.2 <0.3.0-0"` 声明）。版本不匹配时 DSH 的兼容性闸门会明确拒绝并给出提示，而不是让 Harness 崩掉。

## 功能

| # | 目标 | 做法 |
|---|---|---|
| 1 | 隐藏会话页左下角 **更多** 菜单里的「意见反馈」和「登录」 | Client half 用插件自己的样式表把这两行 `display:none`，并标记 `disabled`，让菜单的键盘走位跳过它们 |
| 1b | 让 **设置** 直接顶替「更多」这个菜单 | 用 `priority: -1` 遮住 `settings.launcher` 这个 single 槽位里的账号菜单，渲染一个直接调 `openSettings()` 的设置按钮 |
| 2 | 隐藏 **设置 → 模型** 里的 DeepSeek 官方 Provider 卡片 | 关闭 loader entry `llm-deepseek`，卡片的数据来源（provider 目录 + 适配器路由）一起消失 |
| 3 | 「在使用官方模型 API 时上传 Session Log」保持关闭 | Host half 在 `internal/config` waterfall 里把 `enabled` 钉成 `false` |

## 为什么这么做

**功能 1**：`AccountMenu` 是硬编码 JSX，没有扩展点、渲染出来的行也没有 `id`。所以按 DSH 自己的第三方 UI 插件（如 `dsh-ui-hub`）的做法：只标记节点，靠本插件自己的 `!important` 样式表生效。

**不删 DOM 节点**：`Menu` 渲染的是没有 key 的普通数组，删掉一行后 React 下一次 commit 会对已经不存在的节点调用 `removeChild`，抛错会让整个 launcher 槽位被永久判死（`deadCell`）。隐藏不动 React 的树，是安全的。

行的识别用**图标几何**（纸飞机 = 意见反馈，人像 = 登录），不依赖界面语言。

**功能 1b**：`settings.launcher` 是 `single` 槽位——同一优先级注册会直接抛错，而**最低优先级渲染**（框架自己的提示就是 “register at a different priority to shadow it (lowest renders)”）。所以用 `priority: -1` 遮住默认优先级 0 的账号菜单即可，不需要反注册它。按钮复制了宿主自己的齿轮图标几何和触发按钮尺寸（32px 常规 / 36×36 收起态），只换了类名前缀。

账号菜单并没有被注销，只是不再占据这个座位：它的设置分区、模型页登录编辑器、配额通知都在各自的槽位里，照常工作。

**功能 2**：Provider 卡片是数据，不是标记——没有 `data-provider` 之类的属性，纯 CSS 选不中。而 `llm-deepseek` 这个 entry 的注册同时负责 provider 目录条目和适配器路由，`disabled: true` 一次把两者都拿掉。设置页对缺行是容错的（降级为 `adapter-absent`），不会报错。

**功能 3**：`enabled` 是 volatile 字段，schema 默认值就是 `true`；而 bundle patch 是**优先级最低**的补丁层，profile patch 会覆盖它，Web 开关写进去的 `true` 还会跨重启保留。所以真正生效的是 Host half 的 `internal/config` waterfall——它在 fiber 解析配置时强制写回 `false`，覆盖开机、设置页写入和重新组合三条路径。

## 恢复办法

- 想恢复 **侧栏账号菜单（更多）**：删掉 `client.js` 里 `settings launcher` 那段注册（或把 `priority: -1` 去掉），刷新页面。
- 想恢复 **DeepSeek Provider 卡片**：删掉 `cordis.patch.yml` 里 `llm-deepseek` 那段（含 `disabled: true`），重启 Harness。
- 想恢复 **Session Log 上传开关**：删掉 `index.js` 里的 `internal/config` 监听（或整个停用本插件）。
- 想调整 **被隐藏的菜单行**：`client.js` 顶部的 `FEEDBACK_ICON` / `LOGIN_ICON` 就是那两个图标路径。

## 已知边界

- 设置按钮顶替「更多」之后，**DeepSeek 账号登录在这个 profile 里没有可见入口了**：唯一剩下的入口是模型页首启动引导里的 `settings.models.sign-in`，而那条路依赖官方 Provider 卡片，已被功能 2 一起关掉。这是功能 1b + 功能 2 叠加的结果，不是缺陷；要恢复就按上面「恢复办法」还原其中任意一项。
- 菜单行的隐藏依赖 `Menu` 目前的图标路径和 `:has()` 选择器；Harness 升级后如果换了图标路径，需要同步改 `client.js` 顶部两个常量（不写 `data-*` 标记时，这是唯一能定位这两行的稳定坐标）。
- 键盘方向键走位由菜单自己的实时 DOM 查询驱动；本插件把行标成 `disabled` 就是为了让它跳过这两行。升级后值得顺手按一次 ↑/↓ 确认。
- 关掉 `llm-deepseek` 会让「官方 DeepSeek API Key」这条路由整体消失（这正是需求），首启动引导会降级成 `adapter-absent`。
- Host half 的 `internal/config` 是 Cordis 的 `internal/*` 钩子，没有稳定性承诺。注册失败会被捕获并只记一条 console 错误：此时功能 3 退化为「默认关闭，但设置页可以打开、直到下次重启」，Harness 本身照常启动。
- Client half 的每个注册都单独隔了错误；任何一处注册被拒只会少一个效果，不会让前端启动失败。
- 设置按钮复制的是宿主当前的图标几何与按钮尺寸，只依赖 `--dsw-alias-*` 主题 token；宿主换了图标或尺寸时外观可能略有出入，改 `client.js` 里的 `GEAR_PATHS` 和 `.doc-launcher` 即可。

## 安装

要求 dsh `>= 0.2.1-rc.2`（manifest 里的 `engines.dsh`，版本不符时 DSH 会直接给出提示而不是崩掉）。纯 JavaScript、无构建步骤、无运行时依赖，所以从 git 安装不需要 `prepare` 脚本。

```bash
# 从 GitHub 装（推荐锁定 tag，避免以后被上游改动影响）
dsh plugin --profile web add github:tkhs101/dsh-official-cleanup#v0.3.0

# 跟主干（始终取最新）
dsh plugin --profile web add github:tkhs101/dsh-official-cleanup

# 从本地目录装（自己改着玩）
dsh plugin --profile web add /path/to/dsh-official-cleanup

# 卸载
dsh plugin --profile web remove @local/dsh-official-cleanup
```

`dsh plugin` 只是把参数原样转给 profile 目录里的 pnpm，所以 `add / remove / why` 都能用；装完 DSH 会自己把包加进 `dsh.profile.bundles` 并应用它的补丁层。

装完后**刷新页面**即可；本插件的补丁层改了 loader entry（`llm-deepseek`），那一部分要**重启一次 Harness** 才在新进程里生效。

想把 dsh 换成别的 profile，把 `--profile web` 换成对应名字即可。

## 分发渠道

| 渠道 | 状态 | 用户装法 |
|---|---|---|
| GitHub 仓库 | ✅ 已验证 | `dsh plugin --profile web add github:tkhs101/dsh-official-cleanup#v0.3.0` |
| npm | ⛔ 未发布 | 需要先把 `package.json` 的 `"private": true` 去掉并把 `@local/` 换成可发布的名字；之后 `dsh plugin --profile web add <包名>` |
| 插件市场（rc.2 的 Discover 面板） | ⛔ 未收录 | 市场读用户自己配置的索引 URL（`plugin-market` 的 `indexes`），索引用 format 1 的 JSON；Git 托管的条目用 commit 固定的 `git+https` 地址 |
| 社区清单（awesome-dsh-plugins 系列） | ⛔ 待提 PR | 往清单仓库加一行 + 本仓库启用 `dsh-plugin` topic（topic 已加） |

本仓库已启用 `dsh-plugin` / `deepseek-harness` / `dsh` 三个 topic，社区清单目前就是靠这个筛。

## 第三方声明

- 设置按钮的齿轮图标几何（`client.js` 里的 `GEAR_PATHS`）与按钮尺寸/配色规则复制自 DeepSeek Harness 的客户端 UI 基础组件，遵循其 MIT 许可：MIT License, Copyright (c) 2026 DeepSeek。
- 本插件通过 DSH 自己的槽位与 loader 补丁层工作，不修改 DSH 安装目录里的任何文件。

## English

A DeepSeek Harness Web UI cleanup plugin (dsh `0.2.1-rc.2`, declared via `engines.dsh`):

- **Sidebar**: the 「更多」 account menu is shadowed (`settings.launcher`, `priority: -1`, lowest priority renders) by a button that opens Settings directly. The rows 意见反馈 / 登录 stay filtered should the menu ever come back.
- **Models page**: the unusable official DeepSeek provider card is removed at its source by disabling the loader entry `llm-deepseek`, which owns the provider directory entry and the adapter routes in one registration. The page degrades to `adapter-absent`, by design.
- **Settings → General**: "Upload Session Log when using the official model API" is pinned off in the fiber's resolved config through a global `internal/config` waterfall, because the bundle patch layer alone is overridden by the profile patch and the Web toggle would persist `true`.

Every registration is failure-isolated: a refused hook disables one effect with a console error instead of breaking the boot.

Licensed MIT. The gear icon geometry is copied from DeepSeek Harness (MIT, Copyright (c) 2026 DeepSeek).
