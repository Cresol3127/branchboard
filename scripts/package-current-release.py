"""Append one verified private release; never regenerate historical releases.

Prepare after a source checkpoint, verify the downloads independently, then finalize.
Python is packaging tooling only; the application runtime requires Node.js/npm.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import runpy
import subprocess


ROOT = Path(__file__).resolve().parent.parent
# Reuse the existing deterministic, allowlisted, byte-verified archive helpers.
# run_path avoids creating __pycache__ inside the source distribution.
helpers = runpy.run_path(str(ROOT / 'scripts/package-releases.py'))
digest = helpers['digest']
save_json = helpers['save_json']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--finalize', action='store_true')
    parser.add_argument('--replace-unpublished', action='store_true')
    args = parser.parse_args()
    package = json.loads((ROOT / 'package.json').read_text())
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('A stable SemVer version is required')
    assert version == lock['version'] == lock['packages']['']['version']
    for tag in [f'v{version}', f'editions/v{version}']:
        if subprocess.run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}'],
                          cwd=ROOT, capture_output=True).returncode == 0:
            raise ValueError(f'Tagged releases are immutable: {tag}')
    directory = ROOT / 'releases' / f'v{version}'
    catalog_path = ROOT / 'releases/index.json'
    catalog = json.loads(catalog_path.read_text())
    if any(e['version'] == version for e in catalog['editions']):
        raise ValueError('Release is already cataloged; do not replace its provenance')
    verification = json.loads((directory / 'verification.json').read_text())
    assert verification['version'] == version
    assert verification['build'] == 'passed'
    assert verification['unitAndHttp']['status'] == 'passed'
    assert verification['browser']['status'] == 'passed'
    assert verification['screenshots']['inspected'] is True
    notes = (directory / 'RELEASE_NOTES.md').read_bytes()
    source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
                                            text=True).strip()
    artifacts = []
    for kind, names in [('source', helpers['SOURCE_PATHS']),
                        ('runtime', helpers['RUNTIME_PATHS'])]:
        files = helpers['payload'](ROOT, names)
        files['RELEASE_NOTES.md'] = notes
        if kind == 'runtime':
            files['README.md'] = (f'# BranchBoard {version} — Design improvements\n\n'
                'Private local runtime. Requires Node.js 22.12+ and npm.\n\n'
                'Run `npm ci --omit=dev`, then `npm start`. Open '
                'http://127.0.0.1:3001. The frontend and Node server are included; '
                'no TypeScript runner is required.\n\n'
                'Configure providers in Settings. Keys stay on this server. '
                'Public model updates need no key; available catalog IDs do not '
                'guarantee account access. Local Ollama needs a running service.\n\n'
                'Back up browser work before changing origin or edition. '
                'Do not expose this single-user service publicly. '
                'See the adjacent manifest, checksums and verification records '
                'for exact evidence. No distribution license has been selected.\n').encode()
        else:
            files['releases/README.md'] = (ROOT / 'releases/README.md').read_bytes()
            files['releases/index.json'] = json.dumps({
                'current': version,
                'note': 'Full catalog, historical editions and verification are adjacent to the download.',
            }, indent=2).encode()
            for preview in sorted((directory / 'previews').glob('*.png')):
                files[f'releases/v{version}/previews/{preview.name}'] = preview.read_bytes()
            for name, data in files.items():
                if name == 'releases/index.json':
                    continue  # Deliberately generated minimal download catalog.
                tracked = (f'releases/v{version}/RELEASE_NOTES.md'
                           if name == 'RELEASE_NOTES.md' else name)
                frozen = subprocess.run(['git', 'show', f'{source_commit}:{tracked}'],
                                        cwd=ROOT, capture_output=True)
                if frozen.returncode != 0 or frozen.stdout != data:
                    raise ValueError(f'Source is not frozen at {source_commit}: {tracked}')
        artifact = helpers['archive'](
            directory / f'branchboard-{version}-{kind}.tar.gz', version, files)
        artifact.update(kind=kind, files={
            name: {'sha256': digest(data), 'bytes': len(data)}
            for name, data in sorted(files.items())})
        artifacts.append(artifact)
    if args.finalize:
        clean = verification['cleanInstall']
        assert clean['status'] == 'passed'
        for artifact in artifacts:
            assert clean[artifact['kind']]['status'] == 'passed'
            assert clean[artifact['kind']]['artifactSha256'] == artifact['sha256'], \
                'Fresh-install evidence must match these exact archive bytes'
    previews = {
        p.relative_to(directory).as_posix(): {'sha256': digest(p.read_bytes()),
                                             'bytes': p.stat().st_size}
        for p in sorted((directory / 'previews').glob('*.png'))}
    date = verification.get('date', datetime.date.today().isoformat())
    save_json(directory / 'manifest.json', {
        'name': 'branchboard', 'version': version, 'title': 'Design improvements',
        'date': date, 'private': True, 'license': 'not selected',
        'sourceCommit': source_commit, 'sourcePath': '.', 'backupSchemaVersion': 1,
        'artifacts': artifacts, 'previews': previews,
    })
    paths = [directory / a['file'] for a in artifacts]
    paths += [directory / name for name in
              ['manifest.json', 'verification.json', 'RELEASE_NOTES.md'] + list(previews)]
    (directory / 'SHA256SUMS').write_text(''.join(
        f'{digest(p.read_bytes())}  {p.relative_to(directory).as_posix()}\n' for p in paths))
    if args.finalize:
        # Preserve every historical entry verbatim; only append the new edition.
        catalog['editions'].append({
            'version': version, 'title': 'Design improvements', 'path': f'v{version}/',
            'manifest': f'v{version}/manifest.json',
            'verification': f'v{version}/verification.json',
        })
        catalog.update(current=version, date=date)
        save_json(catalog_path, catalog)
    print(f'{version}: source + runtime byte-verified' +
          ('; exact fresh-install hashes verified and catalog appended' if args.finalize else
           '; fresh-install verification required before finalization'))


if __name__ == '__main__':
    main()
