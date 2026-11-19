(() => {
  const PPU = 630;
  const CARD_W = 1442 / PPU, CARD_H = 2229 / PPU;
  const SHADOW = { w: 313 / 120, h: 454 / 120, dx: 0.1, dy: -0.1 };
  const SLOT = { w: 372 / 150, h: 548 / 150 };
  const DESAT = 0.2, SAT_DURATION = 1;
  const HERO_SCALE = 1.079, HERO_SPINE_Y = -1.044, HERO_SPEED = 2;
  const TURN_PAUSE = 0.2, WALK_ACCEL = 0;
  const MASK = { w: 313 / 120, h: 454 / 120 };
  const SNAP_DIST = 1.6;
  const VIEW = { minX: -4.3, maxX: 4.3, minY: -3.8, maxY: 5.6 };
  const SLOT_STEP = 2.76;
  const CLICK_SLOP = 0.12;
  const MATCHES = [['start1', 'start2'], ['sword', 'start2']];

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
  const RAW = window.HYD_RAW || {};
  for (const k in RAW) assets.setRawDataURI(k, RAW[k]);
  assets.loadTextureAtlas('hero/Shadowclaw.atlas');
  assets.loadJson('hero/Shadowclaw.json');
  assets.loadTextureAtlas('sword/Shadowclaw.atlas');
  assets.loadJson('sword/tutorial_sword.json');

  const imgNames = ['card_start1', 'card_start2', 'card_sword', 'card_shadow', 'card_mask', 'slot', 'tutorial_level_stone_b', 'tutorial_level_stone_f'];
  const tex = {};
  const imgPromises = imgNames.map(n => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { tex[n] = pmaTexture(img); res(); };
    img.onerror = () => rej(new Error('Could not load image ' + n));
    img.src = RAW[n + '.png'] || 'assets/' + n + '.png';
  }));

  function pmaTexture(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const al = a[i + 3] / 255;
      a[i] = a[i] * al; a[i + 1] = a[i + 1] * al; a[i + 2] = a[i + 2] * al;
    }
    return new spine.GLTexture(ctx, d, true);
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

  const stats = { frames: 0, sim: 0 };
  let pending = null;
  let hero, sword, cards, slots, dragging = null, busy = false, zCounter = 0, last = 0;

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
    window.__hyd = { tex, renderer, gl, get cards() { return cards; }, heroState, stats, get hero() { return hero; }, get busy() { return busy; }, step: dt => update(dt) };
    document.getElementById('loading').hidden = true;
    hero = makeSkeleton('hero/Shadowclaw.atlas', 'hero/Shadowclaw.json');
    hero.stateData.defaultMix = 0.3;
    hero.stateData.setMix('basic/idle_simple', 'basic/walk_side', 0);
    hero.stateData.setMix('basic/idle_simple', 'basic/shrug', 0.3);
    sword = makeSkeleton('sword/Shadowclaw.atlas', 'sword/tutorial_sword.json');
    reset();
    document.getElementById('reset').addEventListener('click', reset);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(frame);
  }

  function reset() {
    slots = [-SLOT_STEP / 2, SLOT_STEP / 2].map(x => ({ x, y: -1.64, card: null }));
    const card = (id, img, x, z, extra) => Object.assign(
      { id, img, x, y: 2.55, slot: null, sat: DESAT, satFrom: DESAT, satTo: DESAT, satT: 1, z, tween: null }, extra);
    cards = [
      card('start1', 'card_start1', -2.6, 1, { anchor: { x: -0.383, y: 0.218 } }),
      card('start2', 'card_start2', 0, 2, { anchor: { x: -0.383, y: 0.248 } }),
      card('sword', 'card_sword', 2.6, 3, { anchor: { x: 0.10, y: 0.167, dir: -1, action: tryPullSword } }),
    ];
    zCounter = 4;
    dragging = null; pending = null; busy = false;
    heroState.card = cards[0];
    heroState.lx = -0.383; heroState.ly = 0.218;
    heroState.dir = 1; heroState.facing = 1; heroState.action = null;
    hero.state.clearTracks(); hero.skeleton.setToSetupPose();
    hero.state.setAnimation(0, 'basic/idle_simple', true);
    sword.state.clearTracks(); sword.skeleton.setToSetupPose();
    sword.state.setAnimation(0, 'tutorial_sword_static', true);
    setStatus('Drag cards into the slots, then click a neighbouring card or press ← / →');
  }

  const heroState = { card: null, lx: 0, ly: 0, x: 0, y: 0, dir: 1, facing: 1, action: null };

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

  function hitCard(p) {
    const sorted = [...cards].sort((a, b) => b.z - a.z);
    return sorted.find(c => Math.abs(p.x - c.x) <= CARD_W / 2 && Math.abs(p.y - c.y) <= CARD_H / 2);
  }

  function onDown(e) {
    if (busy) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const c = hitCard(p);
    if (!c) return;
    pending = { card: c, sx: p.x, sy: p.y, ox: p.x - c.x, oy: p.y - c.y };
  }

  function startDrag(pd) {
    const c = pd.card;
    c.tween = null;
    if (c.slot !== null) {
      slots[c.slot].card = null;
      c.slot = null;
      tweenSat(c, DESAT);
    }
    c.z = ++zCounter;
    dragging = { card: c, ox: pd.ox, oy: pd.oy };
    canvas.style.cursor = 'grabbing';
  }

  function onMove(e) {
    const p = screenToWorld(e.clientX, e.clientY);
    if (pending && !dragging && Math.hypot(p.x - pending.sx, p.y - pending.sy) > CLICK_SLOP) {
      startDrag(pending);
    }
    if (!dragging) {
      if (!busy && !pending) {
        const c = hitCard(p);
        canvas.style.cursor = c ? (c !== heroState.card && c.slot !== null ? 'pointer' : 'grab') : 'default';
      }
      return;
    }
    dragging.card.x = p.x - dragging.ox;
    dragging.card.y = p.y - dragging.oy;
  }

  function onUp() {
    const pd = pending;
    pending = null;
    if (!dragging) {
      if (pd) clickCard(pd.card);
      return;
    }
    const c = dragging.card;
    dragging = null;
    canvas.style.cursor = 'default';
    let best = -1, bestD = SNAP_DIST;
    slots.forEach((s, i) => {
      if (s.card) return;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return;
    slots[best].card = c;
    c.slot = best;
    moveCardTo(c, slots[best].x, slots[best].y, 0.18, () => tweenSat(c, 1));
  }

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!busy && !dragging) tryMove(e.key === 'ArrowRight' ? 1 : -1);
    }
  }

  function clickCard(c) {
    if (busy || c === heroState.card) return;
    const from = heroState.card;
    if (from.slot !== null && c.slot !== null && Math.abs(c.slot - from.slot) === 1) {
      tryMove(c.slot - from.slot);
    } else {
      shrug(c.x > heroState.x ? 1 : -1);
    }
  }

  function cardsMatch(from, to, dir) {
    const pair = dir > 0 ? [from.id, to.id] : [to.id, from.id];
    return MATCHES.some(m => m[0] === pair[0] && m[1] === pair[1]);
  }

  function tryMove(dir) {
    const from = heroState.card;
    const slot = from.slot === null ? null : slots[from.slot + dir];
    const to = slot && slot.card && !slot.card.tween ? slot.card : null;
    if (to && cardsMatch(from, to, dir)) startWalk(from, to);
    else shrug(dir);
  }

  function shrug(dir) {
    busy = true;
    setStatus('These cards don\u2019t connect');
    turnTo(dir, () => {
      const tr = hero.state.setAnimation(0, 'basic/shrug', false);
      hero.state.addAnimation(0, 'basic/idle_simple', true, 0);
      tr.listener = { complete: () => { busy = false; } };
    });
  }

  function startWalk(from, to) {
    busy = true;
    const sx = from.x + heroState.lx, sy = from.y + heroState.ly;
    const tx = to.x + to.anchor.x, ty = to.y + to.anchor.y;
    heroState.card = null;
    heroState.x = sx; heroState.y = sy;
    setStatus(to.id === 'sword' ? 'Shadowclaw heads for the sword…' : 'Shadowclaw walks over…');
    turnTo(tx > sx ? 1 : -1, () => beginWalk(sx, sy, tx, ty, to));
  }

  function turnTo(dir, then) {
    if (heroState.facing === dir) { then(); return; }
    heroState.facing = dir;
    heroState.dir = dir;
    heroState.action = { type: 'turn', t: 0, d: TURN_PAUSE, then };
  }

  function beginWalk(sx, sy, tx, ty, to) {
    const dist = Math.abs(tx - sx);
    const d = dist / HERO_SPEED + WALK_ACCEL;
    heroState.action = { type: 'walk', sx, sy, tx, ty, dist, t: 0, d, to };
    hero.state.setAnimation(0, 'basic/walk_side', true);
  }

  function walkDistance(t, d, dist) {
    const a = WALK_ACCEL, v = HERO_SPEED;
    if (t <= 0) return 0;
    if (t >= d) return dist;
    if (a <= 0) return v * t;
    if (t < a) return v * t * t / (2 * a);
    if (t > d - a) return dist - v * (d - t) * (d - t) / (2 * a);
    return v * (t - a / 2);
  }

  function arrive(w) {
    heroState.action = null;
    heroState.card = w.to;
    heroState.lx = w.to.anchor.x; heroState.ly = w.to.anchor.y;
    w.to.z = ++zCounter;
    const anchor = w.to.anchor;
    if (!anchor.action) {
      hero.state.setAnimation(0, 'basic/idle_simple', true);
      busy = false;
      setStatus('Click a neighbouring card or press ← / →');
      return;
    }
    if (heroState.facing !== anchor.dir) {
      hero.state.setAnimation(0, 'basic/idle_simple', true);
    }
    turnTo(anchor.dir, anchor.action);
  }

  function tryPullSword() {
    const tr = hero.state.setAnimation(0, 'levels/tutorial/tutorial_sword_try', false);
    hero.state.addAnimation(0, 'basic/idle_simple', true, 0);
    sword.state.setAnimation(0, 'tutorial_sword_try', false);
    sword.state.addAnimation(0, 'tutorial_sword_static', true, 0);
    setStatus('The sword won’t budge…');
    tr.listener = { complete: () => { busy = false; setStatus('Stuck fast. Shadowclaw shrugs.'); } };
  }

  function updateHeroAction(dt) {
    const a = heroState.action;
    if (!a) return;
    a.t += dt;
    if (a.type === 'turn') {
      if (a.t >= a.d) { heroState.action = null; a.then(); }
    } else if (a.type === 'walk') {
      const s = walkDistance(a.t, a.d, a.dist);
      const k = a.dist > 0 ? s / a.dist : 1;
      heroState.x = a.sx + (a.tx - a.sx) * k;
      heroState.y = a.sy + (a.ty - a.sy) * k;
      if (a.t >= a.d) arrive(a);
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
    }
    updateHeroAction(dt);
    if (heroState.card) {
      heroState.x = heroState.card.x + heroState.lx;
      heroState.y = heroState.card.y + heroState.ly;
    }
    hero.state.update(dt); hero.state.apply(hero.skeleton);
    hero.skeleton.x = heroState.x;
    hero.skeleton.y = heroState.y + HERO_SPINE_Y * HERO_SCALE;
    hero.skeleton.scaleX = HERO_SCALE * heroState.dir;
    hero.skeleton.scaleY = HERO_SCALE;
    hero.skeleton.updateWorldTransform();

    const sc = cardById('sword');
    sword.state.update(dt); sword.state.apply(sword.skeleton);
    sword.skeleton.x = sc.x + 0.125;
    sword.skeleton.y = sc.y - 0.95;
    sword.skeleton.scaleX = -1.079;
    sword.skeleton.scaleY = 1.079;
    sword.skeleton.updateWorldTransform();
  }

  function pmaBlend() {
    renderer.batcher.setBlendMode(spine.BlendMode.Normal, true);
  }

  const SHADOW_TINT = new spine.Color(0.678 * 0.333, 0.431 * 0.333, 0.298 * 0.333, 0.333);

  function quad(t, cx, cy, w, h, color) {
    pmaBlend();
    renderer.drawTexture(t, cx - w / 2, cy - h / 2, w, h, color);
  }

  function drawCard(c) {
    setSat(c.sat);
    quad(tex.card_shadow, c.x + SHADOW.dx, c.y + SHADOW.dy, SHADOW.w, SHADOW.h, SHADOW_TINT);
    quad(tex[c.img], c.x, c.y, CARD_W, CARD_H);
    if (c.id === 'sword') {
      quad(tex.tutorial_level_stone_b, c.x - 0.413, c.y - 0.816, 389 / PPU, 303 / PPU);
      renderer.drawSkeleton(sword.skeleton, true);
      quad(tex.tutorial_level_stone_f, c.x - 0.439, c.y - 0.829, 360 / PPU, 285 / PPU);
    }
    if (heroState.card === c) drawHero();
  }

  function drawCardMasks() {
    renderer.end();
    renderer.batcherShader = maskShader;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);
    for (const c of cards) quad(tex.card_mask, c.x, c.y, MASK.w, MASK.h);
    renderer.end();
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);
    renderer.batcherShader = satShader;
  }

  function drawHero() {
    setSat(1);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    renderer.drawSkeleton(hero.skeleton, true);
    renderer.end();
    gl.disable(gl.STENCIL_TEST);
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
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    stats.frames++; stats.sim += dt;
    update(dt);
    layoutCamera();
    gl.clearColor(1, 1, 1, 1);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    renderer.begin();
    drawCardMasks();
    setSat(1);
    for (const s of slots) quad(tex.slot, s.x, s.y, SLOT.w, SLOT.h);
    const order = [...cards].sort((a, b) => a.z - b.z);
    for (const c of order) drawCard(c);
    if (!heroState.card) drawHero();
    renderer.end();
    requestAnimationFrame(frame);
  }
})();
