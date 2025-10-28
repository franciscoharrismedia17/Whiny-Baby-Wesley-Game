// Constants for canvas sizing
const WIDTH = 1080;
const HEIGHT = 1920;

// Audio helper configuration
let MASTER_GAIN = 0.9, MUSIC_GAIN = 0.6, SFX_GAIN = 0.9;
let SFX = { music:null, pick:null, dropGood:null, dropBad:null, btn:null };
let audioPrimed=false, musicStarted=false;
function safeMasterVolume(v){ if (typeof window.masterVolume === 'function') window.masterVolume(v); }
function safeSoundFormats(){ if (typeof window.soundFormats === 'function') window.soundFormats.apply(null, arguments); }
function safeLoadSound(path){ return (typeof window.loadSound === 'function') ? loadSound(path) : null; }
function ensureAudioContext(){
  if (audioPrimed) return;
  const ac = (window.getAudioContext && window.getAudioContext()) || null;
  if (ac && ac.state !== "running") { try { ac.resume(); } catch(e){} }
  audioPrimed = true;
}
function playSfx(key){
  const snd = SFX[key];
  if (!snd) return;
  try { snd.stop(); } catch(e){}
  snd.setVolume(SFX_GAIN);
  snd.play();
}

let canvas;
function setup() {
  pixelDensity(1);
  canvas = createCanvas(WIDTH, HEIGHT);
  canvas.parent("app");
  fitCanvasCSS();
  safeMasterVolume(MASTER_GAIN);

  textFont(uiFont);
  textAlign(LEFT, TOP);
  imageMode(CENTER);

  createLeadUI();
  positionLeadUI();
  setupLeadMobileBehaviour();

  initGame();
  setState(STATE_MENU);
}
function windowResized(){ fitCanvasCSS(); positionLeadUI(); }
function fitCanvasCSS() {
  if (!canvas) return;
  const scale = Math.min(windowWidth/WIDTH, windowHeight/HEIGHT);
  const w = `${WIDTH*scale}px`, h = `${HEIGHT*scale}px`;
  canvas.elt.style.width = w; canvas.elt.style.height = h;
  const container = document.getElementById("app");
  if (container) { container.style.width = w; container.style.height = h; container.style.position = "relative"; }
}

// State machine identifiers
const STATE_MENU = "menu";
const STATE_PLAY = "play";
const STATE_VICTORY = "victory";
const STATE_LOSE = "lose";
const STATE_LEAD = "lead";

let currentState = null;
let previousState = null;

function setState(next){
  if (currentState === next) return;
  if (currentState) exitState(currentState);
  previousState = currentState;
  currentState = next;
  enterState(next);
}

function exitState(state){
  switch(state){
    case STATE_PLAY: exitStatePlay(); break;
    case STATE_MENU: exitStateMenu(); break;
    case STATE_VICTORY: exitStateVictory(); break;
    case STATE_LOSE: exitStateLose(); break;
    case STATE_LEAD: exitStateLead(); break;
  }
}

function enterState(state){
  switch(state){
    case STATE_PLAY: enterStatePlay(); break;
    case STATE_MENU: enterStateMenu(); break;
    case STATE_VICTORY: enterStateVictory(); break;
    case STATE_LOSE: enterStateLose(); break;
    case STATE_LEAD: enterStateLead(); break;
  }
}

// Assets
let imgBackground, imgCover, imgStartButton, imgVictory;
let imgBabyCry, imgBabyNormal, imgBabyHappy;
let imgOil, imgMaga, imgHillary;
let uiFont;
let loseVideo;

// Game objects
let interactables = [];
let currentDrag = null;
let score = 0;
let babyMood = -1;
let bedtimeSeconds = 30;
let timerActive = false;
let shakeTimer = 0;
let shakeIntensity = 0;
let shakeDuration = 0;
let loseOverlayVisible = false;
let leadShownThisSession = false;

const babyHitbox = { x: WIDTH / 2, y: 640, w: 420, h: 480 };

// UI button rectangles
let startButtonRect = { x: WIDTH/2, y: HEIGHT - 420, w: 500, h: 200 };
let victoryButtonRect = { x: WIDTH/2, y: HEIGHT - 420, w: 480, h: 160 };
let loseButtonRect = { x: WIDTH/2, y: HEIGHT - 380, w: 480, h: 140 };

