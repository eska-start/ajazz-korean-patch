const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../gif-wall/v1.2.2/com.eska.ajazz.wall.sdPlugin');
let sent=[];const canvases=[];
const document={createElement(type){assert.equal(type,'canvas');const c={width:0,height:0};const ctx={fillRect(){},clearRect(){},fillText(text){c.number=text;},drawImage(...args){c.draw=args.slice(1);}};c.getContext=()=>ctx;c.toDataURL=()=>'data:image/png;base64,'+Buffer.from(JSON.stringify({crop:c.draw,number:c.number})).toString('base64');canvases.push(c);return c;}};
let sock;const sandbox={document,console,Date,Map,Number,Math,Error,Array,JSON,Promise,setTimeout,Worker:class{postMessage(){}terminate(){}},Image:class{constructor(){this.width=720;this.height=432;}set src(v){queueMicrotask(()=>this.onload());}},WebSocket:class{constructor(){sock=this;this.readyState=1;this.bufferedAmount=0;}send(s){sent.push(JSON.parse(s));}}};sandbox.window=sandbox;vm.createContext(sandbox);
for(const f of ['engine.js','plugin.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox);
sandbox.connectSocket(1,'plugin','register');sock.onopen();const event=o=>sock.onmessage({data:JSON.stringify(o)}),W=sandbox.WallTest;
const pack={id:'p',frames:[{end:100,image:'data:image/png;base64,AAAA'}],duration:100};
const flush=async()=>{for(const g of W.groups.values()){g.lastFrame=-1;g.lastSent=0;}sent=[];W.tick();await new Promise(r=>setImmediate(r));return sent.filter(x=>x.event==='setImage');};
(async()=>{
for(const columns of [3,5])for(const gaps of [false,true]){
 W.slots.clear();W.groups.clear();event({event:'didReceiveGlobalSettings',payload:{settings:{walls:{dev:{columns:3,fix153Order:false,includeGaps:gaps,gapPercent:30,framePack:pack}}}}});
 const rows=columns===5?3:2;
 // Deliberately shuffled appearance order, copied manual tile 0, string coordinates.
 const cells=Array.from({length:columns*rows},(_,i)=>i).reverse();
 for(const n of cells)event({event:'willAppear',device:'dev',context:'k'+n,payload:{coordinates:{row:String(Math.floor(n/columns)),column:String(n%columns)},settings:{tile:'0',clickAction:'website',clickTarget:'https://example.com'}}});
 const msgs=await flush();assert.equal(msgs.length,columns*rows);assert.equal(W.config('dev',1).columns,columns);
 for(const m of msgs){const n=Number(m.context.slice(1)),data=JSON.parse(Buffer.from(m.payload.image.split(',')[1],'base64'));const gap=gaps?43:0;assert.deepEqual(data.crop,[(n%columns)*(144+gap),Math.floor(n/columns)*(144+gap),144,144,0,0,144,144]);}
 assert.equal(W.slots.get('k0').settings.clickTarget,'https://example.com');
}
// Manual selection applies only at its explicitly saved physical location.
event({event:'didReceiveSettings',context:'k1',payload:{settings:{tile:'14',tileAnchor:'dev:0:1'}}});
let msgs=await flush(),m=msgs.find(x=>x.context==='k1');assert.equal(JSON.parse(Buffer.from(m.payload.image.split(',')[1],'base64')).crop[0],4*187);
event({event:'willAppear',device:'dev',context:'k1',payload:{coordinates:{row:1,column:1},settings:{tile:'14',tileAnchor:'dev:0:1',clickAction:'pause'}}});
assert.equal(W.slots.get('k1').settings.tile,'');assert.equal(W.slots.get('k1').row,1);
// Missing coordinates during settings updates retain the real location.
event({event:'didReceiveSettings',context:'k1',payload:{settings:{tile:'8',tileAnchor:'dev:1:1',clickAction:'pause'}}});assert.equal(W.slots.get('k1').row,1);
event({event:'willAppear',device:'dev',context:'other',payload:{coordinates:{row:0,column:0},settings:{wallGroup:2,tile:'4',tileAnchor:'dev:0:0'}}});
event({event:'sendToPlugin',context:'k1',payload:{resetTiles:true}});assert.equal(W.slots.get('k1').settings.tile,'');assert.equal(W.slots.get('other').settings.tile,'4');
event({event:'sendToPlugin',context:'k1',payload:{device:'dev',wallGroup:1,wallConfig:{columns:5,fix153Order:false,framePack:pack,showTileNumbers:true}}});
msgs=await flush();for(const m of msgs){const s=W.slots.get(m.context),data=JSON.parse(Buffer.from(m.payload.image.split(',')[1],'base64'));assert.equal(data.number,String(s.row*5+s.column+1));}
// Adding a slot while a frame decodes invalidates that old batch (static GIF included).
for(const g of W.groups.values()){g.lastFrame=-1;g.lastSent=0;}sent=[];W.tick();
event({event:'willAppear',device:'dev',context:'late',payload:{coordinates:{row:0,column:0},settings:{}}});
await new Promise(r=>setImmediate(r));assert.equal(sent.filter(x=>x.event==='setImage').length,0);
msgs=await flush();assert.ok(msgs.some(x=>x.context==='late'));
// Actual user's 153 screenshot fixture; these are measured tile numbers, not synthetic row-major order.
const measured=[[13,10,7,4,1],[14,11,8,5,2],[15,12,9,6,3]];
for(const gaps of [false,true]){
 W.slots.clear();W.groups.clear();event({event:'didReceiveGlobalSettings',payload:{settings:{walls:{dev:{columns:5,includeGaps:gaps,gapPercent:30,framePack:pack}}}}});
 for(let row=0;row<3;row++)for(let col=0;col<5;col++){
  const raw=measured[row][col]-1;
  event({event:'willAppear',device:'dev',context:`physical-${row}-${col}`,payload:{coordinates:{row:Math.floor(raw/5),column:raw%5},settings:{}}});
 }
 const corrected=await flush();assert.equal(corrected.length,15);
 for(const m of corrected){const [,r,c]=m.context.split('-').map(Number);const data=JSON.parse(Buffer.from(m.payload.image.split(',')[1],'base64')),step=144+(gaps?43:0);assert.deepEqual(data.crop,[c*step,r*step,144,144,0,0,144,144]);}
}
console.log('PASS: measured screenshot 13 10 7 4 1 / 14 11 8 5 2 / 15 12 9 6 3 corrected to physical 1..15, gaps off/on.');
// Inspector boot checks every requested element against actual HTML IDs.
const html=fs.readFileSync(path.join(root,'inspector.html'),'utf8'),elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',style:{},classList:{toggle(){}},appendChild(){},getContext(){return {}}}]));
const ui={console,Date,JSON,Number,Math,setTimeout(){},clearTimeout(){},document:{getElementById(id){assert.ok(elements.has(id),'Missing UI element '+id);return elements.get(id);},createElement(){return {};}},addEventListener(){}};ui.window=ui;vm.createContext(ui);vm.runInContext(fs.readFileSync(path.join(root,'inspector.js'),'utf8'),ui);
console.log('PASS: 6/15 tiles, shuffled events, string coordinates, 3x2/5x3 detection, gap source rectangles, legacy/copy/move reset, anchored manual override, settings updates, group isolation, numbered tiles, inspector element bindings.');
})().catch(e=>{console.error(e);process.exitCode=1;});
