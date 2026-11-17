#!/usr/bin/env bash
set -uo pipefail

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root" || { echo "baseline verify failed: cannot enter repo root"; exit 2; }

python_cmd=""
if command -v python3 >/dev/null 2>&1; then
  python_cmd=$(command -v python3)
elif command -v python >/dev/null 2>&1; then
  python_cmd=$(command -v python)
else
  echo "baseline verify failed: python missing"
  exit 3
fi
if ! git --version >/dev/null 2>&1; then
  echo "baseline verify failed: git missing"
  exit 3
fi

"$python_cmd" - "$repo_root" <<'PY'
import hashlib
import json
import os
import subprocess
import sys

repo_root = sys.argv[1]
baseline_path = os.path.join(repo_root, '.agent', 'baseline.json')


def fail(message):
    print('baseline verify failed: ' + message)
    sys.exit(1)


def git_output(args):
    result = subprocess.run(
        ['git', '-c', 'core.quotepath=false'] + args,
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode != 0:
        fail('git ' + ' '.join(args) + ' failed')
    return result.stdout


def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    try:
        with open(path, 'rb') as handle:
            return hash_bytes(handle.read())
    except OSError:
        fail('cannot read ' + path)


def compare(field, expected, actual):
    if expected != actual:
        fail(field + ' mismatch')


def compare_optional(field, expected, actual):
    if expected is not None and expected != actual:
        fail(field + ' mismatch')


def is_git_repo():
    result = subprocess.run(
        ['git', 'rev-parse', '--is-inside-work-tree'],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == b'true'


if not os.path.isfile(baseline_path):
    fail('missing .agent/baseline.json')
try:
    with open(baseline_path, 'r', encoding='utf-8') as handle:
        baseline = json.load(handle)
except (OSError, ValueError):
    fail('invalid .agent/baseline.json')

compare('algorithm', 'sha256-v1', baseline.get('algorithm'))
repo_git = is_git_repo()
compare('repo_mode', 'git' if repo_git else 'non_git', baseline.get('repo_mode'))

if repo_git:
    compare('git_head', git_output(['rev-parse', 'HEAD']).decode('utf-8', 'replace').strip(), baseline.get('git_head'))

    worktree = hash_bytes(
        git_output(['diff', '--no-ext-diff', '--binary', 'HEAD', '--', '.',
                    ':(exclude).agent/baseline.json', ':(exclude)scripts/verify-baseline.sh'])
        + b'\0'
        + git_output(['diff', '--no-ext-diff', '--binary', '--cached', 'HEAD', '--', '.',
                      ':(exclude).agent/baseline.json', ':(exclude)scripts/verify-baseline.sh'])
        + b'\0'
        + git_output(['ls-files', '--others', '--exclude-standard', '--', '.',
                      ':(exclude).agent/baseline.json', ':(exclude)scripts/verify-baseline.sh'])
    )
    compare('worktree_fingerprint', worktree, baseline.get('worktree_fingerprint'))
else:
    if baseline.get('git_head') is not None:
        fail('non-git baseline must not contain git_head')

lock_hashes = baseline.get('dependency_lock_hashes') or {}
if not isinstance(lock_hashes, dict):
    fail('invalid dependency_lock_hashes')
for rel_path in sorted(lock_hashes):
    abs_path = os.path.join(repo_root, rel_path)
    compare('dependency lock ' + rel_path, sha256_file(abs_path), lock_hashes[rel_path])

toolchain = baseline.get('toolchain') or {}
if not isinstance(toolchain, dict):
    fail('invalid toolchain')
for name in sorted(toolchain):
    version_args = toolchain[name].get('version_args') if isinstance(toolchain[name], dict) else None
    if not version_args:
        fail('invalid toolchain entry ' + name)
    result = subprocess.run([name] + version_args, cwd=repo_root,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    compare_optional('toolchain ' + name, toolchain[name].get('version'),
                     result.stdout.decode('utf-8', 'replace').strip() if result.returncode == 0 else None)
    if result.returncode != 0:
        fail('toolchain command failed: ' + name)

verification = baseline.get('verification') or {}
if not isinstance(verification, dict) or verification.get('exit_code') != 0:
    fail('invalid verification record')

file_count = 0
file_total_bytes = 0
tracked_hashes = (baseline.get('tracked_file_hashes') or {}) if not repo_git else {}
if tracked_hashes and not isinstance(tracked_hashes, dict):
    fail('invalid tracked_file_hashes')
if not repo_git:
    tree = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = sorted(d for d in dirnames if d not in {'.git', '.venv', 'node_modules', '__pycache__', '.srclight', 'output', 'dist', 'build'})
        for filename in sorted(filenames):
            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, repo_root).replace(os.sep, '/')
            if rel_path in {'.agent/baseline.json', 'scripts/verify-baseline.sh'}:
                continue
            if rel_path.startswith('data/') or rel_path.startswith('docs/') or rel_path.startswith('.zcode/'):
                continue
            try:
                with open(abs_path, 'rb') as handle:
                    data = handle.read()
            except OSError:
                fail('cannot read ' + rel_path)
            digest = hash_bytes(data)
            tree.update(rel_path.encode('utf-8'))
            tree.update(b'\0')
            tree.update(str(len(data)).encode('ascii'))
            tree.update(b'\0')
            tree.update(data)
            file_count += 1
            file_total_bytes += len(data)
            if rel_path in tracked_hashes:
                compare('tracked file ' + rel_path, digest, tracked_hashes[rel_path])
    compare('file_tree_fingerprint', tree.hexdigest(), baseline.get('file_tree_fingerprint'))
    if file_count != baseline.get('file_count') or file_total_bytes != baseline.get('file_total_bytes'):
        fail('file tree size mismatch')

print('baseline verify: ok')
PY
