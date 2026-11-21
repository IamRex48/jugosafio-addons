"""Check the actual APK: ARM64 ELF/ZIP alignment and our own Go engine provenance."""
import json
from pathlib import Path
import struct
import sys
import zipfile

apk = Path(sys.argv[1])
raw = apk.read_bytes()
libraries = []
with zipfile.ZipFile(apk) as archive:
    for item in archive.infolist():
        if not item.filename.startswith('lib/arm64-v8a/') or not item.filename.endswith('.so'):
            continue
        data = archive.read(item)
        assert data[:6] == b'\x7fELF\x02\x01', item.filename
        offset = struct.unpack_from('<Q', data, 32)[0]
        size, count = struct.unpack_from('<HH', data, 54)
        assert size >= 56 and offset + size * count <= len(data), item.filename
        alignments = [struct.unpack_from('<Q', data, offset+i*size+48)[0] for i in range(count)
                      if struct.unpack_from('<I', data, offset+i*size)[0] == 1]
        assert alignments and min(alignments) >= 16384, f'{item.filename}: ELF alignment {alignments}'
        name_size, extra_size = struct.unpack_from('<HH', raw, item.header_offset+26)
        start = item.header_offset + 30 + name_size + extra_size
        assert item.compress_type != zipfile.ZIP_STORED or start % 16384 == 0, f'{item.filename}: ZIP alignment'
        if item.filename.endswith('/libgojni.so'):
            assert b'studios.fonyx/accountengine' in data, 'Missing our own Microsoft provider'
            assert b'github.com/antoic/vcmc/realmsproxy' not in data, 'Unexpected proprietary VCMC engine'
        libraries.append(item.filename)
assert libraries and 'lib/arm64-v8a/libgojni.so' in libraries
print(json.dumps({'arm64Libraries': len(libraries), 'elfAndZip16KiBAligned': True, 'ownAccountEngine': True}))
