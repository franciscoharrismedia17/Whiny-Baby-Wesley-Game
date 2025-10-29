// Constants for canvas sizing
const WIDTH = 1080;
const HEIGHT = 1920;

const CONFIG = {
  baby: {
    x: WIDTH / 2,
    y: 980,
    scale: 1.0,
    hitboxW: 720,
    hitboxH: 780
  },
  items: {
    baseX: WIDTH / 2,
    y: 1740,
    spacing: 340,
    scale: 0.9,
    order: ['oil', 'maga', 'hillary']
  },
  timer: {
    xRight: WIDTH - 120,
    y: 140,
    labelSize: 68,
    numberSize: 78,
    pinkRectW: 220,
    pinkRectH: 112,
    pinkRadius: 48,
    spacing: 36
  },
  score: {
    x: 120,
    y: 320,
    size: 64
  },
  buttons: {
    startY: HEIGHT - 360,
    startScale: 0.55,
    victoryY: HEIGHT - 360,
    victoryScale: 0.6,
    loseY: HEIGHT - 360,
    loseScale: 0.6,
    secondaryOffsetY: 200,
    secondaryWidth: 380,
    secondaryHeight: 120,
    secondaryTextSize: 48
  },
  fonts: {
    uiFamily: null,
    labelScale: 1.0
  },
  loading: {
    x: WIDTH / 2,
    y: HEIGHT - 260,
    size: 54
  }
};

function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

// Audio helper configuration
const MUSIC_VOLUME_DB = -5;
const LOSE_VIDEO_VOLUME_DB = -7;
let MASTER_GAIN = 0.9, MUSIC_GAIN = dbToLinear(MUSIC_VOLUME_DB), SFX_GAIN = 0.9;
const LOSE_VIDEO_VOLUME = dbToLinear(LOSE_VIDEO_VOLUME_DB);
let AUDIO = {
  music: null,
  button: null,
  happy: null,
  cry: null,
  victory: null,
  grab: null,
  drop: null
};
let audioPrimed = false;
let musicStoppedForMood = false;
function safeMasterVolume(v){ if (typeof window.masterVolume === 'function') window.masterVolume(v); }
function safeSoundFormats(){ if (typeof window.soundFormats === 'function') window.soundFormats.apply(null, arguments); }
function safeLoadSound(path){ return (typeof window.loadSound === 'function') ? loadSound(path) : null; }
function ensureAudioContext(){
  if (audioPrimed) return;
  const ac = (window.getAudioContext && window.getAudioContext()) || null;
  if (ac && ac.state !== "running") { try { ac.resume(); } catch(e){} }
  audioPrimed = true;
}
function getSound(key){
  return AUDIO[key] || null;
}
function stopSound(key){
  const snd = getSound(key);
  if (!snd) return;
  try {
    snd.stop();
  } catch (e) {
    /* no-op */
  }
}

function playSound(key, volume = SFX_GAIN, allowOverlap = false){
  const snd = getSound(key);
  if (!snd) return;
  try {
    if (!allowOverlap) snd.stop();
  } catch (e) {
    /* no-op */
  }
  try {
    snd.setVolume(volume);
  } catch (e) {
    /* no-op */
  }
  snd.play();
}
function startMusicLoop(){
  const music = getSound('music');
  if (!music) return;
  try {
    music.setLoop(true);
    music.setVolume(MUSIC_GAIN);
    if (!music.isPlaying()){
      music.play();
    }
  } catch (e) {
    /* no-op */
  }
  musicStoppedForMood = false;
}
function stopMusic({ preserveMoodFlag = false } = {}){
  const music = getSound('music');
  if (!music) return;
  try {
    music.stop();
  } catch (e) {
    /* no-op */
  }
  if (!preserveMoodFlag){
    musicStoppedForMood = false;
  }
}

