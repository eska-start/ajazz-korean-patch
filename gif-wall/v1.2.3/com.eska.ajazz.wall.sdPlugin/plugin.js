(function(){
'use strict';let socket,uuid,timer=null,globalSettings={walls:{}},ready=false;
const slots=new Map(),groups=new Map();
function send(event,context,payload){if(!socket||socket.readyState!==1)return false;socket.send(JSON.stringify({event,context,action:'com.eska.ajazz.wall.play',payload}));return true;}
function wallGroup(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=20?n:1;}
function scope(device,value){return device+'::group:'+wallGroup(value);}
function config(device,value){const walls=globalSettings.walls||{},n=wallGroup(value);const c=walls[scope(device,n)]||(n===1?(walls[device]||walls.default):null)||{};const wide=Array.from(slots.values()).some(s=>s.device===device&&(s.column>=3||s.row>=2));return wide?Object.assign({},c,{columns:5}):c;}
function group(key){if(!groups.has(key))groups.set(key,{started:Date.now(),elapsed:0,paused:false,lastFrame:-1,lastSent:0,busy:false,revision:0});return groups.get(key);}
function status(context,text){send('sendToPropertyInspector',context,{status:text});}
function sync(){for(const[device,g]of groups){const c=config(g.device,g.wallGroup);const key=(c.framePack&&c.framePack.id||'')+':'+(c.columns||3);if(key!==g.key){g.key=key;g.started=Date.now();g.elapsed=0;g.paused=false;}g.revision++;g.lastFrame=-1;g.image=null;}}
async function paint(device,list,g,configNow,index,revision){
 g.busy=true;
 try{
  const pack=GifEngine.validatePack(configNow.framePack),l=GifEngine.wallLayout(configNow),width=l.width,height=l.height;
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('GIF 프레임 읽기 실패'));img.src=pack.frames[index].image;});
  if(g.revision!==revision)return;
  const screen=document.createElement('canvas');screen.width=width;screen.height=height;const ctx=screen.getContext('2d');GifEngine.drawWall(ctx,image,configNow);
  const tile=document.createElement('canvas');tile.width=tile.height=144;const tc=tile.getContext('2d'),messages=[];
  for(const [context,s]of list){let row=s.row,column=s.column;
   // AKP153 app preview, measured with the user's numbered source (2026-10-15):
   // physical rows show 13 10 7 4 1 / 14 11 8 5 2 / 15 12 9 6 3.
   // The incoming tile index n therefore belongs to physical (n % 3, 4 - floor(n / 3)).
   if(l.columns===5&&configNow.fix153Order!==false){const n=row*5+column;if(Number.isInteger(n)&&row>=0&&row<3&&column>=0&&column<5){row=n%3;column=4-Math.floor(n/3);}}
   if(s.settings.tileAnchor===anchor(s)&&Number.isInteger(Number(s.settings.tile))&&Number(s.settings.tile)>=0&&s.settings.tile!==''&&s.settings.tile!==undefined){const n=Number(s.settings.tile);row=Math.floor(n/l.columns);column=n%l.columns;}
   if(row<0||column<0||row>=l.rows||column>=l.columns){status(context,'버튼 위치를 선택해 주세요.');continue;}
   tc.clearRect(0,0,144,144);tc.drawImage(screen,column*(144+l.gap),row*(144+l.gap),144,144,0,0,144,144);if(configNow.showTileNumbers){tc.fillStyle='#18202b';tc.fillRect(0,0,144,144);tc.fillStyle='#ffffff';tc.font='bold 64px sans-serif';tc.textAlign='center';tc.textBaseline='middle';tc.fillText(String(row*l.columns+column+1),72,72);}messages.push({context,image:tile.toDataURL('image/png')});
  }
  if(g.revision!==revision||socket.readyState!==1||socket.bufferedAmount>262144)return;
  // Every tile in this batch comes from the exact same GIF frame.
  for(const m of messages)if(slots.get(m.context)===list.find(p=>p[0]===m.context)[1])send('setImage',m.context,{image:m.image,target:0});
  g.lastFrame=index;g.lastSent=Date.now();
 }catch(error){for(const[context]of list)status(context,'오류: '+error.message);g.lastSent=Date.now();}
 finally{g.busy=false;}
}
function tick(){if(!ready||!socket||socket.readyState!==1)return;const byDevice=new Map(),deviceCounts=new Map();for(const pair of slots){deviceCounts.set(pair[1].device,(deviceCounts.get(pair[1].device)||0)+1);const key=scope(pair[1].device,pair[1].settings.wallGroup);if(!byDevice.has(key))byDevice.set(key,[]);byDevice.get(key).push(pair);}
 for(const[device,list]of byDevice){const g=group(device),c=config(g.device,g.wallGroup);if(!c.framePack||(g.paused&&g.lastFrame>=0)||g.busy)continue;const fps=Math.max(1,Math.min(Number(c.fps)||8,Math.floor(60/Math.max(1,deviceCounts.get(g.device)||list.length))));if(Date.now()-g.lastSent<1000/fps)continue;
  const speed=Math.max(.5,Math.min(3,Number(c.speed)||1));const index=GifEngine.frameIndex(c.framePack,(g.paused?g.elapsed:Date.now()-g.started+g.elapsed)*speed);if(index===g.lastFrame)continue;paint(device,list,g,c,index,g.revision);
 }
}
function ensureTimer(){if(!timer){timer=new Worker('timer.js');timer.onmessage=tick;timer.postMessage({start:true});}}
function coordinate(value,fallback){if(value===undefined||value===null||value==='')return fallback;const n=Number(value);return Number.isInteger(n)&&n>=0?n:fallback;}
function anchor(s){return s.device+':'+s.row+':'+s.column;}
function upsert(data){const old=slots.get(data.context),p=data.payload||{},coord=p.coordinates||{},settings=p.settings===undefined?(old?old.settings:{}):(p.settings||{});
 const s={device:data.device||old&&old.device||'default',row:coordinate(coord.row,old?old.row:-1),column:coordinate(coord.column,old?old.column:-1),settings:settings};slots.set(data.context,s);if(settings.tile!==undefined&&settings.tile!==''&&settings.tileAnchor!==anchor(s)){s.settings=Object.assign({},settings,{tile:''});delete s.settings.tileAnchor;send('setSettings',data.context,s.settings);}
 const key=scope(s.device,settings.wallGroup),g=group(key);g.device=s.device;g.wallGroup=wallGroup(settings.wallGroup);g.revision++;g.lastFrame=-1;
 if(old){const previous=groups.get(scope(old.device,old.settings.wallGroup));if(previous){previous.revision++;previous.lastFrame=-1;}}
 ensureTimer();}
