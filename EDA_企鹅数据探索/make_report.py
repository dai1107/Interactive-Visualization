"""Rebuild the Palmer penguins EDA figures and PDF from penguins.csv.

Requirements: pandas, numpy, Pillow (bundled Codex Python runtime).
Run: python make_report.py
"""
from pathlib import Path
import json
import math
import random

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'penguins.csv'
FIGS = ROOT / 'figures'
FIGS.mkdir(exist_ok=True)
d = pd.read_csv(DATA)

W, H = 1600, 1000
BG = '#F8F7F3'
INK = '#1E2933'
MUTED = '#596874'
GRID = '#DCE2E3'
WHITE = '#FFFFFF'
TEAL = '#159D91'
ORANGE = '#E68B39'
BLUE = '#5277C8'
RED = '#C75866'
COL = {'Adelie': TEAL, 'Chinstrap': ORANGE, 'Gentoo': BLUE}
CN = {'Adelie': '阿德利', 'Chinstrap': '帽带', 'Gentoo': '巴布亚'}
FONT = Path('C:/Windows/Fonts/msyh.ttc')
FONT_B = Path('C:/Windows/Fonts/msyhbd.ttc')

def font(size, bold=False):
    return ImageFont.truetype(str(FONT_B if bold else FONT), size)

def txt(g, xy, s, size=27, fill=INK, bold=False, anchor=None):
    g.text(xy, str(s), font=font(size, bold), fill=fill, anchor=anchor)

def line(g, xy, fill=GRID, width=2):
    g.line(xy, fill=fill, width=width)

def base(no, title, subtitle, insight, ntext):
    im = Image.new('RGB', (W, H), BG)
    g = ImageDraw.Draw(im)
    g.rounded_rectangle((70, 42, 1530, 958), radius=25, fill=WHITE)
    g.rectangle((70, 42, 85, 958), fill=TEAL)
    txt(g, (120, 83), f'探索性数据分析  /  {no:02d}', 24, MUTED)
    txt(g, (120, 128), title, 46, INK, True)
    txt(g, (120, 193), subtitle, 24, MUTED)
    line(g, (120, 247, 1480, 247))
    g.rounded_rectangle((112, 827, 1488, 924), radius=16, fill='#E9F4F2')
    txt(g, (140, 847), '发现', 24, TEAL, True)
    txt(g, (140, 882), insight, 27, INK)
    txt(g, (1465, 955), ntext, 18, MUTED, anchor='rb')
    return im, g

def xmap(v, lo, hi, x0=280, x1=1400):
    return x0 + (float(v)-lo)/(hi-lo)*(x1-x0)

def ymap(v, lo, hi, y0=735, y1=310):
    return y0 - (float(v)-lo)/(hi-lo)*(y0-y1)

def axes(g, xlo, xhi, xticks, ylo, yhi, yticks, xlabel, ylabel, x0=280, x1=1400, y0=735, y1=310):
    for t in xticks:
        x=xmap(t,xlo,xhi,x0,x1); line(g,(x,y1,x,y0),GRID,2)
        txt(g,(x,y0+18),f'{t:g}',21,MUTED,anchor='mt')
    for t in yticks:
        y=ymap(t,ylo,yhi,y0,y1); line(g,(x0,y,x1,y),GRID,2)
        txt(g,(x0-18,y),f'{t:g}',21,MUTED,anchor='rm')
    txt(g,((x0+x1)/2,y0+68),xlabel,23,MUTED,anchor='mt')
    txt(g,(x0-25,y1-36),ylabel,23,MUTED,anchor='lb')

def legend(g, names, x=1080, y=267):
    for i,name in enumerate(names):
        yy=y+i*34
        g.ellipse((x,yy+4,x+16,yy+20),fill=COL[name])
        txt(g,(x+26,yy),CN[name],21,MUTED)

pages=[]
def save(no, slug, im):
    p=FIGS/f'{no:02d}_{slug}.png'
    im.save(p, optimize=True)
    pages.append(im)

# 01. Overview: species counts.
counts=d.species.value_counts().reindex(['Adelie','Gentoo','Chinstrap'])
im,g=base(1,'样本首先呈现三种企鹅','数据范围：2007—2009 年，三个岛屿，共 344 条记录',
          '阿德利企鹅最多（152 只）；物种样本量不均，后续比较需看分组样本量。','样本量 n=344')
