const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');
const menu=document.getElementById('menu'), game=document.getElementById('game'), death=document.getElementById('death');
const nameInput=document.getElementById('nameInput');
nameInput.value=localStorage.getItem('snakeName')||'';

const WORLD=3000, MAX_PLAYERS=10;
let dpr=1,w=0,h=0,player=null,players=[],foods=[],running=false,last=0;
let direction={x:1,y:0}, targetDirection={x:1,y:0};
let ws=null, useDemo=true;
let selectedRoom=null, currentRoomName='Demonstração';
const SPAWN_INVULN_MS=3000;

const WS_URL_DEFAULT='wss://snakemult.onrender.com';
function wsUrl(){return window.SNAKE_WS_URL||WS_URL_DEFAULT}
function statusUrl(){return wsUrl().replace(/^wss:/,'https:').replace(/^ws:/,'http:')+'/status'}
async function refreshOnlineCount(){
  const el=document.getElementById('onlineCount');
  try{
    const res=await fetch(statusUrl());
    const data=await res.json();
    el.textContent=data.online;
  }catch(e){
    el.textContent='?';
  }
}
refreshOnlineCount();
setInterval(refreshOnlineCount,5000);

const roomsList=document.getElementById('roomsList');
function roomsUrl(){return statusUrl().replace(/\/status$/,'/rooms')}
function selectRoom(room){selectedRoom=room;renderRooms(window.lastRooms||[])}
function renderRooms(rooms){
  window.lastRooms=rooms;
  if(!rooms.length){roomsList.innerHTML='<div class="roomsEmpty">Nenhuma sala aberta. Crie a primeira!</div>';return}
  roomsList.innerHTML=rooms.map(r=>`<div class="roomRow ${selectedRoom&&selectedRoom.id===r.id?'selected':''}" data-room="${escapeHtml(r.id)}"><div class="roomDetails"><span class="roomTitle">${escapeHtml(r.name)}</span><span class="roomMeta">${r.count}/${r.max} jogadores</span></div><span class="roomStatus">${r.count>=r.max?'CHEIA':'ENTRAR'}</span></div>`).join('');
  roomsList.querySelectorAll('.roomRow').forEach(row=>row.onclick=()=>selectRoom(rooms.find(r=>r.id===row.dataset.room)));
}
async function refreshRooms(){
  try{const res=await fetch(roomsUrl());const data=await res.json();renderRooms(data.rooms||[])}catch(e){roomsList.innerHTML='<div class="roomsEmpty">Servidor indisponível no momento.</div>'}
}
refreshRooms();setInterval(refreshRooms,5000);
document.getElementById('refreshRoomsButton').onclick=refreshRooms;
document.getElementById('createRoomButton').onclick=async()=>{
  const name=document.getElementById('roomNameInput').value.trim();
  if(!name){document.getElementById('roomNameInput').focus();return}
  try{const res=await fetch(roomsUrl().replace('/rooms','/rooms'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if(res.ok){const data=await res.json();selectRoom(data.room);document.getElementById('roomNameInput').value='';refreshRooms()}
    else throw new Error('create failed')
  }catch(e){alert('Não foi possível criar a sala agora. Tente novamente.')}
};

function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize); resize();

function start(){
  const name=(nameInput.value.trim()||'Jogador').slice(0,16);
  localStorage.setItem('snakeName',name);
  if(!selectedRoom){alert('Selecione ou crie uma sala antes de jogar.');return}
  menu.classList.add('hidden');game.classList.remove('hidden');death.classList.add('hidden');
  currentRoomName=selectedRoom.name;connect(name,selectedRoom.id); running=true; last=performance.now(); requestAnimationFrame(loop);
}
document.getElementById('playButton').onclick=start;
document.getElementById('againButton').onclick=start;

function connect(name,roomId){
  const WS_URL=wsUrl();
  try{
    ws=new WebSocket(WS_URL);
    useDemo=false;
    ws.onopen=()=>ws.send(JSON.stringify({type:'join',name,roomId}));
    ws.onmessage=e=>handleServer(JSON.parse(e.data));
    ws.onerror=()=>{};
    ws.onclose=()=>{
      ws=null;
      if(running && !useDemo){useDemo=true; startDemo(name)}
    };
  }catch(e){
    startDemo(name);
  }
}

function startDemo(name){
  useDemo=true;
  const colors=['#4ade80','#60a5fa','#f472b6','#facc15','#c084fc','#fb7185','#22d3ee','#fb923c','#a3e635','#e879f9'];
  player={id:'me',name,color:colors[0],score:0,alive:true,body:makeBody(1500,1500),dir:{x:1,y:0}};
  players=[player];
  for(let i=1;i<5;i++) {
    const p={x:700+i*350,y:650+i*280};
    players.push({
      id:'bot'+i,name:'Bot '+i,color:colors[i],
      score:0,alive:true,body:makeBody(p.x,p.y),
      dir:{x:Math.random()<.5?1:-1,y:0},
      aiTimer:0,aiTurn:1.5+Math.random()*2,
      target:null, invulnerableUntil:Date.now()+SPAWN_INVULN_MS
    });
  }
  foods=[];
  for(let i=0;i<180;i++) foods.push(food());
}

function makeBody(x,y){let a=[];for(let i=0;i<18;i++)a.push({x:x-i*18,y});return a}
function food(){return{x:Math.random()*(WORLD-80)+40,y:Math.random()*(WORLD-80)+40,r:4+Math.random()*3,value:10}}
function handleServer(m){
  if(m.type==='full'){alert('Sala cheia no momento, tente novamente em instantes.');return}
  if(m.type==='roomNotFound'){alert('Essa sala não existe mais. Escolha outra sala.');return}
  if(m.type!=='state')return;
  const wasAlive=player?player.alive:true;
  players=m.players;foods=m.foods;
  player=players.find(p=>p.id===m.id);
  if(m.room){currentRoomName=m.room.name;document.getElementById('roomNameHud').textContent=currentRoomName}
  if(player&&wasAlive&&!player.alive)showDeath();
}

function setDir(x,y){
  if(!x&&!y)return;
  const ref=(ws&&player)?player.dir:direction;
  if(x===-ref.x&&y===-ref.y)return;
  targetDirection={x,y};
  if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'direction',x,y}));
}
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='arrowup')setDir(0,-1);
  if(k==='arrowdown')setDir(0,1);
  if(k==='arrowleft')setDir(-1,0);
  if(k==='arrowright')setDir(1,0);
});

