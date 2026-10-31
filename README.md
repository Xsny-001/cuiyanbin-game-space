# 崔彦斌的游戏空间

一个纯静态的免费在线小游戏网站，包含 17 款经典小游戏。单机部分完全在浏览器本地运行，不需要登录，成绩只存 `localStorage`；另有「联机大厅」提供门禁与大厅聊天，对局走 WebRTC P2P，仓库里没有任何后端代码，也没有数据库。3D 空战所需的 Three.js、联机所需的 Netlib 均已随仓库内置，可直接部署到 **Cloudflare Workers**、**Cloudflare Pages**（或任意静态托管）。

## 游戏列表

| 游戏 | 类型 | 玩法 | 最高分记录 |
| --- | --- | --- | --- |
| 🐍 贪吃蛇 | 休闲 / 动作 | 吃果实变长，撞墙或咬到自己结束 | 分数 |
| 🔢 2048 | 益智 | 滑动合并数字，冲击 2048 方块 | 分数 |
| 🧩 俄罗斯方块 | 休闲 / 策略 | 旋转堆叠、消行升级 | 分数 |
| 🧱 打砖块 | 动作 | 拖动挡板接球，清空砖墙过关 | 分数 |
| 💣 扫雷 | 益智 / 策略 | 首点安全、长按插旗、三档难度 | 最快用时 |
| 🃏 记忆翻牌 | 休闲 / 益智 | 翻开卡片配对全部 8 对图案 | 最少步数 |
| 🐹 打地鼠 | 休闲 / 反应 | 30 秒限时，金色地鼠 3 分 | 分数 |
| ⚫ 五子棋 | 策略 / 益智 | 人机对战，先连成五子获胜 | 胜场 |
| 🐤 Flappy Bird | 休闲 / 反应 | 点击拍翅膀，穿过水管，速度逐渐加快 | 分数 |
| 🏸 像素羽毛球 | 休闲 / 动作 | 11 分制人机对战，三种操作，过网滞空慢动作 | 胜场 |
| ⚽ 像素足球 | 休闲 / 体育 | 5 对 5 人机或双人同屏，传球、蓄力射门与铲抢 | 胜场 |
| 🏸 像素羽毛球 · 竞技版 | 休闲 / 动作 | 四档 AI、真实空气阻力弹道与手臂长度约束，更耐打的进阶版 | 胜场 |
| 🎯 巷战 · 战术小队 | 休闲 / 动作 | 俯视角小队射击，WASD 跑位、M4A1 / RPG-7 / AWM 切换 | — |
| 🎱 中式八球 | 休闲 / 体育 | 双人同屏台球，打进自己球组后收黑八 | — |
| 💥 坦克之星 | 休闲 / 策略 | 回合制坦克对轰，调角度、算弹道、挑子弹 | 胜场 |
| ✈️ 中途岛空战 | 动作 / 模拟 | 3D 航母起飞与俯冲轰炸，击沉四艘航母 | 胜场 |
| 🎯 山谷高射炮 | 动作 / 策略 | 3D 防空战役，五波敌机、Boss 与血月死守 | 胜场 |

所有游戏均支持手机触屏与电脑键盘；音效由 Web Audio 实时合成，没有音频文件。

### 像素羽毛球操作说明

- **拖拽**：鼠标或手指移动球拍，碰到羽毛球自动回击。
- **摇杆**：左摇杆移动，右摇杆朝网前/后场方向推一下挥拍。
- **时机**：球拍自动跟随，羽毛球进入范围时点「挥拍」或按空格。
- 键盘统一支持方向键 / WASD 移动、空格挥拍。
- 发球自动进行；先得 11 分且领先 2 分获胜，10 平后需拉开 2 分，15 分封顶。
- 开启「过网滞空」后，球飞向自己时会触发短暂慢动作，便于反应。

### 像素羽毛球 · 竞技版

`games/pixel-badminton/` 是同一题材的进阶版本，和上表的「像素羽毛球」是两套独立实现，可以对照着玩：

