# 崔彦斌的游戏空间

一个纯静态、零外部依赖的免费在线小游戏网站，包含 8 款经典小游戏。所有游戏都在浏览器本地运行，无需登录、没有广告、不加载任何第三方脚本或字体，可直接部署到 **Cloudflare Workers**、**Cloudflare Pages**（或任意静态托管）。

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

所有游戏均支持手机触屏与电脑键盘；音效由 Web Audio 实时合成，没有音频文件。

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

## 部署到 Cloudflare Pages

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

## 部署到 Cloudflare Workers（静态资源）

仓库已包含 `wrangler.jsonc`，使用 Workers 的静态资源功能，不需要编写任何 Worker 脚本，也不需要构建。

### 方式一：连接 GitHub 自动部署

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **GitHub**。
2. 选择仓库 `Xsny-001/cuiyanbin-game-space`，生产分支选 `main`。
3. Worker 名称填写 **`cuiyanbin-game-space`**（必须与 `wrangler.jsonc` 中的 `name` 一致）。
4. 构建设置：
   - **Build command**：`npm ci`
   - **Deploy command**：`npx wrangler deploy`
5. 点击 **Save and Deploy**，完成后会得到一个 `*.workers.dev` 域名。
6. 之后每次推送到 `main` 都会自动重新部署。

### 方式二：本地命令行部署

```bash
cd cuiyanbin-game-space
npm install
npx wrangler login
npx wrangler deploy
```

首次部署会创建 Worker 并输出 `https://cuiyanbin-game-space.<你的子域>.workers.dev`。日常本地预览可运行 `npm run dev`。

### 配置说明

- `assets.directory` 指向仓库根目录 `.`，由 `.assetsignore` 排除 README、配置文件等非站点文件。
- `not_found_handling: "404-page"` 让不存在的路径返回根目录的 `404.html`。
- `_headers` 在 Workers 静态资源中同样生效，用于安全响应头与缓存策略。
- 静态资源请求免费且不限量，无需数据库、环境变量或构建产物。
- 绑定自定义域名：Worker → **Settings** → **Domains & Routes** → **Add custom domain**。

## 目录结构

```text
.
├── index.html                  # 首页：游戏列表、搜索、筛选
├── 404.html                    # 自定义 404
├── manifest.webmanifest        # PWA 基础信息
├── _headers                    # Cloudflare 响应头 / 缓存
├── wrangler.jsonc              # Cloudflare Workers 部署配置
├── package.json                # Wrangler 开发依赖与命令
├── .assetsignore               # 不上传为静态资源的文件
├── assets/
│   ├── css/base.css            # 设计变量、按钮、通用样式
│   ├── css/site.css            # 首页样式
│   ├── css/game.css            # 游戏页与各游戏样式
│   ├── js/common.js            # 存档、音效、画布、提示等公共能力
│   ├── js/site.js              # 首页搜索 / 筛选 / 成绩展示
│   └── img/favicon.svg         # 站点图标
└── games/
    ├── snake/                  # 贪吃蛇
    ├── 2048/                   # 2048
    ├── tetris/                 # 俄罗斯方块
    ├── breakout/               # 打砖块
    ├── minesweeper/            # 扫雷
    ├── memory/                 # 记忆翻牌
    ├── whack/                  # 打地鼠
    └── gomoku/                 # 五子棋
```

每个游戏目录都是独立的 `index.html` + 游戏脚本 + 共用样式，没有打包步骤。

## 数据与隐私

- 成绩与设置只保存在浏览器 `localStorage` 中，键名统一以 `cyb.` 开头，不会上传服务器。
- 音效开关保存在 `cyb.sound`；清除浏览器站点数据即可彻底重置。
- 站点不包含统计脚本、广告、Cookie 或任何跨域请求。

主要存档键：

| 键名 | 含义 |
| --- | --- |
| `cyb.best.snake` | 贪吃蛇最高分 |
| `cyb.best.2048` | 2048 最高分 |
| `cyb.best.tetris` | 俄罗斯方块最高分 |
| `cyb.best.breakout` | 打砖块最高分 |
| `cyb.best.minesweeper` | 扫雷最快用时（秒） |
| `cyb.minesweeper.best.easy/medium/hard` | 各难度最快用时 |
| `cyb.best.memory` | 记忆翻牌最少步数 |
| `cyb.best.whack` | 打地鼠最高分 |
| `cyb.wins.gomoku` / `cyb.losses.gomoku` | 五子棋胜 / 负场 |

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