// D-pad clicável com o mouse (ou toque), usa a mesma função das setas do teclado.
for(const [id,x,y] of [['dpadUp',0,-1],['dpadDown',0,1],['dpadLeft',-1,0],['dpadRight',1,0]]){
  document.getElementById(id).addEventListener('pointerdown',e=>{e.preventDefault();setDir(x,y)});
}

function update(dt){
  if(!player||!player.alive)return;
  direction=targetDirection; player.dir=direction;
  const speed=145, head=player.body[0];
  let nx=head.x+direction.x*speed*dt,ny=head.y+direction.y*speed*dt;
  if(nx<20||ny<20||nx>WORLD-20||ny>WORLD-20){die();return}
  player.body.unshift({x:nx,y:ny});
  let ate=false;
  for(let i=foods.length-1;i>=0;i--)if(Math.hypot(foods[i].x-nx,foods[i].y-ny)<18){player.score+=foods[i].value;foods.splice(i,1);foods.push(food());ate=true;break}
  if(!ate)player.body.pop();

  // Bots: movimento natural, procuram comida, desviam de bordas e mudam de direção.
  for(const p of players)if(p!==player&&p.alive){
    updateBot(p,dt);
  }

  // Colisões da cabeça do jogador com bots.
  if(Date.now() >= (player.invulnerableUntil||0)) for(const p of players)if(p!==player&&p.alive){
    if(Date.now() < (p.invulnerableUntil||0)) continue;
    const ph=p.body[0];
    if(Math.hypot(ph.x-nx,ph.y-ny)<22){
      // cabeça contra cabeça: ambos morrem
      killBot(p);
      die();
      return;
    }
    for(let i=5;i<p.body.length;i++){
      if(Math.hypot(p.body[i].x-nx,p.body[i].y-ny)<17){
        die();return;
      }
    }
  }

  // Bots também podem bater no jogador e morrer.
  if(Date.now() >= (player.invulnerableUntil||0)) for(const p of players)if(p!==player&&p.alive){
    if(Date.now() < (p.invulnerableUntil||0)) continue;
    const ph=p.body[0];
    for(let i=5;i<player.body.length;i++){
      if(Math.hypot(player.body[i].x-ph.x,player.body[i].y-ph.y)<17){
        killBot(p);
        break;
      }
    }
  }
}

function updateBot(p,dt){
  const h=p.body[0];
  p.aiTimer=(p.aiTimer||0)-dt;

  // Escolhe comida próxima periodicamente.
  if(p.aiTimer<=0){
    p.aiTimer=1.0+Math.random()*2.2;
    let best=null,bestD=Infinity;
    for(const f of foods){
      const d=Math.hypot(f.x-h.x,f.y-h.y);
      if(d<bestD && d<650){best=f;bestD=d}
    }
    p.target=best;
    if(!best && Math.random()<0.75) randomBotTurn(p);
  }

  // Evita bordas.
  const margin=180;
  if(h.x<margin && p.dir.x<0) p.dir={x:1,y:0};
  else if(h.x>WORLD-margin && p.dir.x>0) p.dir={x:-1,y:0};
  else if(h.y<margin && p.dir.y<0) p.dir={x:0,y:1};
  else if(h.y>WORLD-margin && p.dir.y>0) p.dir={x:0,y:-1};
  else if(p.target && Math.random()<0.08){
    steerBotToFood(p,p.target);
  } else if(Math.random()<0.018){
    randomBotTurn(p);
  }

  const speed=105+Math.min(p.score/40,45);
  const nx=h.x+p.dir.x*speed*dt, ny=h.y+p.dir.y*speed*dt;

  // Crescimento ao comer.
  p.body.unshift({x:nx,y:ny});
  let ate=false;
  for(let i=foods.length-1;i>=0;i--){
    if(Math.hypot(foods[i].x-nx,foods[i].y-ny)<20){
      p.score+=foods[i].value;
      foods.splice(i,1);
      foods.push(food());
      ate=true;
      break;
    }
  }
  if(!ate)p.body.pop();
}

