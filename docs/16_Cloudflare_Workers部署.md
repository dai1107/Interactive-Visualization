# Cloudflare Workers 部署企鹅助手

保留 GitHub Pages 图表前端，将助手接口单独部署到 Cloudflare Workers。仓库根目录的 `wrangler.jsonc` 与 `scripts/build_worker.mjs` 已准备好，无需迁移整站。

## 当前接入阶段

2026年11月14日：完整 Worker 接口已部署，拥有者已在 Cloudflare 后台保存两个 Secret。公开接口为：

`https://penguin-llm.3852816006.workers.dev/api/penguin-llm`

实际健康检查返回 HTTP 200、`ready: true`、`authenticated: false`、`model: "deepseek-flash"`、`protocol: "penguin-llm-v1"`；携带 GitHub Pages 来源时返回对应的跨域响应头。未读取或保存密钥，也没有通过健康检查调用模型。

前端提供独立探索助手工作区并预填以上服务地址。50项程序测试通过，桌面及320/390px窄屏布局已通过实际浏览器检查。真实模型提问、候选操作应用与撤销仍需由拥有者在网页中输入访问口令后验收；本地标记的模型夹具不能作为线上模型成功的证据。

## 构建单文件

```powershell
node scripts/build_worker.mjs
```

输出为 `dist-worker/penguin-llm.mjs`。文件从同一份原始 CSV、现有统计模型与现有鉴权处理器生成，包含运行所需的代码和数据；不读取 `.env`，不嵌入密钥或访问口令。只保留 Node 内置模块 `node:crypto` 与 `node:buffer`，需要 Workers 的 Node.js 兼容模式。

## 通过控制台部署

1. Workers & Pages → Create application → Start with Hello World，名称填 `penguin-llm`，创建 Worker。
2. Settings → Runtime：Compatibility date 使用 `2026-11-13` 或更新日期；Compatibility flags 添加 `nodejs_compat`。
3. More actions → Edit code。用生成文件的完整内容替换 `worker.js`，然后点击 Deploy。
4. 返回 Settings → Runtime variables and secrets，添加以下两个 **Secret**：

| 名称 | 值 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 自己的 DeepSeek API Key |
| `LLM_ACCESS_TOKEN` | 自己设置的随机访问口令，至少16位 |

默认模型为 `deepseek-flash`，默认模型根地址为 `https://api.deepseek.com`，默认允许网页来源为 `https://dai1107.github.io`。如需覆盖，可添加同名文本变量 `LLM_MODEL`、`LLM_BASE_URL`、`LLM_ALLOWED_ORIGINS`。来源不包含项目路径。

密钥在 Secret 输入框中填写，不能放入公开代码、源码包、README 或提交记录。访问口令由使用者在网页里输入，仅保存在当前页面会话内存中。

## 验证与网页接入

接口路径为 `/api/penguin-llm`，根路径 `/` 也提供健康检查。访问接口应返回 `protocol: "penguin-llm-v1"`。配置完成后，未携带口令的健康检查通常显示 `ready: true`、`authenticated: false`；这不是鉴权失败，也不代表已经调用了模型。

将完整 HTTPS 接口地址填入 `assets/llm-config.js` 的 `LLM_ENDPOINT`。网页中打开探索助手，填写访问口令并连接。健康检查不调用模型；成功提问后才有模型回答和 API 用量。

测试问题可使用“合并全部年份，只看帽带雌性企鹅”。候选操作应用后应为34条、r约0.242；撤销后应恢复提问前的条件。需要将本地协议测试、带明确标签的模型夹具与真实上游模型调用分开记录。

## CLI 部署

也可以使用官方 Wrangler 登录后运行 `npx wrangler deploy`。配置会先执行同一构建脚本，并应用兼容标记和三个公开变量。两个 Secret 应通过控制台或 Wrangler 的交互式 `secret put` 命令输入，不作为 shell 参数保存。

依据：[Workers 首次部署](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/)、[Node.js 兼容模式](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)、[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
