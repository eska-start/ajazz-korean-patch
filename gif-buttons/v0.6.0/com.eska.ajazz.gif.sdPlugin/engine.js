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
function frameIndex(anim,elapsed){const t=((elapsed%anim.duration)+anim.duration)%anim.duration;let i=0;while(i<anim.frames.length-1&&t>=anim.frames[i].end)i++;return i;}
root.GifEngine={prepare:prepare,frameIndex:frameIndex};
})(window);
