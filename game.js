import * as THREE from 'three';

const canvas = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91a7a4);
scene.fog = new THREE.Fog(0x91a7a4, 115, 255);
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 320);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = false;

const TRACK_R = 62, ROAD_W = 22, TOTAL_LAPS = 3, MAX_SPEED = 68;
const cars = [
  {name:'TORO V12', make:'ITALIAN SUPERCAR', tag:'V12 · AWD', color:0xd9fa53, top:1.04, accel:1.04, handling:1.0, shape:'wedge'},
  {name:'M4 COMPETITION', make:'GERMAN SPORT', tag:'I6 · RWD', color:0x398bd0, top:.98, accel:1.05, handling:1.14, shape:'coupe'},
  {name:'CHIRON SPORT', make:'FRENCH HYPERCAR', tag:'W16 · AWD', color:0x9f53e2, top:1.12, accel:.91, handling:.88, shape:'hyper'},
  {name:'911 CARRERA', make:'STUTTGART ICON', tag:'FLAT-6 · RWD', color:0xebebdf, top:.96, accel:1, handling:1.18, shape:'classic'},
  {name:'720S SPIDER', make:'BRITISH SUPERCAR', tag:'V8 · RWD', color:0xf07836, top:1.06, accel:1.02, handling:1.02, shape:'wedge'},
  {name:'AMG GT BLACK', make:'GERMAN GT', tag:'V8 · RWD', color:0xdb3e46, top:1.02, accel:1.01, handling:1.05, shape:'coupe'}
];
let selectedCar = 0;
let mode = 'welcome';
let speed = 0, lateral = 0, steer = 0, raceTime = 0, lap = 0, countdown = 0, boost = 100;
let playerAngle = -0.13, lastTime = performance.now(), soundOn = false;
const keys = new Set(), touch = {left:false,right:false,gas:false,brake:false,boost:false};
const racers = [], remotePlayers = new Map();
let playerCar;
let audioContext = null;

scene.add(new THREE.HemisphereLight(0xe4f1ef, 0x4a5a4f, 2.0));
const sun = new THREE.DirectionalLight(0xffe6c6, 2.8);
sun.position.set(-80, 110, -60); scene.add(sun);
const fill = new THREE.DirectionalLight(0x91ccff, 1.1); fill.position.set(70, 55, 60); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600,600), new THREE.MeshStandardMaterial({color:0x526b58, roughness:1}));
ground.rotation.x=-Math.PI/2; ground.position.y=-.12; scene.add(ground);

