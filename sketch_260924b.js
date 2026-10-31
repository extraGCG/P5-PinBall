const { Engine, World, Bodies, Body, Events,
        Constraint, Mouse, MouseConstraint } = Matter;

let engine, world;
let ball;
let walls   = [];
let bumpers = [];
let flippers = [];
let plunger;
let plungerGate;

let score = 0;
let lives = 3;
let gameOver = false;
let launched = false; // Indica si la bola ya está fuera del carril
let highScore = 0;

let popups = [];
let bumperCombo = 1;
let lastBumperHitFrame = 0;

let leftLoopTrack = false;
let centerRampTrack = false;
let rightLoopTrack = false;
let topLanes = [false, false, false]; // Carriles [1] [2] [3] superiores

let bucle1Stage = -1;      // -1 fuera, 0 entró, 1..3 pisos del zigzag recorridos
let saucerHold = 0;        // Cuadros restantes con la bola retenida en la trampa
let saucerCooldown = 0;    // Cuadros en que la trampa ignora la bola tras expulsarla
let bucleStallFrames = 0;  // Cuadros seguidos dentro de un bucle (anti-atasco)

const W = 434;
const H = 760;
const WALL_T = 17;
const PLUNGER_LANE_W = 52;
const PLUNGER_X = 401;
const BALL_START_Y = 651;
const FLIPPER_Y = 690;

const BALL_RADIUS = 11; // Radio de la bola

const LANE_DIV_L = 180; // Divisor izquierdo entre carril 1 y 2
const LANE_DIV_R = 220; // Divisor derecho entre carril 2 y 3
const LANE_L_X   = 140; // Borde izquierdo del carril 1
const LANE_R_X   = 260; // Borde derecho del carril 3
const LANE_Y     = 105; // Altura de los indicadores de carril

const SAUCER_X    = 275; // Trampa (saucer) al fondo del bucle 3
const SAUCER_Y    = 310;
const SAUCER_R    = 14;
const SAUCER_HOLD = 75;  // Cuadros que la trampa retiene la bola
const STALL_LIMIT = 480; // Cuadros dentro de un bucle antes de empujar la bola

function setup() {
  createCanvas(W, H);
  initEngine();
  buildTable();
  resetBall();
}

function initEngine() {
  engine = Engine.create();
  world  = engine.world;
  engine.gravity.y = 1;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  registerCollisionEvents();
}

function registerCollisionEvents() {
  Events.on(engine, 'collisionStart', (evt) => {
    for (const pair of evt.pairs) {
      const { bodyA, bodyB } = pair;

      let bumperBody = null;
      if (bodyA.label === 'Bumper' && bodyB.label === 'Ball') bumperBody = bodyA;
      if (bodyB.label === 'Bumper' && bodyA.label === 'Ball') bumperBody = bodyB;

      if (bumperBody) {
        const ballBody = (bodyA.label === 'Ball') ? bodyA : bodyB;
        for (const b of bumpers) {
          if (b.body === bumperBody) {
            b.hit();
            b.kickBall(ballBody);

            let pts = b.scoreValue || 100;
            let popupText = `+${pts}`;
            let popupCol = b.glowColor || color(255, 220, 50);

            if (b.type === 'cluster') {
              if (frameCount - lastBumperHitFrame < 120) {
                bumperCombo = min(5, bumperCombo + 1);
              } else {
                bumperCombo = 1;
              }
              lastBumperHitFrame = frameCount;
              pts = b.scoreValue * bumperCombo;
              popupText = bumperCombo > 1 ? `COMBO x${bumperCombo}! +${pts}` : `+${pts}`;
              popupCol = color(255, 140, 40);
            } else if (b.type === 'pocket') {
              popupText = `¡DIANA! +${pts}`;
              popupCol = color(255, 70, 210);
            } else if (b.type === 'side') {
              popupText = `+${pts} REBOTE`;
              popupCol = color(255, 190, 50);
            } else if (b.type === 'peg') {
              popupText = `+${pts}`;
              popupCol = color(190, 240, 255);
            }

            score += pts;
            addPopup(ballBody.position.x, ballBody.position.y - 12, popupText, popupCol);
          }
        }
      }

      let slingBody = null;
      if (bodyA.label === 'Slingshot' && bodyB.label === 'Ball') slingBody = bodyA;
      if (bodyB.label === 'Slingshot' && bodyA.label === 'Ball') slingBody = bodyB;
      if (slingBody) {
        const ballBody = (bodyA.label === 'Ball') ? bodyA : bodyB;
        const kickDirX = (ballBody.position.x < 200) ? 1 : -1;
        Body.applyForce(ballBody, ballBody.position, { x: kickDirX * 0.05, y: -0.04 });
        score += 50;
        addPopup(ballBody.position.x, ballBody.position.y - 10, '+50 SLING', color(70, 200, 255));
      }

      const labels = [bodyA.label, bodyB.label];
      if (labels.includes('Ball') && labels.includes('Flipper')) {
        score += 10;
      }
    }
  });
}

