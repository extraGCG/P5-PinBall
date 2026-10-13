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
let launched = false;   // Indica si la bola ya está fuera del carril
let highScore = 0;


const W = 400, H = 700;
const WALL_T = 16;          // Grosor de las paredes
const PLUNGER_X = W - 30;   // Posición X del carril de lanzamiento a la derecha
const FLIPPER_Y = H - 80;   // Posición Y de los pivotes de las aletas

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
  engine.positionIterations = 10; // Mayor precisión del motor para evitar traspaso de objetos
  engine.velocityIterations = 8;

  // ── Manejador de colisiones ──
  Events.on(engine, 'collisionStart', (evt) => {
    for (const pair of evt.pairs) {
      const { bodyA, bodyB } = pair;

      // ¿La bola pegó en un bumper?
      let bumperBody = null;
      if (bodyA.label === 'Bumper' && bodyB.label === 'Ball') bumperBody = bodyA;
      if (bodyB.label === 'Bumper' && bodyA.label === 'Ball') bumperBody = bodyB;

      if (bumperBody) {
        // Ubica el bumper correspondiente y lo hace destellar
        const ballBody = (bodyA.label === 'Ball') ? bodyA : bodyB;
        for (const b of bumpers) {
          if (b.body === bumperBody) {
            b.hit();
            b.kickBall(ballBody);
          }
        }
        score += 100;
      }

      // Contacto de la bola con aletas o paredes — puntaje adicional
      const labels = [bodyA.label, bodyB.label];
      if (labels.includes('Ball') && labels.includes('Flipper')) {
        score += 10;
      }
    }
  });
}

function buildTable() {
  walls   = [];
  bumpers = [];
  flippers = [];

  const T = WALL_T;

  // Techo / Pared superior
  walls.push(new Wall(W/2, T/2, W, T));
  // Pared izquierda
  walls.push(new Wall(T/2, H/2, T, H));
  // Pared exterior derecha
  walls.push(new Wall(W - T/2, H/2, T, H));
  // Separador del carril (pared divisoria entre el tablero y el lanzador)
  walls.push(new Wall(W - 48, H/2 + 80, T/2, H - 160));
  // Deflector diagonal superior derecho: desvía la bola disparada hacia el tablero
  walls.push(new DiagonalWall(372, 68, 60, Math.PI / 4, 12));

  // Guía diagonal inferior izquierda
  walls.push(new DiagonalWall(49, 574, 95, 0.80));
  // Guía diagonal inferior derecha
  walls.push(new DiagonalWall(315, 574, 95, -0.80));

  // Rampas laterales superiores
  walls.push(new DiagonalWall(T + 30, 200, 120, 0.7));
  walls.push(new DiagonalWall(W - 96, 200, 120, -0.6));

  // Bumpers
  bumpers.push(new Bumper(150, 400, 22));
  bumpers.push(new Bumper(210, 390, 22));
  bumpers.push(new Bumper(270, 397, 22));
  bumpers.push(new Bumper(180, 545, 18));
  bumpers.push(new Bumper(248, 445, 18));

  // Flippers
  const flipLen = 87;
  
  flippers.push(new Flipper(90, FLIPPER_Y, flipLen, 'left'));
  flippers.push(new Flipper(274, FLIPPER_Y, flipLen, 'right'));

  //  Lanzador / Resorte de disparo 
  plunger = new Plunger(PLUNGER_X, H * 0.25, H - 60);

  if (plungerGate) plungerGate.open();
  plungerGate = new PlungerGate(368, 158, 54, -0.7, 10);
}

// ── Reiniciar / Nueva bola ──────────────────────────────────────────────────
function resetBall() {
  if (ball) World.remove(world, ball.body);
  ball = new Ball(PLUNGER_X, H - 100);
  Body.setStatic(ball.body, true);   
  launched = false;
  if (plungerGate) plungerGate.open();
}