function ringMesh(inner, outer, material, segments=220, y=.01) {
  const vertices=[], indices=[];
  for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2, c=Math.cos(a), s=Math.sin(a);
    vertices.push(c*inner,y,s*inner,c*outer,y,s*outer);
    if(i<segments){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.rotation.x=0;scene.add(mesh);return mesh;
}
ringMesh(TRACK_R-ROAD_W/2, TRACK_R+ROAD_W/2, new THREE.MeshStandardMaterial({color:0x343b3c,roughness:.88,metalness:.05}),280,.015);
ringMesh(TRACK_R-ROAD_W/2-.55,TRACK_R-ROAD_W/2+.18,new THREE.MeshStandardMaterial({color:0xd3d1c2,roughness:.85}),280,.035);
ringMesh(TRACK_R+ROAD_W/2-.18,TRACK_R+ROAD_W/2+.55,new THREE.MeshStandardMaterial({color:0xd3d1c2,roughness:.85}),280,.035);
// Broken reflective lane markers.
for(let lane of [-4.6,4.6]) for(let i=0;i<80;i+=2){
  const a=i/80*Math.PI*2, r=TRACK_R+lane;
  const dash=new THREE.Mesh(new THREE.BoxGeometry(.22,.035,2.1),new THREE.MeshStandardMaterial({color:0xd7d8c8,emissive:0x171914,roughness:.7}));
  dash.position.set(Math.cos(a)*r,.055,Math.sin(a)*r);dash.rotation.y=-a;scene.add(dash);
}
// Start / finish stripe.
for(let i=0;i<14;i++) for(let j=0;j<2;j++){
  const tile=new THREE.Mesh(new THREE.BoxGeometry(1.55,.055,1.05),new THREE.MeshBasicMaterial({color:(i+j)%2?0x101414:0xf4f1df}));
  tile.position.set(-10.5+i*1.55,.065,-.54+j*1.08);scene.add(tile);
}
// Trackside rumble strips and a simple outer safety barrier.
for(let side of [-1,1]){
  const rr=TRACK_R+side*(ROAD_W/2+1.1);
  for(let i=0;i<160;i++){
    if(i%2)continue;
    const a=i/160*Math.PI*2, curb=new THREE.Mesh(new THREE.BoxGeometry(.65,.18,2.2),new THREE.MeshStandardMaterial({color:(i%4===0)?0xf0f0e9:0xe75d4e,roughness:.8}));
    curb.position.set(Math.cos(a)*rr,.06,Math.sin(a)*rr);curb.rotation.y=-a;scene.add(curb);
  }
  const barrier=ringMesh(TRACK_R+side*(ROAD_W/2+3.1)-.35,TRACK_R+side*(ROAD_W/2+3.1)+.35,new THREE.MeshStandardMaterial({color:0x6a7774,roughness:.55,metalness:.25}),220,.6);
  barrier.scale.y=1;
}
// Low-poly pines and street lights, kept intentionally lightweight.
const treeMat=new THREE.MeshStandardMaterial({color:0x284838,roughness:1});
const trunkMat=new THREE.MeshStandardMaterial({color:0x554838,roughness:1});
for(let i=0;i<72;i++){
  const a=i/72*Math.PI*2, r=TRACK_R+18+(i%3)*3, x=Math.cos(a)*r,z=Math.sin(a)*r;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2,.34,2,5),trunkMat);trunk.position.set(x,1,z);scene.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.8+(i%2)*.4,5+(i%3),6),treeMat);crown.position.set(x,4,z);scene.add(crown);
}
const lampMat=new THREE.MeshStandardMaterial({color:0x273234,metalness:.55,roughness:.4});
const lampGlow=new THREE.MeshBasicMaterial({color:0xffe9b5});
for(let i=0;i<32;i++){
  const a=i/32*Math.PI*2,r=TRACK_R+16,x=Math.cos(a)*r,z=Math.sin(a)*r;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,7,6),lampMat);pole.position.set(x,3.5,z);scene.add(pole);
  const head=new THREE.Mesh(new THREE.BoxGeometry(.65,.18,.35),lampGlow);head.position.set(x,7,z);scene.add(head);
  const pool=new THREE.Mesh(new THREE.CircleGeometry(5,16),new THREE.MeshBasicMaterial({color:0xffedc4,transparent:true,opacity:.055,depthWrite:false}));pool.rotation.x=-Math.PI/2;pool.position.set(x,.025,z);scene.add(pool);
}
// Distant coastal city silhouettes.
for(let i=0;i<38;i++){
  const a=(i/38)*Math.PI*2,r=118+(i%4)*8,h=8+(i*17%27),w=5+(i*7%8),d=5+(i*13%9);
  const building=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:i%3===0?0x667779:0x53676b,roughness:1}));
  building.position.set(Math.cos(a)*r,h/2-1,Math.sin(a)*r);building.rotation.y=-a;scene.add(building);
  for(let k=0;k<4;k++){
    const window=new THREE.Mesh(new THREE.BoxGeometry(.22,.35,.08),new THREE.MeshBasicMaterial({color:k%2?0xe9c77d:0x90b9bf}));
    window.position.set(Math.cos(a)*(r-d/2-.05),1+(k%2)*1.3,Math.sin(a)*(r-d/2-.05));scene.add(window);
  }
}