function addPopup(x, y, text, col) {
  popups.push({ x, y, text, col, alpha: 255, vy: -1.3 });
}

function buildTable() {
  walls   = [];
  bumpers = [];
  flippers = [];

  const T = WALL_T;

  walls.push(new Wall(W/2, T/2, W, T)); // Techo
  walls.push(new Wall(T/2, H/2, T, H)); // Pared izquierda
  walls.push(new Wall(W - T/2, H/2, T, H)); // Pared derecha
  walls.push(new Wall(W - PLUNGER_LANE_W, 477, 8, 566)); // Separador carril lanzador
  walls.push(new DiagonalWall(404, 74, 65, Math.PI / 4, 13)); // Deflector superior derecho

  const arcTR = new DiagonalWall(345, 28, 80, 0.4, 12); // Arco esquina superior derecha
  arcTR.col = color(60, 100, 200);
  walls.push(arcTR);

  const arcTL = new DiagonalWall(46, 46, 80, -Math.PI / 4, 12); // Arco esquina superior izquierda
  arcTL.col = color(60, 100, 200);
  walls.push(arcTL);

  const loopWallL = new Wall(62, 235, 8, 210); // Pared interior canal izquierdo
  loopWallL.col = color(80, 160, 255);
  walls.push(loopWallL);

  const loopTopL = new DiagonalWall(74, 118, 45, -1.0, 10); // Curva superior canal izquierdo
  loopTopL.col = color(80, 160, 255);
  walls.push(loopTopL);

  const loopEntryL = new DiagonalWall(72, 338, 36, 0.9, 8); // Embudo entrada canal izquierdo
  loopEntryL.col = color(80, 160, 255);
  walls.push(loopEntryL);

  const rampWallL = new Wall(180, 285, 8, 300); // Pared izquierda rampa central
  rampWallL.col = color(100, 220, 255);
  walls.push(rampWallL);

  const rampWallR = new Wall(220, 285, 8, 300); // Pared derecha rampa central
  rampWallR.col = color(100, 220, 255);
  walls.push(rampWallR);

  const loopWallR = new Wall(330, 250, 8, 220); // Pared interior canal derecho
  loopWallR.col = color(80, 160, 255);
  walls.push(loopWallR);

  const loopTopR = new DiagonalWall(340, 125, 40, 2.15, 8); // Curva superior canal derecho
  loopTopR.col = color(80, 160, 255);
  walls.push(loopTopR);

  const loopEntryR = new DiagonalWall(320, 363, 34, -0.8, 8); // Embudo entrada canal derecho
  loopEntryR.col = color(80, 160, 255);
  walls.push(loopEntryR);

  const laneWallL = new Wall(140, 105, 6, 50); // Pared izquierda carriles superiores
  laneWallL.col = color(120, 220, 255);
  walls.push(laneWallL);

  const laneDivL = new Wall(LANE_DIV_L, 105, 6, 50); // Divisor carriles 1 y 2
  laneDivL.col = color(120, 220, 255);
  walls.push(laneDivL);

  const laneDivR = new Wall(LANE_DIV_R, 105, 6, 50); // Divisor carriles 2 y 3
  laneDivR.col = color(120, 220, 255);
  walls.push(laneDivR);

  const laneWallR = new Wall(260, 105, 6, 50); // Pared derecha carriles superiores
  laneWallR.col = color(120, 220, 255);
  walls.push(laneWallR);

  const bTop = new Bumper(200, 165, 10); // Bumper superior central
  bTop.type = 'cluster';
  bTop.scoreValue = 200;
  bTop.glowColor = color(255, 140, 40);
  bumpers.push(bTop);


  const zigCol = color(90, 230, 170);
  const zig1 = new DiagonalWall(139, 165, 82, -0.32, 8); // Piso 1: baja hacia la izquierda
  zig1.col = zigCol;
  walls.push(zig1);

  const zig2 = new DiagonalWall(103, 221, 82, 0.32, 8); // Piso 2: baja hacia la derecha
  zig2.col = zigCol;
  walls.push(zig2);

  const zig3 = new DiagonalWall(139, 275, 82, -0.32, 8); // Piso 3: baja hacia la izquierda
  zig3.col = zigCol;
  walls.push(zig3);


  const b3Col = color(220, 120, 255);
  const defl3 = new DiagonalWall(242, 168, 43, 0.38, 8); // Deflector bajo el carril 3
  defl3.col = b3Col;
  walls.push(defl3);

  const funnelL = new DiagonalWall(239, 288, 50, 0.70, 8); // Embudo izquierdo hacia la trampa
  funnelL.col = b3Col;
  walls.push(funnelL);

  const funnelR = new DiagonalWall(311, 288, 50, -0.70, 8); // Embudo derecho hacia la trampa
  funnelR.col = b3Col;
  walls.push(funnelR);

  const bBotR = new Bumper(288, 208, 10); // Bumper del bucle 3
  bBotR.type = 'cluster';
  bBotR.scoreValue = 200;
  bBotR.glowColor = color(255, 140, 40);
  bumpers.push(bBotR);

  const bPocketR = new Bumper(326, 240, 7); // Diana incrustada en la pared del bucle 3
  bPocketR.type = 'pocket';
  bPocketR.scoreValue = 300;
  bPocketR.glowColor = color(255, 70, 210);
  bumpers.push(bPocketR);

  const midDeflL = new DiagonalWall(100, 360, 48, 0.5, 8); // Deflector medio izquierdo
  midDeflL.col = color(80, 130, 200);
  walls.push(midDeflL);

  const midDeflR = new DiagonalWall(290, 384, 48, -0.5, 8); // Deflector medio derecho
  midDeflR.col = color(80, 130, 200);
  walls.push(midDeflR);

  const pMidL = new Bumper(95, 450, 9); // Peg pasillo izquierdo
  pMidL.type = 'peg';
  pMidL.scoreValue = 50;
  pMidL.glowColor = color(180, 220, 255);
  bumpers.push(pMidL);

  const pMidR = new Bumper(302, 450, 9); // Peg pasillo derecho
  pMidR.type = 'peg';
  pMidR.scoreValue = 50;
  pMidR.glowColor = color(180, 220, 255);
  bumpers.push(pMidR);

  const pCenterLow = new Bumper(200, 500, 9); // Peg central inferior
  pCenterLow.type = 'peg';
  pCenterLow.scoreValue = 50;
  pCenterLow.glowColor = color(180, 220, 255);
  bumpers.push(pCenterLow);

  const bSideL = new Bumper(20, 430, 13); // Rebotador lateral izquierdo
  bSideL.type = 'side';
  bSideL.scoreValue = 80;
  bSideL.glowColor = color(255, 190, 50);
  bumpers.push(bSideL);

  const bSideLU = new Bumper(20, 290, 9); // Rebotador lateral izquierdo sup
  bSideLU.type = 'side';
  bSideLU.scoreValue = 80;
  bSideLU.glowColor = color(255, 190, 50);
  bumpers.push(bSideLU);

  const bSideR = new Bumper(376, 430, 9); // Rebotador lateral derecho
  bSideR.type = 'side';
  bSideR.scoreValue = 80;
  bSideR.glowColor = color(255, 190, 50);
  bumpers.push(bSideR);

  const bSideRU = new Bumper(338, 290, 9); // Rebotador lateral derecho sup
  bSideRU.type = 'side';
  bSideRU.scoreValue = 80;
  bSideRU.glowColor = color(255, 190, 50);
  bumpers.push(bSideRU);

  const outlaneL = new Wall(45, 625, 8, 110); // Separador carril salida izquierdo
  outlaneL.col = color(80, 150, 255);
  walls.push(outlaneL);

  const inlaneL = new DiagonalWall(67, 665, 70, 0.72, 8); // Rampa retorno izquierda
  inlaneL.col = color(80, 150, 255);
  walls.push(inlaneL);

  const slingL = new DiagonalWall(110, 575, 106, 1.01, 12, { restitution: 0.95, friction: 0.0 }); // Slingshot izquierdo
  slingL.body.label = 'Slingshot';
  slingL.col = color(100, 200, 255);
  walls.push(slingL);

  const slingGuideL = new DiagonalWall(84, 578, 96, 1.53, 8); // Guía trasera slingshot izquierdo
  slingGuideL.col = color(60, 120, 200);
  walls.push(slingGuideL);

  const outlaneR = new Wall(350, 625, 8, 110); // Separador carril salida derecho
  outlaneR.col = color(80, 150, 255);
  walls.push(outlaneR);

  const inlaneR = new DiagonalWall(328, 665, 70, -0.70, 8); // Rampa retorno derecha
  inlaneR.col = color(80, 150, 255);
  walls.push(inlaneR);

  const slingR = new DiagonalWall(285, 575, 106, -1.01, 12, { restitution: 0.95, friction: 0.0 }); // Slingshot derecho
  slingR.body.label = 'Slingshot';
  slingR.col = color(100, 200, 255);
  walls.push(slingR);

  const slingGuideR = new DiagonalWall(311, 578, 96, -1.53, 8); // Guía trasera slingshot derecho
  slingGuideR.col = color(60, 120, 200);
  walls.push(slingGuideR);

  const pegL = new Bumper(32, 545, 9); // Peg salvador izquierdo
  pegL.type = 'peg';
  pegL.scoreValue = 75;
  pegL.glowColor = color(190, 240, 255);
  bumpers.push(pegL);

  const pegR = new Bumper(363, 545, 9); // Peg salvador derecho
  pegR.type = 'peg';
  pegR.scoreValue = 75;
  pegR.glowColor = color(190, 240, 255);
  bumpers.push(pegR);

  const flipLen = 94;
  flippers.push(new Flipper(98,  FLIPPER_Y, flipLen, 'left'));
  flippers.push(new Flipper(297, FLIPPER_Y, flipLen, 'right'));

  plunger = new Plunger(PLUNGER_X, 190, 695);
  if (plungerGate) plungerGate.open();
  plungerGate = new PlungerGate(400, 172, 59, -0.7, 11);
}

