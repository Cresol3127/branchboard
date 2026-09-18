"""Private local release artifacts, allowlisted payloads and legacy provenance.

Run only after verification. Existing original snapshots are read, never rewritten.
Node/npm are needed to run the app; Python's standard library is only packaging tooling.
"""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
BACKUP = ROOT.parent / 'branchboard-backups/20261022T133446Z-before-material-redesign'
DATE = '2026-10-22'
RELEASES = ROOT / 'releases'
SOURCE_PATHS = ['src', 'server', 'public', 'tests', 'scripts', 'docs',
    'package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
    'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', '.env.example',
    '.gitignore', '.prettierignore', '.prettierrc.json', 'README.md', 'AGENTS.md',
    'CHANGELOG.md', 'PROGRESS.md', 'SPEC.md']
RUNTIME_PATHS = ['dist', 'dist-server', 'package.json', 'package-lock.json', 'README.md', '.env.example']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def inventory(directory):
    result = {}
    for file in sorted(directory.rglob('*')):
        if file.is_symlink():
            raise ValueError(f'Symlink requires explicit review: {file}')
        relative = file.relative_to(directory).as_posix()
        if file.is_dir():
            result[relative + '/'] = {'kind': 'directory'}
        elif file.is_file():
            data = file.read_bytes()
            result[relative] = {'sha256': digest(data), 'bytes': len(data)}
    return result


def payload(directory, names):
    files = {}
    for name in names:
        entry = directory / name
        if not entry.exists():
            continue
        candidates = sorted(entry.rglob('*')) if entry.is_dir() else [entry]
        for file in candidates:
            if file.is_symlink():
                raise ValueError(f'Cannot package symlink: {file}')
            if not file.is_file():
                continue
            relative = file.relative_to(directory).as_posix()
            parts = Path(relative).parts
            if any(p in {'node_modules', '.git', 'data', 'test-results', 'playwright-report', '__pycache__', 'screenshots'} for p in parts):
                raise ValueError(f'Unclean allowlist entry: {relative}')
            if (file.name.startswith('.env') and file.name != '.env.example') or file.name == 'branchboard.providers.json' or file.suffix in {'.pem', '.key', '.sqlite', '.db', '.tsbuildinfo'}:
                raise ValueError(f'Sensitive or generated payload: {relative}')
            files[relative] = file.read_bytes()
    return files