for i,(sp,n) in enumerate(counts.items()):
    y=350+i*150
    txt(g,(170,y+22),CN[sp],30,INK,True)
    g.rounded_rectangle((350,y,350+1000*n/160,y+78),radius=12,fill=COL[sp])
    txt(g,(380+1000*n/160,y+36),f'{n} 只  ·  {n/344:.1%}',30,INK,True,anchor='lm')
save(1,'物种样本量',im)

# 02. Data quality.
miss=d.isna().sum().sort_values(ascending=False)
im,g=base(2,'先检查缺失，再解释图形','原始文件保留 NA；各图按所用变量删除缺失记录',
          '性别缺失 11 条（3.2%），四项身体测量各缺失 2 条；不做均值填补。','原始 n=344')
labels={'sex':'性别','body_mass_g':'体重','bill_length_mm':'喙长','bill_depth_mm':'喙深',
        'flipper_length_mm':'鳍长','species':'物种','island':'岛屿','year':'年份'}
for i,(k,v) in enumerate(miss.items()):
    y=300+i*62
    txt(g,(160,y+13),labels[k],25,INK)
    g.rounded_rectangle((390,y,1280,y+35),radius=8,fill='#EDF1F1')
    if v: g.rounded_rectangle((390,y,390+890*v/12,y+35),radius=8,fill=RED)
    txt(g,(1320,y+15),f'{v}  ({v/344:.1%})',23,MUTED,anchor='lm')
save(2,'缺失值检查',im)

# 03. Bill length distributions, one row per species.
im,g=base(3,'喙长分布：阿德利明显偏短','每个小图使用相同的横轴范围与 2 mm 分箱；柱高为组内比例',
          '阿德利平均喙长 38.8 mm；帽带和巴布亚分别约 48.8 与 47.5 mm。','有效 n=342')
edges=np.arange(30,62,2)
for i,sp in enumerate(['Adelie','Chinstrap','Gentoo']):
    vals=d.loc[d.species==sp,'bill_length_mm'].dropna().to_numpy()
    hist,_=np.histogram(vals,bins=edges); hist=hist/len(vals)
    top=300+i*160; bottom=top+102
    txt(g,(160,top+40),CN[sp],27,COL[sp],True)
    for j,h in enumerate(hist):
        x0=xmap(edges[j],30,60,350,1400); x1=xmap(edges[j+1],30,60,350,1400)
        g.rectangle((x0+2,bottom-h*330,x1-2,bottom),fill=COL[sp])
    line(g,(350,bottom,1400,bottom),GRID,2)
    txt(g,(1420,top+38),f'n={len(vals)}',22,MUTED)
for t in [30,35,40,45,50,55,60]:
    x=xmap(t,30,60,350,1400); txt(g,(x,770),str(t),21,MUTED,anchor='mt')
txt(g,(875,803),'喙长 / mm',23,MUTED,anchor='mt')
save(3,'喙长分布',im)

# 04. Two-dimensional bill morphology.
bd=d.dropna(subset=['bill_length_mm','bill_depth_mm'])
im,g=base(4,'把喙长与喙深一起看，物种更易区分','每个点代表一只企鹅；颜色代表物种',
          '巴布亚企鹅的喙较长且浅，阿德利较短且深；帽带较长且深。','有效 n=342')
axes(g,30,60,[30,35,40,45,50,55,60],13,22,[14,16,18,20,22],'喙长 / mm','喙深 / mm')
for row in bd.itertuples():
    x=xmap(row.bill_length_mm,30,60); y=ymap(row.bill_depth_mm,13,22)
    g.ellipse((x-5,y-5,x+5,y+5),fill=COL[row.species])
legend(g,['Adelie','Chinstrap','Gentoo'])
save(4,'喙部形态',im)

# 05. Body mass boxplots.
im,g=base(5,'巴布亚企鹅的体重整体更高','箱体为第 1 至第 3 四分位数；中线为中位数；须为观测范围',
          '巴布亚平均约 5.08 kg，阿德利与帽带都约 3.7 kg。','有效 n=342')
for t in [2500,3000,3500,4000,4500,5000,5500,6000,6500]:
    x=xmap(t,2500,6500,300,1390); line(g,(x,300,x,710))
    txt(g,(x,733),f'{t/1000:g}',21,MUTED,anchor='mt')
