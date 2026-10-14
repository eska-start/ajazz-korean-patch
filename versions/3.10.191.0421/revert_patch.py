# -*- coding: utf-8 -*-
"""패치 원복. 관리자 권한 PowerShell:  python revert_patch.py
*.bak 백업들을 원래 자리로 되돌리고 앱 재시작.
"""
import ctypes
import pathlib
import shutil
import subprocess
import sys
import time

AJAZZ_DIR = pathlib.Path("C:/Program Files (x86)/Stream Dock AJAZZ Global")
EXE = AJAZZ_DIR / "Stream Dock AJAZZ.exe"


def is_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def main():
    if not is_admin():
        print("관리자 권한 PowerShell에서 실행하십시오.")
        sys.exit(1)
    subprocess.run(["taskkill", "/F", "/IM", "Stream Dock AJAZZ.exe"], capture_output=True)
    time.sleep(2)
    n = 0
    roots = [AJAZZ_DIR,
             pathlib.Path.home() / "AppData/Roaming/HotSpot/StreamDock/plugins"]
    for root in roots:
        if not root.exists():
            continue
        for bak in root.rglob("*.bak"):
            if bak.name == "StreamDockConfig.ini.bak":
                continue
            orig = bak.with_name(bak.name[:-4])
            shutil.copy2(bak, orig)
            n += 1
            print("restored:", orig)
    print("restored files:", n)
    subprocess.Popen([str(EXE)])


if __name__ == "__main__":
    main()
