from apply_patch import *
def revert():
 if os.name!='nt' or not ctypes.windll.shell32.IsUserAnAdmin():raise RuntimeError('관리자 권한 터미널에서 실행해 주세요.')
 root=locate();man=json.loads(zlib.decompress((HERE/'patch.dat').read_bytes()));plans=[]
 for name,entry in man['files'].items():
  p=root/name;bak=p.with_name(p.name+BACKUP)
  if not bak.exists():continue
  raw=bak.read_bytes()
  if digest(raw)!=entry['sha256_orig']:raise RuntimeError('백업 검증 실패: '+name)
  if digest(p.read_bytes()) not in (entry['sha256_orig'],entry['sha256_patched']):raise RuntimeError('파일이 업데이트되었거나 변경되어 복원을 중단합니다: '+name)
  plans.append((p,raw))
 subprocess.run(['taskkill','/F','/IM','Stream Dock AJAZZ.exe'],capture_output=True)
 for p,raw in plans:p.write_bytes(raw);print('복원:',p.name)
 for folder in [root/'plugins',root/'defaultData'/'defaultPlugins',pathlib.Path(os.environ.get('APPDATA',''))/'HotSpot'/'StreamDock'/'plugins']:
  if folder.is_dir():
   for bak in folder.rglob('en.json'+BACKUP):bak.with_name('en.json').write_bytes(bak.read_bytes())
 print('복원 완료')
if __name__=='__main__':
 try:revert()
 except Exception as e:print('실패:',e);sys.exit(1)
