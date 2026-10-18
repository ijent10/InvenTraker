"""Add a locally built Simulator framework without changing the upstream device/macOS payloads."""
import argparse
import os
from pathlib import Path
import plistlib
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=Path)
parser.add_argument('simulator_xcframework', type=Path)
args = parser.parse_args()
sim = plistlib.loads((args.simulator_xcframework / 'Info.plist').read_bytes())
entries = [dict(x) for x in sim['AvailableLibraries'] if x.get('SupportedPlatform') == 'ios' and x.get('SupportedPlatformVariant') == 'simulator']
if len(entries) != 1:
    raise SystemExit('Expected one iOS Simulator library.')
entry = entries[0]
entry.pop('DebugSymbolsPath', None)
identifier = entry['LibraryIdentifier']
framework = args.simulator_xcframework / identifier / entry['LibraryPath']
if not framework.is_dir():
    raise SystemExit('Simulator framework is missing.')
temporary = args.archive.with_suffix('.zip.tmp')
try:
    with zipfile.ZipFile(args.archive) as original, zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        plist_name = next(n for n in original.namelist() if n.endswith('.xcframework/Info.plist'))
        root = plist_name.rsplit('/', 1)[0]
        info = plistlib.loads(original.read(plist_name))
        old_sim = [x['LibraryIdentifier'] for x in info['AvailableLibraries'] if x.get('SupportedPlatformVariant') == 'simulator' and x.get('SupportedPlatform') == 'ios']
        for member in original.infolist():
            if member.filename == plist_name or any(member.filename.startswith(f'{root}/{i}/') for i in old_sim):
                continue
            output.writestr(member, original.read(member))
        info['AvailableLibraries'] = [x for x in info['AvailableLibraries'] if x['LibraryIdentifier'] not in old_sim] + [entry]
        output.writestr(plist_name, plistlib.dumps(info))
        for path in sorted(framework.rglob('*')):
            if path.is_file():
                output.write(path, f'{root}/{identifier}/{entry["LibraryPath"]}/{path.relative_to(framework).as_posix()}')
    with zipfile.ZipFile(args.archive) as original, zipfile.ZipFile(temporary) as updated:
        for member in original.infolist():
            if member.filename == plist_name or any(member.filename.startswith(f'{root}/{i}/') for i in old_sim):
                continue
            if original.read(member) != updated.read(member.filename):
                raise RuntimeError('An existing payload changed.')
    os.replace(temporary, args.archive)
    print('Simulator slice added; existing device/macOS payload bytes verified unchanged.')
finally:
    if temporary.exists():
        temporary.unlink()
