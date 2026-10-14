# -*- coding: utf-8 -*-
import pathlib,sys,os,json,zlib,base64,hashlib,ctypes,subprocess,shutil
HERE=pathlib.Path(__file__).resolve().parent
VERSION='3.10.200.0420'
BACKUP='.ko-backup-'+VERSION

def digest(data):return hashlib.sha256(data).hexdigest()
def locate():
 if len(sys.argv)>1:return pathlib.Path(sys.argv[1])
 candidates=[pathlib.Path(os.environ.get(k,default))/'Stream Dock AJAZZ Global' for k,default in [('ProgramFiles(x86)','C:/Program Files (x86)'),('ProgramFiles','C:/Program Files')]]
 for root in candidates:
  if (root/'Stream Dock AJAZZ.exe').is_file():return root
 raise RuntimeError('설치 폴더를 찾지 못했습니다. python apply_patch.py "설치 폴더"로 실행해 주세요.')
def main():
 if os.name!='nt' or not ctypes.windll.shell32.IsUserAnAdmin():raise RuntimeError('관리자 권한으로 install.bat를 실행해 주세요.')
 root=locate();print('설치 폴더:',root);man=json.loads(zlib.decompress((HERE/'patch.dat').read_bytes()))
 plans=[]
 # Validate every file before stopping the application or changing anything.
 for name,entry in man['files'].items():
  p=root/name
  if not p.is_file():raise RuntimeError('필수 파일 없음: '+str(p))
  orig=p.read_bytes();h=digest(orig)
  if h==entry['sha256_patched']:print('이미 적용됨:',name);continue
  if len(orig)!=entry['size'] or h!=entry['sha256_orig']:
   raise RuntimeError(name+' 원본이 일치하지 않습니다. 다른 버전 또는 기존 패치 파일입니다.\n현재 SHA256: '+h+'\n원본 3.10.200.0420 파일을 복구한 후 실행해 주세요.')
  new=bytearray(orig)
  for off,b64 in entry['runs']:
   chunk=zlib.decompress(base64.b64decode(b64));new[off:off+len(chunk)]=chunk
  if len(new)!=len(orig) or digest(new)!=entry['sha256_patched']:raise RuntimeError('패치 결과 검증 실패: '+name)
  backup=p.with_name(p.name+BACKUP)
  if backup.exists() and digest(backup.read_bytes())!=entry['sha256_orig']:raise RuntimeError('백업 파일이 원본과 다릅니다: '+str(backup))
  plans.append((p,orig,bytes(new),backup,entry))
 subprocess.run(['taskkill','/F','/IM','Stream Dock AJAZZ.exe'],capture_output=True)
 written=[]
 try:
  for p,orig,new,backup,entry in plans:
   if not backup.exists():shutil.copy2(p,backup)
   tmp=p.with_name(p.name+'.ko-temp');tmp.write_bytes(new);os.replace(tmp,p);written.append((p,orig))
   if digest(p.read_bytes())!=entry['sha256_patched']:raise RuntimeError('저장 검증 실패: '+p.name)
   print('적용 및 검증 완료:',p.name)
 except Exception:
  for p,orig in reversed(written):p.write_bytes(orig)
  raise
 n=0
 roots=[root/'plugins',root/'defaultData'/'defaultPlugins',pathlib.Path(os.environ.get('APPDATA',''))/'HotSpot'/'StreamDock'/'plugins']
 for folder in roots:
  if not folder.is_dir():continue
  for ko in folder.rglob('ko.json'):
   en=ko.with_name('en.json')
   if not en.is_file():continue
   try:
    json.loads(ko.read_text(encoding='utf-8-sig'))
    bak=en.with_name(en.name+BACKUP)
    if not bak.exists():shutil.copy2(en,bak)
    en.write_bytes(ko.read_bytes());n+=1
   except Exception as e:print('플러그인 경고:',en,str(e))
 print('플러그인 적용:',n,'개')
 print('한글 패치 완료. 언어는 English(영어)로 선택해 주세요.')
 subprocess.Popen([str(root/'Stream Dock AJAZZ.exe')],cwd=root)
if __name__=='__main__':
 try:main()
 except Exception as e:print('실패:',e);sys.exit(1)
