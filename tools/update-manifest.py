"""Update checksums after reviewing changes to the source overlay."""
from pathlib import Path
import hashlib
import json
root = Path(__file__).resolve().parents[1]
files = sorted(p for p in (root / 'overlay').rglob('*') if p.is_file())
manifest = {p.relative_to(root / 'overlay').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(root / 'overlay-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print('Updated', len(manifest), 'file checksums')