let canvas;
function setup() {
  pixelDensity(1);
  canvas = createCanvas(WIDTH, HEIGHT);
  canvas.parent("app");
  fitCanvasCSS();
  safeMasterVolume(MASTER_GAIN);

  textFont(CONFIG.fonts.uiFamily || 'sans-serif');
  textAlign(LEFT, TOP);
  imageMode(CENTER);

  createLeadUI();
  createTutorialOverlay();
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
let imgBackground, imgCover2, imgStartButton, imgVictory, imgAgainButton;
let imgBabyCry, imgBabyNormal, imgBabyHappy;
let imgOil, imgMaga, imgHillary;
let imgRestartButton;
let imgFormHeadline, imgSubmitBtn;
let uiFont;
let loseVideo;

let assetsLoaded = false;
let assetsLoading = false;
let startRequested = false;
let loadingMessageVisible = false;
let pendingLeadStart = false;
let leadStartRetryTimeout = null;
let lastPointerPressFrame = -1;
let loseVideoActive = false;

// Game objects
let interactables = [];
let currentDrag = null;
let score = 0;
let babyMood = 0;
let bedtimeSeconds = 30;
let timerActive = false;
let shakeTimer = 0;
let shakeIntensity = 0;
let shakeDuration = 0;
let happyTimer = 0;
const HAPPY_HOLD_MS = 1200;

// UI button rectangles
let startButtonRect = { x: WIDTH/2, y: HEIGHT - 420, w: 500, h: 200 };
let victoryButtonRect = { x: WIDTH/2, y: HEIGHT - 420, w: 480, h: 160 };
let loseButtonRect = { x: WIDTH/2, y: HEIGHT - 380, w: 480, h: 140 };

function preload(){
  safeSoundFormats('mp3','wav','ogg');
  imgCover2 = loadImage('assets/Cover2.png');
  imgStartButton = loadImage('assets/START BUTTON.png');
}

function loadImageAsync(path, assign){
  return new Promise(resolve => {
    loadImage(path, img => {
      if (assign) assign(img);
      resolve();
    }, () => resolve());
  });
}

function loadFontAsync(path, assign){
  return new Promise(resolve => {
    loadFont(path, font => {
      if (assign) assign(font);
      resolve();
    }, () => resolve());
  });
}

function loadSoundAsync(path, assign){
  return new Promise(resolve => {
    if (typeof loadSound !== 'function'){
      resolve();
      return;
    }
    loadSound(path, sound => {
      if (assign) assign(sound);
      resolve();
    }, () => resolve());
  });
}

function loadVideoAsync(path){
  return new Promise(resolve => {
    if (loseVideo){
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    loseVideo = createVideo(path, finish);
    configureLoseVideo();
    if (loseVideo && loseVideo.elt){
      const videoEl = loseVideo.elt;
      const onReady = () => finish();
      const onError = () => finish();
      videoEl.addEventListener('loadeddata', onReady, { once: true });
      videoEl.addEventListener('canplay', onReady, { once: true });
      videoEl.addEventListener('canplaythrough', onReady, { once: true });
      videoEl.addEventListener('error', onError, { once: true });
      videoEl.addEventListener('stalled', onError, { once: true });
    }
    setTimeout(finish, 4000);
  });
}

function configureLoseVideo(){
  if (!loseVideo || !loseVideo.elt) return;
  loseVideo.elt.classList.add('lose-video');
  loseVideo.elt.setAttribute('playsinline', 'true');
  loseVideo.elt.preload = 'auto';
  loseVideo.volume(LOSE_VIDEO_VOLUME);
  loseVideo.hide();
  loseVideo.onended(onLoseVideoEnded);
  loseVideo.parent('app');
}

function beginAssetLoading(){
  if (assetsLoaded || assetsLoading) return;
  assetsLoading = true;
  loadingMessageVisible = true;
  const tasks = [
    loadImageAsync('assets/BACKGROUND.png', img => imgBackground = img),
    loadImageAsync('assets/VICTORY.png', img => imgVictory = img),
    loadImageAsync('assets/BABY_CRY.png', img => imgBabyCry = img),
    loadImageAsync('assets/BABY_NORMAL.png', img => imgBabyNormal = img),
    loadImageAsync('assets/BABY_HAPPY.png', img => imgBabyHappy = img),
    loadImageAsync('assets/OIL.png', img => imgOil = img),
    loadImageAsync('assets/MAGA.png', img => imgMaga = img),
    loadImageAsync('assets/HILLARY.png', img => imgHillary = img),
    loadImageAsync('assets/AGAIN_BUTTON.png', img => imgAgainButton = img),
    loadImageAsync('assets/RESTART_BUTTON.png', img => imgRestartButton = img),
    loadImageAsync('assets/FORM.png', img => imgFormHeadline = img),
    loadImageAsync('assets/submit.png', img => imgSubmitBtn = img),
    loadFontAsync('assets/BABYBLOC.otf', font => {
      uiFont = font;
      CONFIG.fonts.uiFamily = uiFont;
    }),
    loadSoundAsync('assets/Music.mp3', sound => AUDIO.music = sound),
    loadSoundAsync('assets/Button.wav', sound => AUDIO.button = sound),
    loadSoundAsync('assets/Happy.mp3', sound => AUDIO.happy = sound),
    loadSoundAsync('assets/Cry.mp3', sound => AUDIO.cry = sound),
    loadSoundAsync('assets/Victory.wav', sound => AUDIO.victory = sound),
    loadSoundAsync('assets/grab.mp3', sound => AUDIO.grab = sound),
    loadSoundAsync('assets/grab.wav', sound => { if (!AUDIO.grab) AUDIO.grab = sound; }),
    loadSoundAsync('assets/drop.mp3', sound => AUDIO.drop = sound),
    loadSoundAsync('assets/drop.wav', sound => { if (!AUDIO.drop) AUDIO.drop = sound; }),
    loadVideoAsync('assets/LOSE.mp4')
  ];
  Promise.all(tasks).then(() => {
    assetsLoaded = true;
    assetsLoading = false;
    loadingMessageVisible = false;
    if (uiFont){
      CONFIG.fonts.uiFamily = uiFont;
      textFont(uiFont);
      updateTutorialOverlayFont();
    }
    setupObjects();
    resetGame();
    if (currentState !== STATE_VICTORY && currentState !== STATE_LOSE){
      startMusicLoop();
    }
    if (startRequested){
      startGame();
    }
  });
}

function initGame(){
  if (loseVideo){
    configureLoseVideo();
  }
  setupObjects();
  resetGame();
}

function setupObjects(){
  const definitions = {
    oil: { img: imgOil, delta: -1, defaultW: 360, defaultH: 360 },
    maga: { img: imgMaga, delta: -1, defaultW: 360, defaultH: 360 },
    hillary: { img: imgHillary, delta: 1, defaultW: 360, defaultH: 360 }
  };
  const order = CONFIG.items.order || Object.keys(definitions);
  const baseX = CONFIG.items.baseX ?? WIDTH / 2;
  const baseY = CONFIG.items.y ?? (HEIGHT - 320);
  const spacing = CONFIG.items.spacing ?? 340;
  const scale = CONFIG.items.scale ?? 1;
  const centerOffset = (order.length - 1) / 2;
  interactables = [];
  order.forEach((key, index) => {
    const def = definitions[key];
    if (!def) return;
    const img = def.img;
    const w = img ? img.width * scale : def.defaultW * scale;
    const h = img ? img.height * scale : def.defaultH * scale;
    const homeX = baseX + (index - centerOffset) * spacing;
    const homeY = baseY;
    interactables.push({
      key,
      img,
      delta: def.delta,
      homeX,
      homeY,
      x: homeX,
      y: homeY,
      w,
      h,
      hover: false,
      dragging: false
    });
  });
}

function resetGame(){
  setBabyMood(0);
  bedtimeSeconds = 30;
  timerActive = false;
  loseVideoActive = false;
  currentDrag = null;
  happyTimer = 0;
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
  if (currentState === STATE_LOSE && loseVideoActive){
    clear();
  } else {
    background(8, 3, 15);
  }
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
  if (imgCover2) image(imgCover2, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);
  let btnW = 520;
  let btnH = 220;
  const startScale = CONFIG.buttons.startScale ?? 1;
  const startY = CONFIG.buttons.startY ?? (HEIGHT - 360);
  if (imgStartButton){
    btnW = imgStartButton.width * startScale;
    btnH = imgStartButton.height * startScale;
    image(imgStartButton, WIDTH / 2, startY, btnW, btnH);
  } else {
    btnW *= startScale;
    btnH *= startScale;
    push();
    rectMode(CENTER);
    fill(240, 120, 180);
    noStroke();
    rect(WIDTH / 2, startY, btnW, btnH, 48);
    pop();
  }
  startButtonRect.w = btnW;
  startButtonRect.h = btnH;
  startButtonRect.x = WIDTH / 2;
  startButtonRect.y = startY;
  if (pointInRect(mouseX, mouseY, startButtonRect)) cursor('pointer'); else cursor(ARROW);
  if (loadingMessageVisible){
    drawLoadingMessage();
  }
}

function drawLoadingMessage(){
  const font = CONFIG.fonts.uiFamily || 'sans-serif';
  const scale = CONFIG.fonts.labelScale ?? 1;
  push();
  textAlign(CENTER, CENTER);
  textFont(font);
  textSize(CONFIG.loading.size * scale);
  fill(255, 240);
  text('Loading...', CONFIG.loading.x, CONFIG.loading.y);
  pop();
  textAlign(LEFT, TOP);
}

function drawGame(){
  imageMode(CORNER);
  if (imgBackground) image(imgBackground, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);

  updateTimer();
  drawBedtimeTimer();
  drawBaby();
  drawInteractables();
  if (babyMood === 1){
    happyTimer += deltaTime;
    if (happyTimer >= HAPPY_HOLD_MS){
      enterVictory();
    }
  } else {
    happyTimer = 0;
  }
}

function drawVictory(){
  imageMode(CORNER);
  if (imgVictory) image(imgVictory, 0, 0, WIDTH, HEIGHT);
  imageMode(CENTER);
  const victoryScale = CONFIG.buttons.victoryScale ?? 1;
  const victoryY = CONFIG.buttons.victoryY ?? (HEIGHT - 360);
  let btnW = 520 * victoryScale;
  let btnH = 200 * victoryScale;
  if (imgAgainButton){
    btnW = imgAgainButton.width * victoryScale;
    btnH = imgAgainButton.height * victoryScale;
    image(imgAgainButton, WIDTH / 2, victoryY, btnW, btnH);
  } else {
    push();
    rectMode(CENTER);
    fill(245, 146, 196);
    noStroke();
    rect(WIDTH / 2, victoryY, btnW, btnH, 48);
    pop();
  }
  victoryButtonRect.x = WIDTH / 2;
  victoryButtonRect.y = victoryY;
  victoryButtonRect.w = btnW;
  victoryButtonRect.h = btnH;
  if (pointInRect(mouseX, mouseY, victoryButtonRect)) cursor('pointer'); else cursor(ARROW);
}

function drawLose(){
  const loseScale = CONFIG.buttons.loseScale ?? 1;
  const loseY = CONFIG.buttons.loseY ?? (HEIGHT - 360);
  let btnW = 520 * loseScale;
  let btnH = 200 * loseScale;
  if (imgRestartButton){
    btnW = imgRestartButton.width * loseScale;
    btnH = imgRestartButton.height * loseScale;
    image(imgRestartButton, WIDTH / 2, loseY, btnW, btnH);
  } else {
    push();
    rectMode(CENTER);
    fill(240, 90, 160, 240);
    noStroke();
    rect(WIDTH / 2, loseY, btnW, btnH, 48);
    pop();
  }
  loseButtonRect.x = WIDTH / 2;
  loseButtonRect.y = loseY;
  loseButtonRect.w = btnW;
  loseButtonRect.h = btnH;
  if (pointInRect(mouseX, mouseY, loseButtonRect)) cursor('pointer'); else cursor(ARROW);
}

function drawLeadPause(){
  if (previousState === STATE_MENU){
    drawMenu();
  } else {
    drawGame();
  }
  if (leadOverlay && leadOverlay.style.display !== 'none'){
    push();
    noStroke();
    fill(15, 5, 32, 210);
    rect(0, 0, WIDTH, HEIGHT);
    pop();
  }
  if (loadingMessageVisible){
    drawLoadingMessage();
  }
}

function drawSecondaryButton(cx, cy, label){
  const cfg = CONFIG.buttons;
  const rectObj = {
    x: cx,
    y: cy,
    w: cfg.secondaryWidth ?? 380,
    h: cfg.secondaryHeight ?? 120
  };
  const font = CONFIG.fonts.uiFamily || 'sans-serif';
  const scale = CONFIG.fonts.labelScale ?? 1;
  push();
  textAlign(CENTER, CENTER);
  textFont(font);
  fill(255, 230);
  rectMode(CENTER);
  stroke(255);
  strokeWeight(4);
  fill(245, 203, 225, 220);
  rect(rectObj.x, rectObj.y, rectObj.w, rectObj.h, 32);
  noStroke();
  fill(131, 37, 65);
  textSize((cfg.secondaryTextSize ?? 48) * scale);
  text(label, rectObj.x, rectObj.y + 5);
  pop();
}

function drawBaby(){
  let sprite = imgBabyCry;
  if (babyMood >= 1) sprite = imgBabyHappy;
  else if (babyMood === 0) sprite = imgBabyNormal;
  if (sprite){
    const drawScale = CONFIG.baby.scale ?? 1;
    const w = sprite.width * drawScale;
    const h = sprite.height * drawScale;
    image(sprite, CONFIG.baby.x, CONFIG.baby.y, w, h);
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
  const font = CONFIG.fonts.uiFamily || 'sans-serif';
  const scale = CONFIG.fonts.labelScale ?? 1;
  const cfg = CONFIG.timer;
  textFont(font);
  const badgeRight = cfg.xRight;
  const badgeCenterX = badgeRight - (cfg.pinkRectW / 2);
  const badgeCenterY = cfg.y;
  const labelAnchorX = badgeCenterX - (cfg.pinkRectW / 2) - cfg.spacing;
  drawingContext.shadowColor = 'rgba(58, 18, 34, 0.5)';
  drawingContext.shadowBlur = 12;
  fill(255, 238, 243);
  textAlign(RIGHT, CENTER);
  textSize(cfg.labelSize * scale);
  text('BEDTIME', labelAnchorX, badgeCenterY);
  const badgeW = cfg.pinkRectW;
  const badgeH = cfg.pinkRectH;
  rectMode(CENTER);
  stroke(255);
  strokeWeight(4);
  fill(255, 138, 181);
  rect(badgeCenterX, badgeCenterY + 6, badgeW, badgeH, cfg.pinkRadius);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(cfg.numberSize * scale);
  const display = Math.max(0, Math.ceil(bedtimeSeconds));
  text(display.toString(), badgeCenterX, badgeCenterY + 6);
  pop();
  textAlign(LEFT, TOP);
}

function drawScore(){
  push();
  const font = CONFIG.fonts.uiFamily || 'sans-serif';
  const scale = CONFIG.fonts.labelScale ?? 1;
  const cfg = CONFIG.score;
  textFont(font);
  textAlign(LEFT, TOP);
  drawingContext.shadowColor = 'rgba(58, 18, 34, 0.4)';
  drawingContext.shadowBlur = 10;
  fill(255, 228, 240);
  textSize(cfg.size * scale);
  text(`SCORE ${score}`, cfg.x, cfg.y);
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

function handlePointerPress(x, y){
  if (lastPointerPressFrame === frameCount) return false;
  lastPointerPressFrame = frameCount;
  ensureAudioContext();
  if (currentState === STATE_MENU){
    if (pointInRect(x, y, startButtonRect)){
      playSound('button');
      beginAssetLoading();
      if (!leadAlreadyShownThisSession() && shouldShowLeadDesktop()){
        markLeadShownThisSession();
        enterLeadDesktop();
      } else {
        startPlayFlow({ fromLead: pendingLeadStart });
      }
      return true;
    }
    return false;
  }
  if (currentState === STATE_VICTORY){
    if (pointInRect(x, y, victoryButtonRect)){
      playSound('button');
      resetGame();
      startRequested = true;
      startGame();
      return true;
    }
    return false;
  }
  if (currentState === STATE_LOSE){
    if (pointInRect(x, y, loseButtonRect)){
      playSound('button');
      resetGame();
      startRequested = true;
      startGame();
      return true;
    }
    return false;
  }
  if (currentState === STATE_PLAY){
    for (const obj of interactables){
      if (over(obj, x, y)){
        currentDrag = obj;
        obj.dragging = true;
        obj.hover = true;
        noCursor();
        playSound('grab');
        return true;
      }
    }
  }
  return false;
}

function mousePressed(){
  handlePointerPress(mouseX, mouseY);
}

function touchStarted(){
  const touch = touches && touches.length ? touches[0] : null;
  const x = touch ? touch.x : mouseX;
  const y = touch ? touch.y : mouseY;
  const handled = handlePointerPress(x, y);
  if (handled){
    return false;
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
  playSound('drop');
  const droppedInside = pointInRect(obj.x, obj.y, getBabyHitbox());
  if (droppedInside){
    const mood = adjustBabyMood(obj.delta);
    obj.x = obj.homeX;
    obj.y = obj.homeY;
    if (mood < -1){
      lose();
    } else if (mood === 1){
      score += 1;
    }
  } else {
    obj.x = obj.homeX;
    obj.y = obj.homeY;
    triggerShake();
  }
  currentDrag = null;
}

function touchMoved(){
  if (currentDrag){
    mouseDragged();
    return false;
  }
}

function touchEnded(){
  if (currentDrag){
    mouseReleased();
    return false;
  }
}

function adjustBabyMood(delta){
  return setBabyMood(babyMood + delta);
}

function setBabyMood(value){
  const previous = babyMood;
  const next = constrain(value, -2, 1);
  babyMood = next;
  if (next <= -1 && previous > -1){
    stopSound('happy');
    const music = getSound('music');
    if (music && typeof music.isPlaying === 'function' && music.isPlaying()){
      musicStoppedForMood = true;
    }
    stopMusic({ preserveMoodFlag: true });
    playSound('cry');
  }
  if (previous <= -1 && next >= 0){
    stopSound('cry');
    if (musicStoppedForMood && currentState === STATE_PLAY){
      startMusicLoop();
    }
  }
  if (next === 1 && previous !== 1){
    stopSound('cry');
    playSound('happy');
  }
  if (previous === 1 && next !== 1){
    stopSound('happy');
  }
  return next;
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

function getBabyHitbox(){
  return {
    x: CONFIG.baby.x,
    y: CONFIG.baby.y,
    w: CONFIG.baby.hitboxW,
    h: CONFIG.baby.hitboxH
  };
}

function enterStateMenu(){
  cursor(ARROW);
  if (!assetsLoading){
    loadingMessageVisible = false;
  }
  stopSound('cry');
  stopSound('happy');
  stopSound('victory');
  flushPendingLeads();
  startMusicLoop();
}
function exitStateMenu(){}

function enterStatePlay(){
  timerActive = true;
  stopSound('cry');
  stopSound('happy');
  stopSound('victory');
  startMusicLoop();
}
function exitStatePlay(){
  timerActive = false;
}

function enterStateVictory(){
  cursor(ARROW);
  stopSound('cry');
  stopSound('happy');
  stopMusic();
  playSound('victory');
}
function exitStateVictory(){}

function enterStateLose(){
  cursor(ARROW);
  stopSound('cry');
  stopSound('happy');
  stopSound('victory');
  stopMusic();
  const hasVideo = !!loseVideo;
  if (hasVideo){
    loseVideo.show();
    loseVideo.style('display', 'block');
    loseVideo.noLoop();
    loseVideo.time(0);
    loseVideo.volume(LOSE_VIDEO_VOLUME);
    loseVideo.play();
  }
  loseVideoActive = hasVideo;
}
function exitStateLose(){
  if (loseVideo){
    loseVideo.stop();
    loseVideo.hide();
    loseVideo.style('display', 'none');
  }
  loseVideoActive = false;
}

function enterStateLead(){
  cursor(ARROW);
  stopSound('cry');
  stopSound('happy');
}
function exitStateLead(){}

function clearLeadStartRetry(){
  if (leadStartRetryTimeout){
    clearTimeout(leadStartRetryTimeout);
    leadStartRetryTimeout = null;
  }
}

function scheduleLeadStartRetry(){
  if (leadStartRetryTimeout || !pendingLeadStart) return;
  leadStartRetryTimeout = setTimeout(() => {
    leadStartRetryTimeout = null;
    if (!pendingLeadStart) return;
    const started = startGame();
    if (started){
      pendingLeadStart = false;
      clearLeadStartRetry();
    } else {
      scheduleLeadStartRetry();
    }
  }, 350);
}

function startPlayFlow(options = {}){
  const { fromLead = false } = options;
  const leadFlowActive = fromLead || pendingLeadStart;
  const started = startGame();
  if (started){
    pendingLeadStart = false;
    clearLeadStartRetry();
    return;
  }
  if (leadFlowActive){
    pendingLeadStart = true;
    if (currentState !== STATE_MENU){
      setState(STATE_MENU);
    }
    loadingMessageVisible = assetsLoading;
    clearLeadStartRetry();
    scheduleLeadStartRetry();
  }
}

function startGame(){
  stopSound('victory');
  if (!assetsLoaded){
    startRequested = true;
    beginAssetLoading();
    loadingMessageVisible = true;
    return false;
  }
  startRequested = false;
  loadingMessageVisible = false;
  pendingLeadStart = false;
  clearLeadStartRetry();
  resetGame();
  setState(STATE_PLAY);
  const showingTutorial = showTutorialOverlay({
    onDismiss: () => {
      timerActive = true;
    }
  });
  if (showingTutorial){
    timerActive = false;
  }
  return true;
}

function enterVictory(){
  timerActive = false;
  happyTimer = 0;
  setState(STATE_VICTORY);
}

function lose(){
  if (currentState === STATE_LOSE) return;
  timerActive = false;
  currentDrag = null;
  setState(STATE_LOSE);
}

function onLoseVideoEnded(){
  loseVideoActive = false;
  if (loseVideo){
    loseVideo.stop();
    loseVideo.hide();
    loseVideo.style('display', 'none');
  }
}

// Lead generation implementation
const LEAD_STORAGE_KEY = 'wbw_lead_data_v1';
const LEAD_SUBMITTED_KEY = 'wbw_lead_submitted_v1';
const LEAD_QUEUE_KEY = 'wbw_lead_queue_v1';
const LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxDzVhcizXvcVpe3iYHhT_w64gRG6EUVGscVmxWj9vkpZzg2yu4ZRGayMf56EEN68pl/exec';
const TUTORIAL_SHOWN_KEY = 'tutorialShown_v1';
let leadOverlay = null;
let leadForm = null;
let leadError = null;
let leadSuccess = null;
let leadSubmitButton = null;
let leadSubmitImage = null;
let leadPending = false;
let tutorialOverlay = null;
let tutorialText = null;
let tutorialVisible = false;
let tutorialDismissCallback = null;
let tutorialSeen = false;

function createLeadUI(){
  const app = document.getElementById('app');
  if (!app || leadOverlay) return;
  leadOverlay = document.createElement('div');
  leadOverlay.className = 'lead-overlay';

  const card = document.createElement('div');
  card.className = 'lead-card';

  leadForm = document.createElement('form');
  leadForm.className = 'lead-form';
  leadForm.addEventListener('submit', onLeadSubmit);

  const headline = document.createElement('img');
  headline.className = 'lead-headline';
  headline.src = 'assets/FORM.png';
  headline.alt = '';

  const firstNameInput = document.createElement('input');
  firstNameInput.type = 'text';
  firstNameInput.name = 'firstName';
  firstNameInput.placeholder = 'First Name';
  firstNameInput.required = true;
  firstNameInput.autocomplete = 'given-name';

  const lastNameInput = document.createElement('input');
  lastNameInput.type = 'text';
  lastNameInput.name = 'lastName';
  lastNameInput.placeholder = 'Last Name';
  lastNameInput.required = true;
  lastNameInput.autocomplete = 'family-name';

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.name = 'email';
  emailInput.placeholder = 'Email';
  emailInput.required = true;
  emailInput.autocomplete = 'email';

  leadError = document.createElement('div');
  leadError.className = 'lead-error';
  leadSuccess = document.createElement('div');
  leadSuccess.className = 'lead-success';

  leadSubmitButton = document.createElement('button');
  leadSubmitButton.type = 'submit';
  leadSubmitButton.className = 'lead-submit-native';
  leadSubmitButton.style.position = 'absolute';
  leadSubmitButton.style.left = '-9999px';
  leadSubmitButton.style.width = '1px';
  leadSubmitButton.style.height = '1px';
  leadSubmitButton.style.overflow = 'hidden';

  leadSubmitImage = document.createElement('img');
  leadSubmitImage.className = 'lead-submit-image';
  leadSubmitImage.src = 'assets/submit.png';
  leadSubmitImage.alt = 'Submit';
  leadSubmitImage.dataset.disabled = 'false';
  leadSubmitImage.addEventListener('click', () => {
    if (!leadPending){
      leadForm.requestSubmit();
    }
  });

  leadForm.appendChild(firstNameInput);
  leadForm.appendChild(lastNameInput);
  leadForm.appendChild(emailInput);
  leadForm.appendChild(leadError);
  leadForm.appendChild(leadSuccess);
  leadForm.appendChild(leadSubmitButton);

  card.appendChild(headline);
  card.appendChild(leadForm);
  card.appendChild(leadSubmitImage);
  leadOverlay.appendChild(card);
  app.appendChild(leadOverlay);
}

function positionLeadUI(){
  const rect = canvas?.elt?.getBoundingClientRect();
  if (!rect) return;
  if (leadOverlay){
    leadOverlay.style.left = '0px';
    leadOverlay.style.top = '0px';
    leadOverlay.style.width = `${rect.width}px`;
    leadOverlay.style.height = `${rect.height}px`;
  }
  applyTutorialOverlaySizing(rect);
}

function setupLeadMobileBehaviour(){
  if (!leadOverlay) return;
  leadOverlay.addEventListener('touchstart', () => {}, { passive: true });
}

function hasSeenTutorial(){
  if (tutorialSeen) return true;
  try {
    tutorialSeen = localStorage.getItem(TUTORIAL_SHOWN_KEY) === '1';
  } catch (e) {
    /* no-op */
  }
  return tutorialSeen;
}

function markTutorialSeen(){
  tutorialSeen = true;
  try {
    localStorage.setItem(TUTORIAL_SHOWN_KEY, '1');
  } catch (e) {
    /* no-op */
  }
}

function createTutorialOverlay(){
  const app = document.getElementById('app');
  if (!app || tutorialOverlay) return;
  tutorialOverlay = document.createElement('div');
  tutorialOverlay.className = 'tutorial-overlay';
  const style = tutorialOverlay.style;
  style.position = 'absolute';
  style.left = '0px';
  style.top = '0px';
  style.display = 'none';
  style.opacity = '0';
  style.alignItems = 'center';
  style.justifyContent = 'center';
  style.background = 'rgba(0, 0, 0, 0.7)';
  style.color = '#fff';
  style.pointerEvents = 'none';
  style.padding = '48px';
  style.boxSizing = 'border-box';
  style.textAlign = 'center';
  style.whiteSpace = 'pre-line';
  style.zIndex = '30';
  style.fontFamily = CONFIG.fonts.uiFamily || 'sans-serif';

  tutorialText = document.createElement('div');
  tutorialText.className = 'tutorial-overlay-text';
  tutorialText.textContent = 'Help Whiny Baby Wesley Hunt!\nDrag and drop the right item to help him fall asleep.';
  const textStyle = tutorialText.style;
  textStyle.margin = '0 auto';
  textStyle.maxWidth = '80%';
  textStyle.lineHeight = '1.4';
  textStyle.whiteSpace = 'pre-line';

  tutorialOverlay.appendChild(tutorialText);

  const dismiss = (event) => {
    if (event){
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    hideTutorialOverlay();
  };

  tutorialOverlay.addEventListener('pointerdown', dismiss, { passive: false });
  tutorialOverlay.addEventListener('click', dismiss);

  app.appendChild(tutorialOverlay);
}

function updateTutorialOverlayFont(){
  if (!tutorialOverlay) return;
  tutorialOverlay.style.fontFamily = CONFIG.fonts.uiFamily || 'sans-serif';
}

function applyTutorialOverlaySizing(rect){
  if (!tutorialOverlay || !rect) return;
  tutorialOverlay.style.left = '0px';
  tutorialOverlay.style.top = '0px';
  tutorialOverlay.style.width = `${rect.width}px`;
  tutorialOverlay.style.height = `${rect.height}px`;
  const fontSize = Math.max(20, Math.min(44, rect.width * 0.045));
  tutorialOverlay.style.fontSize = `${fontSize}px`;
}

function showTutorialOverlay(options = {}){
  if (!tutorialOverlay){
    createTutorialOverlay();
  }
  if (!tutorialOverlay || tutorialVisible || hasSeenTutorial()) return false;
  const { onDismiss } = options;
  tutorialVisible = true;
  tutorialDismissCallback = typeof onDismiss === 'function' ? onDismiss : null;
  tutorialOverlay.style.display = 'flex';
  tutorialOverlay.style.opacity = '1';
  tutorialOverlay.style.pointerEvents = 'auto';
  updateTutorialOverlayFont();
  positionLeadUI();
  return true;
}

function hideTutorialOverlay(){
  if (!tutorialVisible || !tutorialOverlay) return;
  tutorialOverlay.style.opacity = '0';
  tutorialOverlay.style.pointerEvents = 'none';
  tutorialOverlay.style.display = 'none';
  tutorialVisible = false;
  markTutorialSeen();
  const cb = tutorialDismissCallback;
  tutorialDismissCallback = null;
  if (typeof cb === 'function'){
    cb();
  }
}

function enterLeadDesktop(){
  setState(STATE_LEAD);
  pendingLeadStart = false;
  clearLeadStartRetry();
  if (leadOverlay){
    leadOverlay.style.display = 'flex';
    positionLeadUI();
    if (leadForm){
      leadForm.reset();
    }
    leadPending = false;
    if (leadSubmitButton) leadSubmitButton.disabled = false;
    if (leadSubmitImage) leadSubmitImage.dataset.disabled = 'false';
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

function exitLeadDesktopAndStartGame(){
  if (leadOverlay){
    leadOverlay.style.display = 'none';
  }
  leadPending = false;
  if (leadSubmitButton) leadSubmitButton.disabled = false;
  if (leadSubmitImage) leadSubmitImage.dataset.disabled = 'false';
  if (leadError) leadError.textContent = '';
  if (leadSuccess) leadSuccess.textContent = '';
  startPlayFlow({ fromLead: true });
}

function onLeadSubmit(event){
  event.preventDefault();
  if (leadPending) return;
  ensureAudioContext();
  playSound('button');
  const formData = new FormData(leadForm);
  const firstName = (formData.get('firstName') || '').toString().trim();
  const lastName = (formData.get('lastName') || '').toString().trim();
  const email = (formData.get('email') || '').toString().trim();
  if (!firstName || !lastName || !email){
    leadError.textContent = 'Please fill in all fields.';
    return;
  }
  if (!validateEmail(email)){
    leadError.textContent = 'Please enter a valid email address.';
    return;
  }
  leadError.textContent = '';
  leadSuccess.textContent = 'Sending...';
  leadPending = true;
  leadSubmitButton.disabled = true;
  if (leadSubmitImage) leadSubmitImage.dataset.disabled = 'true';
  const platform = getPlatformInfo();
  const userAgent = getUserAgentInfo();
  const payload = {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email,
    platform,
    userAgent,
    timestamp: new Date().toISOString()
  };
  sendLeadToSheet(payload)
    .then(() => {
      try {
        localStorage.setItem(LEAD_SUBMITTED_KEY, '1');
        localStorage.setItem(LEAD_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) { /* no-op */ }

      leadSuccess.textContent = 'Sent successfully!';
      setTimeout(exitLeadDesktopAndStartGame, 500);
    })
    .catch((err) => {
      console.error('Lead error:', err);
      leadError.textContent = 'Error sending data. Please try again.';
      leadPending = false;
      leadSubmitButton.disabled = false;
      if (leadSubmitImage) leadSubmitImage.dataset.disabled = 'false';
    });
}

function fetchWithTimeout(url, opts = {}, ms = 4500){
  let controller = null;
  let timeoutId = null;
  if (typeof AbortController !== 'undefined'){
    controller = new AbortController();
    timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* no-op */
      }
    }, ms);
  }
  const options = { ...opts };
  if (controller){
    options.signal = controller.signal;
  }
  return fetch(url, options).finally(() => {
    if (timeoutId){
      clearTimeout(timeoutId);
    }
  });
}

function sendLeadToSheet(data){
  if (!LEAD_ENDPOINT || !isBrowser() || typeof FormData === 'undefined'){
    return Promise.resolve();
  }
  const formData = buildLeadFormData(data);
  return fetchWithTimeout(LEAD_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    body: formData
  }, 4500).then(response => {
    if (!response.ok){
      throw new Error('bad');
    }
    return response;
  });
}

function buildLeadFormData(data = {}){
  const formData = new FormData();
  const rawFirst = data.firstName ?? data.first ?? '';
  const rawLast = data.lastName ?? data.last ?? '';
  const rawEmail = data.email ?? data.emailAddress ?? '';
  let first = (rawFirst || '').toString().trim();
  let last = (rawLast || '').toString().trim();
  const fallbackName = (data.name || '').toString().trim();
  if (!first && fallbackName){
    const segments = fallbackName.split(/\s+/);
    first = segments.shift() || '';
    last = segments.join(' ');
  }
  if (!last && fallbackName && first){
    const start = fallbackName.indexOf(' ');
    last = start >= 0 ? fallbackName.slice(start + 1).trim() : '';
  }
  const email = (rawEmail || '').toString().trim();
  const platform = (data.platform || '').toString().trim() || getPlatformInfo();
  const userAgent = (data.userAgent || '').toString().trim() || getUserAgentInfo();
  formData.append('first', first);
  formData.append('last', last);
  formData.append('email', email);
  formData.append('platform', platform);
  formData.append('userAgent', userAgent);
  return formData;
}

function enqueuePendingLead(payload){
  if (!isBrowser()) return;
  try {
    const raw = localStorage.getItem(LEAD_QUEUE_KEY) || '[]';
    let queue;
    try {
      queue = JSON.parse(raw);
      if (!Array.isArray(queue)){
        queue = [];
      }
    } catch (err) {
      queue = [];
    }
    queue.push(payload);
    localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    /* no-op */
  }
}

function flushPendingLeads(){
  if (!isBrowser() || !LEAD_ENDPOINT) return Promise.resolve();
  let queue = [];
  try {
    const raw = localStorage.getItem(LEAD_QUEUE_KEY) || '[]';
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)){
      queue = parsed;
    }
  } catch (e) {
    queue = [];
  }
  if (!queue.length){
    return Promise.resolve();
  }
  const next = queue[0];
  return sendLeadToSheet(next).then(() => {
    queue.shift();
    try {
      localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      /* no-op */
    }
    return flushPendingLeads();
  }).catch(() => Promise.resolve());
}

function shouldShowLeadDesktop(){
  if (!isBrowser()) return false;
  try {
    if (localStorage.getItem(LEAD_SUBMITTED_KEY)){
      return false;
    }
    const saved = localStorage.getItem(LEAD_STORAGE_KEY);
    if (saved){
      try {
        localStorage.setItem(LEAD_SUBMITTED_KEY, '1');
      } catch (err) {
        /* no-op */
      }
      return false;
    }
    return true;
  } catch (e) {
    return true;
  }
}

function isBrowser(){
  return typeof window !== 'undefined';
}

function leadAlreadyShownThisSession(){
  if (!isBrowser()) return false;
  try {
    return !!sessionStorage.getItem('leadShown_v1');
  } catch (e) {
    return false;
  }
}

function markLeadShownThisSession(){
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem('leadShown_v1', '1');
  } catch (e) {
    /* no-op */
  }
}

function isMobileDevice(){
  if (!isBrowser()) return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /android|iphone|ipad|ipod|opera mini|iemobile/i.test(ua.toLowerCase());
}

function getPlatformInfo(){
  if (!isBrowser()) return '';
  const nav = navigator || {};
  const uaData = nav.userAgentData || {};
  return uaData.platform || nav.platform || '';
}

function getUserAgentInfo(){
  if (!isBrowser()) return '';
  return navigator.userAgent || '';
}

function validateEmail(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

if (isBrowser()){
  window.addEventListener('focus', () => {
    flushPendingLeads();
  });
}

