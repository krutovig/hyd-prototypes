(() => {
  const PPU = 630;
  const CARD_W = 1442 / PPU, CARD_H = 2229 / PPU;
  const FRAME = { w: 313 / 120, h: 454 / 120 };
  const SHADOW = { w: 313 / 120, h: 454 / 120, dx: 0.1, dy: -0.1 };
  const SLOT = { w: 372 / 150, h: 548 / 150 };
  const MASK = { w: 313 / 120, h: 454 / 120, half: 1.07 };
  const DESAT = 0.2, SAT_DURATION = 1;
  const HERO_SCALE = 1.079, HERO_SPINE_Y = -1.044, HERO_SPEED = 2;
  const TURN_PAUSE = 0.2;
  const SNAP_DIST = 1.6;
  const VIEW = { minX: -3.4, maxX: 3.4, minY: -4.6, maxY: 5.6 };
  const SLOT_STEP = 2.76;
  const HAND = { scale: 0.75, peek: 1.0, step: 1.5, fan: 5, hoverLift: 0.25 };
  const PICKUP = {
    anim: 'items/item_pickup_strength_potion', edgeX: 0.65, fadeAt: 1.2,
    bottle: { x: 0.531, y: 0.706, w: 0.25 },
    slots: ['lib/_3_4_view/hand1', 'lib/cards/tutorial_level/strength_potion_bottle2', 'lib/cards/tutorial_level/strength_potion_cork2'],
  };
  const SWORD_ANCHOR = { x: 0.10, y: 0.167, dir: -1 };
  const BIG_POTION_W = FRAME.w * 0.42;
  const DEAL = { in: 0.55, hold: 0.55, fly: 0.75, showX: 0, showY: 1.0 };

  const canvas = document.getElementById('stage');
  const statusEl = document.getElementById('status');
  const ctx = new spine.ManagedWebGLRenderingContext(canvas, { alpha: false, stencil: true });
  const gl = ctx.gl;
  const renderer = new spine.SceneRenderer(canvas, ctx, true);

  const VS = `
attribute vec4 ${spine.Shader.POSITION};
attribute vec4 ${spine.Shader.COLOR};
attribute vec4 ${spine.Shader.COLOR2};
attribute vec2 ${spine.Shader.TEXCOORDS};
uniform mat4 ${spine.Shader.MVP_MATRIX};
varying vec4 v_light; varying vec4 v_dark; varying vec2 v_texCoords;
void main () {
  v_light = ${spine.Shader.COLOR}; v_dark = ${spine.Shader.COLOR2}; v_texCoords = ${spine.Shader.TEXCOORDS};
  gl_Position = ${spine.Shader.MVP_MATRIX} * ${spine.Shader.POSITION};
}`;
  const FS = `
precision mediump float;
varying vec4 v_light; varying vec4 v_dark; varying vec2 v_texCoords;
uniform sampler2D u_texture; uniform float u_sat;
void main () {
  vec4 t = texture2D(u_texture, v_texCoords);
  vec4 c;
  c.a = t.a * v_light.a;
  c.rgb = ((t.a - 1.0) * v_dark.a + 1.0 - t.rgb) * v_dark.rgb + t.rgb * v_light.rgb;
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(vec3(l), c.rgb, u_sat);
  gl_FragColor = c;
}`;
  const MASK_FS = `
precision mediump float;
varying vec4 v_light; varying vec4 v_dark; varying vec2 v_texCoords;
uniform sampler2D u_texture;
void main () {
  if (texture2D(u_texture, v_texCoords).a < 0.22) discard;
  gl_FragColor = vec4(0.0);
}`;
  const satShader = new spine.Shader(ctx, VS, FS);
  const maskShader = new spine.Shader(ctx, VS, MASK_FS);
  renderer.batcherShader = satShader;

  function setSat(v) {
    renderer.end();
    satShader.bind();
    satShader.setUniformf('u_sat', v);
  }

  const assets = new spine.AssetManager(ctx, 'assets/');
  assets.loadTextureAtlas('hero/Shadowclaw.atlas');
  assets.loadJson('hero/Shadowclaw.json');
  assets.loadTextureAtlas('sword/Shadowclaw.atlas');
  assets.loadJson('sword/tutorial_sword.json');

  const imgNames = ['card_sword', 'card_shadow', 'card_mask', 'card_frame', 'slot',
    'tutorial_level_stone_b', 'tutorial_level_stone_f', 'item_strength_potion', 'item_sword'];
  const img = {}, tex = {};
  const imgPromises = imgNames.map(n => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { img[n] = im; tex[n] = pmaTexture(im, im.naturalWidth, im.naturalHeight); res(); };
    im.onerror = () => rej(new Error('Could not load image ' + n));
    im.src = 'assets/' + n + '.png';
  }));

  function pmaTexture(source, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(source, 0, 0);
    const d = g.getImageData(0, 0, w, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const al = a[i + 3] / 255;
      a[i] = a[i] * al; a[i + 1] = a[i + 1] * al; a[i + 2] = a[i + 2] * al;
    }
    return new spine.GLTexture(ctx, d, true);
  }

  function makeItemCardTexture(icon, withBigIcon) {
    const W = 626, H = 908;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#eedccb';
    g.beginPath();
    g.roundRect(22, 22, W - 44, H - 44, 26);
    g.fill();
    g.drawImage(img.card_frame, 0, 0, W, H);
    if (withBigIcon) {
      const big = W * 0.42, bigH = big * icon.naturalHeight / icon.naturalWidth;
      g.drawImage(icon, (W - big) / 2, (H - bigH) / 2, big, bigH);
    }
    const pip = W * 0.11, pipH = pip * icon.naturalHeight / icon.naturalWidth;
    const inset = 62;
    g.drawImage(icon, inset, inset, pip, pipH);
    g.save();
    g.translate(W - inset, H - inset);
    g.rotate(Math.PI);
    g.drawImage(icon, 0, 0, pip, pipH);
    g.restore();
    return pmaTexture(c, W, H);
  }

  function makeSkeleton(atlasPath, jsonPath) {
    const atlas = assets.require(atlasPath);
    const json = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
    json.scale = 0.002;
    const data = json.readSkeletonData(assets.require(jsonPath));
    const skeleton = new spine.Skeleton(data);
    skeleton.setToSetupPose();
    const stateData = new spine.AnimationStateData(data);
    const state = new spine.AnimationState(stateData);
    return { skeleton, state, stateData };
  }

  let hero, sword, cards, slots, hand, dragging = null, busy = false, zCounter = 0, last = 0;
  let hoverHand = -1, pointer = { x: 0, y: -100 }, potionUsed = false, arm = null, heroCopy = null, copyState = null, flying = null;

  function waitAssets() {
    return new Promise((res, rej) => {
      const tick = () => {
        if (assets.hasErrors()) return rej(new Error(JSON.stringify(assets.getErrors())));
        if (assets.isLoadingComplete()) return res();
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  Promise.all([waitAssets(), ...imgPromises]).then(init).catch(e => {
    document.getElementById('loading').textContent = 'Loading failed: ' + e.message;
    console.error(e);
  });

  function init() {
    tex.item_potion_full = makeItemCardTexture(img.item_strength_potion, true);
    tex.item_potion_empty = makeItemCardTexture(img.item_strength_potion, false);
    tex.item_sword_full = makeItemCardTexture(img.item_sword, true);
    window.__hyd = { renderer, get cards() { return cards; }, get hand() { return hand; }, heroState, get arm() { return arm; }, get hero() { return hero; } };
    document.getElementById('loading').hidden = true;
    hero = makeSkeleton('hero/Shadowclaw.atlas', 'hero/Shadowclaw.json');
    hero.stateData.defaultMix = 0.3;
    hero.stateData.setMix('basic/idle_simple', 'basic/walk_side', 0);
    sword = makeSkeleton('sword/Shadowclaw.atlas', 'sword/tutorial_sword.json');
    heroCopy = new spine.Skeleton(hero.skeleton.data);
    copyState = new spine.AnimationState(hero.stateData);
    reset();
    document.getElementById('reset').addEventListener('click', reset);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    requestAnimationFrame(frame);
  }

  const heroState = { card: null, lx: 0, ly: 0, x: 0, y: 0, dir: 1, facing: 1, action: null };

  function reset() {
    slots = [-SLOT_STEP / 2, SLOT_STEP / 2].map(x => ({ x, y: -1.64, card: null }));
    cards = [{
      id: 'sword', img: 'card_sword', bit: 1, x: 0, y: 2.55, slot: null,
      sat: DESAT, satFrom: DESAT, satTo: DESAT, satT: 1, z: 1, tween: null, alpha: 1,
    }];
    hand = [{ id: 'potion', texture: tex.item_potion_full, x: 0, y: -8, rot: 0, scale: HAND.scale }];
    zCounter = 2;
    dragging = null; busy = false; potionUsed = false; arm = null; flying = null;
    heroState.card = cards[0];
    heroState.lx = 0.55; heroState.ly = 0.2;
    heroState.dir = 1; heroState.facing = 1; heroState.action = null;
    hero.state.clearTracks(); hero.skeleton.setToSetupPose();
    hero.state.setAnimation(0, 'basic/idle_simple', true);
    sword.state.clearTracks(); sword.skeleton.setToSetupPose();
    sword.state.setAnimation(0, 'tutorial_sword_static', true);
    setStatus('Put the sword card into a slot');
  }

  function setStatus(t) { statusEl.textContent = t; }
  function cardById(id) { return cards.find(c => c.id === id); }

  function tweenSat(card, to) {
    card.satFrom = card.sat; card.satTo = to; card.satT = 0;
  }

  function moveCardTo(card, x, y, dur, onDone) {
    card.tween = { fx: card.x, fy: card.y, tx: x, ty: y, t: 0, d: dur, onDone };
  }

  function screenToWorld(px, py) {
    const r = canvas.getBoundingClientRect();
    const cam = renderer.camera;
    const sx = (px - r.left) / r.width, sy = (py - r.top) / r.height;
    const w = cam.viewportWidth * cam.zoom, h = cam.viewportHeight * cam.zoom;
    return { x: cam.position.x - w / 2 + sx * w, y: cam.position.y + h / 2 - sy * h };
  }

  function visibleBottom() {
    const cam = renderer.camera;
    return cam.position.y - cam.viewportHeight * cam.zoom / 2;
  }

  function hitCard(p) {
    const sorted = [...cards].sort((a, b) => b.z - a.z);
    return sorted.find(c => Math.abs(p.x - c.x) <= CARD_W / 2 && Math.abs(p.y - c.y) <= CARD_H / 2);
  }

  function hitHand(p) {
    for (let i = hand.length - 1; i >= 0; i--) {
      const h = hand[i];
      const w = FRAME.w * h.scale, hh = FRAME.h * h.scale;
      if (Math.abs(p.x - h.x) <= w / 2 && Math.abs(p.y - h.y) <= hh / 2) return i;
    }
    return -1;
  }

  function onDown(e) {
    if (busy) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const hi = hitHand(p);
    if (hi >= 0) {
      const h = hand.splice(hi, 1)[0];
      const c = {
        id: h.id, item: true, texture: h.texture, bit: 2, x: h.x, y: h.y, slot: null,
        sat: 1, satFrom: 1, satTo: 1, satT: 1, z: ++zCounter, tween: null, alpha: 1,
        rot: h.rot, scale: h.scale,
      };
      cards.push(c);
      dragging = { card: c, ox: 0, oy: 0 };
      onMove(e);
      return;
    }
    const c = hitCard(p);
    if (!c) return;
    c.tween = null;
    if (c.slot !== null) {
      slots[c.slot].card = null;
      c.slot = null;
      if (!c.item) tweenSat(c, DESAT);
    }
    c.z = ++zCounter;
    dragging = { card: c, ox: p.x - c.x, oy: p.y - c.y };
    canvas.style.cursor = 'grabbing';
  }

  function onMove(e) {
    pointer = screenToWorld(e.clientX, e.clientY);
    if (!dragging) {
      const overHand = !busy && hitHand(pointer) >= 0;
      const c = !busy && !overHand && hitCard(pointer);
      canvas.style.cursor = c || overHand ? 'grab' : 'default';
      return;
    }
    canvas.style.cursor = 'grabbing';
    dragging.card.x = pointer.x - dragging.ox;
    dragging.card.y = pointer.y - dragging.oy;
  }

  function onUp() {
    if (!dragging) return;
    const c = dragging.card;
    dragging = null;
    canvas.style.cursor = 'default';
    let best = -1, bestD = SNAP_DIST;
    slots.forEach((s, i) => {
      if (s.card) return;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) {
      if (c.item) returnToHand(c);
      return;
    }
    slots[best].card = c;
    c.slot = best;
    moveCardTo(c, slots[best].x, slots[best].y, 0.18, () => {
      if (!c.item) tweenSat(c, 1);
      checkUse();
    });
  }

  function returnToHand(c) {
    cards.splice(cards.indexOf(c), 1);
    hand.push({ id: c.id, texture: c.texture, x: c.x, y: c.y, rot: c.rot || 0, scale: 1 });
  }

  function checkUse() {
    if (busy || potionUsed) return;
    const swordCard = cardById('sword'), potionCard = cardById('potion');
    if (!swordCard || !potionCard || swordCard.slot === null || potionCard.slot === null) {
      if (swordCard && swordCard.slot !== null && !potionCard) setStatus('Drag the potion card from your hand next to Shadowclaw');
      return;
    }
    if (Math.abs(swordCard.slot - potionCard.slot) !== 1) return;
    startReach(swordCard, potionCard);
  }

  function startReach(swordCard, potionCard) {
    busy = true;
    const side = potionCard.slot > swordCard.slot ? 1 : -1;
    setStatus('Shadowclaw reaches for the potion…');
    walkOnCard(swordCard, side * PICKUP.edgeX, 0.2, side, () => startPickup(side, swordCard, potionCard));
  }

  function startPickup(side, swordCard, potionCard) {
    arm = { side, swordCard, potionCard, t: 0 };
    potionCard.texture = tex.item_potion_empty;
    const tr = hero.state.setAnimation(0, PICKUP.anim, false);
    hero.state.addAnimation(0, 'basic/idle_simple', true, 0);
    copyState.clearTracks();
    heroCopy.setToSetupPose();
    copyState.setAnimation(0, PICKUP.anim, false);
    tr.listener = { complete: finishReach };
  }

  function walkOnCard(card, lx, ly, faceDir, then) {
    const sx = heroState.x, sy = heroState.y;
    const tx = card.x + lx, ty = card.y + ly;
    heroState.card = null;
    const dir = Math.abs(tx - sx) < 0.01 ? heroState.facing : (tx > sx ? 1 : -1);
    turnTo(dir, () => {
      const dist = Math.abs(tx - sx);
      const done = () => {
        heroState.card = card; heroState.lx = lx; heroState.ly = ly;
        hero.state.setAnimation(0, 'basic/idle_simple', true);
        turnTo(faceDir, then);
      };
      if (dist < 0.01) { done(); return; }
      heroState.action = { type: 'walk', sx, sy, tx, ty, t: 0, d: dist / HERO_SPEED, done };
      hero.state.setAnimation(0, 'basic/walk_side', true);
    });
  }

  function turnTo(dir, then) {
    if (heroState.facing === dir) { then(); return; }
    heroState.facing = dir;
    heroState.dir = dir;
    heroState.action = { type: 'turn', t: 0, d: TURN_PAUSE, then };
  }

  function updateArm(dt) {
    const a = arm;
    if (!a) return;
    a.t += dt;
    if (a.t >= PICKUP.fadeAt && a.potionCard.fade === undefined) a.potionCard.fade = 0;
    copyState.update(dt);
    heroCopy.setBonesToSetupPose();
    copyState.apply(heroCopy);
    const scale = BIG_POTION_W / PICKUP.bottle.w;
    heroCopy.scaleX = scale * a.side;
    heroCopy.scaleY = scale;
    heroCopy.x = a.potionCard.x - PICKUP.bottle.x * scale * a.side;
    heroCopy.y = a.potionCard.y - PICKUP.bottle.y * scale;
    for (const slot of heroCopy.slots) slot.color.a = PICKUP.slots.includes(slot.data.name) ? 1 : 0;
    heroCopy.updateWorldTransform();
  }

  function finishReach() {
    const a = arm;
    arm = null;
    potionUsed = true;
    if (a.potionCard.fade === undefined) a.potionCard.fade = 0;
    setStatus('Shadowclaw heads for the sword…');
    walkOnCard(a.swordCard, SWORD_ANCHOR.x, SWORD_ANCHOR.y, SWORD_ANCHOR.dir, usePotion);
  }

  function usePotion() {
    setStatus('Shadowclaw drinks the potion…');
    const tr = hero.state.setAnimation(0, 'levels/tutorial/tutorial_sword_pull_out', false);
    hero.state.addAnimation(0, 'basic/idle_simple', true, 0);
    sword.state.setAnimation(0, 'tutorial_sword_pull_out', false);
    tr.listener = { complete: () => dealItemCard('sword', tex.item_sword_full) };
  }

  function visibleTop() {
    const cam = renderer.camera;
    return cam.position.y + cam.viewportHeight * cam.zoom / 2;
  }

  function dealItemCard(id, texture) {
    setStatus('New card: Whiskalibur');
    const sx = 1.2, sy = visibleTop() + FRAME.h * 0.7;
    flying = { id, texture, phase: 'in', t: 0, sx, sy, x: sx, y: sy, rot: -25, scale: 1 };
  }

  function backOut(k) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function updateFlying(dt) {
    const f = flying;
    if (!f) return;
    f.t += dt;
    if (f.phase === 'in') {
      const k = Math.min(1, f.t / DEAL.in);
      const e = backOut(k);
      f.x = f.sx + (DEAL.showX - f.sx) * e;
      f.y = f.sy + (DEAL.showY - f.sy) * e;
      f.rot = -25 * (1 - e);
      if (k >= 1) { f.phase = 'hold'; f.t = 0; }
    } else if (f.phase === 'hold') {
      if (f.t >= DEAL.hold) { f.phase = 'fly'; f.t = 0; f.fx = f.x; f.fy = f.y; f.slotIndex = hand.length; }
    } else if (f.phase === 'fly') {
      const k = Math.min(1, f.t / DEAL.fly);
      const e = easeInOut(k);
      const target = handTarget(f.slotIndex, hand.length + 1, false);
      f.x = f.fx + (target.x - f.fx) * e;
      f.y = f.fy + (target.y - f.fy) * e - Math.sin(Math.PI * k) * 0.6;
      f.rot = target.rot * e + Math.sin(Math.PI * k) * 12;
      f.scale = 1 + (target.scale - 1) * e;
      if (k >= 1) {
        hand.push({ id: f.id, texture: f.texture, x: target.x, y: target.y, rot: target.rot, scale: target.scale });
        flying = null;
        busy = false;
        setStatus('Whiskalibur is in your hand');
      }
    }
  }

  function handTarget(i, n, hovered) {
    const mid = (n - 1) / 2;
    const scale = HAND.scale;
    const h = FRAME.h * scale;
    const lift = hovered ? h - HAND.peek + HAND.hoverLift : 0;
    return {
      x: (i - mid) * HAND.step,
      y: visibleBottom() - h / 2 + HAND.peek + lift - Math.abs(i - mid) * 0.06,
      rot: hovered ? 0 : -(i - mid) * HAND.fan,
      scale,
    };
  }

  function updateHand(dt) {
    hoverHand = dragging || busy ? -1 : hitHand(pointer);
    const k = 1 - Math.exp(-dt * 14);
    const n = hand.length + (flying && flying.phase === 'fly' ? 1 : 0);
    hand.forEach((h, i) => {
      const t = handTarget(i, n, i === hoverHand);
      h.x += (t.x - h.x) * k;
      h.y += (t.y - h.y) * k;
      h.rot += (t.rot - h.rot) * k;
      h.scale += (t.scale - h.scale) * k;
    });
  }

  function updateHeroAction(dt) {
    const a = heroState.action;
    if (!a) return;
    a.t += dt;
    if (a.type === 'turn') {
      if (a.t >= a.d) { heroState.action = null; a.then(); }
    } else if (a.type === 'walk') {
      const k = a.d > 0 ? Math.min(1, a.t / a.d) : 1;
      heroState.x = a.sx + (a.tx - a.sx) * k;
      heroState.y = a.sy + (a.ty - a.sy) * k;
      if (k >= 1) { heroState.action = null; a.done(); }
    }
  }

  function update(dt) {
    for (const c of cards) {
      if (c.tween) {
        const tw = c.tween;
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.d), e = 1 - (1 - k) * (1 - k);
        c.x = tw.fx + (tw.tx - tw.fx) * e;
        c.y = tw.fy + (tw.ty - tw.fy) * e;
        if (k >= 1) { c.tween = null; tw.onDone && tw.onDone(); }
      }
      if (c.satT < 1) {
        c.satT = Math.min(1, c.satT + dt / SAT_DURATION);
        const e = 1 - (1 - c.satT) * (1 - c.satT);
        c.sat = c.satFrom + (c.satTo - c.satFrom) * e;
      }
      if (c.item) {
        c.rot = (c.rot || 0) * Math.exp(-dt * 14);
        c.scale = 1 + ((c.scale || 1) - 1) * Math.exp(-dt * 14);
      }
      if (c.fade !== undefined) {
        c.fade += dt;
        c.alpha = Math.max(0, 1 - c.fade / 0.4);
      }
    }
    for (const c of cards.filter(c => c.fade !== undefined && c.alpha <= 0)) {
      if (c.slot !== null) slots[c.slot].card = null;
      cards.splice(cards.indexOf(c), 1);
    }
    updateHeroAction(dt);
    updateArm(dt);
    if (heroState.card) {
      heroState.x = heroState.card.x + heroState.lx;
      heroState.y = heroState.card.y + heroState.ly;
    }
    const sk = hero.skeleton;
    sk.setBonesToSetupPose();
    hero.state.update(dt); hero.state.apply(sk);
    sk.x = heroState.x;
    sk.y = heroState.y + HERO_SPINE_Y * HERO_SCALE;
    sk.scaleX = HERO_SCALE * heroState.dir;
    sk.scaleY = HERO_SCALE;
    sk.updateWorldTransform();

    const sc = cardById('sword');
    sword.state.update(dt); sword.state.apply(sword.skeleton);
    sword.skeleton.x = sc.x + 0.125;
    sword.skeleton.y = sc.y - 0.95;
    sword.skeleton.scaleX = -1.079;
    sword.skeleton.scaleY = 1.079;
    sword.skeleton.updateWorldTransform();

    updateFlying(dt);
    updateHand(dt);
  }

  function pmaBlend() {
    renderer.batcher.setBlendMode(spine.BlendMode.Normal, true);
  }

  const SHADOW_TINT = new spine.Color(0.678 * 0.333, 0.431 * 0.333, 0.298 * 0.333, 0.333);
  const HAND_SHADOW_TINT = new spine.Color(0.3 * 0.25, 0.2 * 0.25, 0.15 * 0.25, 0.25);

  function quad(t, cx, cy, w, h, color) {
    pmaBlend();
    renderer.drawTexture(t, cx - w / 2, cy - h / 2, w, h, color);
  }

  function rotatedQuad(t, cx, cy, w, h, angle, color) {
    pmaBlend();
    renderer.drawTextureRotated(t, cx - w / 2, cy - h / 2, w, h, w / 2, h / 2, angle, color);
  }

  function alphaColor(a) { return new spine.Color(a, a, a, a); }

  function withStencil(func, ref, mask, draw) {
    renderer.end();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(func, ref, mask);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    draw();
    renderer.end();
    gl.disable(gl.STENCIL_TEST);
  }

  function drawHeroSkeleton(shift) {
    const sk = hero.skeleton;
    if (shift) { sk.x += shift; sk.updateWorldTransform(); }
    renderer.drawSkeleton(sk, true);
    if (shift) { sk.x -= shift; sk.updateWorldTransform(); }
  }

  function drawHeroOn(card) {
    setSat(1);
    withStencil(gl.EQUAL, card.bit, card.bit, () => drawHeroSkeleton(0));
  }

  function drawPortal(card) {
    if (!arm || arm.potionCard !== card) return;
    setSat(1);
    withStencil(gl.EQUAL, card.bit, card.bit, () => renderer.drawSkeleton(heroCopy, true));
  }

  function drawLevelCard(c) {
    setSat(c.sat);
    quad(tex.card_shadow, c.x + SHADOW.dx, c.y + SHADOW.dy, SHADOW.w, SHADOW.h, SHADOW_TINT);
    quad(tex[c.img], c.x, c.y, CARD_W, CARD_H);
    quad(tex.tutorial_level_stone_b, c.x - 0.413, c.y - 0.816, 389 / PPU, 303 / PPU);
    renderer.drawSkeleton(sword.skeleton, true);
    quad(tex.tutorial_level_stone_f, c.x - 0.439, c.y - 0.829, 360 / PPU, 285 / PPU);
    if (heroState.card === c) drawHeroOn(c);
    setSat(c.sat);
    quad(tex.card_frame, c.x, c.y, FRAME.w, FRAME.h);
  }

  function drawItemOnTable(c) {
    setSat(1);
    const s = c.scale || 1;
    rotatedQuad(tex.card_shadow, c.x + SHADOW.dx, c.y + SHADOW.dy, SHADOW.w * s, SHADOW.h * s, c.rot || 0,
      new spine.Color(SHADOW_TINT.r * c.alpha, SHADOW_TINT.g * c.alpha, SHADOW_TINT.b * c.alpha, SHADOW_TINT.a * c.alpha));
    rotatedQuad(c.texture, c.x, c.y, FRAME.w * s, FRAME.h * s, c.rot || 0, alphaColor(c.alpha));
    drawPortal(c);
  }

  function drawHandCard(h) {
    const w = FRAME.w * h.scale, hh = FRAME.h * h.scale;
    rotatedQuad(tex.card_shadow, h.x + 0.06, h.y - 0.08, w, hh, h.rot, HAND_SHADOW_TINT);
    rotatedQuad(h.texture, h.x, h.y, w, hh, h.rot);
  }

  function drawCardMasks() {
    renderer.end();
    renderer.batcherShader = maskShader;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);
    for (const c of cards) {
      renderer.end();
      gl.stencilMask(c.bit);
      gl.stencilFunc(gl.ALWAYS, c.bit, 0xff);
      quad(tex.card_mask, c.x, c.y, MASK.w, MASK.h);
    }
    renderer.end();
    gl.stencilMask(0xff);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);
    renderer.batcherShader = satShader;
  }

  function layoutCamera() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const cam = renderer.camera;
    cam.setViewport(w, h);
    const vw = VIEW.maxX - VIEW.minX, vh = VIEW.maxY - VIEW.minY;
    cam.zoom = Math.max(vw / w, vh / h);
    cam.position.x = (VIEW.minX + VIEW.maxX) / 2;
    cam.position.y = (VIEW.minY + VIEW.maxY) / 2;
    cam.update();
    gl.viewport(0, 0, w, h);
  }

  function frame(now) {
    const dt = (last ? Math.min(0.1, (now - last) / 1000) : 0) * (window.__timeScale ?? 1);
    last = now;
    layoutCamera();
    update(dt);
    gl.clearColor(1, 1, 1, 1);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    renderer.begin();
    drawCardMasks();
    setSat(1);
    for (const s of slots) quad(tex.slot, s.x, s.y, SLOT.w, SLOT.h);
    const order = [...cards].sort((a, b) => a.z - b.z);
    for (const c of order) c.item ? drawItemOnTable(c) : drawLevelCard(c);
    if (!heroState.card) {
      setSat(1);
      withStencil(gl.NOTEQUAL, 0, 0xff, () => drawHeroSkeleton(0));
    }
    setSat(1);
    hand.forEach((h, i) => { if (i !== hoverHand) drawHandCard(h); });
    if (hoverHand >= 0) drawHandCard(hand[hoverHand]);
    if (flying) drawHandCard(flying);
    renderer.end();
    requestAnimationFrame(frame);
  }
})();