function preload(){
  safeSoundFormats('mp3','wav','ogg');
  imgBackground = loadImage('assets/BACKGROUND.png');
  imgCover = loadImage('assets/COVER.png');
  imgStartButton = loadImage('assets/START BUTTON.png');
  imgVictory = loadImage('assets/VICTORY.png');
  imgBabyCry = loadImage('assets/BABY_CRY.png');
  imgBabyNormal = loadImage('assets/BABY_NORMAL.png');
  imgBabyHappy = loadImage('assets/BABY_HAPPY.png');
  imgOil = loadImage('assets/OIL.png');
  imgMaga = loadImage('assets/MAGA.png');
  imgHillary = loadImage('assets/HILLARY.png');
  uiFont = loadFont('assets/BABYBLOC.otf');
  loseVideo = createVideo('assets/LOSE.mp4');
  if (loseVideo && loseVideo.elt){
    loseVideo.elt.classList.add('lose-video');
    loseVideo.elt.setAttribute('playsinline', 'true');
    loseVideo.elt.preload = 'auto';
    loseVideo.volume(0);
    loseVideo.hide();
  }
}

function initGame(){
  if (loseVideo){
    loseVideo.stop();
    loseVideo.hide();
    loseVideo.onended(onLoseVideoEnded);
    loseVideo.parent('app');
  }
  setupObjects();
  resetGame();
}

function setupObjects(){
  interactables = [
    { key:'oil', img:imgOil, delta:-1, homeX:WIDTH/2 - 320, homeY:1400, x:WIDTH/2 - 320, y:1400, w:360, h:360, hover:false, dragging:false },
    { key:'maga', img:imgMaga, delta:-1, homeX:WIDTH/2, homeY:1400, x:WIDTH/2, y:1400, w:360, h:360, hover:false, dragging:false },
    { key:'hillary', img:imgHillary, delta:1, homeX:WIDTH/2 + 320, homeY:1400, x:WIDTH/2 + 320, y:1400, w:360, h:360, hover:false, dragging:false }
  ];
  const scale = 0.75;
  interactables.forEach(obj => {
    if (obj.img){
      obj.w = obj.img.width * scale;
      obj.h = obj.img.height * scale;
    }
  });
}

function resetGame(){
  babyMood = -1;
  bedtimeSeconds = 30;
  timerActive = false;
  loseOverlayVisible = false;
  leadShownThisSession = false;
  currentDrag = null;
  interactables.forEach(obj => {
    obj.x = obj.homeX;
    obj.y = obj.homeY;
    obj.dragging = false;
    obj.hover = false;
  });
  if (loseVideo){
    loseVideo.stop();
    loseVideo.hide();
  }
}

function draw(){
  background(8, 3, 15);
  push();
  applyShake();
  switch(currentState){
    case STATE_MENU:
      drawMenu();
      break;
    case STATE_PLAY:
      drawGame();
      break;
    case STATE_VICTORY:
      drawVictory();
      break;
    case STATE_LOSE:
      drawLose();
      break;
    case STATE_LEAD:
      drawLeadPause();
      break;
  }
  pop();
}

function applyShake(){
  if (shakeTimer > 0 && shakeDuration > 0){
    const progress = shakeTimer / shakeDuration;
    const strength = shakeIntensity * Math.max(progress, 0);
    translate(random(-strength, strength), random(-strength, strength));
    shakeTimer -= deltaTime;
    if (shakeTimer <= 0){
      shakeTimer = 0;
      shakeDuration = 0;
      shakeIntensity = 0;
    }
  }
}

function triggerShake(intensity = 12, duration = 180){
  shakeIntensity = intensity;
  shakeDuration = duration;
  shakeTimer = duration;
}

function drawMenu(){
  imageMode(CORNER);
  if (imgCover) image(imgCover, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);
  let btnW = imgStartButton ? imgStartButton.width : 500;
  let btnH = imgStartButton ? imgStartButton.height : 200;
  if (imgStartButton){
    const targetW = WIDTH * 0.55;
    const scale = Math.min(1, targetW / btnW);
    btnW *= scale;
    btnH *= scale;
  }
  startButtonRect.w = btnW;
  startButtonRect.h = btnH;
  startButtonRect.x = WIDTH / 2;
  startButtonRect.y = HEIGHT - 360;
  if (imgStartButton){
    image(imgStartButton, startButtonRect.x, startButtonRect.y, btnW, btnH);
  }
  if (pointInRect(mouseX, mouseY, startButtonRect)) cursor('pointer'); else cursor(ARROW);
}