function steerBotToFood(p,f){
  const h=p.body[0],dx=f.x-h.x,dy=f.y-h.y;
  if(Math.abs(dx)>Math.abs(dy)){
    if(dx>0 && p.dir.x>=0)p.dir={x:1,y:0};
    else if(dx<0 && p.dir.x<=0)p.dir={x:-1,y:0};
  }else{
    if(dy>0 && p.dir.y>=0)p.dir={x:0,y:1};
    else if(dy<0 && p.dir.y<=0)p.dir={x:0,y:-1};
  }
}
function randomBotTurn(p){
  const options=[];
  if(p.dir.x!==0) options.push({x:0,y:1},{x:0,y:-1});
  else options.push({x:1,y:0},{x:-1,y:0});
  p.dir=options[Math.floor(Math.random()*options.length)];
}
function killBot(p){
  if(!p||!p.alive)return;
  p.alive=false;
  const h=p.body[0];
  const drop=Math.min(70,Math.max(12,Math.floor(p.body.length/2)));
  for(let i=0;i<drop;i++){
    foods.push({
      x:Math.max(25,Math.min(WORLD-25,h.x+(Math.random()-.5)*220)),
      y:Math.max(25,Math.min(WORLD-25,h.y+(Math.random()-.5)*220)),
      r:5+Math.random()*2,value:20
    });
  }
}

function die(){
  if(!player||!player.alive)return;
  player.alive=false;
  const drop=Math.min(60,Math.max(10,Math.floor(player.body.length/2)));
  for(let i=0;i<drop;i++)foods.push({x:player.body[0].x+(Math.random()-.5)*180,y:player.body[0].y+(Math.random()-.5)*180,r:5,value:20});
  showDeath();
}

function showDeath(){
  const sorted=[...players].sort((a,b)=>b.score-a.score);
  document.getElementById('finalScore').textContent=player.score;
  document.getElementById('finalRank').textContent=sorted.findIndex(p=>p.id===player.id)+1;
  death.classList.remove('hidden');running=false;
  if(ws){ws.close();ws=null}
}

function draw(){
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#09150f';ctx.fillRect(0,0,w,h);
  if(!player)return;
  const camX=Math.max(0,Math.min(WORLD-w,player.body[0].x-w/2));
  const camY=Math.max(0,Math.min(WORLD-h,player.body[0].y-h/2));
  ctx.save();ctx.translate(-camX,-camY);
  ctx.strokeStyle='#173323';ctx.lineWidth=1;
  const grid=50;
  for(let x=0;x<=WORLD;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD);ctx.stroke()}
  for(let y=0;y<=WORLD;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD,y);ctx.stroke()}
  ctx.strokeStyle='#e9b83f';ctx.lineWidth=8;ctx.strokeRect(0,0,WORLD,WORLD);
  for(const f of foods){ctx.fillStyle='#e9b83f';ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill()}
  const sorted=[...players].filter(p=>p.alive).sort((a,b)=>b.score-a.score);
  for(const p of sorted){
    for(let i=p.body.length-1;i>=0;i--){const s=p.body[i];ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,s.y,Math.max(7,12-i*.015),0,Math.PI*2);ctx.fill()}
    const hd=p.body[0];
    if(sorted[0]===p){ctx.font='24px Arial';ctx.textAlign='center';ctx.fillText('👑',hd.x,hd.y-20)}
    if(Date.now() < (p.invulnerableUntil||0)){
      ctx.strokeStyle='#7dd3fc';ctx.lineWidth=3;ctx.globalAlpha=.8;
      ctx.beginPath();ctx.arc(hd.x,hd.y,22+Math.sin(Date.now()/100)*3,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;
    }
  }
  ctx.restore();
  updateHud(sorted);
}
function updateHud(sorted){
  document.getElementById('score').textContent=player.score;
  document.getElementById('playerName').textContent=player.name;
  document.getElementById('roomNameHud').textContent=currentRoomName;
  document.getElementById('roomCount').textContent=players.filter(p=>p.alive).length;
  document.getElementById('crown').textContent=sorted[0]===player?'👑':'';
  document.getElementById('leaderboard').innerHTML=sorted.slice(0,3).map((p,i)=>`${i===0?'👑':'#'+(i+1)} ${escapeHtml(p.name)} — ${p.score}`).join('<br>');
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function loop(t){
  if(!running)return;
  const dt=Math.min((t-last)/1000,.05);last=t;
  if(useDemo)update(dt);
  draw();requestAnimationFrame(loop);
}
