const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../gif-wall/v1.2.1/com.eska.ajazz.wall.sdPlugin');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.gif':'image/gif'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.sent=[];window.WebSocket=class{constructor(){this.readyState=1;this.bufferedAmount=0;window.sock=this;}send(s){window.sent.push(JSON.parse(s));}};
  window.Worker=class{postMessage(){}terminate(){}};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/plugin.html`);
 await page.evaluate(()=>{connectSocket(123,'plugin','register');sock.onopen();});
 for(const columns of [3,5])for(const includeGaps of [false,true])for(const gapPercent of [0,30,100]){
 const tiles=await page.evaluate(async({columns,includeGaps,gapPercent})=>{
  const config={columns,includeGaps,gapPercent,fps:8},l=GifEngine.wallLayout(config);
  const canvas=document.createElement('canvas');canvas.width=l.width;canvas.height=l.height;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(l.width,l.height);
  for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++){const i=(y*l.width+x)*4;pixels.data.set([x%256,y%256,Math.floor(x/256)*50,255],i);}ctx.putImageData(pixels,0,0);
  config.framePack={id:Math.random().toString(),frames:[{end:100,image:canvas.toDataURL()}],duration:100};
  const event=d=>sock.onmessage({data:JSON.stringify(d)});
  event({event:'didReceiveGlobalSettings',payload:{settings:{walls:{device:config}}}});
  window.WallTest.slots.clear();for(let row=0;row<l.rows;row++)for(let column=0;column<l.columns;column++)event({event:'willAppear',context:`${row}-${column}`,device:'device',payload:{coordinates:{row,column},settings:{}}});
  const g=WallTest.groups.get('device::group:1');g.lastSent=0;g.paused=includeGaps;sent.length=0;WallTest.tick();
  await new Promise(r=>setTimeout(r,120));
  const messages=sent.filter(x=>x.event==='setImage'),results=[];
  for(const m of messages){const img=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=m.payload.image;});const c=document.createElement('canvas');c.width=c.height=144;const t=c.getContext('2d');t.drawImage(img,0,0);const [row,col]=m.context.split('-').map(Number),x=col*(144+l.gap)+72,y=row*(144+l.gap)+72;
   results.push({size:[img.width,img.height],actual:Array.from(t.getImageData(72,72,1,1).data),expected:[x%256,y%256,Math.floor(x/256)*50,255]});}
  return {count:messages.length,expectedCount:l.rows*l.columns,results,gap:l.gap};
 },{columns,includeGaps,gapPercent});
 assert.equal(tiles.count,tiles.expectedCount);for(const t of tiles.results){assert.deepEqual(t.size,[144,144]);assert.deepEqual(t.actual,t.expected);}assert.equal(tiles.gap,includeGaps?Math.round(144*gapPercent/100):0);
 }
 // Separate two page groups on the same device, including pause and save routing.
 const isolated=await page.evaluate(async()=>{
  const event=d=>sock.onmessage({data:JSON.stringify(d)}),frame=color=>{const c=document.createElement('canvas');c.width=432;c.height=288;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,432,288);return {id:color,frames:[{end:100,image:c.toDataURL()}],duration:100};};
  WallTest.slots.clear();WallTest.groups.clear();
  const one={columns:3,framePack:frame('#ff0000')},two={columns:3,framePack:frame('#0000ff')};
  event({event:'didReceiveGlobalSettings',payload:{settings:{walls:{device:one,'device::group:2':two}}}});
  for(const n of [1,2])event({event:'willAppear',context:'group'+n,device:'device',payload:{coordinates:{row:0,column:0},settings:{wallGroup:n,clickAction:'pause'}}});
  sent.length=0;WallTest.tick();await new Promise(r=>setTimeout(r,120));
  const colors={};for(const m of sent.filter(m=>m.event==='setImage')){const i=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=m.payload.image;});const c=document.createElement('canvas');c.width=c.height=144;const x=c.getContext('2d');x.drawImage(i,0,0);colors[m.context]=Array.from(x.getImageData(72,72,1,1).data);}
  event({event:'keyDown',context:'group2'});
  const paused=[WallTest.groups.get('device::group:1').paused,WallTest.groups.get('device::group:2').paused];
  event({event:'sendToPlugin',context:'group2',payload:{device:'device',wallGroup:2,wallConfig:{...two,displayScale:150}}});
  const preserved=WallTest.config('device',1).framePack.id==='#ff0000'&&WallTest.config('device',1).displayScale===undefined;
  const saved=sent.filter(m=>m.event==='setGlobalSettings').at(-1).payload;
  event({event:'didReceiveGlobalSettings',payload:{settings:saved}});
  event({event:'sendToPlugin',context:'group2',payload:{requestWall:true,wallGroup:2}});
  const response=sent.filter(m=>m.event==='sendToPropertyInspector'&&m.payload.wallConfig).at(-1).payload;
  return {colors,paused,preserved,group2:response.wallGroup,scale:response.wallConfig.displayScale,newEmpty:!WallTest.config('device',3).framePack,otherDeviceEmpty:!WallTest.config('other',2).framePack};
 });
 assert.deepEqual(isolated.colors.group1,[255,0,0,255]);assert.deepEqual(isolated.colors.group2,[0,0,255,255]);assert.deepEqual(isolated.paused,[false,true]);assert.equal(isolated.preserved,true);assert.equal(isolated.group2,2);assert.equal(isolated.scale,150);assert.equal(isolated.newEmpty,true);assert.equal(isolated.otherDeviceEmpty,true);
 await page.goto(`http://127.0.0.1:${server.address().port}/inspector.html`);
 await page.evaluate(()=>{connectSocket(123,'button','register','','{}');sock.onopen();sock.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{device:'device',ready:true,wallConfig:{columns:3}}})});});
 assert.equal(await page.locator('#includeGaps').isChecked(),false);
 await page.locator('#includeGaps').check();await page.locator('#gapPercent').fill('40');await page.locator('#gapPercent').dispatchEvent('change');
 let save=await page.evaluate(()=>sent.filter(m=>m.payload&&m.payload.wallConfig).at(-1));assert.equal(save.payload.wallConfig.includeGaps,true);assert.equal(save.payload.wallConfig.gapPercent,40);assert.equal(save.payload.device,'device');
 await page.waitForFunction(()=>document.querySelector('#preview').width===548);
 assert.equal(await page.locator('#gapOptions').isVisible(),true);
 await page.screenshot({path:'/tmp/ajazz-gap-inspector.png',fullPage:true});
 await page.locator('#includeGaps').uncheck();assert.equal(await page.locator('#gapOptions').isVisible(),false);
 save=await page.evaluate(()=>sent.filter(m=>m.payload&&m.payload.wallConfig).at(-1));assert.equal(save.payload.wallConfig.includeGaps,false);
 const local=await page.evaluate(()=>sent.filter(m=>m.event==='setSettings').at(-1).payload);assert.equal(local.includeGaps,undefined);assert.equal(local.framePack,undefined);
 await page.locator('#wallGroup').selectOption('2');
 let groupRequest=await page.evaluate(()=>sent.filter(m=>m.payload&&m.payload.requestWall).at(-1));assert.equal(groupRequest.payload.wallGroup,2);
 const grouping=await page.evaluate(()=>sent.filter(m=>m.event==='setSettings').at(-1).payload);assert.equal(grouping.wallGroup,2);
 await page.evaluate(()=>sock.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{device:'device',wallGroup:1,ready:true,wallConfig:{gifName:'WRONG'}}})}));
 assert.notEqual(await page.locator('#name').textContent(),'WRONG');
 await page.evaluate(()=>sock.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{device:'device',wallGroup:2,ready:true,wallConfig:{gifName:'PAGE TWO',displayScale:150}}})}));
 assert.equal(await page.locator('#name').textContent(),'PAGE TWO');assert.equal(await page.locator('#displayScale').inputValue(),'150');
 await page.locator('#includeGaps').check();
 save=await page.evaluate(()=>sent.filter(m=>m.payload&&m.payload.wallConfig).at(-1));assert.equal(save.payload.wallGroup,2);
 assert.deepEqual(errors,[]);console.log('PASS: 12 pixel-checked layouts (3x2 / 5x3, gaps off/on, 0/30/100%), 144px tiles, shared checkbox save and legacy default, preview geometry, independent page groups/colors/pause/save/reload, stale group responses ignored, no browser errors.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