function drawGame(){
  imageMode(CORNER);
  if (imgBackground) image(imgBackground, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);

  updateTimer();
  drawBedtimeTimer();
  drawScore();
  drawBaby();
  drawInteractables();
}

function drawVictory(){
  imageMode(CORNER);
  if (imgVictory) image(imgVictory, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);
  drawButtonLabel(victoryButtonRect, "PLAY AGAIN");
  drawSecondaryButton(victoryButtonRect.x, victoryButtonRect.y + 180, "MENU");
  const menuRect = { x: victoryButtonRect.x, y: victoryButtonRect.y + 180, w: 380, h: 120 };
  if (pointInRect(mouseX, mouseY, victoryButtonRect) || pointInRect(mouseX, mouseY, menuRect)) cursor('pointer'); else cursor(ARROW);
}

function drawLose(){
  if (loseOverlayVisible){
    push();
    noStroke();
    fill(0, 0, 0, 180);
    rect(0, 0, WIDTH, HEIGHT);
    drawButtonLabel(loseButtonRect, "TRY AGAIN");
    pop();
    if (pointInRect(mouseX, mouseY, loseButtonRect)) cursor('pointer'); else cursor(ARROW);
  }
}

function drawLeadPause(){
  if (previousState === STATE_MENU){
    drawMenu();
  } else {
    drawGame();
  }
  push();
  noStroke();
  fill(15, 5, 32, 210);
  rect(0, 0, WIDTH, HEIGHT);
  pop();
}

function drawButtonLabel(rectObj, label){
  push();
  textAlign(CENTER, CENTER);
  textFont(uiFont);
  const shadow = drawingContext;
  shadow.shadowColor = 'rgba(52, 12, 41, 0.6)';
  shadow.shadowBlur = 24;
  shadow.shadowOffsetX = 0;
  shadow.shadowOffsetY = 12;
  fill(255);
  rectMode(CENTER);
  stroke(255, 120, 192);
  strokeWeight(6);
  fill(243, 86, 157);
  rect(rectObj.x, rectObj.y, rectObj.w, rectObj.h, 38);
  noStroke();
  fill(255);
  textSize(64);
  text(label, rectObj.x, rectObj.y + 6);
  pop();
  textAlign(LEFT, TOP);
}

function drawSecondaryButton(cx, cy, label){
  const rectObj = { x: cx, y: cy, w: 380, h: 120 };
  push();
  textAlign(CENTER, CENTER);
  textFont(uiFont);
  fill(255, 230);
  rectMode(CENTER);
  stroke(255);
  strokeWeight(4);
  fill(245, 203, 225, 220);
  rect(rectObj.x, rectObj.y, rectObj.w, rectObj.h, 32);
  noStroke();
  fill(131, 37, 65);
  textSize(54);
  text(label, rectObj.x, rectObj.y + 5);
  pop();
}

function drawBaby(){
  let sprite = imgBabyCry;
  if (babyMood >= 1) sprite = imgBabyHappy;
  else if (babyMood === 0) sprite = imgBabyNormal;
  if (sprite){
    image(sprite, WIDTH/2, 680, sprite.width, sprite.height);
  }
  noFill();
}

function drawInteractables(){
  let hovering = false;
  for (const obj of interactables){
    if (!currentDrag && over(obj, mouseX, mouseY)){
      obj.hover = true;
      hovering = true;
    } else if (!obj.dragging) {
      obj.hover = false;
    }
  }
  if (!currentDrag){
    if (hovering) cursor('pointer'); else cursor(ARROW);
  }
  for (const obj of interactables){
    const drawX = obj.x;
    const drawY = obj.y;
    const w = obj.w;
    const h = obj.h;
    push();
    if (obj.hover && !obj.dragging){
      drawingContext.shadowColor = 'rgba(255, 220, 255, 0.9)';
      drawingContext.shadowBlur = 35;
    }
    if (obj.dragging){
      drawingContext.shadowColor = 'rgba(255, 220, 255, 0.8)';
      drawingContext.shadowBlur = 45;
    }
    if (obj.img) image(obj.img, drawX, drawY, w, h);
    pop();
  }
}

