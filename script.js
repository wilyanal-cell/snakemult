const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const SIZE = 24;
const CSS_SIZE = 298;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = CSS_SIZE * DPR;
canvas.height = CSS_SIZE * DPR;
ctx.scale(DPR, DPR);

const cell = CSS_SIZE / SIZE;

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const todayEl = document.getElementById('todayScore');
const weeklyEl = document.getElementById('weeklyScore');
const allTimeEl = document.getElementById('allTimeScore');
const startScreen = document.getElementById('startScreen');
const gameOver = document.getElementById('gameOver');
const finalScore = document.getElementById('finalScore');

let best = Number(localStorage.getItem('snakeBest') || 0);
let score = 0;
let snake = [];
let food = {x:8,y:20};
let direction = {x:0,y:0};
let nextDirection = {x:0,y:0};
let playing = false;
let timer = null;
let speed = 240;

// Obstáculos fixos dos quatro cantos.
 // Agora eles são sólidos: encostar neles causa Game Over.
const obstacles = [
  [3,2],[4,2],[5,2],[3,3],[3,4],
  [20,2],[21,2],[22,2],[22,3],[22,4],
  [22,19],[22,20],[22,21],[20,21],[21,21]
];

scoreEl.textContent = 0;
bestEl.textContent = best;
todayEl.textContent = best;
weeklyEl.textContent = best;
allTimeEl.textContent = best;

function drawGrid(){
  ctx.fillStyle='#a7af98';
  ctx.fillRect(0,0,CSS_SIZE,CSS_SIZE);

  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      const px=x*cell, py=y*cell;
      ctx.fillStyle='#9ca38e';
      ctx.fillRect(px+1.5,py+1.5,cell-3,cell-3);
      ctx.strokeStyle='#b1b8a0';
      ctx.lineWidth=1;
      ctx.strokeRect(px+2.2,py+2.2,cell-4.4,cell-4.4);
      ctx.strokeStyle='#919985';
      ctx.strokeRect(px+3.5,py+3.5,cell-7,cell-7);
    }
  }
}

function drawSquare(x,y,fill='#050505'){
  const px=x*cell+1.7, py=y*cell+1.7, s=cell-3.4;
  ctx.fillStyle=fill;
  ctx.fillRect(px,py,s,s);
  ctx.strokeStyle='#697064';
  ctx.lineWidth=1;
  ctx.strokeRect(px+.5,py+.5,s-1,s-1);
}

function drawObstacles(){
  obstacles.forEach(([x,y])=>drawSquare(x,y));
}

function drawSnake(){
  snake.forEach((p,i)=>{
    const px=p.x*cell+1.7, py=p.y*cell+1.7, s=cell-3.4;
    ctx.fillStyle = i===0 ? '#050505' : '#070807';
    ctx.fillRect(px,py,s,s);
    ctx.strokeStyle='#7a8173';
    ctx.lineWidth=1;
    ctx.strokeRect(px+.5,py+.5,s-1,s-1);
  });

  // little face on the head
  if(snake.length){
    const h=snake[0];
    const hx=h.x*cell, hy=h.y*cell;
    ctx.fillStyle='#a7af98';
    ctx.fillRect(hx+4.2,hy+4.1,2,2);
    ctx.fillRect(hx+7.1,hy+4.1,2,2);
  }
}

function drawFood(){
  const cx=food.x*cell+cell/2, cy=food.y*cell+cell/2;
  ctx.fillStyle='#8e261d';
  ctx.fillRect(cx-6.2,cy-6.2,12.4,12.4);
  ctx.fillStyle='#e54a35';
  ctx.fillRect(cx-4.2,cy-4.2,8.4,8.4);
  ctx.strokeStyle='#b53a2d';
  ctx.strokeRect(cx-5.8,cy-5.8,11.6,11.6);
}

function render(){
  drawGrid();
  drawObstacles();
  drawSnake();
  drawFood();
}