txt(g,(840,785),'体重 / kg',23,MUTED,anchor='mt')
for i,sp in enumerate(['Adelie','Chinstrap','Gentoo']):
    v=d.loc[d.species==sp,'body_mass_g'].dropna(); q1,med,q3=np.percentile(v,[25,50,75]); y=360+i*150
    scale=lambda z:xmap(z,2500,6500,300,1390)
    line(g,(scale(v.min()),y,scale(v.max()),y),COL[sp],4)
    g.rounded_rectangle((scale(q1),y-36,scale(q3),y+36),radius=10,fill=COL[sp])
    line(g,(scale(med),y-35,scale(med),y+35),WHITE,5)
    txt(g,(160,y),CN[sp],27,INK,True,anchor='lm')
    txt(g,(1425,y),f'{v.mean()/1000:.2f} kg',25,INK,anchor='lm')
save(5,'分物种体重',im)

# 06. Sex differences within species.
sex=d.dropna(subset=['sex','body_mass_g']).groupby(['species','sex']).body_mass_g.agg(['mean','count'])
im,g=base(6,'同一物种内，雄性平均体重更高','点为各组均值；连线长度显示雄雌均值差，标签给出差值',
          '三个物种均如此，差值约 0.41—0.81 kg；性别缺失记录未纳入。','有效 n=333')
for t in [3000,3500,4000,4500,5000,5500,6000]:
    x=xmap(t,3000,6000,340,1330); line(g,(x,315,x,735))
    txt(g,(x,755),f'{t/1000:g}',21,MUTED,anchor='mt')
txt(g,(835,801),'平均体重 / kg',23,MUTED,anchor='mt')
for i,sp in enumerate(['Adelie','Chinstrap','Gentoo']):
    y=365+i*150; f=sex.loc[(sp,'female'),'mean']; m=sex.loc[(sp,'male'),'mean']
    xf=xmap(f,3000,6000,340,1330); xm=xmap(m,3000,6000,340,1330)
    txt(g,(165,y),CN[sp],27,INK,True,anchor='lm')
    line(g,(xf,y,xm,y),COL[sp],7)
    g.ellipse((xf-12,y-12,xf+12,y+12),fill=WHITE,outline=COL[sp],width=5)
    g.ellipse((xm-12,y-12,xm+12,y+12),fill=COL[sp])
    txt(g,((xf+xm)/2,y-43),f'+{(m-f)/1000:.2f} kg',24,COL[sp],True,anchor='mm')
txt(g,(1125,280),'○ 雌性    ● 雄性',23,MUTED)
save(6,'性别与体重',im)

# 07. Flipper and body mass.
fm=d.dropna(subset=['flipper_length_mm','body_mass_g'])
overall=fm[['flipper_length_mm','body_mass_g']].corr().iloc[0,1]
within={sp:fm[fm.species==sp][['flipper_length_mm','body_mass_g']].corr().iloc[0,1] for sp in COL}
im,g=base(7,'鳍长与体重正相关，但物种也在影响两者','散点为个体，相关系数 r 为 Pearson 描述性统计',
          f'总体 r={overall:.2f}；物种内 r 为 {within["Adelie"]:.2f}—{within["Gentoo"]:.2f}，总体关系包含物种差异。','有效 n=342')
axes(g,170,235,[170,180,190,200,210,220,230],2500,6500,[3000,4000,5000,6000],'鳍长 / mm','体重 / g')
for row in fm.itertuples():
    x=xmap(row.flipper_length_mm,170,235); y=ymap(row.body_mass_g,2500,6500)
    g.ellipse((x-5,y-5,x+5,y+5),fill=COL[row.species])
legend(g,['Adelie','Chinstrap','Gentoo'])
save(7,'鳍长体重关系',im)

# 08. Island-by-species composition.
ct=pd.crosstab(d.island,d.species).reindex(['Biscoe','Dream','Torgersen'])
im,g=base(8,'三个岛屿的物种构成不同','横条长度相同，颜色显示各岛样本的物种比例',
          '巴布亚只出现在 Biscoe，帽带只出现在 Dream；跨岛比较需控制物种。','样本量 n=344')
for i,(island,row) in enumerate(ct.iterrows()):
    y=365+i*150; x=360; total=row.sum()
    txt(g,(155,y+30),island,29,INK,True)
    for sp in ['Adelie','Chinstrap','Gentoo']:
        n=int(row[sp]); width=960*n/total
        if n:
            g.rectangle((x,y,x+width,y+75),fill=COL[sp])
            if width>120: txt(g,(x+width/2,y+37),f'{n}',25,WHITE,True,anchor='mm')
        x+=width
    txt(g,(1350,y+37),f'n={total}',23,MUTED,anchor='lm')
