
// ─── Model.js ─ Objetos del juego de Pinball (p5.js + Matter.js) ─────────────

class Ball {
  constructor(x, y, r = 12) {
    this.r = r;
    this.body = Bodies.circle(x, y, r, {
      restitution: 0.6,
      friction: 0.0,
      frictionAir: 0.0,   // Sin fricción con el aire para que la bola ruede libre y no se quede parada
      density: 0.004,
      label: 'Ball',
      collisionFilter: { category: 1, mask: 0xFFFF }
    });
    World.add(world, this.body);
  }

  draw() {
    const { x, y } = this.body.position;
    push();
      translate(x, y);
      // Bola plateada con brillo metálico
      noStroke();
      fill(200, 200, 220);
      circle(0, 0, this.r * 2);
      fill(255, 255, 255, 180);
      ellipse(-this.r * 0.3, -this.r * 0.35, this.r * 0.7, this.r * 0.5);
    pop();
  }
}

class Wall {
  constructor(x, y, w, h, options = {}) {
    this.w = w;
    this.h = h;
    this.body = Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      restitution: 0.5,
      friction: 0.1,
      label: 'Wall',
      ...options
    });
    World.add(world, this.body);
  }

  draw(col = color(40, 40, 80)) {
    const { x, y } = this.body.position;
    push();
      translate(x, y);
      rotate(this.body.angle);
      rectMode(CENTER);
      noStroke();
      fill(col);
      rect(0, 0, this.w, this.h, 3);
    pop();
  }
}

class Bumper {
  constructor(x, y, r = 24) {
    this.r = r;
    this.lit = 0;          // Cuadros restantes del destello
    this.body = Bodies.circle(x, y, r, {
      isStatic: true,
      restitution: 0.0,    // El rebote fuerte lo manejamos manualmente con kickBall
      friction: 0,
      label: 'Bumper',
      collisionFilter: { category: 2, mask: 0xFFFF }
    });
    World.add(world, this.body);
  }

  hit() {
    this.lit = 12;        
  }

  // Impulsa la bola lejos del bumper con velocidad fija
  kickBall(ballBody) {
    const bx = this.body.position.x;
    const by = this.body.position.y;
    const px = ballBody.position.x;
    const py = ballBody.position.y;

    // Dirección calculada desde el centro del bumper hacia la bola
    let dx = px - bx;
    let dy = py - by;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;

    const kickSpeed = 10;  
    Body.setVelocity(ballBody, { x: dx * kickSpeed, y: dy * kickSpeed });
  }

  draw() {
    const { x, y } = this.body.position;
    this.lit = max(0, this.lit - 1);
    push();
      translate(x, y);
      noStroke();
      // Aro exterior
      fill(this.lit > 0 ? color(255, 80, 20) : color(180, 20, 20));
      circle(0, 0, this.r * 2);
      // Brillo interior
      fill(this.lit > 0 ? color(255, 220, 100) : color(220, 60, 60));
      circle(0, 0, this.r);
      // Punto del centro
      fill(255);
      circle(0, 0, this.r * 0.3);
    pop();
  }
}

class Flipper {
  /**
   * @param {number} x        
   * @param {number} y        
   * @param {number} len      
   * @param {'left'|'right'} side 
   */
  constructor(x, y, len, side) {
    this.side = side;
    this.len = len;
    this.h = 14;

    this.restAngle  = side === 'left' ?  0.45 : -0.45;
    this.raiseAngle = side === 'left' ? -0.45 :  0.45;
    this.currentAngle = this.restAngle;
    this.isUp = false;

    const dir = side === 'left' ? 1 : -1;
    const cx = x + dir * (len / 2) * cos(this.restAngle);
    const cy = y + dir * (len / 2) * sin(this.restAngle);

    this.body = Bodies.rectangle(cx, cy, len, this.h, {
      label: 'Flipper',
      restitution: 0.2,
      friction: 0.1,
      frictionAir: 0.05,
      collisionFilter: { category: 4, mask: 0xFFFF }
    });

    this.pivot = Constraint.create({
      pointA: { x, y },
      bodyB: this.body,
      pointB: { x: (side === 'left' ? -1 : 1) * (len / 2), y: 0 },
      stiffness: 1,
      length: 0
    });

    World.add(world, [this.body, this.pivot]);

    this.pivotX = x;
    this.pivotY = y;

    Body.setAngle(this.body, this.restAngle);
  }

