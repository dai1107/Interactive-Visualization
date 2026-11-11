# Palmer 企鹅交互探索

研究问题：鳍长与体重的关系在不同物种和性别中是否一致？本项目独立完成，从作业 2 的探索性分析继续发展为作业 3 的交互式网页。

已实现可从静态 CSV 加载数据的交互网页，支持物种与性别筛选、个体详情、同步统计、重置和可展开数据表。第五阶段新增刷选与直方图联动、子集与基准比较、五步探索引导、动态观察说明，以及可开关的物种均值标注，并优化文字与窄屏布局。采用 Vega-Lite 绘图，Vega 相关库以固定版本保存在 `vendor/`，不依赖 CDN、外部字体或定制后端。

**在线体验：https://dai1107.github.io/Interactive-Visualization/**

仓库：https://github.com/dai1107/Interactive-Visualization 。GitHub Pages 已构建成功，10 项线上资源均返回 HTTP 200 且与本地文件一致；浏览器实测限制见[实现与验收记录](docs/04_实现与验收.md)。

## 项目资料

- [实施清单与当前进度](作业3实施清单.md)
- [需求与选题范围](docs/01_需求与选题.md)
- [数据核查与分组统计](docs/02_数据核查.md)
- [视觉编码与交互规格](docs/03_视觉与交互设计.md)
- [布局草图](docs/wireframe.png)
- [实现与验收记录](docs/04_实现与验收.md)
- [刷选联动与基准比较及手工验收](docs/05_刷选联动与基准比较.md)
- [解释叙事与设计优化及手工验收](docs/06_解释叙事与设计优化.md)
- [前期 EDA 报告](EDA_企鹅数据探索/企鹅数据探索报告.md)

## 复核数据

在仓库根目录执行，Python 3 标准库即可运行：

```powershell
python scripts/audit_penguins.py
```

输出 `docs/data-audit.json` 和 `docs/02_数据核查.md`，不修改原始 CSV。原始 344 条记录中，342 条鳍长与体重有效，333 条同时记录了性别。总体 Pearson r≈0.871；分物种后约为 0.468、0.642、0.703。

## 本地运行

无需安装 npm 依赖或构建。安装 Python 3 后，在仓库根目录启动静态 HTTP 服务：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

浏览器打开 http://127.0.0.1:8000/ 。结束预览时在终端按 Ctrl+C。不要直接双击 `index.html` 使用 `file://` 打开，浏览器会限制模块和 CSV 加载。也可运行 `npm start` 启动相同服务。

测试需要 Node.js 18 或以上版本，无需安装第三方测试依赖：

```powershell
node --test tests/data.test.mjs
```

亦可使用 `npm test`。12 项测试核对原始数据哈希、缺失处理、分组统计、全部筛选组合、格式错误、实际 Vega 数据流、原生刷选与联动、五步引导、动态说明和均值标注。

## 如何探索

1. 初始显示 342 条有效记录，Pearson r 约为 0.871。取消其他物种，仅保留帽带企鹅，比较总体与物种内的关系。
2. 在帽带企鹅中切换雌性与雄性，比较 n 与 r；不同分组的差异仅作描述性分析。
3. 悬停查看详情；点击固定一个点，移开鼠标仍保留。清除详情或重置可取消固定。
4. 展开“查看当前数据”按行阅读个体信息；筛选与重置控件均可通过键盘使用。
5. 选择“未记录”查看未知性别的记录；取消全部物种可检查空状态。重置全部可恢复初始数据范围。
6. 从散点图空白处拖动矩形框选，体重直方图、分物种统计和明细表会联动。基准统计保留，便于和子集比较。
7. 也可展开“用数值范围框选”，输入鳍长和体重上下限后应用；例如 180—200 mm、3000—4000 g 会选中 144 条记录，均重约 3554.0 g，r≈0.218。
8. 双击图形或点击“清除框选”恢复当前基准。切换物种或性别会自动清除旧框选；缩放窗口保留数据单位下的范围。
9. 点击上方引导步骤或“开始引导”，按“全体 → 帽带 → 雌性 → 雄性 → 局部”观察。可随时进入自由探索，保留当前数据范围。
10. 菱形标记表示当前范围内 n≥3 的物种均值；可关闭标注。“当前观察”文字依据实际范围更新，不是固定结论。

## GitHub Pages 部署

入口为仓库根目录的 `index.html`，所有资源使用相对路径，支持项目子路径。`.nojekyll` 使文件按静态资源发布。无需构建步骤：仓库 Settings → Pages → Deploy from a branch → `main` → `/ (root)`。

后续更新只需提交并推送到相同分支。若需要命令行核查，可以使用下方脚本；脚本只读取本仓库已保存的 Git 凭据，在内存中调用 GitHub API，不写入或输出凭据：

```powershell
python scripts/github_pages.py inspect
```

`enable` 仅在尚未启用 Pages、且具有仓库管理权限时配置 `main` 根目录；遇到其他已有来源会保留原配置并退出。首次部署以实际 Pages 构建与线上 HTTP 核验结果为准。

复查线上资源与当前检出版本是否一致：

```powershell
python scripts/check_site.py https://dai1107.github.io/Interactive-Visualization/
```

该检查只验证 HTTP 状态、脚本 MIME 类型、资源字节与 CSV 哈希，不代替浏览器中的点击、悬停和排版验收。

## 数据与引用

本地数据：[penguins.csv](EDA_企鹅数据探索/penguins.csv)。来源：[palmerpenguins 官方项目](https://allisonhorst.github.io/palmerpenguins/)；数据采用 CC0 许可。数据时间范围为 2007—2009 年，首次下载日期未记录，2026 年 11 月 10 日完成本次本地核查与官方来源核对。

Horst AM, Hill AP, Gorman KB (2020). palmerpenguins: Palmer Archipelago (Antarctica) penguin data. https://doi.org/10.5281/zenodo.3960218

原始研究：Gorman KB, Williams TD, Fraser WR (2014). Ecological sexual dimorphism and environmental variability within a community of Antarctic penguins (genus Pygoscelis). https://doi.org/10.1371/journal.pone.0090081