function draw() {
  // ── Actualización de física con sub-pasos (elimina el "tunelado" a altas velocidades) ──
  const subSteps = 3;
  const subDelta = (1000 / 60) / subSteps;
  for (let i = 0; i < subSteps; i++) {
    for (const f of flippers) f.update();
    Engine.update(engine, subDelta);
  }

  // ── Límite de velocidad máxima para garantizar colisiones sólidas ──
  if (ball && ball.body) {
    const v = ball.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    const MAX_SPEED = 20; // Límite de velocidad en px/cuadro
    if (speed > MAX_SPEED) {
      const factor = MAX_SPEED / speed;
      Body.setVelocity(ball.body, { x: v.x * factor, y: v.y * factor });
    }
  }

  // Actualiza el lanzador
  plunger.update();

  // Cierra la compuerta una vez la bola supera la cima del carril 
  if (launched && plungerGate && !plungerGate.closed) {
    if ((ball.body.position.x > W - 48 && ball.body.position.y <= 132) ||
        (ball.body.position.x <= W - 48 && ball.body.position.y < 160)) {
      plungerGate.close();
    }
  }

  // Detección de caída de la bola (por debajo del lienzo)
  if (!gameOver && launched && ball.body.position.y > H + 40) {
    const inPlungerLane = ball.body.position.x > W - 48;
    if (inPlungerLane) {
      // La bola se devolvió por el carril del lanzador: tiro gratis, no descuenta vida
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

  for (const w of walls)   w.draw();
  for (const b of bumpers) b.draw();
  for (const f of flippers) f.draw();
  if (plungerGate) plungerGate.draw();
  plunger.draw();
  ball.draw();

  drawHUD();

  if (gameOver) drawGameOver();
}

function drawBackground() {
  // Paño oscuro estilo mesa de billar/arcade
  background(10, 10, 30);
  // Cuadrícula sutil que da textura al paño
  stroke(20, 20, 50);
  strokeWeight(1);
  for (let y = 0; y < H; y += 20) line(0, y, W, y);
  for (let x = 0; x < W; x += 20) line(x, 0, x, H);

  noStroke();
  fill(5, 5, 20, 160);
  rect(W - 48, 0, 48, H);
}

function drawHUD() {
  // Puntaje actual
  push();
    noStroke();
    fill(255, 220, 50);
    textSize(22);
    textAlign(LEFT, TOP);
    text(`SCORE  ${score}`, 18, 12);

    fill(180, 180, 255);
    textSize(13);
    text(`HI  ${highScore}`, 18, 38);

    // Vidas restantes
    fill(255, 80, 80);
    textSize(13);
    textAlign(RIGHT, TOP);
    text(`LIVES  ${'♥ '.repeat(lives)}`, W - 56, 12);

    // Indicaciones de controles 
    if (!launched) {
      fill(200, 200, 200, 180);
      textSize(11);
      textAlign(CENTER, BOTTOM);
      text('Mantén [ESPACIO] para cargar · Suelta para disparar', W/2 - 24, H - 10);
    }
    else{
      fill(200, 200, 200, 180);
      textSize(11);
      textAlign(CENTER, BOTTOM);
      text('Oprime [A] y [D] para jugar!', W/2 - 24, H - 10);
    }
  pop();
}

function drawGameOver() {
  push();
    fill(0, 0, 0, 160);
    rect(0, 0, W, H);

    fill(255, 80, 80);
    textSize(48);
    textAlign(CENTER, CENTER);
    text('GAME OVER', W/2 - 24, H/2 - 30);

    fill(255, 220, 50);
    textSize(22);
    text(`Puntaje: ${score}`, W/2 - 24, H/2 + 20);

    fill(200, 200, 200);
    textSize(14);
    text('Oprime R para reiniciar', W/2 - 24, H/2 + 60);
  pop();
}

function keyPressed() {
  if (key === 'a' || key === 'A' || keyCode === LEFT_ARROW) {
    flippers[0].activate(true);
  }
  if (key === 'd' || keyCode === 'D') {
    flippers[1].activate(true);
  }

  if (key === ' ') {
    if (!launched) plunger.startPull();
  }

  if ((key === 'r' || key === 'R') && gameOver) {
    score = 0;
    lives = 3;
    gameOver = false;
    // Limpia los cuerpos físicos anteriores
    World.clear(world);
    Engine.clear(engine);
    engine.gravity.y = 1;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    Events.off(engine);
    buildTable();
    resetBall();
    // Registra de nuevo los eventos de colisión
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
            }
          }
          score += 100;
        }
        const labels = [bodyA.label, bodyB.label];
        if (labels.includes('Ball') && labels.includes('Flipper')) score += 10;
      }
    });
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

  // Disparar la bola al soltar la barra espaciadora
  if (key === ' ' && !launched) {
    Body.setStatic(ball.body, false);  // Pasa a cuerpo dinámico para moverse libremente
    plunger.release(ball);
    launched = true;
  }
}
