"""Draw the phase-three layout using actual CSV points; this is not a website."""
import csv
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')
COLORS = {'Adelie': '#0072B2', 'Chinstrap': '#D55E00', 'Gentoo': '#009E73'}
CN = {'Adelie': '阿德利', 'Chinstrap': '帽带', 'Gentoo': '巴布亚'}


def main():
    image = Image.new('RGB', (1600, 1230), '#F5F5F5')
    draw = ImageDraw.Draw(image)
    ink, muted, border = '#202020', '#626262', '#BDBDBD'

    def text(x, y, value, size=23, bold=False, color=None, anchor=None):
        draw.text((x, y), value, font=ImageFont.truetype(str(BOLD if bold else FONT), size), fill=color or ink, anchor=anchor)

    def box(bounds, fill='white'):
        draw.rectangle(bounds, fill=fill, outline=border, width=2)

    text(50, 30, '企鹅的鳍长与体重', 40, True)
    text(50, 91, '不同物种和性别中，鳍长与体重的关系是否一致？', 27)
    text(1550, 38, '阶段三  /  低保真布局草图', 22, color=muted, anchor='rt')
    text(50, 137, '2007—2009 年 · Palmer 群岛 · 先观察全部样本，再只选一种企鹅比较关系。', 22, color=muted)

    box((50, 188, 1550, 275))
    text(70, 213, '物种', 23, True)
    for x, species in [(160, 'Adelie'), (340, 'Chinstrap'), (520, 'Gentoo')]:
        draw.rectangle((x, 217, x + 22, 239), fill='white', outline=ink, width=2)
        draw.line((x + 4, 228, x + 9, 234, x + 19, 221), fill=ink, width=3)
        text(x + 34, 213, CN[species], 23, color=COLORS[species])
    box((710, 207, 850, 251), '#F1F1F1')
    text(780, 214, '全选物种', 22, anchor='mt')
    text(895, 213, '性别', 23, True)
    box((970, 207, 1230, 251))
    text(990, 213, '全部（含未记录）', 22)
    draw.polygon([(1201, 225), (1215, 225), (1208, 234)], fill=ink)
    box((1300, 207, 1520, 251), '#F1F1F1')
    text(1410, 213, '一键重置', 23, anchor='mt')

    audit = json.loads((ROOT / 'docs' / 'data-audit.json').read_text(encoding='utf-8'))
    text(50, 293, f'当前条件：全部物种 / 全部性别     有效样本 n = {audit["overall"]["n"]}     Pearson r = {audit["overall"]["pearson_r"]:.3f}', 25, True)

    box((50, 350, 1110, 880))
    text(78, 366, '鳍长与体重散点图', 25, True)
    text(1065, 368, '每个点代表一条记录', 20, color=muted, anchor='rt')
    x0, x1, y0, y1 = 155, 1050, 780, 430
    xscale = lambda value: x0 + (value - 170) / 65 * (x1 - x0)
    yscale = lambda value: y0 - (value - 2500) / 4000 * (y0 - y1)
    for value in [170, 180, 190, 200, 210, 220, 230, 235]:
        x = xscale(value)
        draw.line((x, y1, x, y0), fill='#E4E4E4', width=1)
        text(x, 791, str(value), 19, color=muted, anchor='mt')
    for value in [2500, 3500, 4500, 5500, 6500]:
        y = yscale(value)
        draw.line((x0, y, x1, y), fill='#E4E4E4', width=1)
        text(x0 - 14, y, str(value), 19, color=muted, anchor='rm')
    draw.line((x0, y1, x0, y0, x1, y0), fill='#777777', width=2)
    text(80, 404, '体重 / g', 19, color=muted)
    text((x0 + x1) / 2, 830, '鳍长 / mm', 22, color=muted, anchor='mt')
    with (ROOT / 'EDA_企鹅数据探索' / 'penguins.csv').open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        if row['flipper_length_mm'] == 'NA' or row['body_mass_g'] == 'NA':
            continue
        x, y = xscale(float(row['flipper_length_mm'])), yscale(float(row['body_mass_g']))
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=COLORS[row['species']])

    box((1140, 350, 1550, 880))
    text(1165, 370, '个体详情', 25, True)
    text(1165, 421, '悬停或点击一个点查看详情', 22)
    text(1165, 466, '图例', 22, True)
    for i, species in enumerate(COLORS):
        y = 516 + i * 44
        draw.ellipse((1166, y + 7, 1179, y + 20), fill=COLORS[species])
        text(1195, y, f'{CN[species]}  {species}', 22)
    text(1165, 677, '选中后显示', 22, True)
    text(1165, 721, '记录编号 / 物种 / 性别', 22, color=muted)
    text(1165, 761, '鳍长 mm / 体重 g / 岛屿 / 年份', 21, color=muted)
    text(1165, 820, '点击固定详情，可清除', 22, color=muted)

    text(50, 905, '分物种统计（随筛选同步更新）', 26, True)
    box((50, 951, 1050, 1118))
    draw.rectangle((51, 952, 1049, 990), fill='#EAEAEA')
    text(75, 957, '物种', 21, True)
    text(530, 957, '有效样本 n', 21, True)
    text(805, 957, 'Pearson r', 21, True)
    for i, species in enumerate(COLORS):
        y = 998 + i * 38
        item = audit['by_species'][species]
        text(75, y, f'{CN[species]}  {species}', 21, color=COLORS[species])
        text(530, y, str(item['n']), 21)
        text(805, y, f'{item["pearson_r"]:.3f}', 21)
    box((1140, 951, 1550, 1020), '#F1F1F1')
    draw.polygon([(1166, 976), (1166, 992), (1176, 984)], fill=ink)
    text(1186, 973, '查看当前数据（键盘可展开）', 21)
    text(1140, 1049, '空结果与加载错误在主图区域提示', 21, color=muted)
    text(1140, 1084, '窄屏时详情移至散点图下方', 21, color=muted)
    text(50, 1144, '数据：palmerpenguins / CC0 · 原始 344 条，测量缺失排除 2 条；性别未知的 9 条有效记录默认保留。', 22, color=muted)
    text(50, 1184, '仅做描述性探索，相关性不代表因果。此图用于布局评审，全部交互将在第四阶段实现。', 22, color=muted)
    target = ROOT / 'docs' / 'wireframe.png'
    image.save(target)
    print(target)


if __name__ == '__main__':
    main()