function makeCar(spec, isPlayer=false){
  const root=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color:spec.color,metalness:.72,roughness:.26});
  const dark=new THREE.MeshStandardMaterial({color:0x11191c,metalness:.45,roughness:.3});
  const glass=new THREE.MeshStandardMaterial({color:0x14252a,metalness:.5,roughness:.18});
  const rubber=new THREE.MeshStandardMaterial({color:0x101214,roughness:.9});
  const rim=new THREE.MeshStandardMaterial({color:0xc2c9c4,metalness:.85,roughness:.22});
  const lower=new THREE.Mesh(new THREE.BoxGeometry(1.82,.38,4.35),paint);lower.position.y=.48;root.add(lower);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(1.72,.23,1.36),paint);nose.position.set(0,.63,-1.43);root.add(nose);
  const rear=new THREE.Mesh(new THREE.BoxGeometry(1.75,.28,1.0),paint);rear.position.set(0,.62,1.53);root.add(rear);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.35,.58,1.86),glass);cabin.position.set(0,.91,-.12);root.add(cabin);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(1.22,.13,.92),paint);roof.position.set(0,1.23,.02);root.add(roof);
  const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.28,.045,.58),glass);windshield.position.set(0,1.12,-.72);windshield.rotation.x=-.26;root.add(windshield);
  const backGlass=new THREE.Mesh(new THREE.BoxGeometry(1.23,.04,.48),glass);backGlass.position.set(0,1.11,.66);backGlass.rotation.x=.25;root.add(backGlass);
  const splitter=new THREE.Mesh(new THREE.BoxGeometry(1.8,.11,.26),dark);splitter.position.set(0,.34,-2.16);root.add(splitter);
  const diffuser=new THREE.Mesh(new THREE.BoxGeometry(1.55,.17,.28),dark);diffuser.position.set(0,.35,2.18);root.add(diffuser);
  for(const x of [-.97,.97]) for(const z of [-1.34,1.38]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.27,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.38,z);root.add(wheel);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.29,10),rim);hub.rotation.z=Math.PI/2;hub.position.set(x*1.01,.38,z);root.add(hub);
  }
  const headMat=new THREE.MeshBasicMaterial({color:0xfff0c4});
  for(const x of [-.62,.62]){const light=new THREE.Mesh(new THREE.BoxGeometry(.43,.11,.08),headMat);light.position.set(x,.62,-2.1);root.add(light);}
  const tailMat=new THREE.MeshBasicMaterial({color:0xff382e});
  for(const x of [-.63,.63]){const light=new THREE.Mesh(new THREE.BoxGeometry(.42,.12,.08),tailMat);light.position.set(x,.62,2.07);root.add(light);}
  if(spec.shape==='wedge'||spec.shape==='hyper'){
    const fin=new THREE.Mesh(new THREE.BoxGeometry(1.55,.11,.24),dark);fin.position.set(0,.96,1.75);root.add(fin);
    const strut1=new THREE.Mesh(new THREE.BoxGeometry(.09,.28,.09),dark);strut1.position.set(-.55,.83,1.68);root.add(strut1);
    const strut2=strut1.clone();strut2.position.x=.55;root.add(strut2);
    const side=new THREE.Mesh(new THREE.BoxGeometry(.12,.16,2.15),dark);side.position.set(-.88,.38,0);root.add(side);const side2=side.clone();side2.position.x=.88;root.add(side2);
  } else {
    const grille=new THREE.Mesh(new THREE.BoxGeometry(.75,.2,.08),dark);grille.position.set(0,.48,-2.18);root.add(grille);
  }
  if(isPlayer){
    const glow=new THREE.Mesh(new THREE.CircleGeometry(2.4,20),new THREE.MeshBasicMaterial({color:0xc8f27b,transparent:true,opacity:.11,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.025;root.add(glow);
  }
  scene.add(root);return root;
}

playerCar=makeCar(cars[selectedCar],true);
const aiSpecs=[cars[2],cars[1],cars[4],cars[3],cars[5]];
for(let i=0;i<5;i++) racers.push({mesh:makeCar(aiSpecs[i]), angle:playerAngle-(i+1)*.025, lane:(i%2?1:-1)*(2.2+(i%3)*1.1), speed:35+(i%3)*2.5, base:35+(i%3)*2.5, name:aiSpecs[i].name, isAI:true});

function placeOnTrack(mesh,angle,lane=0,y=.08){
  const r=TRACK_R+lane;mesh.position.set(Math.cos(angle)*r,y,Math.sin(angle)*r);mesh.rotation.y=Math.PI-angle;
}
placeOnTrack(playerCar,playerAngle,0,.1);

const ui={welcome:document.querySelector('#welcome'),garage:document.querySelector('#garage'),countdown:document.querySelector('#countdown'),finish:document.querySelector('#finishPanel'),lap:document.querySelector('#lapValue'),position:document.querySelector('#positionValue'),time:document.querySelector('#timeValue'),progress:document.querySelector('#raceProgress'),speed:document.querySelector('#speedValue'),meter:document.querySelector('#speedMeter'),gear:document.querySelector('#gearValue'),boost:document.querySelector('#boostLabel'),online:document.querySelector('#onlineText')};
const carList=document.querySelector('#carList');
function renderCarList(){
  carList.innerHTML='';cars.forEach((car,i)=>{const button=document.createElement('button');button.className='car-option'+(i===selectedCar?' selected':'');button.innerHTML=`<span class="car-swatch" style="color:#${car.color.toString(16).padStart(6,'0')}">◆</span><span><b>${car.name}</b><small>${car.make}</small></span><span class="car-number">0${i+1}</span>`;button.addEventListener('click',()=>selectCar(i));carList.append(button);});
  document.querySelector('#carTag').textContent=cars[selectedCar].tag;
}
function selectCar(i){selectedCar=i;scene.remove(playerCar);playerCar=makeCar(cars[i],true);placeOnTrack(playerCar,playerAngle,lateral,.1);renderCarList();}
renderCarList();
function showGarage(){ui.welcome.classList.add('hidden');ui.garage.classList.remove('hidden');}
function beginRace(){ui.garage.classList.add('hidden');mode='countdown';countdown=3.3;ui.countdown.classList.remove('hidden');}
function startRace(){mode='racing';raceTime=0;lap=0;speed=0;boost=100;ui.countdown.classList.add('hidden');}
document.querySelector('#startBtn').addEventListener('click',showGarage);
document.querySelector('#raceBtn').addEventListener('click',beginRace);
document.querySelector('#closeGarage').addEventListener('click',()=>{ui.garage.classList.add('hidden');ui.welcome.classList.remove('hidden');});
document.querySelector('#againBtn').addEventListener('click',()=>{ui.finish.classList.add('hidden');mode='welcome';speed=0;lap=0;raceTime=0;playerAngle=-.13;lateral=0;racers.forEach((r,i)=>r.angle=playerAngle-(i+1)*.025);placeOnTrack(playerCar,playerAngle,0,.1);ui.welcome.classList.remove('hidden');});
document.querySelector('#soundBtn').addEventListener('click',async()=>{soundOn=!soundOn;document.querySelector('#soundIcon').textContent=soundOn?'♫':'♪';if(soundOn){audioContext ||= new AudioContext();if(audioContext.state==='suspended')await audioContext.resume();}});

function getPressed(name){
  if(name==='left')return keys.has('a')||keys.has('arrowleft')||touch.left;
  if(name==='right')return keys.has('d')||keys.has('arrowright')||touch.right;
  if(name==='gas')return keys.has('w')||keys.has('arrowup')||touch.gas;
  if(name==='brake')return keys.has('s')||keys.has('arrowdown')||touch.brake;
  if(name==='boost')return keys.has(' ')||touch.boost;
}
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();keys.add(k);if(k==='enter'&&mode==='welcome')showGarage();if(k==='enter'&&mode==='garage')beginRace();},{passive:false});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();for(const k of Object.keys(touch))touch[k]=false;});
document.querySelectorAll('.mobile-controls button').forEach(button=>{
  const key=button.dataset.control;
  const down=e=>{e.preventDefault();touch[key]=true;button.setPointerCapture?.(e.pointerId);};
  const up=e=>{e.preventDefault();touch[key]=false;};
  button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
});