for j,sp in enumerate(['Adelie','Chinstrap','Gentoo']):
    x=440+j*300; g.rectangle((x,755,x+24,779),fill=COL[sp]); txt(g,(x+34,752),CN[sp],23,MUTED)
save(8,'岛屿物种构成',im)

# 09. Crude island mean vs same-species comparison.
all_means=d.groupby('island').body_mass_g.mean(); adelie=d[d.species=='Adelie'].groupby('island').body_mass_g.mean()
im,g=base(9,'岛屿体重差，主要与物种构成有关','实心点：岛屿所有物种均值；空心点：仅阿德利企鹅均值',
          'Biscoe 总体均值 4.72 kg；只看阿德利时，三岛均约 3.7 kg。','体重有效 n=342')
for t in [3500,4000,4500,5000]:
    x=xmap(t,3400,5100,380,1350); line(g,(x,320,x,730)); txt(g,(x,751),f'{t/1000:g}',21,MUTED,anchor='mt')
txt(g,(860,795),'平均体重 / kg',23,MUTED,anchor='mt')
for i,island in enumerate(['Biscoe','Dream','Torgersen']):
    y=372+i*145; xa=xmap(all_means[island],3400,5100,380,1350); xb=xmap(adelie[island],3400,5100,380,1350)
    txt(g,(165,y),island,28,INK,True,anchor='lm')
    line(g,(xa,y,xb,y),MUTED,4)
    g.ellipse((xa-11,y-11,xa+11,y+11),fill=BLUE)
    g.ellipse((xb-11,y-11,xb+11,y+11),fill=WHITE,outline=TEAL,width=5)
    txt(g,(xa,y-36),f'{all_means[island]/1000:.2f}',22,BLUE,anchor='mm')
    txt(g,(xb,y+30),f'{adelie[island]/1000:.2f}',22,TEAL,anchor='mm')
txt(g,(970,281),'● 所有物种     ○ 仅阿德利',22,MUTED)
save(9,'岛屿比较与混杂',im)

# 10. Time sanity check.
yr=d.dropna(subset=['body_mass_g']).groupby(['species','year']).body_mass_g.agg(['mean','count'])
im,g=base(10,'三年内没有一致的体重上升趋势','各点为物种×年份样本均值；线仅连接三年的描述性结果',
          '2007—2009 年各物种均值有波动，但不足以据此推断长期变化。','体重有效 n=342')
axes(g,2007,2009,[2007,2008,2009],3400,5500,[3500,4000,4500,5000,5500],'年份','平均体重 / g',x0=360,x1=1280,y0=730,y1=310)
for sp in ['Adelie','Chinstrap','Gentoo']:
    pts=[]
    for year in [2007,2008,2009]:
        val=yr.loc[(sp,year),'mean']; x=xmap(year,2007,2009,360,1280); y=ymap(val,3400,5500,730,310)
        pts.append((x,y)); g.ellipse((x-10,y-10,x+10,y+10),fill=COL[sp])
        txt(g,(x,y-34),f'{val/1000:.2f}',21,COL[sp],True,anchor='mm')
    g.line(pts,fill=COL[sp],width=5)
legend(g,['Adelie','Chinstrap','Gentoo'],x=1330,y=325)
save(10,'年度检查',im)

def text_page(kicker, title, subtitle, cards, footer):
    """Make a readable narrative page in the same visual style as the figures."""
    im = Image.new('RGB', (W, H), BG)
    g = ImageDraw.Draw(im)
    g.rounded_rectangle((70, 42, 1530, 958), radius=25, fill=WHITE)
    g.rectangle((70, 42, 85, 958), fill=TEAL)
    txt(g, (120, 83), kicker, 24, MUTED)
    txt(g, (120, 128), title, 46, INK, True)
    txt(g, (120, 193), subtitle, 24, MUTED)
    line(g, (120, 247, 1480, 247))
    y = 279
    for heading, lines in cards:
        h = 76 + 43 * len(lines)
        g.rounded_rectangle((120, y, 1480, y+h), radius=16, fill='#F1F6F5')
        txt(g, (153, y+18), heading, 29, TEAL, True)
        for i, item in enumerate(lines):
            txt(g, (153, y+65+i*43), item, 27, INK)
        y += h+20
    txt(g, (1465, 946), footer, 20, MUTED, anchor='rb')
    return im