function resetBall() {
  if (ball) World.remove(world, ball.body);
  ball = new Ball(PLUNGER_X, BALL_START_Y, BALL_RADIUS);
  Body.setStatic(ball.body, true);
  launched = false;
  bumperCombo = 1;
  leftLoopTrack   = false;
  centerRampTrack = false;
  rightLoopTrack  = false;
  bucle1Stage = -1;
  saucerHold = 0;
  saucerCooldown = 0;
  bucleStallFrames = 0;
  if (plungerGate) plungerGate.open();
}

function updateBucles() {
  if (!launched || !ball || !ball.body) return;
  const b  = ball.body;
  const bx = b.position.x;
  const by = b.position.y;

  // Bucle 3: la trampa retiene la bola y luego la expulsa hacia abajo
  if (saucerHold > 0) {
    saucerHold--;
    if (saucerHold === 0) {
      Body.setStatic(b, false);
      Body.setVelocity(b, { x: -2.5, y: 3 });
      saucerCooldown = 30;
    }
    return;
  }
  if (saucerCooldown > 0) {
    saucerCooldown--;
  } else if (dist(bx, by, SAUCER_X, SAUCER_Y) < SAUCER_R && b.velocity.y > 0) {
    Body.setStatic(b, true);
    Body.setPosition(b, { x: SAUCER_X, y: SAUCER_Y });
    saucerHold = SAUCER_HOLD;
    bucleStallFrames = 0;
    score += 750;
    addPopup(SAUCER_X, SAUCER_Y - 30, '¡CAPTURA! +750', color(220, 120, 255));
    return;
  }

  // Bucle 1: avanza de piso al pasar por cada hueco del zigzag
  if (bx < 60 || bx > 180 || by < 120 || by > 350) {
    bucle1Stage = -1;
  } else if (bucle1Stage === -1 && by < 150 && bx > 75) {
    bucle1Stage = 0;
  } else if (bucle1Stage === 0 && bx < 100 && by > 185 && by < 215) {
    bucle1Stage = 1;
    score += 100;
    addPopup(120, 195, 'ZIGZAG 1/3 +100', color(90, 230, 170));
  } else if (bucle1Stage === 1 && bx > 142 && by > 240 && by < 268) {
    bucle1Stage = 2;
    score += 100;
    addPopup(120, 250, 'ZIGZAG 2/3 +100', color(90, 230, 170));
  } else if (bucle1Stage === 2 && bx < 100 && by > 295 && by < 340) {
    bucle1Stage = 3;
    score += 600;
    addPopup(120, 305, '¡BUCLE 1! +600', color(90, 255, 190));
  }

  // Anti-atasco: si la bola pasa demasiado tiempo en un bucle, se le da un empujón
  const inBucle1 = bx > 66 && bx < 176 && by > 128 && by < 345;
  const inBucle3 = bx > 224 && bx < 326 && by > 128 && by < SAUCER_Y;
  if (inBucle1 || inBucle3) {
    bucleStallFrames++;
    if (bucleStallFrames > STALL_LIMIT) {
      bucleStallFrames = 0;
      if (inBucle1) {
        Body.setVelocity(b, { x: random(-4, 4), y: -6 });
      } else {
        // Dirige la bola hacia la trampa para cortar rebotes repetitivos
        const dx = SAUCER_X - bx;
        const dy = SAUCER_Y - by;
        const len = Math.hypot(dx, dy) || 1;
        Body.setVelocity(b, { x: dx / len * 7, y: dy / len * 7 });
      }
    }
  } else {
    bucleStallFrames = 0;
  }
}

