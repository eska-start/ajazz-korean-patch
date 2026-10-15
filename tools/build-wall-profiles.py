"""Create AJAZZ profiles using the vendor's streamDockProfile archive schema."""
from pathlib import Path
import json,uuid,zipfile
root=Path(__file__).resolve().parents[1]/'gif-wall/v1.2.3'
for model,columns,rows in [('AKP03E',3,2),('AKP153E',5,3)]:
 page=str(uuid.uuid4()).upper()+'.sdProfile'
 actions={f'{col},{row}':{'ActionID':str(uuid.uuid4()),'Controller':'Keypad','Name':'분할 GIF 버튼','Settings':{'wallGroup':1,'tile':'','clickAction':'pause'},'State':0,'States':[{'Image':'Images/gif-wall.png','Title':''}],'UUID':'com.eska.ajazz.wall.play'} for row in range(rows) for col in range(columns)}
 manifest={'Actions':actions,'DeviceModel':'20GBA9901','DeviceUUID':model,'DeviceSerialNumber':'','Name':f'GIF Wall {model} · {columns*rows}버튼','Pages':{'Current':page,'Pages':[page]},'Version':'1.0'}
 name='AKP03E_GIF_Wall_6.streamDockProfile' if columns==3 else 'AKP153_GIF_Wall_15.streamDockProfile'
 with zipfile.ZipFile(root/name,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2));z.write(root/'com.eska.ajazz.wall.sdPlugin/images/icon.png','Images/gif-wall.png')
 with zipfile.ZipFile(root/name) as z:
  data=json.loads(z.read('manifest.json'));assert len(data['Actions'])==columns*rows
  assert set(data['Actions'])=={f'{c},{r}' for r in range(rows) for c in range(columns)}
  assert all(a['Settings']['wallGroup']==1 and a['Settings']['tile']=='' for a in data['Actions'].values());assert z.testzip() is None
 print(f'PASS: {model} profile: {columns}x{rows}, {columns*rows} actions, shared group 1, automatic tile positions.')