function drawBedtimeTimer(){
  push();
  textFont(uiFont);
  textSize(96);
  textAlign(LEFT, CENTER);
  const x = 70;
  const y = 100;
  drawingContext.shadowColor = 'rgba(58, 18, 34, 0.5)';
  drawingContext.shadowBlur = 12;
  fill(255, 238, 243);
  text('BEDTIME', x, y);
  const badgeX = x + 420;
  const badgeY = y;
  const badgeW = 200;
  const badgeH = 110;
  rectMode(CENTER);
  stroke(255);
  strokeWeight(4);
  fill(255, 138, 181);
  rect(badgeX, badgeY + 6, badgeW, badgeH, 48);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(72);
  const display = Math.max(0, Math.ceil(bedtimeSeconds));
  text(display.toString(), badgeX, badgeY + 10);
  pop();
  textAlign(LEFT, TOP);
}

function drawScore(){
  push();
  textFont(uiFont);
  textAlign(LEFT, TOP);
  drawingContext.shadowColor = 'rgba(58, 18, 34, 0.4)';
  drawingContext.shadowBlur = 10;
  fill(255, 228, 240);
  textSize(64);
  text(`SCORE ${score}`, 70, 220);
  pop();
}

function updateTimer(){
  if (!timerActive) return;
  if (bedtimeSeconds <= 0){
    bedtimeSeconds = 0;
    lose();
    return;
  }
  bedtimeSeconds -= deltaTime / 1000;
  if (bedtimeSeconds <= 0){
    bedtimeSeconds = 0;
    lose();
  }
}

function mousePressed(){
  ensureAudioContext();
  if (currentState === STATE_MENU){
    if (pointInRect(mouseX, mouseY, startButtonRect)){
      playSfx('btn');
      if (shouldShowLeadDesktop()){
        enterLeadDesktop();
      } else {
        startGame();
      }
    }
    return;
  }
  if (currentState === STATE_VICTORY){
    if (pointInRect(mouseX, mouseY, victoryButtonRect)){
      playSfx('btn');
      resetGame();
      startGame();
      return;
    }
    const menuRect = { x: victoryButtonRect.x, y: victoryButtonRect.y + 180, w: 380, h: 120 };
    if (pointInRect(mouseX, mouseY, menuRect)){
      playSfx('btn');
      resetGame();
      setState(STATE_MENU);
    }
    return;
  }
  if (currentState === STATE_LOSE){
    if (loseOverlayVisible && pointInRect(mouseX, mouseY, loseButtonRect)){
      playSfx('btn');
      resetGame();
      startGame();
    }
    return;
  }
  if (currentState === STATE_PLAY){
    if (!leadShownThisSession && shouldShowLeadDesktop()){
      leadShownThisSession = true;
      enterLeadDesktop();
      return;
    }
    for (const obj of interactables){
      if (over(obj, mouseX, mouseY)){
        currentDrag = obj;
        obj.dragging = true;
        obj.hover = true;
        noCursor();
        playSfx('pick');
        break;
      }
    }
  }
}

function mouseDragged(){
  if (currentDrag){
    currentDrag.x = mouseX;
    currentDrag.y = mouseY;
    currentDrag.hover = false;
  }
}

function mouseReleased(){
  if (!currentDrag) return;
  const obj = currentDrag;
  obj.dragging = false;
  cursor(ARROW);
  const droppedInside = pointInRect(obj.x, obj.y, babyHitbox);
  if (droppedInside){
    babyMood += obj.delta;
    babyMood = constrain(babyMood, -2, 1);
    obj.x = obj.homeX;
    obj.y = obj.homeY;
    playSfx(obj.delta > 0 ? 'dropGood' : 'dropBad');
    if (babyMood < -1){
      lose();
    } else if (babyMood === 1){
      score += 1;
      enterVictory();
    }
  } else {
    obj.x = obj.homeX;
    obj.y = obj.homeY;
    triggerShake();
  }
  currentDrag = null;
}

function over(obj, px, py){
  const halfW = obj.w / 2;
  const halfH = obj.h / 2;
  return px >= obj.x - halfW && px <= obj.x + halfW && py >= obj.y - halfH && py <= obj.y + halfH;
}