function draw() {
  const subSteps = 3; // Sub-pasos de física para evitar tunelado
  const subDelta = (1000 / 60) / subSteps;
  for (let i = 0; i < subSteps; i++) {
    for (const f of flippers) f.update();
    Engine.update(engine, subDelta);
  }

  if (ball && ball.body) {
    const v = ball.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    const MAX_SPEED = 27; // Límite de velocidad máxima
    if (speed > MAX_SPEED) {
      const factor = MAX_SPEED / speed;
      Body.setVelocity(ball.body, { x: v.x * factor, y: v.y * factor });
    }
  }

  plunger.update();

  if (launched && plungerGate && !plungerGate.closed) {
    if ((ball.body.position.x > W - PLUNGER_LANE_W && ball.body.position.y <= 143) ||
        (ball.body.position.x <= W - PLUNGER_LANE_W && ball.body.position.y < 174)) {
      plungerGate.close();
    }
  }

  if (launched && plungerGate && !plungerGate.closed && ball.body.position.x > W - PLUNGER_LANE_W) {
    if (ball.body.velocity.y > 0 && ball.body.position.y >= BALL_START_Y) {
      resetBall();
    }
  }

  if (launched && ball && ball.body) {
    const bx = ball.body.position.x;
    const by = ball.body.position.y;
    const vy = ball.body.velocity.y;

    if (bx < 68 && by > 130 && by < 330 && vy < -2) {
      leftLoopTrack = true;
    }
    if (leftLoopTrack && by < 75 && bx > 80) {
      leftLoopTrack = false;
      score += 500;
      addPopup(160, 68, '¡BUCLE IZQ! +500', color(60, 220, 255));
    }

    if (bx > 180 && bx < 220 && by > 160 && by < 430 && vy < -2.5) {
      centerRampTrack = true;
    }
    if (centerRampTrack && by < 135 && bx > 175 && bx < 225) {
      centerRampTrack = false;
      score += 400;
      addPopup(200, 120, '¡RAMPA! +400', color(100, 255, 140));
    }

    if (bx > 330 && bx < 382 && by > 130 && by < 355 && vy < -2) {
      rightLoopTrack = true;
    }
    if (rightLoopTrack && by < 120 && bx < 325) {
      rightLoopTrack = false;
      score += 450;
      addPopup(240, 68, '¡BUCLE DER! +450', color(255, 90, 230));
    }

    if (by > 85 && by < 125) {
      if (bx >= LANE_L_X && bx < LANE_DIV_L && !topLanes[0]) {
        topLanes[0] = true;
        score += 150;
        addPopup(160, LANE_Y, 'CARRIL 1 +150', color(255, 240, 120));
      } else if (bx >= LANE_DIV_L && bx < LANE_DIV_R && !topLanes[1]) {
        topLanes[1] = true;
        score += 150;
        addPopup(200, LANE_Y, 'CARRIL 2 +150', color(255, 240, 120));
      } else if (bx >= LANE_DIV_R && bx <= LANE_R_X && !topLanes[2]) {
        topLanes[2] = true;
        score += 150;
        addPopup(240, LANE_Y, 'CARRIL 3 +150', color(255, 240, 120));
      }

      if (topLanes[0] && topLanes[1] && topLanes[2]) {
        score += 2000;
        addPopup(200, 68, '¡TRIPLE! +2000', color(255, 255, 160));
        topLanes = [false, false, false];
      }
    }
  }

  updateBucles();

  if (!gameOver && launched && ball.body.position.y > H + 43) {
    const inPlungerLane = ball.body.position.x > W - PLUNGER_LANE_W;
    if (inPlungerLane) {
      resetBall();
    } else {
      lives--;
      if (lives <= 0) {
        gameOver = true;
        if (score > highScore) highScore = score;
      } else {
        resetBall();
      }
    }
  }

  drawBackground();

  for (const w of walls) {
    w.draw(w.col || color(40, 50, 95));
  }

  for (const b of bumpers) {
    b.draw();
    if (b.glowColor) {
      push();
        noFill();
        stroke(b.glowColor.levels[0], b.glowColor.levels[1], b.glowColor.levels[2],
               b.lit > 0 ? 255 : 100);
        strokeWeight(b.lit > 0 ? 4 : 2);
        circle(b.body.position.x, b.body.position.y, b.r * 2 + (b.lit > 0 ? 10 : 6));
        stroke(b.glowColor.levels[0], b.glowColor.levels[1], b.glowColor.levels[2],
               b.lit > 0 ? 180 : 40);
        strokeWeight(b.lit > 0 ? 2 : 1);
        circle(b.body.position.x, b.body.position.y, b.r * 2 + (b.lit > 0 ? 16 : 10));
      pop();
    }
  }

  for (const f of flippers) f.draw();
  if (plungerGate) plungerGate.draw();
  plunger.draw();
  ball.draw();

  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy;
    p.alpha -= 5;
    push();
      noStroke();
      textSize(12);
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      fill(0, 0, 0, p.alpha * 0.5);
      text(p.text, p.x + 1, p.y + 1);
      fill(red(p.col), green(p.col), blue(p.col), p.alpha);
      text(p.text, p.x, p.y);
    pop();
    if (p.alpha <= 0) popups.splice(i, 1);
  }

  drawHUD();
  if (gameOver) drawGameOver();
}

