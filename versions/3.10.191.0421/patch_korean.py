# -*- coding: utf-8 -*-
"""Stream Dock AJAZZ Global 한글 패치.
확인 버전: 3.10.191.0421 / 관리자 권한 PowerShell에서 실행:  python patch_korean.py
원리: 바이너리에 사장된 한국어 문자열(비압축 JSON) + 활성 영어 설정 테이블(압축 JSON)을 찾아,
     영어 테이블 값을 한국어로 교체 후 동일 길이로 패치.
"""
import ctypes
import json
import pathlib
import re
import shutil
import subprocess
import sys
import time
import zlib

AJAZZ_DIR = pathlib.Path("C:/Program Files (x86)/Stream Dock AJAZZ Global")
EXE = AJAZZ_DIR / "Stream Dock AJAZZ.exe"
DLL = AJAZZ_DIR / "SDLibrary1.dll"
APPDATA_PLUGINS = pathlib.Path.home() / "AppData/Roaming/HotSpot/StreamDock/plugins"


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def kill_app():
    subprocess.run(["taskkill", "/F", "/IM", "Stream Dock AJAZZ.exe"], capture_output=True)
    time.sleep(2)


def backup(path):
    bak = path.with_name(path.name + ".bak")
    if not bak.exists():
        shutil.copy2(path, bak)
        print("backup:", bak)


def patch_plugins():
    n = 0
    roots = [AJAZZ_DIR / "plugins", AJAZZ_DIR / "defaultData" / "defaultPlugins", APPDATA_PLUGINS]
    for root in roots:
        if not root.exists():
            continue
        for ko in root.rglob("ko.json"):
            en = ko.parent / "en.json"
            if not en.exists():
                continue
            bak = ko.parent / "en.json.bak"
            if not bak.exists():
                shutil.copy2(en, bak)
            en.write_bytes(ko.read_bytes())
            n += 1
    print("plugins patched:", n)


def load_json_chunks(path):
    """바이너리에서 \\x00 구분 JSON 청크 추출 -> (part_index, prefix, js, suffix, obj)."""
    data = pathlib.Path(path).read_bytes()
    parts = data.split(b"\x00")
    out = []
    for pi, p in enumerate(parts):
        if len(p) < 5000 or b'"General":' not in p:
            continue
        i = p.find(b"{")
        j = p.rfind(b"}")
        if i < 0 or j < 0:
            continue
        try:
            obj = json.loads(p[i:j + 1].decode("utf-8"))
        except Exception:
            continue
        out.append((pi, p[:i], p[i:j + 1], p[j + 1:], obj))
    return data, parts, out


def build_ko_dict():
    ko = {}
    for path in (DLL, EXE):
        _, _, chunks = load_json_chunks(path)
        for _, _, _, _, obj in chunks:
            t = json.dumps(obj, ensure_ascii=False)
            if any("\uac00" <= ch <= "\ud7a3" for ch in t):
                for k, v in obj.items():
                    if isinstance(v, str) and v.strip() and k not in ko:
                        ko[k] = v
    print("korean strings collected:", len(ko))
    return ko


