import hashlib
import json
from pathlib import Path
import tempfile

from publish import package


with tempfile.TemporaryDirectory(prefix="jugosafio-publisher-test-") as temp:
    root = Path(temp)
    source = root / "source"
    source.mkdir()
    (source / "manifest.json").write_text(json.dumps({
        "header": {"uuid": "143fd6c0-c67c-4e36-9baa-68884ec01b62", "version": [1, 0, 0]},
        "modules": [{"type": "resources"}],
    }))
    (source / "splashes.json").write_text('{"splashes":["test"]}')
    first = root / "one"
    second = root / "two"
    first.mkdir()
    second.mkdir()
    a = package(source, first, "https://example.org/v1")
    b = package(source, second, "https://example.org/v1")
    assert a == b, "Identical packs must produce identical assets and hashes"
    archive = next(first.glob("*.mcpack"))
    assert a["sha256"] == hashlib.sha256(archive.read_bytes()).hexdigest()
    assert a["url"].endswith(archive.name) and a["kind"] == "resources"
    manifest = json.loads((source / "manifest.json").read_text())
    manifest["header"]["version"] = [-1, 0, 0]
    (source / "manifest.json").write_text(json.dumps(manifest))
    try:
        package(source, first, "https://example.org/v1")
    except ValueError:
        pass
    else:
        raise AssertionError("Negative pack version accepted")
print("PASS: deterministic release assets, SHA-256, URLs, types and version validation")
