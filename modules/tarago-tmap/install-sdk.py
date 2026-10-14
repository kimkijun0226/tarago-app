#!/usr/bin/env python3
"""Install pinned official TMAP vector SDKs without committing vendor binaries."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent
VERSION = '3.7'
CHECKSUMS = {
    'ios': '88787adb7270dc7804e7954e008657884cd54a86a43da26be2d2d5d5a750181d',
    'android': '513a1c170487306d62bb7dbb48604ecb73e61be3156ede1a892188ea49d9e008',
}

def install(platform):
    endpoint = ('[iOS_VSM]TmapSDK_' if platform == 'ios' else '[Android]TMapVSMSDK_') + VERSION + '.zip'
    with tempfile.TemporaryDirectory(prefix='tarago-tmap-') as work:
        request = 'https://tmapapi.tmapmobility.com/presigned-url/' + urllib.parse.quote(endpoint)
        with urllib.request.urlopen(request, timeout=30) as response:
            url = json.load(response)['url']
        archive = pathlib.Path(work) / 'sdk.zip'
        if urllib.parse.urlparse(url).scheme != 'https':
            raise RuntimeError('Official SDK download must use HTTPS')
        with urllib.request.urlopen(url, timeout=120) as response, archive.open('wb') as output:
            shutil.copyfileobj(response, output)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != CHECKSUMS[platform]:
            raise RuntimeError('TMAP SDK checksum mismatch; verify the official release before updating the pinned hash')
        with zipfile.ZipFile(archive) as sdk:
            destination_root = pathlib.Path(work).resolve()
            if any(not (destination_root / entry.filename).resolve().is_relative_to(destination_root) for entry in sdk.infolist()):
                raise RuntimeError('Invalid SDK archive path')
            sdk.extractall(work)
        extracted = next(pathlib.Path(work).glob('*' + VERSION))
        if platform == 'android':
            destination = ROOT / 'android/libs'
            destination.mkdir(parents=True, exist_ok=True)
            for source in (extracted / 'lib').glob('*.aar'):
                shutil.copy2(source, destination / source.name)
        else:
            destination = ROOT / 'ios/Frameworks'
            destination.mkdir(parents=True, exist_ok=True)
            device = extracted / '배포(디바이스)'
            simulator = extracted / '개발(시뮬레이터)'
            target = destination / 'TMapSDK.xcframework'
            if target.exists(): shutil.rmtree(target)
            subprocess.run(['xcodebuild', '-create-xcframework', '-framework', str(device / 'TMapSDK.framework'), '-framework', str(simulator / 'TMapSDK.framework'), '-output', str(target)], check=True)
            shutil.copytree(device / 'VSMSDK.xcframework', destination / 'VSMSDK.xcframework', dirs_exist_ok=True)
        print('Installed official TMAP ' + platform + ' SDK ' + VERSION)

if __name__ == '__main__':
    import sys
    for platform in sys.argv[1:] or ['android', 'ios']:
        if platform not in ('android', 'ios'): raise SystemExit('Expected android or ios')
        install(platform)
