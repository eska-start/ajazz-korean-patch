(function(root){
'use strict';
function launch(payload){const raw=unescape(encodeURIComponent(JSON.stringify(payload)));return 'eskaajazzgif://launch/'+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function target(settings){
 const kind=settings.clickAction||'pause',value=String(settings.clickTarget||'').trim();
 if(kind==='none'||kind==='pause')return {kind:kind};
 if(!value)throw Error(kind==='website'?'웹사이트 주소를 입력해 주세요.':'폴더 또는 파일 경로를 입력해 주세요.');
 if(kind==='website'){
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(value)?value:'https://'+value);
  if(!['http:','https:'].includes(url.protocol)||!url.hostname)throw Error('http 또는 https 웹사이트 주소를 입력해 주세요.');
  const browser=settings.browser||'default';
  if(!['default','chrome','edge','whale','firefox'].includes(browser))throw Error('지원하지 않는 브라우저입니다.');
  return {kind:kind,url:browser==='default'?url.href:launch({kind:kind,target:url.href,browser:browser})};
 }
 if(kind!=='folder'&&kind!=='file')throw Error('지원하지 않는 클릭 동작입니다.');
 let path=value.replace(/^"(.*)"$/,'$1');
 if(!/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(path))throw Error('C:\\폴더처럼 전체 경로를 입력해 주세요.');
 if(/[\x00-\x1f]/.test(path))throw Error('경로에 잘못된 문자가 있습니다.');
 return {kind:kind,url:launch({kind:kind,target:path,folderMode:settings.folderMode==='new'?'new':'reuse'})};
}
root.GifActions={target:target};
})(window);