let channel=null, roomName='';
const playerId=Math.random().toString(36).slice(2,8);
const roomModal=document.querySelector('#roomModal');
document.querySelector('#roomBtn').addEventListener('click',()=>roomModal.classList.remove('hidden'));
document.querySelector('#roomClose').addEventListener('click',()=>roomModal.classList.add('hidden'));
document.querySelector('#connectBtn').addEventListener('click',()=>{
  const code=document.querySelector('#roomCode').value.trim().toUpperCase();if(!code)return;
  if(channel)channel.close();roomName=code;
  channel=new BroadcastChannel('apex-race-'+roomName);
  channel.onmessage=({data})=>{
    if(!data||data.id===playerId)return;
    if(data.type==='hello')channel.postMessage({type:'hello',id:playerId,name:cars[selectedCar].name});
    if(data.type==='state'){
      let other=remotePlayers.get(data.id);
      if(!other){other={id:data.id,mesh:makeCar(cars[data.car]||cars[0]),angle:data.angle,lane:data.lane||0,speed:data.speed||0,last:performance.now(),name:data.name||'GUEST'};remotePlayers.set(data.id,other);}
      other.targetAngle=data.angle;other.targetLane=data.lane||0;other.speed=data.speed||0;other.last=performance.now();other.car=data.car;
    }
  };
  channel.postMessage({type:'hello',id:playerId,name:cars[selectedCar].name});
  document.querySelector('#onlineText').textContent='ROOM '+roomName;
  roomModal.classList.add('hidden');
});

