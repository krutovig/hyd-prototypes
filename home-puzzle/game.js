(() => {
  const SK = 0.0015;
  const FRAME = { w: 313 / 120, h: 454 / 120 };
  const CARD_HIT = { w: 2.34, h: 3.56 };
  const SHADOW = { w: 313 / 120, h: 454 / 120, dx: 0.1, dy: -0.1 };
  const SLOT = { w: 372 / 150, h: 548 / 150 };
  const DESAT = 0.2, SAT_DURATION = 1;
  const HERO_SCALE = 1, HERO_SPINE_Y = -1.044, HERO_ROOT_Y = -0.229, HERO_SPEED = 2;
  const HERO_ORDER = 50;
  const TURN_PAUSE = 0.2;
  const SNAP_DIST = 1.6;
  const VIEW = { minX: -4.5, maxX: 4.5, minY: -4.5, maxY: 5.9 };
  const SLOT_STEP = 2.93, SLOT_Y = -2.25, FREE_Y = 1.95;
  const CLICK_SLOP = 0.12;
  const MATCHES = [['home1', 'home2'], ['home1', 'home3']];
  const TAIL_X = -0.62;
  const BARREL_K = 1442 * 0.0015 / 1009;

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
  const SKELS = {
    hero: ['hero/Shadowclaw.atlas', 'hero/Shadowclaw.json', 0.002],
    h1bg: ['house01/Whiskerwick.atlas', 'house01/Whiskerwick_House01_bg.json', SK],
    h1fg: ['house01/Whiskerwick.atlas', 'house01/Whiskerwick_House01_foreg.json', SK],
    h2bg: ['house02/Whiskerwick.atlas', 'house02/Whiskerwick_House02_bg.json', SK],
    h2table: ['house02/Whiskerwick.atlas', 'house02/Whiskerwick_House02_table.json', SK],
    h2fg: ['house02/Whiskerwick.atlas', 'house02/Whiskerwick_House02_foreg.json', SK],
    h3bg: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_bg.json', SK],
    bird: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_bird.json', SK],
    fire: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_fireplace_fire.json', SK],
    pan: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_fireplace_pan.json', SK],
    goldberg: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_goldberg.json', SK],
    door: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_door.json', SK],
    h3fg: ['house03/Whiskerwick.atlas', 'house03/Whiskerwick_House03_foreg.json', SK],
    cat: ['cat/Whiskerwick.atlas', 'cat/Whiskerwick_cat.json', SK],
  };
  for (const k in SKELS) {
    if (!assets.get(SKELS[k][0])) assets.loadTextureAtlas(SKELS[k][0]);
    assets.loadJson(SKELS[k][1]);
  }

  const imgNames = ['card_frame', 'mask', 'card_shadow', 'slot', 'home01_pan', 'home02_egg', 'home03_matches', 'flare'];
  const STRAIGHT_ALPHA = new Set(['house01', 'house02', 'house03', 'cat']);
  const tex = {};
  const imgPromises = imgNames.map(n => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { tex[n] = { t: pmaTexture(img), w: img.naturalWidth, h: img.naturalHeight }; res(); };
    img.onerror = () => rej(new Error('Could not load image ' + n));
    img.src = RAW[n + '.png'] || 'assets/' + n + '.png';
  }));

  function pmaTexture(src) {
    let c = src;
    if (!(src instanceof HTMLCanvasElement)) {
      c = document.createElement('canvas');
      c.width = src.naturalWidth; c.height = src.naturalHeight;
      c.getContext('2d').drawImage(src, 0, 0);
    }
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const al = a[i + 3] / 255;
      a[i] = a[i] * al; a[i + 1] = a[i + 1] * al; a[i + 2] = a[i + 2] * al;
    }
    return new spine.GLTexture(ctx, d, true);
  }

  function makeBarrelTexture() {
    const atlas = assets.require('house01/Whiskerwick.atlas');
    const img = atlas.pages[0].texture.getImage();
    const CX = 290, TOP = 1468, BOT = 1800, HW = 146;
    const W = HW * 2 + 20, Hh = BOT - TOP + 20;
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const cx = W / 2, top = 10, bot = Hh - 10;
    const path = () => {
      g.beginPath();
      g.moveTo(cx - 133, top + 36);
      g.bezierCurveTo(cx - 133, top + 4, cx + 133, top + 4, cx + 133, top + 36);
      g.bezierCurveTo(cx + 152, top + 120, cx + 152, bot - 120, cx + 126, bot - 26);
      g.bezierCurveTo(cx + 126, bot + 4, cx - 126, bot + 4, cx - 126, bot - 26);
      g.bezierCurveTo(cx - 152, bot - 120, cx - 152, top + 120, cx - 133, top + 36);
      g.closePath();
    };
    g.save(); path(); g.clip();
    g.drawImage(img, CX, TOP - 10, HW + 10, Hh, cx, 0, HW + 10, Hh);
    g.translate(cx * 2, 0); g.scale(-1, 1);
    g.beginPath(); g.rect(cx, 0, cx, Hh); g.clip();
    g.drawImage(img, CX, TOP - 10, HW + 10, Hh, cx, 0, HW + 10, Hh);
    g.restore();
    g.lineWidth = 7; g.strokeStyle = '#4b2416'; g.lineJoin = 'round';
    path(); g.stroke();
    return { t: pmaTexture(c), w: W, h: Hh };
  }

  function makeSkeleton(key) {
    const [atlasPath, jsonPath, scale] = SKELS[key];
    const atlas = assets.require(atlasPath);
    const json = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
    json.scale = scale;
    const data = json.readSkeletonData(assets.require(jsonPath));
    const skeleton = new spine.Skeleton(data);
    skeleton.setToSetupPose();
    const stateData = new spine.AnimationStateData(data);
    const state = new spine.AnimationState(stateData);
    return { key, skeleton, state, stateData, hide: null, ox: 0, oy: 0, straight: STRAIGHT_ALPHA.has(atlasPath.split('/')[0]) };
  }

  function play(sk, anim, loop, then) {
    const tr = sk.state.setAnimation(0, anim, !!loop);
    if (then) tr.listener = { complete: () => { tr.listener = null; then(); } };
    return tr;
  }

  const stats = { frames: 0, sim: 0 };
  let pending = null, dragging = null, busy = false, zCounter = 0, last = 0, simTime = 0;
  let sk = {}, cards, slots, items, timers = [], barrelTex;
  let flags;
  const inv = { slots: [], items: [], selected: null };

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

  function after(sec, fn) { timers.push({ at: simTime + sec, fn }); }

  function init() {
    window.__hyd = {
      tex, renderer, gl, stats, sk: () => sk, get cards() { return cards; }, heroState, get busy() { return busy; },
      get flags() { return flags; }, inv, step: dt => update(dt), render: () => render(), clickAt, useOnFire, addToInventory, cardById, slots: () => slots, attachOffset, items: () => items,
    };
    document.getElementById('loading').hidden = true;
    barrelTex = makeBarrelTexture();
    buildInventory();
    reset();
    document.getElementById('reset').addEventListener('click', reset);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layoutInventory);
    requestAnimationFrame(frame);
  }

  function attachOffset(animName, time, slotName) {
    const h = makeSkeleton('hero');
    const a = h.skeleton.data.findAnimation(animName);
    h.skeleton.setToSetupPose();
    a.apply(h.skeleton, 0, time, false, null, 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
    h.skeleton.updateWorldTransform();
    const b = attBounds(h.skeleton.findSlot(slotName));
    return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  function attBounds(slot) {
    const att = slot && slot.getAttachment();
    if (!att || !att.computeWorldVertices) return null;
    let v;
    if (att instanceof spine.RegionAttachment) { v = new Float32Array(8); att.computeWorldVertices(slot, v, 0, 2); }
    else { v = new Float32Array(att.worldVerticesLength); att.computeWorldVertices(slot, 0, att.worldVerticesLength, v, 0, 2); }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function rootFor(spriteX, off, nearX) {
    const a = spriteX - off.x, b = spriteX + off.x;
    return Math.abs(a - nearX) <= Math.abs(b - nearX) ? { x: a, dir: 1 } : { x: b, dir: -1 };
  }

  function reset() {
    timers = []; busy = false; dragging = null; pending = null;
    flags = { egg: false, pan: false, matches: false, panIn: false, matchesIn: false, goldberg: false, keyOut: false, key: false };
    for (const k in SKELS) sk[k] = makeSkeleton(k);
    const hero = sk.hero;
    hero.stateData.defaultMix = 0.3;
    hero.stateData.setMix('basic/idle_simple', 'basic/walk_side', 0);
    play(hero, 'basic/idle_simple', true);
    sk.h1bg.hide = n => n.includes('hammock') || n.includes('wakeup') || n === 'lib/shadowclaw';
    play(sk.h1bg, 'static'); play(sk.h1fg, 'static');
    play(sk.h2bg, 'static'); play(sk.h2table, 'static'); play(sk.h2fg, 'static');
    play(sk.h3bg, 'static'); play(sk.bird, 'static_sleep'); play(sk.fire, 'wood');
    play(sk.pan, 'static'); play(sk.goldberg, 'static_before'); play(sk.door, 'static');
    play(sk.h3fg, 'static'); play(sk.cat, 'calm_idle', true);
    sk.cat.ox = 0.225; sk.cat.oy = 0.026;

    slots = [-SLOT_STEP, 0, SLOT_STEP].map(x => ({ x, y: SLOT_Y, card: null }));
    const card = (id, x, y, layers, extra) => Object.assign(
      { id, x, y, slot: null, sat: DESAT, satFrom: DESAT, satTo: DESAT, satT: 1, z: ++zCounter, tween: null, layers }, extra);
    const flare = (x, y, scale, order, visible) =>
      ({ flare: { t: 0, wait: Math.random() * 1.5 }, x, y, w: tex.flare.w / 500 * scale, h: tex.flare.h / 500 * scale, order, visible });
    const sprite = (name, x, y, ppu, order, visible, scale = 1) =>
      ({ sprite: tex[name], x, y, w: tex[name].w / ppu * scale, h: tex[name].h / ppu * scale, order, visible });
    cards = [
      card('home1', -SLOT_STEP, FREE_Y, [
        { skel: sk.h1bg, order: 5 },
        sprite('home01_pan', -0.368, -0.491, 520, 45, () => !flags.pan),
        flare(-0.58, -0.428, 0.326, 46, () => !flags.pan),
        { skel: sk.h1fg, order: 65 },
      ], { entryX: 0.25 }),
      card('home2', 0, FREE_Y, [
        { skel: sk.h2bg, order: 5 },
        { skel: sk.h2table, order: 15 },
        sprite('home02_egg', 0.447 - 0.557, -0.128, 665, 45, () => !flags.egg, 0.995),
        flare(0.447 - 0.509, -0.138, 0.258, 50, () => !flags.egg),
        { sprite: barrelTex, x: 0.84, y: -0.8, w: barrelTex.w * BARREL_K, h: barrelTex.h * BARREL_K, order: 91 },
        { sprite: barrelTex, x: 0.6, y: -1.0, w: barrelTex.w * BARREL_K * 1.1, h: barrelTex.h * BARREL_K * 1.1, order: 92 },
        { skel: sk.h2fg, order: 90 },
      ], { entryX: -0.5 }),
      card('home3', SLOT_STEP, FREE_Y, [
        { skel: sk.h3bg, order: 5 },
        sprite('home03_matches', -0.377 + 0.313, 0.144 + 0.317, 520, 6, () => !flags.matches),
        flare(-0.377 + 0.321, 0.144 + 0.332, 0.365, 7, () => !flags.matches),
        flare(-0.377 - 0.291, 0.144 - 1.006, 0.365, 17, () => flags.keyOut && !flags.key),
        { skel: sk.bird, order: 15 },
        { skel: sk.door, order: 20 },
        { skel: sk.fire, order: 25 },
        { skel: sk.pan, order: 30 },
        { skel: sk.goldberg, order: 35 },
        { skel: sk.cat, order: 40 },
        { skel: sk.h3fg, order: 90 },
      ], { entryX: -0.517 }),
    ];
    const h2 = cards[1];
    h2.slot = 1; slots[1].card = h2; h2.x = slots[1].x; h2.y = slots[1].y; h2.sat = h2.satTo = 1;
    h2.z = ++zCounter;

    const offEgg = attachOffset('levels/whiskerwick/collect_egg', 0.84, 'lib/levels/whiskerwick/home02_egg');
    const offPan = attachOffset('levels/whiskerwick/collect_pan', 0.68, 'lib/levels/whiskerwick/home01_pan');
    const offMatches = attachOffset('levels/whiskerwick/collect_matches', 1.04, 'lib/levels/whiskerwick/home03_matches');
    const offKey = attachOffset('levels/whiskerwick/collect_key', 0.41, 'lib/levels/whiskerwick/home02_key2_hand2');
    window.__hyd.offsets = { offEgg, offPan, offMatches, offKey };

    const L = (id, i) => cards.find(c => c.id === id).layers[i];
    const eggL = L('home2', 2), panL = L('home1', 1), matchesL = L('home3', 1);
    items = [
      { id: 'Egg', card: cardById('home2'), rect: rectOf(eggL, 0.08), visible: () => !flags.egg,
        anim: 'levels/whiskerwick/collect_egg', show: 0.83, stand: rootFor(eggL.x, offEgg, 0.344), take: () => { flags.egg = true; } },
      { id: 'Pan', card: cardById('home1'), rect: rectOf(panL, 0.08), visible: () => !flags.pan,
        anim: 'levels/whiskerwick/collect_pan', show: 0.67, stand: rootFor(panL.x, offPan, 0.361), take: () => { flags.pan = true; } },
      { id: 'Matches', card: cardById('home3'), rect: rectOf(matchesL, 0.12), visible: () => !flags.matches,
        anim: 'levels/whiskerwick/collect_matches', show: 1.03, stand: rootFor(matchesL.x, offMatches, -0.124), take: () => { flags.matches = true; } },
      { id: 'HomeKey', card: cardById('home3'), rect: null, visible: () => flags.keyOut && !flags.key,
        anim: 'levels/whiskerwick/collect_key', show: 0.4, stand: null, take: () => { flags.key = true; play(sk.bird, 'collect_key'); } },
    ];

    heroState.card = h2;
    heroState.lx = h2.entryX; heroState.ly = HERO_ROOT_Y;
    heroState.dir = 1; heroState.facing = 1; heroState.action = null;
    clearInventory();
    setStatus('Drag cards into the slots. Click items to pick them up, click a neighbouring card or press ← / → to walk');
  }

  function rectOf(l, pad) {
    return { x: l.x - l.w / 2 - pad, y: l.y - l.h / 2 - pad, w: l.w + pad * 2, h: l.h + pad * 2 };
  }

  const heroState = { card: null, lx: 0, ly: 0, x: 0, y: 0, dir: 1, facing: 1, action: null };

  function setStatus(t) { statusEl.textContent = t; }
  function cardById(id) { return cards.find(c => c.id === id); }

  function tweenSat(card, to) { card.satFrom = card.sat; card.satTo = to; card.satT = 0; }

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
    return sorted.find(c => Math.abs(p.x - c.x) <= CARD_HIT.w / 2 && Math.abs(p.y - c.y) <= CARD_HIT.h / 2);
  }

  function inRect(p, c, r) {
    const x = p.x - c.x, y = p.y - c.y;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function keyRect() {
    const b = slotBounds(sk.bird, 'lib/house/03/bird_turn/key');
    return b ? { x: b.x - 0.12, y: b.y - 0.12, w: b.w + 0.24, h: b.h + 0.24 } : null;
  }

  function slotBounds(s, slotName) {
    const b = attBounds(s.skeleton.findSlot(slotName));
    const c = cardById('home3');
    return b && { x: b.x - c.x, y: b.y - c.y, w: b.w, h: b.h };
  }

  const FIRE_RECT = { x: -1.02, y: -0.98, w: 0.82, h: 0.95 };

  function hitItem(p, c) {
    for (const it of items) {
      if (it.card !== c || !it.visible()) continue;
      const r = it.id === 'HomeKey' ? keyRect() : it.rect;
      if (r && inRect(p, c, r)) return it;
    }
    return null;
  }

  function hitFire(p) {
    const c = cardById('home3');
    return hitCard(p) === c && inRect(p, c, FIRE_RECT);
  }

  function onDown(e) {
    if (inv.selected) return;
    if (busy) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const c = hitCard(p);
    if (!c) return;
    pending = { card: c, p, sx: p.x, sy: p.y, ox: p.x - c.x, oy: p.y - c.y };
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
    if (inv.selected) { followCursor(e); return; }
    const p = screenToWorld(e.clientX, e.clientY);
    if (pending && !dragging && Math.hypot(p.x - pending.sx, p.y - pending.sy) > CLICK_SLOP) startDrag(pending);
    if (!dragging) {
      if (!busy && !pending) {
        const c = hitCard(p);
        let cur = 'default';
        if (c) cur = hitItem(p, c) || (c !== heroState.card && c.slot !== null) ? 'pointer' : 'grab';
        canvas.style.cursor = cur;
      }
      return;
    }
    dragging.card.x = p.x - dragging.ox;
    dragging.card.y = p.y - dragging.oy;
  }

  function onUp(e) {
    const pd = pending;
    pending = null;
    if (!dragging) {
      if (pd) clickAt(pd.p, pd.card);
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
      if (!busy && !dragging && !inv.selected) tryMove(e.key === 'ArrowRight' ? 1 : -1);
    }
    if (e.key === 'Escape' && inv.selected) deselect();
  }

  function clickAt(p, c) {
    if (busy) return;
    const it = hitItem(p, c);
    if (it) { collect(it); return; }
    if (c === heroState.card) return;
    const from = heroState.card;
    if (from.slot !== null && c.slot !== null && Math.abs(c.slot - from.slot) === 1) tryMove(c.slot - from.slot);
    else shrug(c.x > heroState.x ? 1 : -1);
  }

  function cardsMatch(from, to, dir) {
    const pair = dir > 0 ? [from.id, to.id] : [to.id, from.id];
    return MATCHES.some(m => m[0] === pair[0] && m[1] === pair[1]);
  }

  function neighbour(dir) {
    const from = heroState.card;
    const slot = from.slot === null ? null : slots[from.slot + dir];
    return slot && slot.card && !slot.card.tween ? slot.card : null;
  }

  function tryMove(dir) {
    const to = neighbour(dir);
    if (to && cardsMatch(heroState.card, to, dir)) {
      busy = true;
      setStatus('Shadowclaw walks over…');
      goTo(to, to.entryX, null, () => { busy = false; setStatus('Click items to pick them up, click a neighbouring card or press \u2190 / \u2192 to walk'); });
    } else shrug(dir, dir > 0 && heroState.card.id === 'home2' ? 'Barrels block the way' : null);
  }

  function shrug(dir, text) {
    busy = true;
    setStatus(text || 'These cards don’t connect');
    turnTo(dir, () => {
      play(sk.hero, 'basic/shrug', false, () => { busy = false; });
      sk.hero.state.addAnimation(0, 'basic/idle_simple', true, 0);
    });
  }

  function reachable(card) {
    const from = heroState.card;
    if (!from) return false;
    if (card === from) return from.slot !== null;
    if (from.slot === null || card.slot === null || Math.abs(card.slot - from.slot) !== 1) return false;
    const dir = card.slot - from.slot;
    return cardsMatch(from, card, dir);
  }

  function goTo(card, lx, faceDir, then) {
    const from = heroState.card;
    const sx = from.x + heroState.lx, sy = from.y + heroState.ly;
    const tx = card.x + lx, ty = card.y + HERO_ROOT_Y;
    heroState.card = null;
    heroState.x = sx; heroState.y = sy;
    const done = () => {
      heroState.card = card; heroState.lx = heroState.x - card.x; heroState.ly = HERO_ROOT_Y;
      card.z = Math.max(card.z, ++zCounter);
      play(sk.hero, 'basic/idle_simple', true);
      if (faceDir) turnTo(faceDir, then); else then();
    };
    if (Math.abs(tx - sx) < 0.01) { heroState.x = tx; heroState.y = ty; done(); return; }
    turnTo(tx > sx ? 1 : -1, () => {
      heroState.action = { type: 'walk', sx, sy, tx, ty, dist: Math.abs(tx - sx), t: 0, to: card, done };
      play(sk.hero, 'basic/walk_side', true);
    });
  }

  function turnTo(dir, then) {
    if (heroState.facing === dir) { then(); return; }
    heroState.facing = dir;
    heroState.dir = dir;
    heroState.action = { type: 'turn', t: 0, d: TURN_PAUSE, then };
  }

  function collect(it) {
    if (!reachable(it.card)) { shrug(it.card.x > heroState.x ? 1 : -1, 'Can’t reach that from here'); return; }
    busy = true;
    let stand = it.stand;
    if (it.id === 'HomeKey') {
      const r = keyRect();
      stand = rootFor(r.x + r.w / 2, window.__hyd.offsets.offKey, -0.047);
    }
    setStatus('Shadowclaw goes for the ' + niceName(it.id) + '…');
    goTo(it.card, stand.x, stand.dir, () => {
      play(sk.hero, it.anim, false, () => {
        play(sk.hero, 'basic/idle_simple', true);
        addToInventory(it.id);
        busy = false;
        setStatus(collectedText(it.id));
      });
      after(it.show, () => it.take());
    });
  }

  function niceName(id) { return { Egg: 'egg', Pan: 'pan', Matches: 'matches', HomeKey: 'key' }[id]; }

  function collectedText(id) {
    if (id === 'HomeKey') return 'Got the house key! Puzzle solved.';
    return 'Picked up the ' + niceName(id) + '.';
  }

  function updateCatTail() {
    const a = heroState.action;
    if (flags.goldberg || !a || a.type !== 'walk' || a.to.id !== 'home3') return;
    const c = a.to;
    if (a.tx - c.x > TAIL_X && heroState.x - c.x >= TAIL_X - 0.02 && a.sx - c.x < TAIL_X) {
      heroState.x = c.x + TAIL_X;
      heroState.action = null;
      heroState.card = c; heroState.lx = TAIL_X; heroState.ly = HERO_ROOT_Y;
      runGoldberg();
    }
  }

  function runGoldberg() {
    flags.goldberg = true;
    busy = true;
    setStatus('Oops… the cat’s tail!');
    play(sk.hero, 'levels/whiskerwick/goldberg_slow', false, () => {
      play(sk.hero, 'basic/idle_simple', true);
      busy = false;
      setStatus('The bird swallowed the house key. Maybe scare it with something?');
    });
    play(sk.cat, 'goldberg');
    play(sk.door, 'goldberg');
    play(sk.bird, 'goldberg_slow');
    play(sk.goldberg, 'goldberg_slow', false, () => play(sk.goldberg, 'static_after'));
    play(sk.h2table, 'goldberg', false, () => play(sk.h2table, 'after_goldberg'));
  }

  const USES = {
    Pan: { x: 0.113, ok: () => !flags.panIn },
    Matches: { x: -0.09, ok: () => !flags.matchesIn },
    Egg: { x: -0.126, ok: () => flags.panIn && flags.matchesIn },
  };

  function useOnFire(id) {
    const u = USES[id];
    const home3 = cardById('home3');
    if (!u || !reachable(home3)) {
      deselect();
      shrug(home3.x > heroState.x ? 1 : -1, u ? 'Can’t reach the fireplace from here' : 'That won’t help');
      return;
    }
    if (!u.ok()) {
      deselect();
      shrug(-1, id === 'Egg' ? 'Raw egg in a cold fireplace? Nothing happens.' : 'Already done');
      return;
    }
    consume(id);
    busy = true;
    goTo(home3, u.x, id === 'Egg' ? 1 : -1, () => {
      if (id === 'Pan') {
        play(sk.hero, 'levels/whiskerwick/use_pan', false, () => {
          play(sk.hero, 'basic/idle_simple', true); busy = false; setStatus('The pan is on the fire stand.');
        });
        play(sk.pan, 'insert_pan', false, () => play(sk.pan, 'pan'));
        after(1, () => play(sk.bird, 'open_eye'));
        flags.panIn = true;
      } else if (id === 'Matches') {
        play(sk.hero, 'levels/whiskerwick/use_matches', false, () => {
          play(sk.hero, 'basic/idle_simple', true); busy = false; setStatus('The fire is burning.');
        });
        play(sk.bird, 'open_eyes');
        play(sk.fire, 'matches', false, () => play(sk.fire, 'idle', true));
        flags.matchesIn = true;
      } else {
        setStatus('Frying an egg in front of a bird…');
        play(sk.hero, 'levels/whiskerwick/use_egg', false, () => play(sk.hero, 'basic/idle_simple', true));
        play(sk.bird, 'return_key', false, () => {
          play(sk.bird, 'return_key_static');
          flags.keyOut = true;
          busy = false;
          setStatus('The scared bird dropped the key. Pick it up!');
        });
      }
    });
  }

  function updateHeroAction(dt) {
    const a = heroState.action;
    if (!a) return;
    a.t += dt;
    if (a.type === 'turn') {
      if (a.t >= a.d) { heroState.action = null; a.then(); }
    } else if (a.type === 'walk') {
      const s = Math.min(a.dist, HERO_SPEED * a.t);
      const k = a.dist > 0 ? s / a.dist : 1;
      heroState.x = a.sx + (a.tx - a.sx) * k;
      heroState.y = a.sy + (a.ty - a.sy) * k;
      updateCatTail();
      if (heroState.action === a && s >= a.dist) { heroState.action = null; a.done(); }
    }
  }

  function updateSkel(s, x, y, sx = 1, sy = 1) {
    s.state.update(lastDt); s.state.apply(s.skeleton);
    if (s.hide) for (const slot of s.skeleton.slots) if (s.hide(slot.data.name)) slot.attachment = null;
    s.skeleton.x = x + s.ox; s.skeleton.y = y + s.oy;
    s.skeleton.scaleX = sx; s.skeleton.scaleY = sy;
    s.skeleton.updateWorldTransform();
  }

  let lastDt = 0;
  function update(dt) {
    lastDt = dt;
    simTime += dt;
    const due = timers.filter(t => t.at <= simTime);
    timers = timers.filter(t => t.at > simTime);
    due.forEach(t => t.fn());
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
      for (const l of c.layers) {
        if (l.skel) updateSkel(l.skel, c.x, c.y);
        if (l.flare) updateFlare(c, l.flare, dt);
      }
    }
    updateHeroAction(dt);
    if (heroState.card) {
      heroState.x = heroState.card.x + heroState.lx;
      heroState.y = heroState.card.y + heroState.ly;
    }
    updateSkel(sk.hero, heroState.x, heroState.y + HERO_SPINE_Y * HERO_SCALE, HERO_SCALE * heroState.dir, HERO_SCALE);
    updateInventoryHover();
  }

  function pmaBlend() { renderer.batcher.setBlendMode(spine.BlendMode.Normal, true); }

  const SHADOW_TINT = new spine.Color(0.678 * 0.333, 0.431 * 0.333, 0.298 * 0.333, 0.333);

  function quad(t, cx, cy, w, h, color) {
    pmaBlend();
    renderer.drawTexture(t, cx - w / 2, cy - h / 2, w, h, color);
  }

  function stencilFor(bit) {
    renderer.end();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0);
    gl.stencilFunc(gl.EQUAL, bit, bit);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }

  function noStencil() { renderer.end(); gl.disable(gl.STENCIL_TEST); }

  function drawCard(c, bit) {
    setSat(c.sat);
    noStencil();
    quad(tex.card_shadow.t, c.x + SHADOW.dx, c.y + SHADOW.dy, SHADOW.w, SHADOW.h, SHADOW_TINT);
    stencilFor(bit);
    const layers = [...c.layers];
    if (heroState.card === c) layers.push({ hero: true, order: HERO_ORDER });
    layers.sort((a, b) => a.order - b.order);
    for (const l of layers) {
      if (l.hero) { setSat(1); renderer.drawSkeleton(sk.hero.skeleton, true); setSat(c.sat); stencilFor(bit); continue; }
      if (l.visible && !l.visible()) continue;
      if (l.skel) renderer.drawSkeleton(l.skel.skeleton, !l.skel.straight);
      else if (l.flare) drawFlare(c, l);
      else quad(l.sprite.t, c.x + l.x, c.y + l.y, l.w, l.h);
    }
    noStencil();
    quad(tex.card_frame.t, c.x, c.y, FRAME.w, FRAME.h);
    renderer.end();
  }

  function drawFlare(c, l) {
    const s = flareScale(l.flare);
    if (s <= 0.001) return;
    pmaBlend();
    const w = l.w * s, h = l.h * s;
    renderer.drawTextureRotated(tex.flare.t, c.x + l.x - w / 2, c.y + l.y - h / 2, w, h, w / 2, h / 2, -flareAngle(l.flare));
  }

  const FLARE_ANIM = 1.4, FLARE_SCALE = 0.5;
  const outQuad = k => 1 - (1 - k) * (1 - k);

  function flareScale(f) {
    if (f.wait > 0) return 0;
    if (f.t < FLARE_SCALE) return outQuad(f.t / FLARE_SCALE);
    const back = FLARE_ANIM - FLARE_SCALE;
    if (f.t < back) return 1;
    return 1 - outQuad(Math.min(1, (f.t - back) / FLARE_SCALE));
  }

  function flareAngle(f) { return f.wait > 0 ? 0 : 360 * outQuad(Math.min(1, f.t / FLARE_ANIM)); }

  function updateFlare(c, f, dt) {
    if (c.slot === null || c.tween) { f.t = 0; f.wait = 0.3; return; }
    if (f.wait > 0) { f.wait -= dt; return; }
    f.t += dt;
    if (f.t >= FLARE_ANIM + FLARE_SCALE) { f.t = 0; f.wait = 3 + Math.random() * 3; }
  }

  function drawCardMasks(order) {
    renderer.end();
    renderer.batcherShader = maskShader;
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    order.forEach((c, i) => {
      const bit = 1 << i;
      gl.stencilMask(0xff);
      gl.stencilFunc(gl.ALWAYS, bit, 0xff);
      quad(tex.mask.t, c.x, c.y, FRAME.w, FRAME.h);
      renderer.end();
    });
    gl.colorMask(true, true, true, true);
    gl.disable(gl.STENCIL_TEST);
    renderer.batcherShader = satShader;
  }

  function drawWalkingHero() {
    setSat(1);
    renderer.end();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    renderer.drawSkeleton(sk.hero.skeleton, true);
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
    const dt = window.__timeScale === 0 ? 0 : (last ? Math.min(0.1, (now - last) / 1000) : 0);
    last = now;
    stats.frames++; stats.sim += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    layoutCamera();
    gl.clearColor(1, 1, 1, 1);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    renderer.begin();
    const order = [...cards].sort((a, b) => a.z - b.z);
    drawCardMasks(order);
    setSat(1);
    for (const s of slots) quad(tex.slot.t, s.x, s.y, SLOT.w, SLOT.h);
    order.forEach((c, i) => drawCard(c, 1 << i));
    if (!heroState.card) drawWalkingHero();
    renderer.end();
  }

  const INV_SLOTS = [[-840, 55], [-576, 40], [-308, 54], [-29, 46], [262, 43], [542, 51], [814, 51]];
  const INV_ITEMS = {
    Egg: { img: 'item_egg', w: 98, h: 128 },
    Pan: { img: 'item_pan', w: 154, h: 100 },
    Matches: { img: 'item_matches', w: 132, h: 156 },
    HomeKey: { img: 'item_house_key', w: 128, h: 140 },
  };

  function buildInventory() {
    const root = document.getElementById('inventory');
    root.innerHTML = '';
    const plate = document.createElement('div');
    plate.className = 'plate';
    root.appendChild(plate);
    INV_SLOTS.forEach(([x, y], i) => {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'inv-slot';
      s.style.left = (1090.5 + x - 96) + 'px';
      s.style.top = (204.5 + 21 - y - 96) + 'px';
      s.innerHTML = '<span class="sel"></span>';
      s.addEventListener('click', e => { e.stopPropagation(); clickSlot(i); });
      plate.appendChild(s);
      inv.slots.push({ el: s, item: null });
    });
    layoutInventory();
  }

  function layoutInventory() {
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.sqrt((W / 3840) * (H / 2160));
    document.documentElement.style.setProperty('--inv-scale', s);
  }

  function clearInventory() {
    if (inv.selected) deselect(true);
    for (const s of inv.slots) { if (s.item) s.item.el.remove(); s.item = null; s.el.classList.remove('selected'); }
  }

  function addToInventory(id) {
    const slot = inv.slots.find(s => !s.item);
    if (!slot) return;
    const def = INV_ITEMS[id];
    const el = document.createElement('img');
    el.src = 'assets/inv/' + def.img + '.png';
    el.alt = niceName(id);
    el.className = 'inv-item pop';
    el.style.width = def.w + 'px'; el.style.height = def.h + 'px';
    el.draggable = false;
    slot.el.appendChild(el);
    slot.item = { id, el };
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('pop')));
  }

  function consume(id) {
    const slot = inv.slots.find(s => s.item && s.item.id === id);
    if (inv.selected && inv.selected.slot === slot) deselect(true);
    if (!slot) return;
    slot.item.el.remove(); slot.item = null;
    const rest = inv.slots.filter(s => s.item).map(s => s.item);
    inv.slots.forEach((s, i) => {
      s.item = rest[i] || null;
      if (s.item) s.el.appendChild(s.item.el);
    });
  }

  function clickSlot(i) {
    const slot = inv.slots[i];
    if (inv.selected) { deselect(); return; }
    if (!slot.item || busy) return;
    inv.selected = { slot, id: slot.item.id };
    slot.el.classList.add('selected');
    const el = slot.item.el;
    el.classList.add('held');
    document.body.appendChild(el);
    canvas.style.cursor = 'none';
    followCursor(lastPointer);
    setStatus('Use ' + niceName(slot.item.id) + ' on…');
  }

  function deselect(silent) {
    const sel = inv.selected;
    if (!sel) return;
    inv.selected = null;
    sel.slot.el.classList.remove('selected');
    const el = sel.slot.item && sel.slot.item.el;
    if (el) {
      el.classList.remove('held', 'hot');
      el.style.left = el.style.top = '';
      sel.slot.el.appendChild(el);
    }
    canvas.style.cursor = 'default';
    if (!silent) setStatus('');
  }

  let lastPointer = { clientX: 0, clientY: 0 };
  window.addEventListener('pointermove', e => { lastPointer = { clientX: e.clientX, clientY: e.clientY }; }, true);

  function followCursor(e) {
    const sel = inv.selected;
    if (!sel || !sel.slot.item) return;
    const el = sel.slot.item.el;
    el.style.left = e.clientX + 'px';
    el.style.top = e.clientY + 'px';
  }

  function updateInventoryHover() {
    const sel = inv.selected;
    if (!sel || !sel.slot.item) return;
    const p = screenToWorld(lastPointer.clientX, lastPointer.clientY);
    sel.slot.item.el.classList.toggle('hot', hitFire(p) && !!USES[sel.id]);
  }

  canvas.addEventListener('click', e => {
    if (!inv.selected || busy) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const id = inv.selected.id;
    if (hitFire(p)) { deselect(true); useOnFire(id); }
    else deselect();
  });
})();
