let timer=null;onmessage=function(e){if(e.data.start&&!timer)timer=setInterval(()=>postMessage({tick:true}),17);};