const map=document.querySelector('#minimap'), mapCtx=map.getContext('2d');
function drawMap(){
  const w=map.width,h=map.height,cx=w/2,cy=h/2;mapCtx.clearRect(0,0,w,h);
  mapCtx.beginPath();mapCtx.ellipse(cx,cy,57,57,0,0,Math.PI*2);mapCtx.strokeStyle='#46504d';mapCtx.lineWidth=20;mapCtx.stroke();
  mapCtx.beginPath();mapCtx.ellipse(cx,cy,57,57,0,0,Math.PI*2);mapCtx.strokeStyle='#8b958b';mapCtx.lineWidth=1;mapCtx.setLineDash([3,5]);mapCtx.stroke();mapCtx.setLineDash([]);
  for(const r of racers){const x=cx+Math.cos(r.angle)*57,y=cy+Math.sin(r.angle)*57;mapCtx.fillStyle='#ff907c';mapCtx.beginPath();mapCtx.arc(x,y,3.2,0,Math.PI*2);mapCtx.fill();}
  for(const r of remotePlayers.values()){const a=r.angle||0;mapCtx.fillStyle='#83d8ff';mapCtx.beginPath();mapCtx.arc(cx+Math.cos(a)*57,cy+Math.sin(a)*57,3.5,0,Math.PI*2);mapCtx.fill();}
  mapCtx.fillStyle='#d5fa56';mapCtx.beginPath();mapCtx.arc(cx+Math.cos(playerAngle)*57,cy+Math.sin(playerAngle)*57,4.5,0,Math.PI*2);mapCtx.fill();
}
function formatTime(t){const m=Math.floor(t/60),s=(t%60).toFixed(2).padStart(5,'0');return `${String(m).padStart(2,'0')}:${s}`;}
function finishRace(){mode='finished';ui.finish.classList.remove('hidden');const pos=Number(ui.position.textContent.slice(0,2));document.querySelector('#finishTitle').textContent=pos===1?'YOU OWN THE NIGHT':'RACE COMPLETE';document.querySelector('#finishCopy').textContent=`P${String(pos).padStart(2,'0')}  ·  ${formatTime(raceTime)}  ·  ${cars[selectedCar].name}`;}

