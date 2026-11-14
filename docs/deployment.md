# GitHub Pages 与 Cloudflare 部署

核心图表从GitHub Pages加载静态文件，LLM扩展通过Cloudflare Workers调用DeepSeek公共API。网页与助手分别部署。

## GitHub Pages

仓库使用 `main` 分支根目录和 `.nojekyll` 发布：

- [仓库](https://github.com/dai1107/Interactive-Visualization)
- [在线网页](https://dai1107.github.io/Interactive-Visualization/)
- [探索助手](https://dai1107.github.io/Interactive-Visualization/#assistant)

提交并推送后，等待Pages构建完成，再核对实际资源：

```powershell
python scripts/check_site.py https://dai1107.github.io/Interactive-Visualization/
```

## 构建 Worker

```powershell
node scripts/build_worker.mjs
```

输出 `dist-worker/penguin-llm.mjs`，从原始CSV、统计模型和请求处理器生成；构建不读取 `.env`，不嵌入密钥或访问口令。配置见 [wrangler.jsonc](../wrangler.jsonc)。

在Cloudflare控制台创建 `penguin-llm` Worker，兼容日期使用 `2026-11-13` 或更新日期，启用 `nodejs_compat`。进入Edit code，用生成文件完整替换 `worker.js`，点击Deploy。

也可使用官方Wrangler登录后运行 `npx wrangler deploy`；配置会先执行同一构建脚本。

## 运行时配置

在Settings的Runtime variables and secrets添加两个 **Secret**：

| 名称 | 内容 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 拥有者自己的DeepSeek API Key |
| `LLM_ACCESS_TOKEN` | 自行设置的随机访问口令，至少16位 |

可选的普通文本变量：

| 名称 | 默认值 |
| --- | --- |
| `LLM_BASE_URL` | `https://api.deepseek.com` |
| `LLM_MODEL` | `deepseek-flash` |
| `LLM_ALLOWED_ORIGINS` | `https://dai1107.github.io` |

网页来源不包含项目路径；多个来源用逗号分隔。模型密钥仅在服务端配置，网页访问口令只保存在当前页面会话内存中。

## 网页接入与验收

当前接口为 `https://penguin-llm.3852816006.workers.dev/api/penguin-llm`，公开地址在 [llm-config.js](../assets/llm-config.js) 中配置。

健康检查应返回 `protocol: "penguin-llm-v1"`。配置齐全时，直接打开接口显示 `ready: true`、`authenticated: false` 正常；健康检查不调用模型。

在探索助手输入与 `LLM_ACCESS_TOKEN` 一致的值，点击连接并检查，然后再提问。拥有者已确认线上真实模型回答返回。可使用“合并全部年份，只看帽带雌性企鹅”检查候选条件：预计34条、体型r约0.242；候选应用和撤销需单独验收。

[查看探索助手界面](assistant-preview.png)。

## 本地调试助手

使用Node.js 22或以上，在忽略的 `.env` 中填写本机调试配置：

```powershell
Copy-Item .env.example .env
node --env-file=.env server/dev.mjs
```

打开 `http://127.0.0.1:8894/#assistant`，将页面中的助手服务地址改为 `http://127.0.0.1:8894/api/penguin-llm`，填写本机配置的访问口令。`.env` 不提交到Git；本地服务只绑定回环地址。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| `ready: false` | 两个Secret是否保存并部署，口令是否至少16位 |
| 连接时口令不正确 | 输入Secret的值，而不是变量名称或模型API Key |
| 页面来源不允许 | `LLM_ALLOWED_ORIGINS` 是否包含当前来源 |
| 已连接但提问报错 | 连接成功只验证后端；另检查模型密钥、额度、上游错误与运行时兼容性 |

Workers不支持 `redirect: 'error'`。当前模型请求使用 `manual` 并拒绝3xx，避免请求在发出前报错或向重定向地址转发认证信息。此行为已通过官方Wrangler/workerd验证；协议夹具、无效密钥联网检查和真实模型回答分别记录，不混为一次验收。

官方资料：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Workers首次部署](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/)、[Node.js兼容模式](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)、[Secret](https://developers.cloudflare.com/workers/configuration/secrets/)、[Request重定向模式](https://developers.cloudflare.com/workers/runtime-apis/request/)。