function onMessage(e){let d;try{d=JSON.parse(e.data);}catch{return;}const p=d.payload||{};
 if(d.event==='didReceiveGlobalSettings'){globalSettings=p.settings||{walls:{}};ready=true;sync();}
 else if(d.event==='willAppear'||d.event==='didReceiveSettings')upsert(d);
 else if(d.event==='willDisappear'){const old=slots.get(d.context);slots.delete(d.context);if(old){const g=groups.get(scope(old.device,old.settings.wallGroup));if(g){g.revision++;g.lastFrame=-1;}}if(!slots.size&&timer){timer.terminate();timer=null;}}
 else if(d.event==='sendToPlugin'&&p.requestWall){const current=slots.get(d.context);const device=current?current.device:(p.device||'default');const n=wallGroup(p.wallGroup===undefined&&current?current.settings.wallGroup:p.wallGroup);send('sendToPropertyInspector',d.context,{device,wallGroup:n,wallConfig:config(device,n),coordinates:current?{row:current.row,column:current.column}:null,ready});}
 else if(d.event==='sendToPlugin'&&p.applyVisibleGroup){const current=slots.get(d.context);if(!current)return;const n=Number(p.wallGroup);if(!Number.isInteger(n)||n<1||n>20)return;let count=0;for(const [context,s]of slots){if(s.device!==current.device)continue;s.settings=Object.assign({},s.settings,{wallGroup:n});send('setSettings',context,s.settings);const g=group(scope(s.device,n));g.device=s.device;g.wallGroup=n;count++;}sync();status(d.context,'현재 화면 '+count+'개 버튼에 그룹 '+n+'을 적용했습니다.');}
 else if(d.event==='sendToPlugin'&&p.resetTiles){const current=slots.get(d.context);if(!current)return;for(const [context,s]of slots){if(s.device!==current.device||wallGroup(s.settings.wallGroup)!==wallGroup(current.settings.wallGroup))continue;s.settings=Object.assign({},s.settings,{tile:''});delete s.settings.tileAnchor;send('setSettings',context,s.settings);}sync();status(d.context,'이 화면 그룹의 버튼 순서를 자동 위치로 복원했습니다.');}
 else if(d.event==='sendToPlugin'&&p.settings)upsert({context:d.context,payload:{settings:p.settings}});
 else if(d.event==='sendToPlugin'&&p.wallConfig){if(!ready){status(d.context,'기기 설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');return;}globalSettings.walls=globalSettings.walls||{};globalSettings.walls[scope(p.device||'default',p.wallGroup)]=p.wallConfig;send('setGlobalSettings',uuid,globalSettings);ready=true;sync();}
 else if(d.event==='keyDown'||(d.event==='sendToPlugin'&&p.testClick)){const s=slots.get(d.context);if(!s)return;try{const a=GifActions.target(s.settings);if(a.url){send('openUrl',undefined,{url:a.url});status(d.context,'열기 요청을 보냈습니다.');}else if(a.kind==='pause'){const g=group(scope(s.device,s.settings.wallGroup));if(g.paused){g.started=Date.now();g.paused=false;}else{g.elapsed+=Date.now()-g.started;g.paused=true;}status(d.context,g.paused?'전체 GIF 일시정지':'전체 GIF 재생');}}catch(error){status(d.context,'오류: '+error.message);}}
 else if(d.event==='propertyInspectorDidAppear'){const s=slots.get(d.context);if(s)send('sendToPropertyInspector',d.context,{device:s.device,coordinates:{row:s.row,column:s.column},wallGroup:wallGroup(s.settings.wallGroup),wallConfig:config(s.device,s.settings.wallGroup),ready});}
}
function connect(port,id,event){uuid=id;ready=false;globalSettings={walls:{}};slots.clear();groups.clear();if(timer){timer.terminate();timer=null;}socket=new WebSocket('ws://127.0.0.1:'+port);socket.onopen=()=>{socket.send(JSON.stringify({event,uuid}));send('getGlobalSettings',uuid,{});};socket.onmessage=onMessage;socket.onclose=()=>{if(timer)timer.terminate();timer=null;slots.clear();groups.clear();};}
window.connectElgatoStreamDeckSocket=connect;window.connectMiraBoxSDSocket=connect;window.connectSocket=connect;window.WallTest={onMessage,tick,slots,groups,config,scope};
})();