function pointInRect(px, py, rectObj){
  const w = rectObj.w || rectObj.width || 0;
  const h = rectObj.h || rectObj.height || 0;
  const cx = rectObj.x;
  const cy = rectObj.y;
  if (rectObj.mode === CENTER || !rectObj.mode){
    const halfW = w / 2;
    const halfH = h / 2;
    return px >= cx - halfW && px <= cx + halfW && py >= cy - halfH && py <= cy + halfH;
  }
  return px >= rectObj.x && px <= rectObj.x + w && py >= rectObj.y && py <= rectObj.y + h;
}

function enterStateMenu(){
  cursor(ARROW);
  leadShownThisSession = false;
}
function exitStateMenu(){}

function enterStatePlay(){
  timerActive = true;
}
function exitStatePlay(){
  timerActive = false;
}

function enterStateVictory(){
  cursor(ARROW);
}
function exitStateVictory(){}

function enterStateLose(){
  cursor(ARROW);
  if (loseVideo){
    loseVideo.show();
    loseVideo.style('display', 'block');
    loseVideo.noLoop();
    loseVideo.time(0);
    loseVideo.play();
  }
}
function exitStateLose(){
  if (loseVideo){
    loseVideo.stop();
    loseVideo.hide();
    loseVideo.style('display', 'none');
  }
  loseOverlayVisible = false;
}

function enterStateLead(){
  cursor(ARROW);
}
function exitStateLead(){}

function startGame(){
  if (leadOverlay && leadOverlay.style){
    leadOverlay.style.display = 'none';
  }
  resetGame();
  timerActive = true;
  setState(STATE_PLAY);
}

function enterVictory(){
  timerActive = false;
  setState(STATE_VICTORY);
}

function lose(){
  if (currentState === STATE_LOSE) return;
  timerActive = false;
  loseOverlayVisible = false;
  currentDrag = null;
  setState(STATE_LOSE);
}

function onLoseVideoEnded(){
  loseOverlayVisible = true;
}

// Lead generation implementation
const LEAD_STORAGE_KEY = 'wbw_lead_data_v1';
const LEAD_ENDPOINT = 'https://script.google.com/macros/s/YOUR_ENDPOINT_ID/exec';
let leadOverlay = null;
let leadForm = null;
let leadError = null;
let leadSuccess = null;
let leadCloseButton = null;
let leadSubmitButton = null;
let leadPending = false;

function createLeadUI(){
  const app = document.getElementById('app');
  if (!app || leadOverlay) return;
  leadOverlay = document.createElement('div');
  leadOverlay.className = 'lead-overlay';

  const card = document.createElement('div');
  card.className = 'lead-card';

  leadCloseButton = document.createElement('button');
  leadCloseButton.className = 'lead-close';
  leadCloseButton.type = 'button';
  leadCloseButton.textContent = 'Cerrar';
  leadCloseButton.addEventListener('click', () => exitLeadDesktopAndGoTutorial());

  const title = document.createElement('h2');
  title.textContent = 'Join the Crib List';
  const desc = document.createElement('p');
  desc.textContent = 'Recibí noticias frescas del bebé más caprichoso del multiverso y desbloqueá recompensas exclusivas.';

  leadForm = document.createElement('form');
  leadForm.className = 'lead-form';
  leadForm.addEventListener('submit', onLeadSubmit);

  const nameField = createInputField('Nombre', 'name', 'text');
  const emailField = createInputField('Email', 'email', 'email');
  const roleField = createSelectField('Rol', 'role', ['Padre/Madre', 'Tío/Tía', 'Periodista', 'Otro']);

  leadError = document.createElement('div');
  leadError.className = 'lead-error';
  leadSuccess = document.createElement('div');
  leadSuccess.className = 'lead-success';

  leadSubmitButton = document.createElement('button');
  leadSubmitButton.className = 'lead-submit';
  leadSubmitButton.type = 'submit';
  leadSubmitButton.textContent = 'Enviar';

  leadForm.appendChild(nameField.wrapper);
  leadForm.appendChild(emailField.wrapper);
  leadForm.appendChild(roleField.wrapper);
  leadForm.appendChild(leadError);
  leadForm.appendChild(leadSuccess);
  leadForm.appendChild(leadSubmitButton);

  card.appendChild(leadCloseButton);
  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(leadForm);
  leadOverlay.appendChild(card);
  app.appendChild(leadOverlay);
}