def archive(target, version, files):
    prefix = f'branchboard-{version}'
    # Stable ordering, permissions, ownership and gzip/tar timestamps.
    raw = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as tar:
            for name, data in sorted(files.items()):
                entry = tarfile.TarInfo(f'{prefix}/{name}')
                entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                tar.addfile(entry, io.BytesIO(data))
    encoded = raw.getvalue()
    # Published/tagged versions are immutable. Explicit replacement is only for
    # this local unpublished preparation stage, never for historical artifacts.
    if target.exists() and target.read_bytes() != encoded:
        tagged = any(subprocess.run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}'], cwd=ROOT, capture_output=True).returncode == 0
            for tag in [f'v{version}', f'editions/v{version}'])
        if '--replace-unpublished' not in sys.argv or tagged:
            raise FileExistsError(f'Refusing changed release artifact: {target}')
    # Verify every extracted byte without trusting tar path extraction.
    with tarfile.open(fileobj=io.BytesIO(encoded)) as tar:
        extracted = {m.name.removeprefix(prefix + '/'): tar.extractfile(m).read() for m in tar.getmembers()}
    if extracted != files:
        raise ValueError(f'Archive round trip failed: {target}')
    target.write_bytes(encoded)
    return {'file': target.name, 'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes())}


def main():
    source_commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
    original_inventory = json.loads((BACKUP / 'inventory.json').read_text())['files']
    (RELEASES / 'inventories').mkdir(exist_ok=True)
    legacy = []
    for minor in range(6):
        label = f'v1.{minor}'
        directory = RELEASES / label
        items = inventory(directory)
        original_files = {p: v for p, v in items.items() if 'sha256' in v}
        expected = {p.removeprefix(f'releases/{label}/'): v for p, v in original_inventory.items() if p.startswith(f'releases/{label}/')}
        if original_files != expected:
            raise ValueError(f'Original snapshot changed since checkpoint: {label}')
        save_json(RELEASES / f'inventories/{label}.json', items)
        legacy.append({'label': label, 'path': f'{label}/', 'normalizedLabel': f'1.{minor}.0',
            'embeddedVersion': '1.0.0' if minor else None,
            'status': 'preserved, historical verification only' if minor else 'empty original; payload unavailable',
            'files': len(original_files), 'refreshedEdition': f'1.{minor}.1' if minor else None,
            'inventory': f'inventories/{label}.json'})
    editions = []
    for minor in [1, 2, 3, 4, 5, 6]:
        version = f'1.{minor}.1' if minor < 6 else '1.6.0'
        directory = RELEASES / f'v{version}'
        directory.mkdir(exist_ok=True)
        source = directory if minor < 6 else ROOT
        pkg = json.loads((source / 'package.json').read_text())
        lock = json.loads((source / 'package-lock.json').read_text())
        assert pkg['version'] == lock['version'] == lock['packages']['']['version'] == version
        verification = json.loads((directory / 'verification.json').read_text())
        assert verification['build'] == 'passed'
        assert verification['browser']['status'] == 'passed'
        if '--finalize' in sys.argv:
            assert verification.get('cleanInstall', {}).get('status') == 'passed', 'Fresh-install verification required'
        notes = f'''# BranchBoard {version} — {DATE}

{'Material workspace release. See the source CHANGELOG.md.' if minor == 6 else f'Explicitly labeled refreshed edition of original v1.{minor}; not a rewritten historical release.'}

Originals and their built assets remain unchanged. No v1.0 implementation was invented.
No workspace migration, paid AI verification, hosted service or unfinished attachment/recovery feature.
Private local artifacts: the owner has not yet selected a project distribution license.

Source package: npm ci, npm run build, npm start (Node 22.12+).
Runtime package: npm ci --omit=dev, npm start; frontend AND Node server are included.
Default URL: http://127.0.0.1:3001. Back up browser work before changing origin/edition.
Use separate profiles/origins for historical comparisons; storage belongs to the origin.
Review adjacent verification.json for the exact scope; refreshes use smoke checks,
not a claim of passing every inherited original browser test unchanged.
'''
        (directory / 'RELEASE_NOTES.md').write_text(notes)
        artifacts = []
        for kind, names in [('source', SOURCE_PATHS), ('runtime', RUNTIME_PATHS)]:
            files = payload(source, names)
            files['RELEASE_NOTES.md'] = notes.encode()
            if kind == 'runtime':
                files['README.md'] = (f'# BranchBoard {version} — private runtime\n\n'
                    'Requires Node.js 22.12+ and npm. Run `npm ci --omit=dev`, then '
                    '`npm start`. Open http://127.0.0.1:3001. Both the frontend and '
                    'Node server are included; no TypeScript runner is needed.\n\n'
                    'Use Settings to configure real providers. Keys stay server-side. '
                    'Ollama requires a separately running local service. Provider '
                    'failures are reported, never replaced with fake AI.\n\n'
                    'Back up browser work before changing origin or edition. '
                    'Do not expose this single-user local service publicly.\n\n'
                    'See RELEASE_NOTES.md and the download\'s adjacent manifest.json, '
                    'SHA256SUMS and verification.json for provenance and exact checks. '
                    'No project distribution license has been selected.\n').encode()
            if kind == 'source' and minor == 6:
                # Keep the maintained README's relative history link usable in extraction.
                files['releases/README.md'] = (RELEASES / 'README.md').read_bytes()
                files['releases/index.json'] = json.dumps({'originals': legacy, 'note': 'Artifacts and full catalog are adjacent to the release download.'}, indent=2).encode()
                for preview in sorted((directory / 'previews').glob('*.png')):
                    files[f'releases/v{version}/previews/{preview.name}'] = preview.read_bytes()
            artifact = archive(directory / f'branchboard-{version}-{kind}.tar.gz', version, files)
            artifact['kind'] = kind
            artifact['files'] = {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in sorted(files.items())}
            artifacts.append(artifact)
        previews = {p.relative_to(directory).as_posix(): {'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size}
            for p in sorted((directory / 'previews').glob('*.png'))}
        manifest = {'name': 'branchboard', 'version': version, 'date': DATE,
            'edition': 'material workspace' if minor == 6 else 'refreshed historical edition',
            'originalPath': f'../v1.{minor}/' if minor < 6 else None,
            'checkpointCommits': ['918e636baecaa8bbda287af3f642800f923be91c', '03b4db3b038343bda1b693b8d87df4d62ff78f4a'],
            'backupSchemaVersion': 1, 'private': True, 'license': 'not selected',
            'sourceCommit': source_commit, 'sourcePath': f'releases/v{version}' if minor < 6 else '.',
            'artifacts': artifacts, 'previews': previews}
        save_json(directory / 'manifest.json', manifest)
        checksum_paths = [directory / a['file'] for a in artifacts] + [directory / 'manifest.json', directory / 'verification.json', directory / 'RELEASE_NOTES.md'] + [directory / name for name in previews]
        (directory / 'SHA256SUMS').write_text(''.join(f'{digest(f.read_bytes())}  {f.relative_to(directory).as_posix()}\n' for f in checksum_paths))
        editions.append({'version': version, 'path': f'v{version}/', 'manifest': f'v{version}/manifest.json', 'verification': f'v{version}/verification.json'})
        print(f'{version}: packaged and byte-verified source + runtime')
    save_json(RELEASES / 'index.json', {'schemaVersion': 1, 'date': DATE, 'current': '1.6.0',
        'policy': 'private local artifacts; preserve originals; refreshed editions have new versions',
        'externalBackup': '../../branchboard-backups/20261022T133446Z-before-material-redesign/',
        'originals': legacy, 'editions': editions})


if __name__ == '__main__':
    main()