function drawBackground() {
  background(0, 0, 0);

  stroke(15, 25, 45); // Cuadrícula de fondo
  strokeWeight(1);
  const gridStep = 22;
  for (let y = 0; y < H; y += gridStep) line(0, y, W, y);
  for (let x = 0; x < W; x += gridStep) line(x, 0, x, H);

  noStroke();
  fill(5, 8, 18, 190);
  rect(W - PLUNGER_LANE_W, 0, PLUNGER_LANE_W, H); // Sombra carril lanzador

  push();
    strokeWeight(1);
    noFill();

    stroke(80, 160, 255, 55);
    drawingContext.setLineDash([4, 7]);
    line(40, 340, 40, 90); // Guía ruta izquierda
    drawingContext.setLineDash([]);

    stroke(100, 220, 255, 55);
    drawingContext.setLineDash([4, 7]);
    line(201, 438, 201, 120); // Guía ruta central
    drawingContext.setLineDash([]);

    stroke(200, 100, 255, 55);
    drawingContext.setLineDash([4, 7]);
    line(356, 365, 356, 90); // Guía ruta derecha
    drawingContext.setLineDash([]);

    rectMode(CENTER);
    const boxX = [160, 200, 240];
    for (let i = 0; i < 3; i++) {
      if (topLanes[i]) {
        fill(80, 255, 140, 240);
        stroke(150, 255, 200);
      } else {
        fill(30, 60, 100, 140);
        stroke(80, 140, 220, 140);
      }
      strokeWeight(1.5);
      rect(boxX[i], LANE_Y - 7, 22, 14, 2);
      noStroke();
      fill(topLanes[i] ? color(0, 60, 30) : color(180, 220, 255, 200));
      textSize(9);
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      text(i + 1, boxX[i], LANE_Y - 7);
    }

    // Luces de progreso del zigzag (bucle 1), en cada hueco entre pisos
    const zigLights = [[88, 198], [159, 252], [88, 306]];
    noStroke();
    for (let i = 0; i < 3; i++) {
      fill(bucle1Stage > i ? color(90, 255, 190, 230) : color(40, 90, 80, 120));
      circle(zigLights[i][0], zigLights[i][1], 8);
    }

    // Trampa (saucer) del bucle 3
    fill(12, 0, 22);
    circle(SAUCER_X, SAUCER_Y, SAUCER_R * 2 + 6);
    noFill();
    stroke(220, 120, 255, saucerHold > 0 ? 150 + 105 * sin(frameCount * 0.4) : 120);
    strokeWeight(saucerHold > 0 ? 3 : 2);
    circle(SAUCER_X, SAUCER_Y, SAUCER_R * 2 + 6);
  pop();
}

