(function(){
'use strict';let socket,uuid,timer=null,globalSettings={walls:{}},ready=false;
const slots=new Map(),groups=new Map();
function send(event,context,payload){if(!socket||socket.readyState!==1)return false;socket.send(JSON.stringify({event,context,action:'com.eska.ajazz.wall.play',payload}));return true;}
function config(device){return (globalSettings.walls||{})[device]||(globalSettings.walls||{}).default||{};}
function group(device){if(!groups.has(device))groups.set(device,{started:Date.now(),elapsed:0,paused:false,lastFrame:-1,lastSent:0,busy:false,revision:0});return groups.get(device);}
function status(context,text){send('sendToPropertyInspector',context,{status:text});}
function sync(){for(const[device,g]of groups){const c=config(device);const key=(c.framePack&&c.framePack.id||'')+':'+(c.columns||3);if(key!==g.key){g.key=key;g.started=Date.now();g.elapsed=0;g.paused=false;}g.revision++;g.lastFrame=-1;g.image=null;}}
async function paint(device,list,g,configNow,index,revision){
 g.busy=true;
 try{
  const pack=GifEngine.validatePack(configNow.framePack),l=GifEngine.wallLayout(configNow),width=l.width,height=l.height;
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('GIF 프레임 읽기 실패'));img.src=pack.frames[index].image;});
  if(g.revision!==revision)return;
  const screen=document.createElement('canvas');screen.width=width;screen.height=height;const ctx=screen.getContext('2d');GifEngine.drawWall(ctx,image,configNow);
  const tile=document.createElement('canvas');tile.width=tile.height=144;const tc=tile.getContext('2d'),messages=[];
  for(const [context,s]of list){let row=s.row,column=s.column;if(Number(s.settings.tile)>=0&&s.settings.tile!==''&&s.settings.tile!==undefined){const n=Number(s.settings.tile);row=Math.floor(n/l.columns);column=n%l.columns;}
   if(row<0||column<0||row>=l.rows||column>=l.columns){status(context,'버튼 위치를 선택해 주세요.');continue;}
   tc.clearRect(0,0,144,144);tc.drawImage(screen,column*(144+l.gap),row*(144+l.gap),144,144,0,0,144,144);messages.push({context,image:tile.toDataURL('image/png')});
  }
  if(g.revision!==revision||socket.readyState!==1||socket.bufferedAmount>262144)return;
  // Every tile in this batch comes from the exact same GIF frame.
  for(const m of messages)if(slots.get(m.context)===list.find(p=>p[0]===m.context)[1])send('setImage',m.context,{image:m.image,target:0});
  g.lastFrame=index;g.lastSent=Date.now();
 }catch(error){for(const[context]of list)status(context,'오류: '+error.message);g.lastSent=Date.now();}
 finally{g.busy=false;}
}
function tick(){if(!ready||!socket||socket.readyState!==1)return;const byDevice=new Map();for(const pair of slots){if(!byDevice.has(pair[1].device))byDevice.set(pair[1].device,[]);byDevice.get(pair[1].device).push(pair);}
 for(const[device,list]of byDevice){const c=config(device),g=group(device);if(!c.framePack||(g.paused&&g.lastFrame>=0)||g.busy)continue;const fps=Math.max(1,Math.min(Number(c.fps)||8,Math.floor(60/Math.max(1,list.length))));if(Date.now()-g.lastSent<1000/fps)continue;
  const speed=Math.max(.5,Math.min(3,Number(c.speed)||1));const index=GifEngine.frameIndex(c.framePack,(g.paused?g.elapsed:Date.now()-g.started+g.elapsed)*speed);if(index===g.lastFrame)continue;paint(device,list,g,c,index,g.revision);
 }
}
function ensureTimer(){if(!timer){timer=new Worker('timer.js');timer.onmessage=tick;timer.postMessage({start:true});}}
function upsert(data){const old=slots.get(data.context),p=data.payload||{},coord=p.coordinates||{},settings=p.settings||{};
 const s={device:data.device||old&&old.device||'default',row:Number.isFinite(coord.row)?coord.row:old?old.row:-1,column:Number.isFinite(coord.column)?coord.column:old?old.column:-1,settings:settings};slots.set(data.context,s);group(s.device).lastFrame=-1;ensureTimer();}
function onMessage(e){let d;try{d=JSON.parse(e.data);}catch{return;}const p=d.payload||{};
 if(d.event==='didReceiveGlobalSettings'){globalSettings=p.settings||{walls:{}};ready=true;sync();}
 else if(d.event==='willAppear'||d.event==='didReceiveSettings')upsert(d);
 else if(d.event==='willDisappear'){const old=slots.get(d.context);slots.delete(d.context);if(old){const g=groups.get(old.device);if(g){g.revision++;g.lastFrame=-1;}}if(!slots.size&&timer){timer.terminate();timer=null;}}
 else if(d.event==='sendToPlugin'&&p.requestWall){const current=slots.get(d.context);const device=current?current.device:(p.device||'default');send('sendToPropertyInspector',d.context,{device,wallConfig:config(device),coordinates:current?{row:current.row,column:current.column}:null,ready});}
 else if(d.event==='sendToPlugin'&&p.settings)upsert({context:d.context,payload:{settings:p.settings}});
 else if(d.event==='sendToPlugin'&&p.wallConfig){if(!ready){status(d.context,'기기 설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');return;}globalSettings.walls=globalSettings.walls||{};globalSettings.walls[p.device||'default']=p.wallConfig;send('setGlobalSettings',uuid,globalSettings);ready=true;sync();}
 else if(d.event==='keyDown'||(d.event==='sendToPlugin'&&p.testClick)){const s=slots.get(d.context);if(!s)return;try{const a=GifActions.target(s.settings);if(a.url){send('openUrl',undefined,{url:a.url});status(d.context,'열기 요청을 보냈습니다.');}else if(a.kind==='pause'){const g=group(s.device);if(g.paused){g.started=Date.now();g.paused=false;}else{g.elapsed+=Date.now()-g.started;g.paused=true;}status(d.context,g.paused?'전체 GIF 일시정지':'전체 GIF 재생');}}catch(error){status(d.context,'오류: '+error.message);}}
 else if(d.event==='propertyInspectorDidAppear'){const s=slots.get(d.context);if(s)send('sendToPropertyInspector',d.context,{device:s.device,coordinates:{row:s.row,column:s.column},wallConfig:config(s.device),ready});}
}
function connect(port,id,event){uuid=id;ready=false;globalSettings={walls:{}};slots.clear();groups.clear();if(timer){timer.terminate();timer=null;}socket=new WebSocket('ws://127.0.0.1:'+port);socket.onopen=()=>{socket.send(JSON.stringify({event,uuid}));send('getGlobalSettings',uuid,{});};socket.onmessage=onMessage;socket.onclose=()=>{if(timer)timer.terminate();timer=null;slots.clear();groups.clear();};}
window.connectElgatoStreamDeckSocket=connect;window.connectMiraBoxSDSocket=connect;window.connectSocket=connect;window.WallTest={onMessage,tick,slots,groups};
})();
