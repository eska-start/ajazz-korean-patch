# -*- coding: utf-8 -*-
"""patch.dat 적용기. 관리자 권한 PowerShell:  python apply_patch.py
원본 해시 검증 -> .bak 백업 -> 패치 적용 -> 앱 재시작.
"""
import base64
import ctypes
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time
import zlib

HERE = pathlib.Path(__file__).resolve().parent
AJAZZ_DIR = pathlib.Path("C:/Program Files (x86)/Stream Dock AJAZZ Global")
EXE = AJAZZ_DIR / "Stream Dock AJAZZ.exe"


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def real_path(rel):
    if rel.startswith("AJAZZ_DIR\\"):
        return AJAZZ_DIR / rel[len("AJAZZ_DIR\\"):]
    if rel.startswith("%HOME%"):
        return pathlib.Path(rel.replace("%HOME%", str(pathlib.Path.home())))
    raise ValueError(rel)


def main():
    if not is_admin():
        print("관리자 권한 PowerShell에서 실행하십시오.")
        sys.exit(1)
    man = json.loads(zlib.decompress((HERE / "patch.dat").read_bytes()).decode())
    print("patch version:", man.get("version"))
    subprocess.run(["taskkill", "/F", "/IM", "Stream Dock AJAZZ.exe"], capture_output=True)
    time.sleep(2)
    for name, entry in man["files"].items():
        p = AJAZZ_DIR / name
        if not p.exists():
            print("없음, 건너뜀:", p)
            continue
        bak = p.with_name(p.name + ".bak")
        if not bak.exists():
            shutil.copy2(p, bak)
            print("backup:", bak.name)
        data = bytearray(p.read_bytes())
        if len(data) != entry["size"]:
            print("크기 불일치, 건너뜀:", name)
            continue
        if hashlib.sha256(bytes(data)).hexdigest() != entry["sha256_orig"]:
            print("원본 해시 불일치(다른 버전?), 건너뜀:", name)
            continue
        for off, b64 in entry["runs"]:
            chunk = zlib.decompress(base64.b64decode(b64))
            data[off:off + len(chunk)] = chunk
        p.write_bytes(bytes(data))
        print("patched:", name)
    n = 0
    for rel, b64 in man.get("plugin_en_json", {}).items():
        p = real_path(rel)
        if not p.exists():
            continue
        bak = p.with_name("en.json.bak")
        if not bak.exists():
            shutil.copy2(p, bak)
        p.write_bytes(zlib.decompress(base64.b64decode(b64)))
        n += 1
    print("plugins patched:", n)
    print("done. 앱을 시작합니다.")
    subprocess.Popen([str(EXE)])


if __name__ == "__main__":
    main()
