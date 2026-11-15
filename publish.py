"""Build release assets locally. Never uploads or changes Minecraft files."""
import argparse
import hashlib
import json
from pathlib import Path
import uuid
import zipfile
from urllib.parse import urlparse


def package(folder, output, base_url):
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8-sig"))
    header = manifest["header"]
    pack_id = str(uuid.UUID(header["uuid"]))
    version = header["version"]
    if len(version) != 3 or any(type(n) is not int or n < 0 for n in version):
        raise ValueError(f"Invalid pack version: {folder}")
    kinds = {m["type"] for m in manifest["modules"]} & {"resources", "data"}
    if len(kinds) != 1:
        raise ValueError(f"Expected one pack type: {folder}")
    name = f"{pack_id}-{'.'.join(map(str, version))}.mcpack"
    archive = output / name
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for path in sorted(folder.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"Pack must not contain symbolic links: {path}")
            if not path.is_file():
                continue
            relative = path.relative_to(folder).as_posix()
            if any(part.startswith(".") for part in path.relative_to(folder).parts):
                continue
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zipped.writestr(info, path.read_bytes())
    with archive.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"uuid": pack_id, "kind": kinds.pop(), "version": version,
            "url": base_url.rstrip("/") + "/" + name,
            "sha256": digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="HTTPS release asset directory; use a fixed release tag")
    parser.add_argument("--pack", type=Path, action="append", default=[], help="Unpacked BP or RP directory; repeat for dependencies")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "release-assets")
    args = parser.parse_args()
    url = urlparse(args.base_url)
    if url.scheme != "https" or not url.hostname or url.username or url.query or url.fragment:
        parser.error("base-url must be an HTTPS directory without credentials, query or fragment")
    folders = [Path(__file__).parent / "branding", *args.pack]
    args.output.mkdir(parents=True, exist_ok=True)
    packs = [package(folder.resolve(), args.output, args.base_url) for folder in folders]
    if len({p["uuid"] for p in packs}) != len(packs):
        raise ValueError("Duplicate pack UUIDs")
    included = {p["uuid"] for p in packs}
    for folder in folders:
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8-sig"))
        for dependency in manifest.get("dependencies", []):
            if dependency.get("uuid") and dependency["uuid"] not in included:
                print(f"WARNING: {folder.name} also needs pack {dependency['uuid']} (not included).")
    (args.output / "event-manifest.json").write_text(json.dumps({"schema": 1, "packs": packs}, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(packs)} packs and event-manifest.json in {args.output.resolve()}")
    print("Upload these files as release assets, then configure the launcher's manifest URL.")


if __name__ == "__main__":
    main()
