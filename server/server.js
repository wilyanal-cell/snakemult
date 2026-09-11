// Snake Multiplayer - servidor WebSocket
const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 5;
const WORLD = 3000;
const SPAWN_INVULN_MS = 3000;

const httpServer = http.createServer((req,res)=>{
  if(req.url==='/status'){
    const online=[...players.values()].filter(p=>!p.isBot).length;
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify({online,max:MAX_PLAYERS}));
    return;
  }
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
  res.end('Snake Multiplayer server ativo. Conecte-se via WebSocket, não HTTP.');
});
const wss = new WebSocket.Server({server:httpServer});
const players = new Map();
const colors=['#4ade80','#60a5fa','#f472b6','#facc15','#c084fc','#fb7185','#22d3ee','#fb923c','#a3e635','#e879f9'];

function spawn(){return {x:100+Math.random()*(WORLD-200),y:100+Math.random()*(WORLD-200)}}
function bodyAt(p){return Array.from({length:18},(_,i)=>({x:p.x-i*18,y:p.y}))}
function makeBot(index){
  const p=spawn();
  return {id:'bot-'+index,name:'Bot '+index,color:colors[index%colors.length],score:0,alive:true,
    body:bodyAt(p),dir:{x:Math.random()<.5?1:-1,y:0},aiTimer:0,target:null,isBot:true,ws:null,
    invulnerableUntil:Date.now()+SPAWN_INVULN_MS};
}
let botSeq=0;
let foods=Array.from({length:180},()=>({x:40+Math.random()*(WORLD-80),y:40+Math.random()*(WORLD-80),r:5,value:10}));

function living(){return [...players.values()].filter(p=>p.alive)}
function addBots(){
  while(players.size<MIN_PLAYERS && players.size<MAX_PLAYERS){
    const b=makeBot(++botSeq);
    players.set(b.id,b);
  }
}
function removeExtraBots(){
  while(players.size>MIN_PLAYERS){
    const bot=[...players.values()].find(p=>p.isBot);
    if(!bot)break;
    players.delete(bot.id);
  }
}
function dropFood(p){
  const h=p.body[0],count=Math.min(80,Math.max(12,Math.floor(p.body.length/2)));
  for(let i=0;i<count;i++)foods.push({
    x:Math.max(25,Math.min(WORLD-25,h.x+(Math.random()-.5)*220)),
    y:Math.max(25,Math.min(WORLD-25,h.y+(Math.random()-.5)*220)),
    r:5,value:20
  });
}
function broadcast(){
  addBots();
  const state={type:'state',players:[...players.values()].map(p=>({
    id:p.id,name:p.name,color:p.color,score:p.score,alive:p.alive,body:p.body,dir:p.dir,
    invulnerableUntil:p.invulnerableUntil
  })),foods};
  const data=JSON.stringify(state);
  for(const c of wss.clients){
    if(c.readyState===WebSocket.OPEN){
      const id=c.playerId;
      c.send(JSON.stringify({...state,id}));
    }
  }
}

function randomTurn(p){
  if(p.dir.x!==0)p.dir=Math.random()<.5?{x:0,y:1}:{x:0,y:-1};
  else p.dir=Math.random()<.5?{x:1,y:0}:{x:-1,y:0};
}
function steer(p,f){
  const h=p.body[0],dx=f.x-h.x,dy=f.y-h.y;
  if(Math.abs(dx)>Math.abs(dy)){
    if(dx>0&&p.dir.x>=0)p.dir={x:1,y:0};
    else if(dx<0&&p.dir.x<=0)p.dir={x:-1,y:0};
  }else{
    if(dy>0&&p.dir.y>=0)p.dir={x:0,y:1};
    else if(dy<0&&p.dir.y<=0)p.dir={x:0,y:-1};
  }
}
function updateBot(p,dt){
  const h=p.body[0];
  p.aiTimer-=dt;
  if(p.aiTimer<=0){
    p.aiTimer=1+Math.random()*2;
    let best=null,bd=Infinity;
    for(const f of foods){
      const d=Math.hypot(f.x-h.x,f.y-h.y);
      if(d<bd&&d<700){best=f;bd=d}
    }
    p.target=best;
    if(!best||Math.random()<.35)randomTurn(p);
  }
  const margin=180;
  if(h.x<margin&&p.dir.x<0)p.dir={x:1,y:0};
  else if(h.x>WORLD-margin&&p.dir.x>0)p.dir={x:-1,y:0};
  else if(h.y<margin&&p.dir.y<0)p.dir={x:0,y:1};
  else if(h.y>WORLD-margin&&p.dir.y>0)p.dir={x:0,y:-1};
  else if(p.target&&Math.random()<.10)steer(p,p.target);

  const speed=105+Math.min(p.score/40,45);
  const nh={x:h.x+p.dir.x*speed*dt,y:h.y+p.dir.y*speed*dt};
  if(nh.x<20||nh.y<20||nh.x>WORLD-20||nh.y>WORLD-20){p.alive=false;dropFood(p);return}
  p.body.unshift(nh);
  let ate=false;
  for(let i=foods.length-1;i>=0;i--){
    if(Math.hypot(foods[i].x-nh.x,foods[i].y-nh.y)<20){
      p.score+=foods[i].value;foods.splice(i,1);foods.push({x:40+Math.random()*(WORLD-80),y:40+Math.random()*(WORLD-80),r:5,value:10});ate=true;break;
    }
  }
  if(!ate)p.body.pop();
}

wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==='join'){
      const humans=[...players.values()].filter(p=>!p.isBot).length;
      if(humans>=MAX_PLAYERS){ws.send(JSON.stringify({type:'full'}));return}
      // Reserve a slot for the human by removing one bot first.
      const bot=[...players.values()].find(p=>p.isBot);
      if(bot)players.delete(bot.id);
      const id=Math.random().toString(36).slice(2);
      const p=spawn();
      players.set(id,{id,name:String(m.name||'Jogador').slice(0,16),color:colors[players.size%colors.length],
        score:0,alive:true,body:bodyAt(p),dir:{x:1,y:0},isBot:false,ws,
        invulnerableUntil:Date.now()+SPAWN_INVULN_MS});
      ws.playerId=id;
      addBots();
      broadcast();
    }
    if(m.type==='direction'&&ws.playerId){
      const p=players.get(ws.playerId);
      if(p&&p.alive&&Math.abs(m.x)+Math.abs(m.y)===1&&!(m.x===-p.dir.x&&m.y===-p.dir.y))p.dir={x:m.x,y:m.y};
    }
  });
  ws.on('close',()=>{
    if(ws.playerId)players.delete(ws.playerId);
    addBots();broadcast();
  });
});

setInterval(()=>{
  addBots();
  for(const p of players.values())if(p.alive){
    if(p.isBot)updateBot(p,.1);
    else{
      const h=p.body[0],speed=145*.1,nh={x:h.x+p.dir.x*speed,y:h.y+p.dir.y*speed};
      if(nh.x<20||nh.y<20||nh.x>WORLD-20||nh.y>WORLD-20){p.alive=false;dropFood(p);continue}
      p.body.unshift(nh);
      let ate=false;
      for(let i=foods.length-1;i>=0;i--)if(Math.hypot(foods[i].x-nh.x,foods[i].y-nh.y)<20){
        p.score+=foods[i].value;foods.splice(i,1);foods.push({x:40+Math.random()*(WORLD-80),y:40+Math.random()*(WORLD-80),r:5,value:10});ate=true;break
      }
      if(!ate)p.body.pop();
    }
  }

  const alive=living();
  for(const p of alive){
    if(Date.now() < (p.invulnerableUntil||0)) continue;
    const h=p.body[0];
    for(const q of alive)if(p!==q){
      if(Date.now() < (q.invulnerableUntil||0)) continue;
      if(Math.hypot(h.x-q.body[0].x,h.y-q.body[0].y)<18){
        p.alive=false;q.alive=false;dropFood(p);dropFood(q);break;
      }
      for(let i=5;i<q.body.length;i++)if(Math.hypot(h.x-q.body[i].x,h.y-q.body[i].y)<15){
        p.alive=false;dropFood(p);break;
      }
      if(!p.alive)break;
    }
  }
  // Se um bot morreu, repõe bot para manter no mínimo 5 participantes.
  for(const [id,p] of players)if(!p.alive&&p.isBot)players.delete(id);
  addBots();
  broadcast();
},100);

addBots();
httpServer.listen(PORT, ()=>console.log(`Snake server running on port ${PORT}`));