function resetGame(){
  score=0;
  speed=240;
  direction={x:1,y:0};
  nextDirection={x:1,y:0};

  // Easy, slow starting snake.
  snake=[
    {x:10,y:12},
    {x:9,y:12},
    {x:8,y:12},
    {x:7,y:12}
  ];
  placeFood();
  scoreEl.textContent=score;
  render();
}

function placeFood(){
  do{
    food={
      x:Math.floor(Math.random()*SIZE),
      y:Math.floor(Math.random()*SIZE)
    };
  }while(snake.some(p=>p.x===food.x&&p.y===food.y));
}

function startGame(){
  clearTimeout(timer);
  resetGame();
  playing=true;
  startScreen.style.display='none';
  gameOver.style.display='none';
  scheduleTick();
}

function scheduleTick(){
  clearTimeout(timer);
  if(playing) timer=setTimeout(tick,speed);
}

function tick(){
  if(!playing)return;

  direction=nextDirection;
  const head=snake[0];

  // No walls: crossing an edge puts the snake on the opposite side.
  const next={
    x:(head.x+direction.x+SIZE)%SIZE,
    y:(head.y+direction.y+SIZE)%SIZE
  };

  // Colisão com o próprio corpo ou com qualquer quadrado dos cantos.
  const hitBody = snake.some(p=>p.x===next.x && p.y===next.y);
  const hitObstacle = obstacles.some(([x,y])=>x===next.x && y===next.y);

  if(hitBody || hitObstacle){
    endGame();
    return;
  }

  snake.unshift(next);

  if(next.x===food.x && next.y===food.y){
    score++;
    scoreEl.textContent=score;

    if(score>best){
      best=score;
      localStorage.setItem('snakeBest',best);
      bestEl.textContent=best;
      todayEl.textContent=best;
      weeklyEl.textContent=best;
      allTimeEl.textContent=best;
    }

    // Starts very easy and gets progressively faster.
    // Minimum delay prevents the game from becoming impossible.
    speed=Math.max(72,240-score*5);
    placeFood();
  }else{
    snake.pop();
  }

  render();
  scheduleTick();
}

function endGame(){
  playing=false;
  clearTimeout(timer);
  finalScore.textContent=score;
  gameOver.style.display='flex';
}

function setDirection(x,y){
  if(!playing)return;
  // Never allow a 180-degree turn.
  if(direction.x===-x && direction.y===-y)return;
  nextDirection={x,y};
}

document.getElementById('playBtn').addEventListener('click',startGame);
document.getElementById('againBtn').addEventListener('click',startGame);

document.getElementById('menuBtn').addEventListener('click',()=>{
  clearTimeout(timer);
  playing=false;
  gameOver.style.display='none';
  startScreen.style.display='flex';
  resetGame();
});

document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['arrowup','w'].includes(k)){e.preventDefault();setDirection(0,-1)}
  if(['arrowdown','s'].includes(k)){e.preventDefault();setDirection(0,1)}
  if(['arrowleft','a'].includes(k)){e.preventDefault();setDirection(-1,0)}
  if(['arrowright','d'].includes(k)){e.preventDefault();setDirection(1,0)}
  if(k==='enter' && !playing && startScreen.style.display!=='none')startGame();
});

document.querySelectorAll('.touch-controls button').forEach(btn=>{
  btn.addEventListener('pointerdown',e=>{
    e.preventDefault();
    const d=btn.dataset.dir;
    if(d==='up')setDirection(0,-1);
    if(d==='down')setDirection(0,1);
    if(d==='left')setDirection(-1,0);
    if(d==='right')setDirection(1,0);
  });
});

// Swipe controls for phones.
let touchStart=null;
canvas.addEventListener('pointerdown',e=>{
  touchStart={x:e.clientX,y:e.clientY};
});
canvas.addEventListener('pointerup',e=>{
  if(!touchStart)return;
  const dx=e.clientX-touchStart.x;
  const dy=e.clientY-touchStart.y;
  touchStart=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;

  if(Math.abs(dx)>Math.abs(dy)){
    setDirection(dx>0?1:-1,0);
  }else{
    setDirection(0,dy>0?1:-1);
  }
});

resetGame();