- **真实弹道**：球速受与速度平方成正比的空气阻力影响，六种球路（杀球 / 高远 / 挑球 / 平抽 / 吊球 / 搓网）由「飞行时间 + 落点」反解出初速，轨迹前后不对称。
- **手臂长度锁死**：拍头到肩的距离固定，够不到的高远球只能靠跑位、跨步探身或起跳去接，不会出现"橡皮筋手臂"。
- **四档 AI**：入门 / 新手 / 普通 / 高手，差异体现在跑动速度、反应延迟、瞄准误差、进攻欲望与主动失误率；相持越久 AI 越容易手抖。
- **1V1 / 2V2 / 4V4**：每边人数可选，我方真人数量也可选（其余位置由人机队友补上，最少 1 个真人）；多人时操控权自动跟随离球最近的球员，同侧按前后分区各守一块。
- **双人同屏**：一台设备两个人对打——左右半屏各归一个人，各拖自己那半边控制球拍；2V2 / 4V4 时其余位置由人机补位。电脑上 P1 用鼠标 / WASD，P2 用方向键 + Enter。
- **拖拽模式杀球键**：全人（我方无人机队友，双人模式则两边都没有人机）时，拖拽模式下会出现「杀球」键——按下后 0.6 秒内拍面碰到球就强制杀球，不用再苦练甩拍手势；电脑上 P1 按 F，P2 按右 Shift。
- **三种操作**：拖拽（鼠标 / 手指 / 方向键）、双摇杆、时机挥拍，共用同一套物理与判定。
- **过网滞空**：球飞向自己时世界降到 0.36 倍速，但玩家的操作速度只被轻微拖慢。

### 像素足球操作说明

- 开球前可选择**虚拟摇杆**或**四向虚拟按键**移动，手机和电脑显示同一套屏幕控制，选择会自动保存。
- 屏幕右侧固定提供传球、按住蓄力/松开射门、铲抢和换人按钮；双人同屏时左右两侧各有一套方向与动作控制。
- 虚拟按键支持同时按住两个方向斜向跑动；摇杆则按拖动幅度控制方向。
- 每队 5 人，上下半场各 90 秒，无越位和犯规；进球、界外球、角球与门球后自动重开。
- 单人胜负计入战绩，平局和双人同屏局不写入胜负。

### 山谷高射炮操作说明

- 左下虚拟摇杆转动炮塔，右下「开火」按钮持续射击；电脑也可按住空格开火。
- 战役共五波，第三波起出现俯冲机，最终波会出现巨型空中 Boss。
- 第五波结束后进入血月防线，需要坚持 60 秒等待后方洲际导弹支援。
- 基地或高射炮耐久归零即失败；通关记 1 个胜场，失败记 1 个负场。

### 关于 3D 与外部资源

- 「中途岛空战」和「山谷高射炮」都是 Three.js 3D 游戏，引擎文件已放在 `assets/vendor/three.min.js`（r128，MIT 协议）随仓库一起部署，运行时不请求任何 CDN。
- 该页面原本还依赖 Tailwind CSS 的 CDN 版本，已改为页面内的等价工具类；「坦克之星」原本从 Google Fonts 取字体，已改为系统字体回退。
- 因此整站首次访问后即可离线运行，`git clone` 下来直接开服务器就能玩全部 17 款。

## 联机大厅

入口：首页导航「联机大厅」，不再有独立的 `lobby.html`。

**当前已联机的游戏只有五子棋**（试点 1/5），其余 16 款仍是纯单机，脚本没有被引入。

### 玩家视角

1. 点导航「联机大厅」，输入账号（`admin` / `1949101`）和昵称。
2. 登录后自动进入固定大厅房间，导航会显示「联机大厅 · N」，右下角出现聊天按钮。
3. 点五子棋卡片会提示「即将进入游戏房间，大厅连接将断开」，确认后进入游戏页。
4. 游戏页会自动进同一个固定房间：先进的是房主执黑，后进的是客机执白。
5. 落子、重开实时同步；右下角仍是同一个聊天面板，只是标题变成「五子棋」。

未登录时首页不会弹任何窗，全部单机游戏照常可玩；五子棋页会显示「想和朋友下？联机对战」按钮，点了才要求登录。

### 配置

全部集中在 `assets/js/net/p2p.js` 顶部：

```js
var SITE_LOBBY    = 'cybmy78_main_lobby';   // 大厅房间名
var GAME_PASSWORD = '1949101';              // 所有房间共用的密码

var CONFIG = {
  ACCOUNT: { user: 'admin', pass: '1949101' },   // 门禁
  ROOMS: {
    lobby:  { name: SITE_LOBBY,       gameId: '…', maxPlayers: 8 },
    gomoku: { name: 'cybmy78_gomoku', gameId: '…', maxPlayers: 2 }
  }
};
```

改账号、密码、房间名、人数上限都只动这一处。新增联机游戏时在 `ROOMS` 里加一项、分配一个新 `gameId` 即可，房间池互不可见。

### 房间是怎么"碰头"的

Netlib 没有"固定房间码"这个概念：`create()` 返回的是服务端随机码，`joinOrCreate()` 会忽略传入的名字（实测返回的 code 与传入值无关，且 `password` 不生效）。所以固定碰头是靠三条组合实现的：

