#!/usr/bin/env python3
"""Recreate the workbench from a pinned upstream and reviewed source overlay."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

UPSTREAM = 'https://github.com/deepseek-ai/deepseek-harness.git'
TAG = 'dsh-v0.2.1-alpha.1'
COMMIT = '5badb15009ae1756c3afe0ae0cef1faafc290ccc'
ROOT = Path(__file__).resolve().parent


def run(args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', type=Path, default=ROOT / 'runtime' / 'deepseek-harness')
    parser.add_argument('--upstream-url', default=UPSTREAM, help='Official upstream or a trusted local mirror, used for offline validation')
    parser.add_argument('--source-only', action='store_true', help='Prepare source and configuration without downloading dependencies or building')
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    if target.exists():
        raise SystemExit('Target already exists; choose a new --target to protect existing work: ' + str(target))
    manifest = json.loads((ROOT / 'overlay-manifest.json').read_text())
    for rel, digest in manifest.items():
        if Path(rel).is_absolute() or '..' in Path(rel).parts:
            raise SystemExit('Unsafe overlay path: ' + rel)
        if hashlib.sha256((ROOT / 'overlay' / rel).read_bytes()).hexdigest() != digest:
            raise SystemExit('Overlay checksum mismatch: ' + rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    run(['git', 'clone', '--depth', '1', '--branch', TAG, args.upstream_url, str(target)])
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=target, text=True).strip()
    if actual != COMMIT:
        raise SystemExit('Upstream commit mismatch; no overlay applied.')
    for rel in manifest:
        dest = target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'overlay' / rel, dest)
    home = target / '.local-data'
    shutil.copytree(ROOT / 'skills', home / 'mode-skills')
    (home / 'skills').mkdir(parents=True)
    for skill in (home / 'mode-skills').iterdir():
        if skill.is_dir():
            (home / 'skills' / skill.name).symlink_to(Path('../mode-skills') / skill.name, target_is_directory=True)
    for profile in ('desktop', 'web'):
        dest = home / 'profiles' / profile / 'cordis.patch.yml'
        dest.parent.mkdir(parents=True, exist_ok=True)
        text = (ROOT / 'config' / (profile + '.patch.yml')).read_text()
        text = text.replace('"__WORKBENCH_SKILLS__"', json.dumps(str(home / 'mode-skills'), ensure_ascii=False))
        if '__WORKBENCH_SKILLS__' in text:
            raise SystemExit('Unresolved configuration placeholder')
        dest.write_text(text)
    launcher = target / 'start-workbench.sh'
    launcher.write_text('''#!/bin/sh
set -eu
cd "$(dirname "$0")"
export DSH_HOME="$PWD/.local-data"
export DSH_CLIENT_AIPM=1
export DSH_DESKTOP_OPEN_DEVTOOLS=0
if [ "${1:-desktop}" = "web" ]; then
  exec pnpm dsh web
fi
exec pnpm run start:desktop
''')
    launcher.chmod(0o755)
    if not args.source_only:
        if shutil.which('pnpm') is None:
            raise SystemExit('Source prepared. Install pnpm 11.7.0, then run pnpm install --frozen-lockfile and pnpm run build in the target directory.')
        run(['pnpm', 'install', '--frozen-lockfile'], cwd=target)
        run(['pnpm', 'run', 'build'], cwd=target)
    print('Prepared pinned workbench source:', target)
    print('Start with: sh start-workbench.sh [desktop|web]')


if __name__ == '__main__':
    main()
