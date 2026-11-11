"""Verify deployed static resources against this checkout without a browser."""
import hashlib
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = {'assets/data.js', 'assets/bubble-model.js', 'assets/bubble-chart.js', 'assets/bonus-model.js?v=bonus-20261112d', 'assets/bonus-charts.js?v=bonus-20261112d', 'assets/bonus-experience.js?v=bonus-20261112d', './?v=llm-20261112e', 'assets/llm-config.js?v=llm-20261112e', 'assets/llm-model.js?v=llm-20261112e', 'assets/llm-ui.js?v=llm-20261112e'}

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('href', 'src') and value and not value.startswith(('https:', 'http:', '#')):
                self.paths.add(value)


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/check_site.py https://HOST/PROJECT/')
    base = sys.argv[1].rstrip('/') + '/'
    references = References()
    references.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
    checked = []
    for relative in sorted(references.paths):
        resource_path = unquote(urlsplit(relative).path)
        local = ROOT / ('index.html' if resource_path == './' else resource_path)
        if not local.resolve().is_relative_to(ROOT.resolve()):
            raise SystemExit('Unexpected resource outside project.')
        url = quote(urljoin(base, relative), safe=':/?=&%')
        with urlopen(Request(url, headers={'User-Agent': 'penguin-static-resource-check'}), timeout=30) as response:
            data = response.read()
            if response.status != 200:
                raise SystemExit(f'Unexpected HTTP status for {relative}: {response.status}')
            content_type = response.headers.get_content_type()
        expected = local.read_bytes()
        # Git serves committed LF text even when core.autocrlf checks it out as
        # CRLF on Windows. Keep the audited CSV comparison byte-for-byte.
        if local.suffix.lower() in ('.html', '.js', '.css', '.svg'):
            expected = expected.replace(b'\r\n', b'\n')
        if hashlib.sha256(data).digest() != hashlib.sha256(expected).digest():
            raise SystemExit(f'Deployed resource does not match the checkout: {relative}')
        if resource_path.endswith('.js') and content_type not in ('application/javascript', 'text/javascript'):
            raise SystemExit(f'Invalid module MIME type: {relative} {content_type}')
        checked.append({'path': relative, 'status': 200, 'content_type': content_type, 'bytes': len(data)})
    audit = json.loads((ROOT / 'docs/data-audit.json').read_text(encoding='utf-8'))
    if hashlib.sha256((ROOT / audit['source_file']).read_bytes()).hexdigest() != audit['sha256']:
        raise SystemExit('Original CSV hash does not match the audit.')
    print(json.dumps({'base_url': base, 'resources_checked': len(checked), 'all_match_checkout': True, 'original_csv_hash_verified': True, 'resources': checked}, indent=2, ensure_ascii=True))


if __name__ == '__main__':
    main()