intro = text_page(
    '探索性数据分析  /  研究设计', '研究什么：三种企鹅有何不同？',
    'Palmer 群岛企鹅数据 · 先提出问题，再检验数据与图形',
    [
        ('数据与目标', [
            '344 条观测、3 个物种、3 个岛屿、2007—2009 年。',
            '目标是描述形态与体重差异，发现值得进一步研究的关系。']),
        ('分析前提出的三个问题', [
            '1  三种企鹅的身体形态有什么差异？哪些测量值能区分物种？',
            '2  鳍长与体重是否相关？各物种内部是否仍有这种关系？',
            '3  同一物种内，雌雄企鹅的体重是否不同？']),
        ('探索中追加的问题', [
            '岛屿间体重差是否受到物种构成影响？',
            '2007—2009 年各物种体重均值是否呈现一致趋势？'])
    ], '数据来源：palmerpenguins 官方公开数据')

method = text_page(
    '探索性数据分析  /  方法与处理', '从原始数据到可比较的图形',
    '先检查样本构成与缺失，再按问题逐步细分和复查',
    [
        ('数据质量', [
            '原始数据有 344 行、8 列；物种、岛屿和年份无缺失。',
            '性别缺失 11 条；喙长、喙深、鳍长、体重各缺失 2 条。',
            '这些缺失值在图 02 中呈现，避免掩盖数据质量问题。']),
        ('处理规则', [
            '保留原始 CSV，不用均值填补缺失。',
            '每张图仅排除其所用变量缺失的记录，图中标注有效样本量。',
            '体重原始单位是克；标成千克时仅作显示换算。']),
        ('探索路径', [
            '先比较物种形态、体重和性别，再检查鳍长与体重的相关性。',
            '发现岛屿的物种构成不同后，追加同一物种的跨岛复查。'])
    ], '图 03—10 为逐步分析与追问')

conclusion = text_page(
    '探索性数据分析  /  结论', '主要发现与解释边界',
    '以下结论是对这份观测样本的描述，不是因果检验',
    [
        ('主要发现', [
            '阿德利企鹅喙较短；巴布亚企鹅体重整体更高。',
            '鳍长与体重正相关，但总体关系也包含物种间差异。',
            '三个物种中，雄性平均体重都高于雌性。']),
        ('关键追问：岛屿差异', [
            'Biscoe 岛的总体平均体重最高，但这里聚集了较重的巴布亚企鹅。',
            '只看阿德利企鹅时，三个岛的平均体重都约为 3.7 kg。',
            '因此不能把总体岛屿差直接解释为岛屿环境造成的差异。']),
        ('局限', [
            '样本只覆盖三个岛和三个年份，不能推断长期趋势或因果关系。',
            '物种与岛屿高度关联，缺少平衡的跨岛物种比较。',
            '部分性别和身体测量值缺失，分组结果应谨慎解读。'])
    ], '数据与代码、逐图结果见同文件夹')

report_pages = [intro] + pages[:2] + [method] + pages[2:] + [conclusion]
report_pages[0].save(ROOT/'企鹅数据探索报告.pdf',save_all=True,
                     append_images=report_pages[1:],resolution=150.0)
summary={
    'rows':len(d), 'columns':list(d.columns), 'missing':{k:int(v) for k,v in d.isna().sum().items()},
    'species_counts':{k:int(v) for k,v in d.species.value_counts().items()},
    'species_mean_mass_g':{k:round(float(v),1) for k,v in d.groupby('species').body_mass_g.mean().items()},
    'species_mean_bill_length_mm':{k:round(float(v),1) for k,v in d.groupby('species').bill_length_mm.mean().items()},
    'sex_mean_mass_g':{f'{k[0]}_{k[1]}':round(float(v),1) for k,v in d.groupby(['species','sex']).body_mass_g.mean().items()},
    'island_species_counts':ct.to_dict(),
    'island_mean_mass_g':{k:round(float(v),1) for k,v in all_means.items()},
    'adelie_island_mean_mass_g':{k:round(float(v),1) for k,v in adelie.items()},
    'flipper_mass_correlation_overall':round(float(overall),3),
    'flipper_mass_correlation_by_species':{k:round(float(v),3) for k,v in within.items()},
    'figure_count':len(pages),
    'report_page_count':len(report_pages),
}
(ROOT/'analysis_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Generated {len(pages)} figures and {len(report_pages)}-page PDF in {ROOT}')
