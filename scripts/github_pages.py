"""Inspect/enable GitHub Pages using the repository's existing Git credential.

Never writes or prints credentials. No token is accepted in command arguments.
"""
import json
import os
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPOSITORY = 'dai1107/Interactive-Visualization'
BASE = f'https://api.github.com/repos/{REPOSITORY}'


def credential():
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
    result = subprocess.run(['git', 'credential', 'fill'], input=f'protocol=https\nhost=github.com\npath={REPOSITORY}.git\n\n', text=True, capture_output=True, env=environment, timeout=30)
    if result.returncode:
        return None
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    return fields.get('password')


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'inspect'
    if mode not in ['inspect', 'enable', 'build']:
        raise SystemExit('Usage: python scripts/github_pages.py [inspect|enable|build]')
    origin = subprocess.run(['git', 'remote', 'get-url', 'origin'], text=True, capture_output=True, check=True).stdout.strip()
    if origin.removesuffix('.git') != f'https://github.com/{REPOSITORY}':
        raise SystemExit('Origin differs from the expected assignment repository; no remote changes performed.')
    token = credential()

    def request(suffix='', method='GET', payload=None):
        headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'penguin-assignment-deployment'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        body = json.dumps(payload).encode('utf-8') if payload is not None else None
        if body is not None:
            headers['Content-Type'] = 'application/json'
        try:
            with urlopen(Request(BASE + suffix, data=body, headers=headers, method=method), timeout=30) as response:
                data = response.read()
                return response.status, json.loads(data) if data else {}
        except HTTPError as error:
            # GitHub API error bodies do not contain our request's Authorization header.
            data = json.loads(error.read())
            return error.code, {'message': data.get('message', 'GitHub request failed')}

    status, repo = request()
    if status != 200:
        raise SystemExit(json.dumps({'repository_status': status, 'message': repo.get('message')}, ensure_ascii=True))
    print(json.dumps({'repository': repo['full_name'], 'private': repo['private'], 'has_pages': repo['has_pages'], 'permissions': repo.get('permissions', {}), 'credential_available': bool(token)}))
    page_status, pages = request('/pages')
    if mode == 'enable' and page_status == 404:
        if not repo.get('permissions', {}).get('admin'):
            raise SystemExit('Existing credential does not have repository admin permission to enable Pages.')
        page_status, pages = request('/pages', method='POST', payload={'source': {'branch': 'main', 'path': '/'}, 'build_type': 'legacy'})
    elif mode == 'enable' and page_status == 200:
        if pages.get('source', {}).get('branch') != 'main' or pages.get('source', {}).get('path') != '/':
            raise SystemExit('Pages already uses a different source. Existing settings preserved; review configuration before changing it.')
    if mode == 'build':
        page_status, pages = request('/pages/builds', method='POST')
    print(json.dumps({'pages_api_status': page_status, 'html_url': pages.get('html_url'), 'status': pages.get('status'), 'build_type': pages.get('build_type'), 'source': pages.get('source'), 'message': pages.get('message')}))
    if mode == 'inspect' and page_status == 200:
        status, build = request('/pages/builds/latest')
        print(json.dumps({'latest_build_status': status, 'status': build.get('status'), 'commit': build.get('commit'), 'error': build.get('error', {}).get('message')}))
    if page_status not in [200, 201, 202, 404]:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