function createInputField(labelText, name, type){
  const wrapper = document.createElement('label');
  wrapper.textContent = labelText;
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.required = true;
  input.autocomplete = 'on';
  wrapper.appendChild(input);
  return { wrapper, input };
}

function createSelectField(labelText, name, options){
  const wrapper = document.createElement('label');
  wrapper.textContent = labelText;
  const select = document.createElement('select');
  select.name = name;
  select.required = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seleccioná una opción';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  wrapper.appendChild(select);
  return { wrapper, select };
}

function positionLeadUI(){
  if (!leadOverlay) return;
  const rect = canvas?.elt?.getBoundingClientRect();
  if (!rect) return;
  leadOverlay.style.left = '0px';
  leadOverlay.style.top = '0px';
  leadOverlay.style.width = `${rect.width}px`;
  leadOverlay.style.height = `${rect.height}px`;
}

function setupLeadMobileBehaviour(){
  if (!leadOverlay) return;
  leadOverlay.addEventListener('touchstart', () => {}, { passive: true });
}

function enterLeadDesktop(){
  setState(STATE_LEAD);
  if (leadOverlay){
    leadOverlay.style.display = 'flex';
    positionLeadUI();
    if (leadForm){
      leadForm.reset();
    }
    leadPending = false;
    if (leadSubmitButton) leadSubmitButton.disabled = false;
    if (leadError) leadError.textContent = '';
    if (leadSuccess) leadSuccess.textContent = '';
    const firstInput = leadOverlay.querySelector('input, select');
    if (firstInput){
      try {
        firstInput.focus({ preventScroll: true });
      } catch (e) {
        /* no-op */
      }
    }
  }
}

function exitLeadDesktopAndGoTutorial(){
  if (leadOverlay){
    leadOverlay.style.display = 'none';
  }
  try {
    if (!localStorage.getItem(LEAD_STORAGE_KEY)){
      localStorage.setItem(LEAD_STORAGE_KEY, 'dismissed');
    }
  } catch (e) {
    /* no-op */
  }
  leadPending = false;
  if (leadSubmitButton) leadSubmitButton.disabled = false;
  startGame();
}

function onLeadSubmit(event){
  event.preventDefault();
  if (leadPending) return;
  const formData = new FormData(leadForm);
  const name = (formData.get('name') || '').toString().trim();
  const email = (formData.get('email') || '').toString().trim();
  const role = (formData.get('role') || '').toString();
  if (!name || !email || !role){
    leadError.textContent = 'Completá todos los campos.';
    return;
  }
  if (!validateEmail(email)){
    leadError.textContent = 'Ingresá un email válido.';
    return;
  }
  leadError.textContent = '';
  leadSuccess.textContent = 'Enviando...';
  leadPending = true;
  leadSubmitButton.disabled = true;
  const payload = { name, email, role, timestamp: new Date().toISOString() };
  sendLeadToSheet(payload)
    .then(() => {
      leadSuccess.textContent = '¡Listo! Revisá tu correo pronto.';
      try {
        localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        /* no-op */
      }
      leadPending = false;
      leadSubmitButton.disabled = false;
      setTimeout(() => exitLeadDesktopAndGoTutorial(), 800);
    })
    .catch(() => {
      leadError.textContent = 'Ups, falló el envío. Intentá de nuevo.';
      leadSuccess.textContent = '';
      leadSubmitButton.disabled = false;
      leadPending = false;
    });
}

function sendLeadToSheet(data){
  if (!LEAD_ENDPOINT){
    return Promise.resolve();
  }
  return fetch(LEAD_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(response => {
    if (!response.ok){
      throw new Error('Lead submit failed');
    }
    return response;
  });
}

function shouldShowLeadDesktop(){
  if (!isBrowser()) return false;
  try {
    const saved = localStorage.getItem(LEAD_STORAGE_KEY);
    return !saved;
  } catch (e) {
    return true;
  }
}

function isBrowser(){
  return typeof window !== 'undefined';
}

function isMobileDevice(){
  if (!isBrowser()) return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /android|iphone|ipad|ipod|opera mini|iemobile/i.test(ua.toLowerCase());
}

function validateEmail(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
