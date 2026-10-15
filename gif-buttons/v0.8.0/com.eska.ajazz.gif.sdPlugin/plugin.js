(function(){
'use strict';
let socket=null;const slots=new Map(),cache=new Map(),titles=new Map();let cursor=0,timer=null;
function send(event,context,payload){if(!socket||socket.readyState!==1||(event==='setImage'&&socket.bufferedAmount>65536))return false;socket.send(JSON.stringify({event:event,context:context,action:'com.eska.ajazz.gif.play',payload:payload}));return true;}
function status(context,text){send('sendToPropertyInspector',context,{status:text});}
function stop(){if(timer){timer.terminate();timer=null;}}
function run(){if(timer)return;timer=new Worker('timer.js');timer.onmessage=tick;timer.postMessage({start:true});}
function tick(){
 if(!socket||socket.readyState!==1)return;
 const candidates=Array.from(slots.entries()).filter(pair=>pair[1].anim&&!pair[1].paused);
 if(!candidates.length)return;
 // Round-robin maximum about 60 image messages/sec across every visible button.
 cursor%=candidates.length;const pair=candidates[cursor++],context=pair[0],s=pair[1],now=Date.now();
 const fps=Math.max(1,Math.min(30,Number(s.settings.fps)||12));
 if(now-s.lastSent<1000/fps)return;
 const speed=Math.max(0.5,Math.min(3,Number(s.settings.speed)||1));
 const index=GifEngine.frameIndex(s.anim,(now-s.started+s.elapsed)*speed);
 if(index===s.lastFrame)return;
 if(send('setImage',context,{image:s.anim.frames[index].image,target:0})){s.lastSent=now;s.lastFrame=index;}
}
function base64Buffer(value){const raw=atob(value);const array=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);return array.buffer;}
function animationKey(settings){const key=settings.framePack?'pack:'+settings.framePack.id:(settings.gifBase64||'builtin');return key+':scale:'+Math.max(50,Math.min(300,Number(settings.displayScale)||100))+':x:'+(Number(settings.offsetX)||0)+':y:'+(Number(settings.offsetY)||0);}
async function scaleAnimation(anim,percent,offsetX,offsetY){

 const canvas=document.createElement('canvas');canvas.width=canvas.height=144;const ctx=canvas.getContext('2d'),size=144*percent/100,margin=(144-size)/2,frames=[];
 for(const frame of anim.frames){const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('프레임 읽기 실패'));img.src=frame.image;});ctx.fillStyle='#000';ctx.fillRect(0,0,144,144);ctx.drawImage(image,margin+(Number(offsetX)||0)*2.4,margin+(Number(offsetY)||0)*2.4,size,size);frames.push({end:frame.end,image:canvas.toDataURL('image/png')});}
 return Object.assign({},anim,{frames:frames,width:144,height:144});
}
async function load(context,settings){
 const previous=slots.get(context);
 if(previous&&previous.anim&&animationKey(previous.settings)===animationKey(settings||{})){previous.settings=settings||{};status(context,'설정이 적용되었습니다.');return;}
 const s={settings:settings||{},token:{},paused:false,started:Date.now(),elapsed:0,lastSent:0,lastFrame:-1};slots.set(context,s);
 try{
  const key=animationKey(s.settings);let anim=cache.get(key);
  if(!anim&&s.settings.framePack){anim=await scaleAnimation(GifEngine.validatePack(s.settings.framePack),Math.max(50,Math.min(300,Number(s.settings.displayScale)||100)),s.settings.offsetX,s.settings.offsetY);cache.set(key,anim);}
  if(!anim){let buffer;
   if(s.settings.gifBase64)buffer=base64Buffer(s.settings.gifBase64);
   else buffer=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET','default.gif');xhr.responseType='arraybuffer';xhr.onload=()=>xhr.response?resolve(xhr.response):reject(Error('기본 아이콘 읽기 실패'));xhr.onerror=()=>reject(Error('기본 아이콘 읽기 실패'));xhr.send();});
   anim=await scaleAnimation(GifEngine.prepare(buffer),Math.max(50,Math.min(300,Number(s.settings.displayScale)||100)),s.settings.offsetX,s.settings.offsetY);cache.set(key,anim);
  }
  if(slots.get(context)!==s)return;
  s.anim=anim;s.started=Date.now();send('setTitle',context,{title:titles.get(context)||'',target:0});send('setImage',context,{image:anim.frames[0].image,target:0});s.lastFrame=0;s.lastSent=Date.now();
  status(context,'재생 준비 완료: '+anim.frames.length+'프레임. ');run();prune();
 }catch(error){if(slots.get(context)===s){status(context,'오류: '+error.message);/* Keep device title intact; show decode errors in the inspector. */}prune();}
}
function prune(){const used=new Set(Array.from(slots.values()).map(s=>animationKey(s.settings)));for(const key of cache.keys())if(!used.has(key))cache.delete(key);}
function onMessage(message){let data;try{data=JSON.parse(message.data);}catch{return;}
 const context=data.context,payload=data.payload||{};
 if(data.event==='willAppear'){const title=typeof payload.title==='string'?payload.title:'';titles.set(context,title==='GIF 오류'?'':title);load(context,payload.settings||{});}
 else if(data.event==='titleParametersDidChange'){if(typeof payload.title==='string'&&payload.title!=='GIF 오류')titles.set(context,payload.title);}
 else if(data.event==='didReceiveSettings')load(context,payload.settings||{});
 else if(data.event==='sendToPlugin' && payload.settings)load(context,payload.settings);
 else if(data.event==='willDisappear'){slots.delete(context);titles.delete(context);prune();if(!slots.size)stop();}
 else if(data.event==='keyDown' || (data.event==='sendToPlugin' && payload.testClick)){
  const s=slots.get(context);if(!s)return;
  let click;try{click=GifActions.target(s.settings);}catch(error){status(context,'오류: '+error.message);return;}
  if(click.kind==='none'){status(context,'클릭 동작 없음');return;}
  if(click.url){send('openUrl',undefined,{url:click.url});status(context,'열기 요청 전송: '+(s.settings.clickTarget||''));return;}
  if(!s.anim)return;
  if(s.paused){s.started=Date.now();s.paused=false;s.lastFrame=-1;}
  else{s.elapsed+=Date.now()-s.started;s.paused=true;}
  status(context,s.paused?'일시정지':'재생 중');
 }
 else if(data.event==='propertyInspectorDidAppear'){const s=slots.get(context);status(context,s&&s.anim?(s.paused?'일시정지':'재생 중'):'GIF를 불러오는 중');}
}
function connect(port,uuid,event){
 if(socket)socket.close();stop();slots.clear();cache.clear();titles.clear();socket=new WebSocket('ws://127.0.0.1:'+port);
 socket.onopen=()=>socket.send(JSON.stringify({event:event,uuid:uuid}));socket.onmessage=onMessage;
 socket.onclose=()=>{stop();slots.clear();cache.clear();titles.clear();};
}
window.connectElgatoStreamDeckSocket=connect;window.connectMiraBoxSDSocket=connect;window.connectSocket=connect;
window.GifPluginTest={onMessage:onMessage,tick:tick,slots:slots};
})();