1. `create()` 时把房间名写进 `customData.room`，同时设 `password` 与 `maxPlayers`；
2. 后来者用 `list()` 拉公开房，按 `customData.room` 匹配，找到就 `join(code, GAME_PASSWORD)`；
3. 两端同时建房时，房间码字典序小的一方胜出，另一方 `leave()` 后加入对方。

房主每 30 秒刷新一次 `customData.ts` 心跳；超过 2 分钟没有心跳的房间会被判定为残骸直接跳过，避免有人被塞进"房主早已关闭"的僵尸房。

### 已知边界

- 账号密码硬编码在前端，**任何人查看源码即可绕过**，localStorage 只是个标记。它挡的是"随手点进来的同学"，不是有心人。
- 纯静态没有服务器裁决，房主理论上可以改客户端作弊。娱乐场景，不做反作弊。
- 页面跳转到游戏页时 WebRTC 必然断开，这是静态多页应用的固有限制，所以跳转前用 `confirm` 提示。
- Netlib 的信令与 TURN 由 Poki 提供（`wss://netlib.poki.io`、`turn.cloudflare.com`），没有 SLA，可能被限流或改协议。传输层封装在 `p2p.js` 单点，将来可整体替换。
- 大厅上限 8 人，满了会开第二个厅，两厅的人互相看不见。
- `_headers` 里的 CSP 只对 Cloudflare 生效，本地 `python -m http.server` 不带这些头；验证 CSP 要用 `npx wrangler dev`。
- 自有 JS/CSS 按 `max-age=0, must-revalidate` 回源校验，`?v=` 只是双保险，改动 `p2p.js` / `chat.js` / `gomoku/net.js` 后建议同步改版本号。


## 本地预览

不需要安装依赖，任意静态服务器即可：

```bash
# 在项目根目录执行
python3 -m http.server 8080
# 打开 http://localhost:8080
```

或者：

```bash
npx serve .
```

> 直接双击 `index.html` 也能打开首页，但建议用本地服务器预览，行为与线上一致。

## 部署到 Cloudflare Pages（推荐）

> 这是当前采用的方式。项目没有任何构建步骤，Pages 直接托管仓库根目录。

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权 GitHub，选择仓库 `Xsny-001/cuiyanbin-game-space`，生产分支选 `main`。
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空（本项目无需构建）
   - **Build output directory**：`/`（若提示无效，可改为 `.`，即仓库根目录）
4. 点击 **Save and Deploy**。首次部署完成后会得到一个 `*.pages.dev` 域名。
5. 之后每次推送到 `main` 都会自动重新部署；也可以在 Pages 项目里绑定自定义域名。

> 不想连接 Git 也可以：在 Pages 中选择 **Direct Upload**，把整个项目文件夹（或 zip）直接拖进去即可，同样无需构建。

项目根目录的 `_headers` 会由 Cloudflare Pages 自动识别，用于设置安全响应头与缓存策略；`404.html` 会作为自定义 404 页面。

> 因为发布目录是仓库根目录，`README.md`、`package.json` 这类文件也会被静态托管（内容本来就是公开的，无敏感信息）。如果介意，可在 Pages 项目里用 `_redirects` 把它们重写到 404。

### 命令行部署

```bash
npm install          # 安装 wrangler（仅首次）
npx wrangler login   # 在你自己电脑上登录 Cloudflare
npm run deploy       # 等价于 wrangler pages deploy .
```

`wrangler.jsonc` 里的 `pages_build_output_dir` 已指向 `.`，`npm run dev` 会用 `wrangler pages dev .` 在本地带 `_headers` 预览。

### 绑定自定义域名

Pages 项目 → **Custom domains** → **Set up a domain**，填入 `cybmy78.cc.cd`。如果这个域名当前还绑在旧的 Worker 上，需先在 Worker 的 **Settings → Domains & Routes** 里移除，否则两边会抢同一个域名。

## （可选）改回 Cloudflare Workers

如果以后想用 Workers 的静态资源而不是 Pages：把 `wrangler.jsonc` 换回

```json
{
  "name": "cuiyanbin-game-space",
  "compatibility_date": "2026-10-25",
  "assets": { "directory": ".", "not_found_handling": "404-page" }
}
```

然后 `npm run deploy:workers`。`.assetsignore` 只在 Workers 模式下生效，用来排除 README、配置文件等非站点文件。

## 目录结构