def fit_json(new_obj, budget):
    raw = json.dumps(new_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    guard = 0
    while len(raw) > budget and guard < 2000:
        guard += 1
        cand = [(k, len(v.encode("utf-8"))) for k, v in new_obj.items()
                if isinstance(v, str) and len(v) > 5]
        if not cand:
            break
        lk = max(cand, key=lambda kv: kv[1])[0]
        v = new_obj[lk]
        new_obj[lk] = v[:max(10, len(v) - 8)].rstrip() + "..."
        raw = json.dumps(new_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return raw


def patch_uncompressed(path, ko):
    data = pathlib.Path(path).read_bytes()
    parts = data.split(b"\x00")
    patched = 0
    new_parts = []
    for p in parts:
        if len(p) < 5000 or b'"General":' not in p:
            new_parts.append(p)
            continue
        i = p.find(b"{")
        j = p.rfind(b"}")
        prefix, js, suffix = p[:i], p[i:j + 1], p[j + 1:]
        try:
            obj = json.loads(js.decode("utf-8"))
        except Exception:
            new_parts.append(p)
            continue
        if obj.get("General") != "General":
            new_parts.append(p)
            continue
        new_obj = {k: (ko[k] if (isinstance(v, str) and k in ko) else v)
                   for k, v in obj.items()}
        raw = fit_json(new_obj, len(js))
        if len(raw) > len(js):
            print("  skip (too long):", pathlib.Path(path).name)
            new_parts.append(p)
            continue
        raw = raw[:-1] + b" " * (len(js) - len(raw)) + b"}"
        json.loads(raw.decode("utf-8"))  # validate
        new_parts.append(prefix + raw + suffix)
        patched += 1
    out = b"\x00".join(new_parts)
    assert len(out) == len(data), "size changed - abort"
    pathlib.Path(path).write_bytes(out)
    print("uncompressed patched:", pathlib.Path(path).name, patched)


def find_en_settings_blob(data):
    """압축된 활성 영어 설정 테이블 위치 탐색. -> (zoff, complen, obj)"""
    for m in re.finditer(rb"\x78[\x01\x9c\xda]", data):
        off = m.start()
        if off < 4:
            continue
        qlen = int.from_bytes(data[off - 4:off], "big")
        if not (1000 < qlen < 20_000_000):
            continue
        try:
            d = zlib.decompressobj()
            dec = d.decompress(data[off:off + qlen + 100])
        except Exception:
            continue
        if b'"General":' not in dec:
            continue
        try:
            obj = json.loads(dec.decode("utf-8"))
        except Exception:
            continue
        if obj.get("General") == "General" and \
                '"DeviceConnected": "Device is Connected"' in dec.decode("utf-8"):
            trailing = d.unused_data
            complen = len(data[off:]) - len(trailing)
            return off, complen, obj
    return None


def patch_compressed_settings(ko):
    data = bytearray(EXE.read_bytes())
    found = find_en_settings_blob(bytes(data))
    if not found:
        print("active EN settings blob: not found (already patched?)")
        return
    zoff, complen, en = found
    print("EN settings blob at", zoff, "complen", complen, "keys", len(en))
    new_obj = {k: (ko[k] if (isinstance(v, str) and k in ko) else v)
               for k, v in en.items()}
    hit = sum(1 for k in en if k in ko)
    print(f"korean coverage: {hit}/{len(en)}")
    raw = fit_json(new_obj, 10 ** 9)
    comp = zlib.compress(raw)
    guard = 0
    while len(comp) > complen and guard < 2000:
        guard += 1
        cand = [(k, len(v.encode("utf-8"))) for k, v in new_obj.items()
                if isinstance(v, str) and len(v) > 5]
        lk = max(cand, key=lambda kv: kv[1])[0]
        v = new_obj[lk]
        new_obj[lk] = v[:max(10, len(v) - 8)].rstrip() + "..."
        raw = json.dumps(new_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        comp = zlib.compress(raw)
    assert len(comp) <= complen, "cannot fit"
    blob = len(raw).to_bytes(4, "big") + comp
    blob += b"\x00" * ((4 + complen) - len(blob))
    data[zoff - 4:zoff - 4 + 4 + complen] = blob
    EXE.write_bytes(bytes(data))
    # verify
    d2 = EXE.read_bytes()
    h = int.from_bytes(d2[zoff - 4:zoff], "big")
    dec = zlib.decompress(d2[zoff:zoff + complen])
    assert len(dec) == h and json.loads(dec.decode("utf-8"))
    print("compressed settings patched OK")


def main():
    if not is_admin():
        print("관리자 권한 PowerShell에서 실행하십시오.")
        sys.exit(1)
    if not EXE.exists():
        print("AJAZZ Global 설치를 찾을 수 없습니다:", AJAZZ_DIR)
        sys.exit(1)
    kill_app()
    backup(EXE)
    backup(DLL)
    patch_plugins()
    ko = build_ko_dict()
    patch_uncompressed(DLL, ko)
    patch_uncompressed(EXE, ko)
    patch_compressed_settings(ko)
    print("done. 앱을 시작하십시오:", EXE)
    subprocess.Popen([str(EXE)])


if __name__ == "__main__":
    main()