function update(dt){
  if(mode==='countdown'){
    countdown-=dt;ui.countdown.textContent=countdown>2.3?'3':countdown>1.3?'2':countdown>.3?'1':'GO';if(countdown<=0){startRace();}return;
  }
  if(mode==='racing'){
    raceTime+=dt;
    const gas=getPressed('gas'), brake=getPressed('brake'), boosting=getPressed('boost')&&boost>0&&gas;
    const car=cars[selectedCar];
    const targetSpeed=gas?MAX_SPEED*car.top*(boosting?1.32:1):0;
    speed+=(targetSpeed-speed)*(gas?Math.min(dt*1.05*car.accel,1):Math.min(dt*(brake?2.3:.36),1));
    if(brake)speed=Math.max(0,speed-dt*15);
    if(boosting)boost=Math.max(0,boost-dt*36);else boost=Math.min(100,boost+dt*6.5);
    const direction=(getPressed('left')?-1:0)+(getPressed('right')?1:0);
    steer+=(direction-steer)*Math.min(dt*7,1);
    lateral+=steer*dt*(1.9+speed*.058)*car.handling;
    lateral*=Math.max(0,1-dt*.24);
    const offroad=Math.abs(lateral)>ROAD_W*.39;
    lateral=THREE.MathUtils.clamp(lateral,-ROAD_W*.54,ROAD_W*.54);
    const speedFactor=offroad?.55:1;
    playerAngle+=(speed/ TRACK_R)*dt*.48*speedFactor;
    if(playerAngle>=Math.PI*2){playerAngle-=Math.PI*2;lap++;if(lap>=TOTAL_LAPS)finishRace();}
    placeOnTrack(playerCar,playerAngle,lateral,.1);
    playerCar.rotation.z=THREE.MathUtils.clamp(-steer*.035,-.07,.07);
    // AI drivers pace the player and hold their racing line.
    for(const r of racers){
      const diff=((playerAngle-r.angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      const pace=r.base+(diff<0?1.8:-1.1)+(Math.sin(r.angle*3)*1.5);
      r.speed+=(pace-r.speed)*dt*.18;r.angle+=r.speed/TRACK_R*dt*.48;
      if(r.angle>=Math.PI*2)r.angle-=Math.PI*2;
      placeOnTrack(r.mesh,r.angle,r.lane,.1);
    }
    for(const [id,r] of remotePlayers){
      if(performance.now()-r.last>8000){scene.remove(r.mesh);remotePlayers.delete(id);continue;}
      if(r.targetAngle!==undefined){let delta=((r.targetAngle-r.angle+Math.PI*3)%(Math.PI*2))-Math.PI;r.angle+=delta*Math.min(dt*8,1);r.lane+=(r.targetLane-r.lane)*Math.min(dt*5,1);}
      if(r.car!==undefined&&r.car!==r.activeCar){scene.remove(r.mesh);r.mesh=makeCar(cars[r.car]||cars[0]);r.activeCar=r.car;}
      placeOnTrack(r.mesh,r.angle,r.lane,.1);
    }
    const totalProgress=(lap*2*Math.PI+playerAngle)/(TOTAL_LAPS*2*Math.PI);
    const scored=[...racers.map(r=>r.angle),...Array.from(remotePlayers.values(),r=>r.angle)];
    const position=1+scored.filter(a=>a>playerAngle).length;
    ui.position.innerHTML=`${String(position).padStart(2,'0')}<span> / ${String(1+racers.length+remotePlayers.size).padStart(2,'0')}</span>`;
    ui.lap.innerHTML=`${String(Math.min(lap+1,TOTAL_LAPS)).padStart(2,'0')}<span> / 0${TOTAL_LAPS}</span>`;
    ui.time.textContent=formatTime(raceTime);ui.progress.style.width=`${Math.min(totalProgress*100,100)}%`;
    ui.speed.textContent=String(Math.round(speed*3.6)).padStart(3,'0');ui.meter.style.width=`${Math.min(speed/(MAX_SPEED*car.top)*100,100)}%`;
    ui.gear.textContent=speed<1?'N':String(Math.min(7,Math.floor(speed/(MAX_SPEED*car.top/7))+1));ui.boost.textContent=boosting?'BOOST':`N₂O ${Math.round(boost)}%`;
    if(channel)channel.postMessage({type:'state',id:playerId,angle:playerAngle,lane:lateral,speed,car:selectedCar,name:cars[selectedCar].name});
  }
}

const cameraTarget=new THREE.Vector3();
function render(now){
  requestAnimationFrame(render);const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;update(dt);
  const a=playerAngle,r=TRACK_R+lateral;
  const carX=Math.cos(a)*r,carZ=Math.sin(a)*r;
  const forward=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
  const desired=new THREE.Vector3(carX-forward.x*15,11.8,carZ-forward.z*15);
  camera.position.lerp(desired,Math.min(dt*2.7,1));cameraTarget.set(carX,0,carZ);camera.lookAt(cameraTarget);
  if(mode==='welcome'||mode==='garage'){
    const orbit=now*.000025;const x=carX+Math.cos(a+orbit)*15,z=carZ+Math.sin(a+orbit)*15;
    camera.position.lerp(new THREE.Vector3(x,11.8,z),Math.min(dt*.45,1));camera.lookAt(carX,0,carZ);
  }
  renderer.render(scene,camera);if(Math.floor(now/150)%2===0)drawMap();
}
requestAnimationFrame(render);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35));renderer.setSize(innerWidth,innerHeight);});
