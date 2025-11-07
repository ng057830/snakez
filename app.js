/* ===== Utilidades ===== */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const randInt = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
const choice = arr => arr[(Math.random()*arr.length)|0];

function fitText(ctx, text, maxW, maxH, base){
  // Ajuste binario del tamaño de fuente para que quepa en el chip
  let lo=8, hi=base, best=12;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    ctx.font=`${mid}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    const h = mid*1.2;
    if(w<=maxW && h<=maxH){ best=mid; lo=mid+1; } else hi=mid-1;
  }
  return best;
}

/* ===== Generador de problemas ===== */
class ProblemGen{
  nonZero(min,max){ let n=0; while(n===0) n=randInt(min,max); return n; }

  next(){
    const ops = ['+','-','*','/'];
    const op = choice(ops);
    const three = (op==='/' ? Math.random()<0.25 : Math.random()<0.55);
    let a,b,c,ans,tex;

    if(op==='+'){
      a=randInt(-20,20); b=randInt(-20,20);
      if(three){ c=randInt(-20,20); ans=a+b+c; tex=`${a}+${b}+${c}`; }
      else { ans=a+b; tex=`${a}+${b}`; }
    }else if(op==='-'){
      a=randInt(-20,20); b=randInt(-20,20);
      if(three){ c=randInt(-20,20); ans=a-b-c; tex=`${a}-${b}-${c}`; }
      else { ans=a-b; tex=`${a}-${b}`; }
    }else if(op==='*'){
      a=randInt(-10,10); b=randInt(-10,10);
      if(three){ c=randInt(-10,10); ans=a*b*c; tex=`${a}\\times${b}\\times${c}`; }
      else { ans=a*b; tex=`${a}\\times${b}`; }
    }else{
      if(three){
        b=this.nonZero(-10,10); c=this.nonZero(-10,10);
        ans=randInt(-10,10); a=ans*b*c;
        tex=`${a}\\div ${b}\\div ${c}`;
      }else{
        b=this.nonZero(-10,10); ans=randInt(-10,10); a=ans*b;
        tex=`${a}\\div ${b}`;
      }
    }

    return { tex, ans, wrong: this.makeWrong(ans, op) };
  }

  makeWrong(correct, op){
    const s = new Set();
    const push=v=>{ if(v!==correct) s.add(v); };
    [1,2,3].forEach(k=>{ push(correct+k); push(correct-k); });
    push(-correct);
    push(correct + Math.sign(correct||1)*randInt(4,7));
    if(op==='+'||op==='-'){ push(correct + (op==='+'?-randInt(2,6):randInt(2,6))); }
    while(s.size<3) push(correct + randInt(-9,9));
    return Array.from(s).slice(0,3);
  }
}

/* ===== Juego ===== */
class SnakeMath{
  constructor(canvas){
    // DOM
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.$q = document.getElementById('question');
    this.$score = document.getElementById('score');
    this.$spd = document.getElementById('spd');
    this.$ov = document.getElementById('overlay');
    this.$mTitle = document.getElementById('modalTitle');
    this.$mMsg = document.getElementById('modalMsg');
    this.$mScore = document.getElementById('mScore');
    this.$mBest = document.getElementById('mBest');
    this.$mStreak = document.getElementById('mStreak');

    // Lógica
    this.grid = 22;
    this.cols = 22;
    this.rows = 22;
    this.speedBase = 6;   // casillas/seg
    this.speedMax  = 14;
    this.speed = this.speedBase;
    this.acc = 0; this.prev = 0;

    this.snake = [];
    this.dir = 'right';
    this.inputQueue = [];
    this.food = [];

    this.problem = new ProblemGen();
    this.current = null;

    this.score = 0;
    this.best = Number(localStorage.getItem('snk_best')||0);
    this.streak = 0;
    this.state = 'idle';

    // Eventos
    this.handleResize();
    addEventListener('resize', ()=>this.handleResize(), {passive:true});
    this.bindInputs();

    // Overlay inicial y primera pregunta (cuando KaTeX ya está)
    this.showOverlay('¡Listo!', 'Recoge la respuesta correcta y evita chocar.', true);
    this.current = this.problem.next();
    this.renderQuestion();

    // Bucle
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  handleResize(){
    const rect = this.c.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width - 28, rect.height - 28);
    const dpr = Math.max(1, window.devicePixelRatio||1);

    this.cols = this.rows = clamp(Math.floor(size/24), 18, 30);
    this.grid = Math.floor(size/this.cols);

    this.c.width  = Math.floor(this.cols*this.grid*dpr);
    this.c.height = Math.floor(this.rows*this.grid*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  bindInputs(){
    const setDir = (nx,ny)=>{
      const map={'0,-1':'up','0,1':'down','-1,0':'left','1,0':'right'};
      const cur = {'up':[0,-1],'down':[0,1],'left':[-1,0],'right':[1,0]}[this.dir];
      if(cur[0]===-nx && cur[1]===-ny) return;
      this.inputQueue.push([nx,ny]);
    };

    addEventListener('keydown', e=>{
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ',"p","P","n","N"].includes(e.key)) e.preventDefault();
      if(e.key==='ArrowUp') setDir(0,-1);
      else if(e.key==='ArrowDown') setDir(0,1);
      else if(e.key==='ArrowLeft') setDir(-1,0);
      else if(e.key==='ArrowRight') setDir(1,0);
      else if(e.key===' '||e.key==='p'||e.key==='P') this.togglePause();
      else if(e.key==='n'||e.key==='N') this.newGame();
    }, {passive:false});

    // Touch
    let sx=0, sy=0;
    this.c.addEventListener('touchstart', e=>{
      if(e.touches.length){ sx=e.touches[0].clientX; sy=e.touches[0].clientY; }
    }, {passive:true});
    this.c.addEventListener('touchend', e=>{
      if(!sx && !sy){ this.togglePause(); }
    }, {passive:true});
    this.c.addEventListener('touchmove', e=>{
      if(!e.touches.length) return;
      const dx=e.touches[0].clientX-sx, dy=e.touches[0].clientY-sy;
      const TH=28;
      if(Math.abs(dx)>TH || Math.abs(dy)>TH){
        if(Math.abs(dx)>Math.abs(dy)) setDir(dx>0?1:-1,0);
        else setDir(0, dy>0?1:-1);
        sx=e.touches[0].clientX; sy=e.touches[0].clientY;
      }
    }, {passive:true});

    // Botones
    document.getElementById('playBtn').onclick = ()=>this.newGame();
    document.getElementById('againBtn').onclick = ()=>this.newGame();
    document.getElementById('helpBtn').onclick  = ()=>this.showOverlay('Ayuda',
      'Flechas para mover · P o Espacio pausa · N nueva partida. En móviles, deslice para mover y toque el tablero para pausar.',
      true);
  }

  showOverlay(title,msg,initial=false){
    this.$mTitle.textContent = title;
    this.$mMsg.textContent = msg||'';
    this.$mScore.textContent = this.score;
    this.$mBest.textContent = this.best;
    this.$mStreak.textContent = this.streak;
    document.getElementById('againBtn').style.display = (this.state==='over' && !initial) ? 'inline-block' : 'none';
    this.$ov.classList.add('show');
    this.state = 'idle';
  }
  hideOverlay(){ this.$ov.classList.remove('show'); }

  updateSpeedBar(){
    const frac = (this.speed - this.speedBase) / (this.speedMax - this.speedBase);
    this.$spd.style.transform = `scaleX(${clamp(frac,0,1)})`;
  }

  renderQuestion(){
    // Seguro porque index.html carga KaTeX antes y este JS está deferred
    katex.render(this.current.tex + ' = ?', this.$q, {throwOnError:false});
  }

  newGame(){
    this.hideOverlay();
    const cx=(this.cols/2)|0, cy=(this.rows/2)|0;
    this.snake.length=0;
    this.snake.push({x:cx,y:cy},{x:cx-1,y:cy},{x:cx-2,y:cy});
    this.dir='right'; this.inputQueue.length=0;

    this.food.length=0;
    this.score=0; this.streak=0;
    this.speed=this.speedBase; this.updateSpeedBar();

    this.current = this.problem.next();
    this.spawnAnswers();
    this.renderQuestion();

    this.acc=0; this.prev=0;
    this.state='run';
    this.c.focus();
  }

  togglePause(){
    if(this.state==='run'){
      this.state='pause';
      this.showOverlay('Pausa','Presiona continuar para seguir.');
    }else if(this.state==='pause' || this.state==='idle'){
      this.hideOverlay(); this.state='run';
    }
  }

  gameOver(){
    this.state='over';
    this.best = Math.max(this.best, this.score);
    localStorage.setItem('snk_best', String(this.best));
    this.showOverlay('¡Buen intento!','Puedes volver a jugar y superar tu marca.');
  }

  spawnAnswers(){
    this.food.length=0;
    const options=[...this.current.wrong, this.current.ans];
    const head=this.snake[0], minDist=4;

    for(const val of options){
      let ok=false, x=0,y=0, tries=0;
      while(!ok && tries++<150){
        x=randInt(0,this.cols-1); y=randInt(0,this.rows-1);
        ok = !this.occupied(x,y) &&
             Math.abs(x-head.x)+Math.abs(y-head.y) >= minDist &&
             !this.food.some(f=>f.x===x && f.y===y);
      }
      this.food.push({x,y,val});
    }
  }

  occupied(x,y){
    for(let i=0;i<this.snake.length;i++){
      const s=this.snake[i]; if(s.x===x && s.y===y) return true;
    }
    return false;
  }

  loop(ts){
    requestAnimationFrame(this.loop);
    const step = 1000/this.speed;
    if(this.state!=='run'){ this.draw(); return; }
    if(!this.prev) this.prev=ts;
    const dt=ts-this.prev; this.prev=ts;
    this.acc+=dt;
    while(this.acc>=step){ this.step(); this.acc-=step; }
    this.draw();
  }

  step(){
    if(this.inputQueue.length){
      const [nx,ny]=this.inputQueue.shift();
      const map={'0,-1':'up','0,1':'down','-1,0':'left','1,0':'right'};
      this.dir = map[`${nx},${ny}`]||this.dir;
    }

    const head={...this.snake[0]};
    if(this.dir==='up') head.y--;
    else if(this.dir==='down') head.y++;
    else if(this.dir==='left') head.x--;
    else if(this.dir==='right') head.x++;

    if(head.x<0||head.y<0||head.x>=this.cols||head.y>=this.rows) return this.gameOver();
    for(let i=0;i<this.snake.length;i++){
      const s=this.snake[i]; if(s.x===head.x && s.y===head.y) return this.gameOver();
    }

    const eaten = this.food.findIndex(f=>f.x===head.x && f.y===head.y);
    this.snake.unshift(head);

    if(eaten>-1){
      const val=this.food[eaten].val;
      if(val===this.current.ans){
        this.score+=5; this.streak++;
        this.speed = clamp(this.speed+0.4, this.speedBase, this.speedMax);
        this.updateSpeedBar();
        this.current=this.problem.next();
        this.spawnAnswers();
        this.renderQuestion();
      }else{
        this.score=Math.max(0,this.score-3); this.streak=0;
        if(this.snake.length>3) this.snake.pop();
        this.food.splice(eaten,1);
      }
      this.$score.textContent=this.score;
    }else{
      this.snake.pop();
    }
  }

  draw(){
    const g=this.grid, w=this.cols*g, h=this.rows*g, ctx=this.ctx;
    ctx.clearRect(0,0,w,h);

    // Cuadrícula
    ctx.save();
    ctx.strokeStyle='rgba(0,0,0,.05)';
    ctx.lineWidth=1;
    ctx.beginPath();
    for(let x=1;x<this.cols;x++){ ctx.moveTo(x*g+.5,0); ctx.lineTo(x*g+.5,h); }
    for(let y=1;y<this.rows;y++){ ctx.moveTo(0,y*g+.5); ctx.lineTo(w,y*g+.5); }
    ctx.stroke();
    ctx.restore();

    // Foods
    for(const f of this.food){
      const cx=f.x*g+g/2, cy=f.y*g+g/2, r=Math.floor(g*0.46);
      ctx.beginPath();
      ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--food').trim()||'#f87171';
      ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();

      const str=String(f.val);
      const fs=fitText(ctx,str,r*1.6,r*1.4,Math.floor(g*0.9));
      ctx.font=`${fs}px Inter, system-ui, sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#fff';
      ctx.fillText(str,cx,cy);
    }

    // Snake
    const snakeCol=getComputedStyle(document.documentElement).getPropertyValue('--snake').trim()||'#34d399';
    const headCol =getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#fbbf24';
    for(let i=0;i<this.snake.length;i++){
      const s=this.snake[i];
      ctx.fillStyle = i===0? headCol : snakeCol;
      const x=s.x*g+1, y=s.y*g+1, w=g-2, h=g-2, r=Math.floor(g*0.18);
      roundRect(ctx,x,y,w,h,r); ctx.fill();
    }
  }
}

function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

/* ===== Inicio seguro tras DOM ===== */
window.addEventListener('DOMContentLoaded', ()=>{
  // KaTeX ya está cargado porque ambos scripts son "defer" y respetan orden.
  const game = new SnakeMath(document.getElementById('stage'));
  window._snake = game; // opcional para depurar
});
