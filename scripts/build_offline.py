"""Bundle the existing app and original CSV into a self-contained HTML file."""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(destination):
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'assets/style.css').read_text(encoding='utf-8')
    csv = (ROOT / 'EDA_企鹅数据探索/penguins.csv').read_text(encoding='utf-8')
    modules = []
    for filename in ['data.js', 'bubble-model.js', 'bubble-chart.js', 'bonus-model.js', 'bonus-charts.js', 'bonus-experience.js', 'bubble-app.js']:
        source = (ROOT / 'assets' / filename).read_text(encoding='utf-8')
        source = re.sub(r'^import .+?;\s*$', '', source, flags=re.M)
        source = re.sub(r'^export ', '', source, flags=re.M)
        if filename == 'bubble-app.js':
            loader = "const response=await fetch(new URL('../EDA_企鹅数据探索/penguins.csv',import.meta.url));if(!response.ok)throw new Error(`CSV HTTP ${response.status}`);const csvText=await response.text();state.model=parsePenguins(csvText);state.sourceHash=csvFingerprint(csvText);experience.initialize();"
            if loader not in source:
                raise RuntimeError('App CSV loader changed; update this bundler before continuing.')
            source = source.replace(loader, 'const csvText=' + json.dumps(csv, ensure_ascii=False) + ';state.model=parsePenguins(csvText);state.sourceHash=csvFingerprint(csvText);experience.initialize();')
        modules.append(source)
    javascript = '\n'.join(modules).replace('</script', '<\\/script')
    html, styles = re.subn(r'<link rel="stylesheet" href="assets/style\.css[^\"]*">', lambda _: '<style>' + css + '</style>', html)
    html, d3_count = re.subn(r'<script src="vendor/d3\.v7\.min\.js" defer></script>', '', html)
    html, app_count = re.subn(r'<script type="module" src="assets/bubble-app\.js[^\"]*"></script>', '', html)
    if (styles, d3_count, app_count) != (1, 1, 1):
        raise RuntimeError('Expected exactly one stylesheet, D3 script and app module.')
    favicon = base64.b64encode((ROOT / 'assets/favicon.svg').read_bytes()).decode('ascii')
    html = html.replace('href="assets/favicon.svg"', 'href="data:image/svg+xml;base64,' + favicon + '"')
    csv_url = 'data:text/csv;charset=utf-8;base64,' + base64.b64encode((ROOT / 'EDA_企鹅数据探索/penguins.csv').read_bytes()).decode('ascii')
    html = html.replace('href="EDA_企鹅数据探索/penguins.csv"', 'href="' + csv_url + '"')
    d3 = (ROOT / 'vendor/d3.v7.min.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
    html = html.replace('</body>', '<script>' + d3 + '</script><script type="module">' + javascript + '</script></body>')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(html, encoding='utf-8')
    print(json.dumps({'output': str(destination), 'bytes': destination.stat().st_size, 'embedded_csv_records': 344}, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/build_offline.py OUTPUT.html')
    build(Path(sys.argv[1]).resolve())
