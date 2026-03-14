#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_ENV_PATH = "/home/christoffer/.openclaw/sandboxes/agent-telegram-fast-ea503142/secrets/x_api.env"
USER_AGENT = "Jarvis-DR-X-Scout/1.0"

def load_env(path: str):
    env = {}
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"Secret file not found: {path}")
    for raw in p.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    token = env.get('X_BEARER_TOKEN', '')
    if not token:
        raise SystemExit("X_BEARER_TOKEN missing in secret file")
    return token

def request_json(url: str, token: str):
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def recent_search(args):
    token = load_env(args.env_file)
    params = {
        'query': args.query,
        'max_results': str(max(10, min(args.limit, 100))),
        'tweet.fields': 'created_at,author_id,public_metrics,lang,conversation_id,referenced_tweets',
        'expansions': 'author_id',
        'user.fields': 'username,name,verified,public_metrics,description',
    }
    if args.start_time:
        params['start_time'] = args.start_time
    if args.end_time:
        params['end_time'] = args.end_time
    url = 'https://api.x.com/2/tweets/search/recent?' + urllib.parse.urlencode(params)
    data = request_json(url, token)
    users = {u.get('id'): u for u in (data.get('includes', {}) or {}).get('users', [])}
    normalized = []
    for t in data.get('data', []) or []:
        u = users.get(t.get('author_id')) or {}
        normalized.append({
            'id': t.get('id'),
            'url': f"https://x.com/{u.get('username', 'unknown')}/status/{t.get('id')}" if t.get('id') else None,
            'author_username': u.get('username'),
            'author_name': u.get('name'),
            'author_verified': u.get('verified'),
            'created_at': t.get('created_at'),
            'lang': t.get('lang'),
            'text': t.get('text'),
            'public_metrics': t.get('public_metrics', {}),
            'source_class': 'x',
            'item_type': 'post',
            'provenance_tier': 'community-signal',
            'claim_status': 'lead',
            'injection_risk': 'untrusted',
        })
    out = {
        'query': args.query,
        'result_count': len(normalized),
        'meta': data.get('meta', {}),
        'results': normalized,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

def user_lookup(args):
    token = load_env(args.env_file)
    handle = args.handle.lstrip('@')
    params = {'user.fields': 'created_at,description,location,public_metrics,verified,url'}
    url = f"https://api.x.com/2/users/by/username/{urllib.parse.quote(handle)}?" + urllib.parse.urlencode(params)
    data = request_json(url, token)
    print(json.dumps(data, ensure_ascii=False, indent=2))

def post_lookup(args):
    token = load_env(args.env_file)
    params = {
        'tweet.fields': 'created_at,author_id,public_metrics,lang,conversation_id,referenced_tweets',
        'expansions': 'author_id',
        'user.fields': 'username,name,verified,public_metrics,description',
    }
    url = f"https://api.x.com/2/tweets/{urllib.parse.quote(args.post_id)}?" + urllib.parse.urlencode(params)
    data = request_json(url, token)
    print(json.dumps(data, ensure_ascii=False, indent=2))

parser = argparse.ArgumentParser(description='X API helper for DR x-scout')
parser.add_argument('--env-file', default=os.environ.get('X_API_ENV_FILE', DEFAULT_ENV_PATH))
sub = parser.add_subparsers(dest='cmd', required=True)

s = sub.add_parser('recent-search', help='Search recent X posts')
s.add_argument('--query', required=True)
s.add_argument('--limit', type=int, default=20)
s.add_argument('--start-time')
s.add_argument('--end-time')
s.set_defaults(func=recent_search)

u = sub.add_parser('user', help='Look up X user by handle')
u.add_argument('--handle', required=True)
u.set_defaults(func=user_lookup)

p = sub.add_parser('post', help='Read X post by ID')
p.add_argument('--post-id', required=True)
p.set_defaults(func=post_lookup)

args = parser.parse_args()
try:
    args.func(args)
except urllib.error.HTTPError as e:
    body = ''
    try:
        body = e.read().decode('utf-8', errors='ignore')[:2000]
    except Exception:
        pass
    print(json.dumps({'error': 'http_error', 'status': e.code, 'detail': body or str(e)}, ensure_ascii=False, indent=2))
    sys.exit(1)