function drawHUD() {
  push();
    noStroke();
    fill(255, 240, 100);
    textSize(23);
    textAlign(LEFT, TOP);
    text(`SCORE  ${score}`, 20, 13);

    fill(200, 220, 255);
    textSize(13);
    text(`HI  ${highScore}`, 20, 40);

    if (bumperCombo > 1 && frameCount - lastBumperHitFrame < 120) {
      fill(255, 180, 80);
      textSize(12);
      textStyle(BOLD);
      text(`COMBO  x${bumperCombo}!`, 20, 60);
    }

    fill(255, 100, 100);
    textSize(14);
    textAlign(RIGHT, TOP);
    text(`LIVES  ${'💜 '.repeat(lives)}`, W, 13);

    if (!launched) {
      fill(220, 230, 255, 220);
      textSize(12);
      textAlign(CENTER, BOTTOM);
      text('Mantén [ESPACIO] para cargar · Suelta para disparar', W/2 - 20, H - 11);
    } else {
      fill(220, 230, 255, 220);
      textSize(12);
      textAlign(CENTER, BOTTOM);
      text('Oprime [A] y [D] para jugar!', W/2 - 20, H - 11);
    }
  pop();
}

function drawGameOver() {
  push();
    fill(0, 0, 15, 190);
    rect(0, 0, W, H);

    fill(255, 100, 100);
    textSize(52);
    textAlign(CENTER, CENTER);
    text('GAME OVER', W/2 - 26, H/2 - 33);

    fill(255, 255, 120);
    textSize(24);
    text(`Puntaje: ${score}`, W/2 - 26, H/2 + 22);

    fill(220, 230, 255);
    textSize(15);
    text('Oprime R para reiniciar', W/2 - 26, H/2 + 65);
  pop();
}

function keyPressed() {
  if (key === 'a' || key === 'A' || keyCode === LEFT_ARROW) {
    flippers[0].activate(true);
  }
  if (key === 'd' || key === 'D' || keyCode === RIGHT_ARROW) {
    flippers[1].activate(true);
  }
  if (key === ' ') {
    if (!launched) plunger.startPull();
  }
  if ((key === 'r' || key === 'R') && gameOver) {
    score = 0;
    lives = 3;
    gameOver = false;
    popups = [];
    bumperCombo = 1;
    leftLoopTrack   = false;
    centerRampTrack = false;
    rightLoopTrack  = false;
    topLanes = [false, false, false];

    World.clear(world);
    Engine.clear(engine);
    engine.gravity.y = 1;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    Events.off(engine);
    buildTable();
    resetBall();
    registerCollisionEvents();
    loop();
  }
}

function keyReleased() {
  if (key === 'a' || key === 'A') {
    flippers[0].activate(false);
  }
  if (key === 'd' || key === 'D') {
    flippers[1].activate(false);
  }
  if (key === ' ' && !launched) {
    Body.setStatic(ball.body, false);
    plunger.release(ball);
    launched = true;
  }
}