  activate(up) {
    this.isUp = up;
  }

  update() {
    const target = this.isUp ? this.raiseAngle : this.restAngle;
    const diff = target - this.body.angle;
    // Impulso angular fuerte hacia el ángulo objetivo
    Body.setAngularVelocity(this.body, diff * 0.45);
  }

  draw() {
    const { x, y } = this.body.position;
    push();
      translate(x, y);
      rotate(this.body.angle);
      rectMode(CENTER);
      noStroke();
      fill(20, 20, 60, 120);
      rect(2, 2, this.len, this.h, 4);
      fill(80, 160, 255);
      rect(0, 0, this.len, this.h, 4);
      // Brillo superior
      fill(180, 220, 255, 160);
      rect(0, -2, this.len * 0.8, 3, 2);
    pop();

    push();
      noStroke();
      fill(50, 50, 90);
      circle(this.pivotX, this.pivotY, 14);
      fill(180, 200, 240);
      circle(this.pivotX, this.pivotY, 7);
    pop();
  }
}

class Plunger {
  constructor(x, yTop, yBottom) {
    this.x = x;
    this.yTop = yTop;
    this.yBottom = yBottom;
    this.y = yBottom;       // Posición vertical actual
    this.maxPull = 80;
    this.pulling = false;
    this.power = 0;         // Potencia acumulada (de 0 a 1)
  }

  startPull() { this.pulling = true; }

  release(ball) {
    if (!this.pulling) return;
    this.pulling = false;
    const forceMag = 0.13 + 0.21 * this.power;
    Body.applyForce(ball.body, ball.body.position, { x: 0, y: -forceMag });
    this.power = 0;
  }

  update() {
    if (this.pulling) {
      this.power = min(1, this.power + 0.02);
    }
    this.y = this.yBottom + this.power * this.maxPull;
  }

  draw() {
    push();
      // Riel del lanzador
      stroke(60);
      strokeWeight(4);
      line(this.x, this.yTop, this.x, this.yBottom + this.maxPull + 20);
      // Agarradera / Mango
      noStroke();
      fill(220, 80, 80);
      rectMode(CENTER);
      rect(this.x, this.y, 18, 28, 4);
      // Barra medidora de potencia
      if (this.pulling) {
        fill(255, map(this.power, 0, 1, 255, 0), 0);
        rect(this.x, this.yBottom + this.maxPull * 0.5 + 20,
             8, this.power * this.maxPull, 2);
      }
    pop();
  }
}

class DiagonalWall extends Wall {
  constructor(x, y, len, angle, thickness = 10, options = {}) {
    super(x, y, len, thickness, options);
    Body.setAngle(this.body, angle);
    this.body.label = 'Wall';
  }
}

class PlungerGate extends DiagonalWall {
  constructor(x = 368, y = 158, len = 54, angle = -0.7, thickness = 10) {
    super(x, y, len, angle, thickness, {
      restitution: 0.6,
      friction: 0.02
    });
    this.closed = true;
    this.open(); // Arranca abierta hasta que la bola suba por completo
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    World.add(world, this.body);
  }

  open() {
    if (!this.closed) return;
    this.closed = false;
    World.remove(world, this.body);
  }

  draw() {
    if (this.closed) {
      super.draw(color(235, 155, 35));
      push();
        translate(this.body.position.x, this.body.position.y);
        rotate(this.body.angle);
        rectMode(CENTER);
        noStroke();
        fill(255, 225, 120);
        rect(0, -2, this.w * 0.8, 2, 1);
      pop();
    } else {
      push();
        noStroke();
        fill(70, 70, 110, 160);
        rectMode(CENTER);
        rect(385, 140, 5, 24, 2);
        fill(130, 130, 170);
        circle(385, 128, 5);
      pop();
    }
  }
}