```text
.
├── index.html                  # 首页：游戏列表、搜索、筛选
├── 404.html                    # 自定义 404
├── manifest.webmanifest        # PWA 基础信息
├── _headers                    # Cloudflare 响应头 / 缓存
├── wrangler.jsonc              # Cloudflare Pages 部署配置
├── package.json                # Wrangler 开发依赖与命令
├── .assetsignore               # 仅 Workers 模式使用：排除非站点文件
├── assets/
│   ├── css/base.css            # 设计变量、按钮、通用样式
│   ├── css/site.css            # 首页样式
│   ├── css/game.css            # 游戏页与各游戏样式
│   ├── js/common.js            # 存档、音效、画布、提示等公共能力
│   ├── js/site.js              # 首页搜索 / 筛选 / 成绩展示
│   ├── js/net/p2p.js           # 联机基建：门禁、房间、消息信封
│   ├── js/net/chat.js          # 悬浮聊天组件
│   ├── css/net.css             # 门禁与聊天样式
│   ├── vendor/netlib.js        # Poki Netlib（26 KB，P2P 与信令）
│   └── img/favicon.svg         # 站点图标
└── games/
    ├── snake/                  # 贪吃蛇
    ├── 2048/                   # 2048
    ├── tetris/                 # 俄罗斯方块
    ├── breakout/               # 打砖块
    ├── minesweeper/            # 扫雷
    ├── memory/                 # 记忆翻牌
    ├── whack/                  # 打地鼠
    ├── gomoku/                 # 五子棋
    ├── flappy/                 # Flappy Bird
    ├── football/               # 像素足球
    ├── pixel-badminton/        # 像素羽毛球竞技版
    ├── street-war/             # 巷战
    ├── billiards/              # 中式八球
    ├── tank-stars/             # 坦克之星
    ├── midway/                 # 中途岛空战
    ├── valley-flak/            # 山谷高射炮
    └── badminton/              # 像素羽毛球
```

每个游戏目录都是独立的 `index.html` + 游戏脚本 + 共用样式，没有打包步骤。

## 数据与隐私

- 单机的成绩与设置只保存在浏览器 `localStorage` 中，键名统一以 `cyb.` 开头，不会上传服务器。
- 音效开关保存在 `cyb.sound`；清除浏览器站点数据即可彻底重置。
- 联机功能不经过任何自建服务器：账号密码在浏览器本地比对，`localStorage['cyb.auth.v1']` 只存用户名、昵称和时间戳，**不存密码**。
- 聊天记录只存在内存里，刷新即清空，不落盘、不上传。
- 对局数据走 WebRTC P2P 直连（必要时经 Poki 提供的 TURN 中继），信令经 `wss://netlib.poki.io`。
- 站点不包含统计脚本、广告与第三方 Cookie。

主要存档键：

| 键名 | 含义 |
| --- | --- |
| `cyb.best.snake` | 贪吃蛇最高分 |
| `cyb.best.2048` | 2048 最高分 |
| `cyb.best.tetris` | 俄罗斯方块最高分 |
| `cyb.best.breakout` | 打砖块最高分 |
| `cyb.best.minesweeper.v2` | 扫雷跨难度最快用时（秒，v2） |
| `cyb.minesweeper.v2.best.easy/medium/hard` | 扫雷各难度纪录（秒、毫秒、写入时间） |
| `cyb.best.memory` | 记忆翻牌最少步数 |
| `cyb.best.whack` | 打地鼠最高分 |
| `cyb.wins.gomoku` / `cyb.losses.gomoku` | 五子棋胜 / 负场 |
| `cyb.best.flappy` | Flappy Bird 最高分 |
| `cyb.wins.badminton` / `cyb.losses.badminton` | 像素羽毛球胜 / 负场 |
| `cyb.wins.football` / `cyb.losses.football` | 像素足球单人胜 / 负场 |
| `cyb.wins.valley-flak` / `cyb.losses.valley-flak` | 山谷高射炮通关 / 失败场次 |
| `cyb.football.settings` | 像素足球上次选择的模式与 AI 难度 |
| `cyb.badminton.settings` | 像素羽毛球上次选择的场地、操作模式与滞空设置 |

## 自定义

- **改配色**：编辑 `assets/css/base.css` 顶部的 CSS 变量（`--brand`、`--brand-2`、`--bg` 等）。
- **加游戏**：在 `games/` 下新建目录，复制任一游戏的页面结构，再在 `index.html` 中加一张 `.game-card` 卡片；卡片上的 `data-game` 与存档键对应即可自动显示最高成绩。
- **改文案**：首页标题、副标题、页脚都在 `index.html` 中，直接修改即可。

## 技术说明

- 原生 HTML / CSS / JavaScript，无框架、无构建、无依赖。
- Canvas 2D 渲染游戏画面，`devicePixelRatio` 适配高分屏。
- Web Audio API 合成音效，可一键静音。
- 响应式布局，支持键盘、鼠标、触摸滑动与屏幕按钮。
- 遵循 `prefers-reduced-motion`，减少动画用户也能正常游玩。

## License

[MIT](./LICENSE) © 2026 崔彦斌
