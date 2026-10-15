/* GIF compositing, disposal, and cumulative-delay playback. */
(function(root){
'use strict';
function prepare(buffer){
 const bytes=new Uint8Array(buffer);
 if(bytes.length<13 || bytes.length>1048576)throw Error('GIF 파일은 1MB 이하로 선택해 주세요.');
 const header=String.fromCharCode.apply(null,bytes.slice(0,6));
 if(header!=='GIF87a' && header!=='GIF89a')throw Error('올바른 GIF 파일이 아닙니다.');
 const parsed=root.GIFUCT.parseGIF(buffer),w=parsed.lsd.width,h=parsed.lsd.height;
 if(!w||!h||w>512||h>512)throw Error('512×512 이하 GIF를 사용해 주세요.');
 const images=parsed.frames.filter(f=>f.image);
 if(images.length>200)throw Error('200프레임 이하 GIF를 사용해 주세요.');
 for(const f of images){const d=f.image.descriptor;
  if(d.width*d.height>512*512 || d.left+d.width>w || d.top+d.height>h)throw Error('프레임 영역이 잘못되었습니다.');
 }
 const source=root.GIFUCT.decompressFrames(parsed,true);
 if(!source.length)throw Error('GIF에 재생할 프레임이 없습니다.');
 const full=document.createElement('canvas');full.width=w;full.height=h;const ctx=full.getContext('2d');
 const patch=document.createElement('canvas'),out=document.createElement('canvas');out.width=out.height=60;
 const oc=out.getContext('2d');const frames=[];let prev=null,restore=null,total=0;
 for(const f of source){
  if(prev && prev.disposalType===2){const d=prev.dims;ctx.clearRect(d.left,d.top,d.width,d.height);}
  if(prev && prev.disposalType===3 && restore)ctx.putImageData(restore,0,0);
  restore=f.disposalType===3?ctx.getImageData(0,0,w,h):null;
  const d=f.dims;patch.width=d.width;patch.height=d.height;
  const pc=patch.getContext('2d'),image=pc.createImageData(d.width,d.height);image.data.set(f.patch);pc.putImageData(image,0,0);
  ctx.drawImage(patch,d.left,d.top);
  oc.fillStyle='#000';oc.fillRect(0,0,60,60);const scale=Math.min(60/w,60/h);
  oc.drawImage(full,(60-w*scale)/2,(60-h*scale)/2,w*scale,h*scale);
  total+=Math.max(20,f.delay||100);frames.push({end:total,image:out.toDataURL('image/png')});prev=f;
 }
 return {frames,duration:total,width:w,height:h};
}
async function optimize(buffer,onProgress){
 const bytes=new Uint8Array(buffer);
 if(bytes.length<13||bytes.length>50*1024*1024)throw Error('50MB 이하 GIF를 선택해 주세요.');
 const header=String.fromCharCode.apply(null,bytes.slice(0,6));if(!/^GIF8[79]a$/.test(header))throw Error('올바른 GIF 파일이 아닙니다.');
 const parsed=root.GIFUCT.parseGIF(buffer),w=parsed.lsd.width,h=parsed.lsd.height;
 if(!w||!h||w*h>16777216||w>8192||h>8192)throw Error('원본 해상도가 너무 커 처리할 수 없습니다.');
 const source=parsed.frames.filter(f=>f.image);if(!source.length||source.length>3000)throw Error('재생 가능한 3000프레임 이하 GIF를 선택해 주세요.');
 const full=document.createElement('canvas');full.width=w;full.height=h;const ctx=full.getContext('2d');
 const patch=document.createElement('canvas'),out=document.createElement('canvas');out.width=out.height=288;const oc=out.getContext('2d');
 const step=Math.ceil(source.length/180),frames=[];let prev=null,restore=null,total=0;
 for(let i=0;i<source.length;i++){
  const desc=source[i].image.descriptor;if(desc.width*desc.height>16777216||desc.left+desc.width>w||desc.top+desc.height>h)throw Error('프레임 영역이 잘못되었습니다.');
  const f=root.GIFUCT.decompressFrame(source[i],parsed.gct,true);
  if(prev&&prev.disposalType===2){const d=prev.dims;ctx.clearRect(d.left,d.top,d.width,d.height);}
  if(prev&&prev.disposalType===3&&restore)ctx.putImageData(restore,0,0);
  restore=f.disposalType===3?ctx.getImageData(0,0,w,h):null;
  const d=f.dims;patch.width=d.width;patch.height=d.height;const pc=patch.getContext('2d'),image=pc.createImageData(d.width,d.height);image.data.set(f.patch);pc.putImageData(image,0,0);ctx.drawImage(patch,d.left,d.top);
  total+=Math.max(20,f.delay||100);
  if(i%step===0){oc.fillStyle='#000';oc.fillRect(0,0,288,288);const scale=Math.min(288/w,288/h);oc.drawImage(full,(288-w*scale)/2,(288-h*scale)/2,w*scale,h*scale);frames.push({end:total,image:out.toDataURL('image/png')});}
  else frames[frames.length-1].end=total;
  prev=f;
  if(i%5===0){if(onProgress)onProgress(Math.round((i+1)/source.length*100));await new Promise(r=>setTimeout(r,0));}
 }
 const frameBytes=frames.reduce((n,f)=>n+f.image.length,0);const keep=Math.max(1,Math.min(frames.length,Math.floor(frames.length*6*1024*1024/Math.max(1,frameBytes))));
 if(keep<frames.length){const old=frames.slice();frames.length=0;const span=Math.ceil(old.length/keep);for(let n=0;n<old.length;n+=span){frames.push({image:old[n].image,end:old[Math.min(n+span-1,old.length-1)].end});}}
 if(onProgress)onProgress(100);
 return {id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2),frames:frames,duration:total,width:288,height:288,originalWidth:w,originalHeight:h,originalFrames:source.length};
}
function validatePack(pack){
 if(!pack||!Array.isArray(pack.frames)||!pack.frames.length||pack.frames.length>180||!Number.isFinite(pack.duration)||pack.duration<=0)throw Error('저장된 GIF 데이터가 잘못되었습니다.');
 let end=0;
 for(const f of pack.frames){if(!Number.isFinite(f.end)||f.end<=end||typeof f.image!=='string'||!/^data:image\/(jpeg|png);base64,/.test(f.image)||f.image.length>500000)throw Error('저장된 프레임이 잘못되었습니다.');end=f.end;}
 if(end!==pack.duration)throw Error('저장된 재생 시간이 잘못되었습니다.');return pack;
}
function frameIndex(anim,elapsed){const t=((elapsed%anim.duration)+anim.duration)%anim.duration;let i=0;while(i<anim.frames.length-1&&t>=anim.frames[i].end)i++;return i;}
root.GifEngine={prepare:prepare,optimize:optimize,validatePack:validatePack,frameIndex:frameIndex};
})(window);
