(() => {
  const CARD_W = 2.34, CARD_H = 3.56;
  const FRAME = { w: 313 / 120, h: 454 / 120 };
  const SHADOW = { w: 313 / 120, h: 454 / 120, dx: 0.1, dy: -0.1 };
  const SLOT = { w: 372 / 150, h: 548 / 150 };
  const MASK = { w: 313 / 120, h: 454 / 120 };
  const DESAT = 0.2, SAT_DURATION = 1;
  const SNAP_DIST = 1.4;
  const SLOT_STEP = 2.70, SLOT_Y = -1.0, TOP_Y = 3.75;
  const VIEW = { minX: -7.2, maxX: 7.2, minY: -3.1, maxY: 7.0 };
  const HAND_ACTIVE = { from: 2.33, to: 3.99 };
  const FOOT = { ox: 0.0235, oy: 0.0147, w: 0.383, h: 0.257 };
  const RESCUE_DELAY = 0.8;
  const T = 'levels/dungeon_tickle/';

  const DEFS = {
    c1: {
      locked: true, back: ['room1', 'dungeon_tickle_trap_room1_b'], front: ['room1', 'dungeon_tickle_trap_room1_f'],
      ropes: 'dungeon_tickle_trap_room1_ropes', hero: { x: 0.386, y: -0.229 },
      forwards: ['card_1_move_forward0'], giggles: [], hands: [], hang: () => 'card_1_hang0',
    },
    c3: {
      back: ['room3456', 'dungeon_tickle_trap_room3'], ropes: 'dungeon_tickle_trap_room3_ropes', hero: { x: 0, y: 0 },
      forwards: [0, 1, 2, 3, 4, 5].map(i => 'card_3_move_forward' + i),
      giggles: [0, 0, 1, 2, 3, 4].map(i => 'card_3_giggle' + i),
      hang: s => 'card_3_hang' + (s - 1),
      hands: [
        { x: 0.005, y: 0, anim: 'tickle_vertical_loop', delay: 7, interval: 5, box: { ox: 0, oy: -0.42, w: 0.358, h: 0.979 } },
      ],
    },
    c4: {
      back: ['room3456', 'dungeon_tickle_trap_room4'], ropes: 'dungeon_tickle_trap_room4_ropes', hero: { x: 0, y: 0 },
      forwards: [0, 1, 2, 3, 4, 5, 6].map(i => 'card_4_move_forward' + i),
      giggles: [0, 0, 1, 2, 3, 4, 5].map(i => 'card_4_giggle' + i),
      hang: s => 'card_4_hang' + (s - 1),
      hands: [
        { x: 0, y: 0.083, anim: 'tickle_horizontal_loop', delay: 5, interval: 4, box: { ox: -0.012, oy: -0.194, w: 0.309, h: 0.527 } },
      ],
    },
    c5: {
      back: ['room3456', 'dungeon_tickle_trap_room5'], ropes: 'dungeon_tickle_trap_room5_ropes', hero: { x: 0, y: 0 },
      forwards: [0, 1, 2, 3, 4, 5, 6].map(i => 'card_5_move_forward' + i),
      giggles: [0, 0, 1, 2, 3, 4, 5].map(i => 'card_5_giggle' + i),
      hang: s => 'card_5_hang' + (s - 1),
      hands: [
        { x: 0.58, y: 0, anim: 'tickle_vertical_loop', delay: 6.5, interval: 7, box: { ox: 0, oy: -0.423, w: 0.358, h: 0.985 } },
      ],
    },
    c7: {
      locked: true, back: ['room7', 'dungeon_tickle_trap_room7_b'], front: ['room7', 'dungeon_tickle_trap_room7_f'],
      ropes: 'dungeon_tickle_trap_room7_ropes', hero: { x: 0, y: -0.258 },
      forwards: ['card_7_move_forward0'], giggles: [], hands: [], exit: true,
    },
  };

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
  const ATLASES = ['hero/Shadowclaw.atlas', 'room1/dungeon_tickle_trap.atlas', 'room3456/dungeon_tickle_trap.atlas',
    'room7/dungeon_tickle_trap.atlas', 'ropes/dungeon_tickle_trap.atlas', 'hand/dungeon_tickle_trap.atlas'];
  const JSONS = ['hero/Shadowclaw.json', 'hero/shadowclaw_fingers_tickle.json', 'hand/dungeon_tickle_trap_hand.json'];
  for (const d of Object.values(DEFS)) {
    JSONS.push(d.back[0] + '/' + d.back[1] + '.json');
    if (d.front) JSONS.push(d.front[0] + '/' + d.front[1] + '.json');
    JSONS.push('ropes/' + d.ropes + '.json');
  }
  ATLASES.forEach(a => assets.loadTextureAtlas(a));
  JSONS.forEach(j => assets.loadJson(j));

  const imgNames = ['card_shadow', 'card_mask', 'card_frame', 'slot'];
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

  function makeLockTexture() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.fillStyle = '#efdcc4';
    g.beginPath();
    g.roundRect(4, 4, S - 8, S - 8, 22);
    g.fill();
    g.strokeStyle = '#5a3f30';
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#3b2a22';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(S / 2, 52, 24, Math.PI, 0);
    g.lineTo(S / 2 + 24, 66);
    g.moveTo(S / 2 - 24, 66);
    g.lineTo(S / 2 - 24, 52);
    g.stroke();
    g.fillStyle = '#e0b04a';
    g.beginPath();
    g.roundRect(22, 62, S - 44, 54, 10);
    g.fill();
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#3b2a22';
    g.beginPath();
    g.arc(S / 2, 84, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(S / 2 - 3, 86, 6, 16);
    return pmaTexture(c, S, S);
  }

  const atlasCache = {};
  function makeSkeleton(atlasPath, jsonPath, scale, mix) {
    const atlas = assets.require(atlasPath);
    const key = atlasPath + '|' + jsonPath;
    let data = atlasCache[key];
    if (!data) {
      const json = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
      json.scale = scale;
      data = atlasCache[key] = json.readSkeletonData(assets.require(jsonPath));
    }
    const skeleton = new spine.Skeleton(data);
    skeleton.setToSetupPose();
    const stateData = new spine.AnimationStateData(data);
    stateData.defaultMix = mix || 0;
    const state = new spine.AnimationState(stateData);
    return { skeleton, state, pma: atlas.pages[0].pma !== false };
  }

  let cards, slots, hero, fingers, dragging = null, last = 0, pointer = { x: 0, y: 0 };
  const heroState = { card: null, state: 0, phase: 'stand', timer: 0 };

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
    tex.lock = makeLockTexture();
    hero = makeSkeleton('hero/Shadowclaw.atlas', 'hero/Shadowclaw.json', 0.002, 0.3);
    fingers = makeSkeleton('hero/Shadowclaw.atlas', 'hero/shadowclaw_fingers_tickle.json', 0.002, 0);
    window.__hyd = { renderer, get cards() { return cards; }, heroState, get slots() { return slots; } };
    document.getElementById('loading').hidden = true;
    reset();
    document.getElementById('reset').addEventListener('click', reset);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    requestAnimationFrame(frame);
  }

  function buildCard(id, bit) {
    const def = DEFS[id];
    const back = makeSkeleton(def.back[0] + '/dungeon_tickle_trap.atlas', def.back[0] + '/' + def.back[1] + '.json', 0.0015);
    back.state.setAnimation(0, 'idle', true);
    let front = null;
    if (def.front) {
      front = makeSkeleton(def.front[0] + '/dungeon_tickle_trap.atlas', def.front[0] + '/' + def.front[1] + '.json', 0.0015);
      front.state.setAnimation(0, 'idle', true);
    }
    const ropes = makeSkeleton('ropes/dungeon_tickle_trap.atlas', 'ropes/' + def.ropes + '.json', 0.0015);
    ropes.state.setAnimation(0, 'animation', false);
    const hands = def.hands.map(h => {
      const s = makeSkeleton('hand/dungeon_tickle_trap.atlas', 'hand/dungeon_tickle_trap_hand.json', 0.0015);
      s.state.setAnimation(0, 'empty', false);
      return Object.assign({ phase: 'delay', t: 0 }, h, { skel: s });
    });
    return {
      id, def, bit, back, front, ropes, hands, x: 0, y: 0, slot: null, locked: !!def.locked,
      sat: DESAT, satFrom: DESAT, satTo: DESAT, satT: 1, z: 0, tween: null,
    };
  }

  function reset() {
    slots = [-2, -1, 0, 1, 2].map(i => ({ x: i * SLOT_STEP, y: SLOT_Y, card: null }));
    const ids = ['c1', 'c3', 'c4', 'c5', 'c7'];
    cards = ids.map((id, i) => buildCard(id, 1 << i));
    const c1 = cards[0], c7 = cards[4];
    placeInSlot(c1, 0, true);
    placeInSlot(c7, 4, true);
    const middle = [cards[1], cards[3], cards[2]];
    middle.forEach((c, i) => {
      c.x = (i - 1) * 2.9; c.y = 10;
      c.z = i + 1;
      moveCardTo(c, (i - 1) * 2.9, TOP_Y, 0.45, null, 0.15 + i * 0.12);
    });
    dragging = null;
    putHeroAtStart();
    setStatus('Place cards next to Shadowclaw to open the way');
  }

  function putHeroAtStart() {
    heroState.card = cards[0];
    heroState.state = 0;
    heroState.phase = 'stand';
    heroState.timer = 0;
    hero.state.clearTracks(); hero.skeleton.setToSetupPose();
    const e = hero.state.setAnimation(0, T + 'card_1_jump_on', false);
    e.timeScale = 0;
    fingers.state.clearTracks(); fingers.skeleton.setToSetupPose();
    fingers.state.setAnimation(0, 'empty', false);
  }

  function placeInSlot(c, i, instant) {
    slots[i].card = c;
    c.slot = i;
    if (instant) {
      c.x = slots[i].x; c.y = slots[i].y;
      c.sat = c.satFrom = c.satTo = 1;
    }
  }

  function setStatus(t) { statusEl.textContent = t; }

  function tweenSat(card, to) { card.satFrom = card.sat; card.satTo = to; card.satT = 0; }

  function moveCardTo(card, x, y, dur, onDone, delay) {
    card.tween = { fx: card.x, fy: card.y, tx: x, ty: y, t: -(delay || 0), d: dur, onDone };
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

  function canDrag(c) {
    if (!c || c.locked || heroState.card === c) return false;
    const busy = ['jump', 'move'].includes(heroState.phase);
    return !(busy && heroState.card.slot !== null && c.slot === heroState.card.slot + 1);
  }

  function onDown(e) {
    const p = screenToWorld(e.clientX, e.clientY);
    const c = hitCard(p);
    if (!canDrag(c)) return;
    c.tween = null;
    if (c.slot !== null) {
      slots[c.slot].card = null;
      c.slot = null;
      tweenSat(c, DESAT);
    }
    c.z = 100 + cards.reduce((m, q) => Math.max(m, q.z), 0);
    dragging = { card: c, ox: p.x - c.x, oy: p.y - c.y };
    canvas.style.cursor = 'grabbing';
  }

  function onMove(e) {
    pointer = screenToWorld(e.clientX, e.clientY);
    if (!dragging) {
      const c = hitCard(pointer);
      canvas.style.cursor = canDrag(c) ? 'grab' : (c && c.locked ? 'not-allowed' : 'default');
      return;
    }
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
    if (best < 0) return;
    placeInSlot(c, best, false);
    moveCardTo(c, slots[best].x, slots[best].y, 0.18, () => {
      tweenSat(c, 1);
      checkAdvance();
    });
  }

  function nextCardOf(c) {
    if (c.slot === null) return null;
    const s = slots[c.slot + 1];
    return s && s.card && !s.card.tween ? s.card : null;
  }

  function checkAdvance() {
    if (heroState.phase === 'stand') {
      if (nextCardOf(heroState.card)) jumpOn();
    } else if (heroState.phase === 'wait') {
      if (nextCardOf(heroState.card)) moveNext();
    }
  }

  function playHero(name, loop) {
    const e = hero.state.setAnimation(0, T + name, loop);
    fingers.state.setAnimation(0, name, loop);
    return e;
  }

  function jumpOn() {
    heroState.phase = 'jump';
    setStatus('Shadowclaw grabs the ropes…');
    const e = playHero('card_1_jump_on', false);
    e.listener = { complete: () => { heroState.state = 0; moveNext(); } };
  }

  function enterCard(card) {
    heroState.card = card;
    heroState.state = 0;
    hero.state.clearTracks(); hero.skeleton.setToSetupPose();
    fingers.state.clearTracks(); fingers.skeleton.setToSetupPose();
    moveNext();
  }

  function moveNext() {
    const def = heroState.card.def;
    const lastMove = heroState.state === def.forwards.length - 1;
    if (lastMove && !def.exit && !nextCardOf(heroState.card)) {
      heroState.phase = 'wait';
      playHero(def.hang(heroState.state), true);
      setStatus('Shadowclaw waits for the next card');
      return;
    }
    if (heroState.state < def.forwards.length) {
      heroState.phase = 'move';
      setStatus('Shadowclaw climbs along the ropes…');
      const e = playHero(def.forwards[heroState.state], false);
      const myCard = heroState.card;
      e.listener = { complete: () => {
        if (heroState.phase !== 'move' || heroState.card !== myCard) return;
        heroState.state++;
        moveNext();
      } };
      return;
    }
    if (def.exit) { jumpDown(); return; }
    enterCard(nextCardOf(heroState.card));
  }

  function jumpDown() {
    heroState.phase = 'exit';
    setStatus('Shadowclaw jumps down…');
    fingers.state.setAnimation(0, 'empty', false);
    const e = hero.state.setAnimation(0, T + 'card_7_jump_down', false);
    e.listener = { complete: () => {
      hero.state.setAnimation(0, 'basic/none', false);
      heroState.phase = 'done';
      setStatus('Shadowclaw escaped into the cave!');
    } };
  }

  function tickled() {
    const def = heroState.card.def;
    const giggle = def.giggles[heroState.state];
    heroState.phase = 'giggle';
    setStatus('Tickled! Shadowclaw falls into the abyss…');
    fingers.state.setAnimation(0, 'empty', false);
    const e = hero.state.setAnimation(0, T + giggle, false);
    e.listener = { complete: () => {
      hero.state.setAnimation(0, 'basic/empty', false);
      heroState.phase = 'fallen';
      heroState.timer = RESCUE_DELAY;
    } };
  }

  function rescue() {
    const middle = cards.filter(c => !c.locked);
    middle.forEach((c, i) => {
      if (c.slot !== null) { slots[c.slot].card = null; c.slot = null; }
      tweenSat(c, DESAT);
      moveCardTo(c, (i - 1) * 2.9, TOP_Y, 0.4, null, i * 0.08);
    });
    putHeroAtStart();
    setStatus('Try again: mind the tickling hands');
  }

  function updateHand(card, h, dt) {
    h.t += dt;
    if (h.phase === 'delay' && h.t >= h.delay) {
      h.phase = 'loop'; h.t = 0;
      h.dur = h.skel.state.setAnimation(0, h.anim, false).animation.duration;
    } else if (h.phase === 'loop' && h.t >= h.dur) {
      h.phase = 'interval'; h.t = 0;
    } else if (h.phase === 'interval' && h.t >= h.interval) {
      h.phase = 'loop'; h.t = 0;
      h.skel.state.setAnimation(0, h.anim, false);
    }
    h.skel.state.update(dt);
    h.skel.state.apply(h.skel.skeleton);
    h.skel.skeleton.x = card.x + h.x;
    h.skel.skeleton.y = card.y + h.y;
    h.skel.skeleton.updateWorldTransform();
  }

  function boneBox(bone, box) {
    const rot = bone.getWorldRotationX() * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const cx = bone.worldX + box.ox * cos - box.oy * sin;
    const cy = bone.worldY + box.ox * sin + box.oy * cos;
    const hw = (Math.abs(box.w * cos) + Math.abs(box.h * sin)) / 2;
    const hh = (Math.abs(box.w * sin) + Math.abs(box.h * cos)) / 2;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  }

  function overlap(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }

  function checkTickle() {
    if (heroState.phase !== 'move' && heroState.phase !== 'wait') return;
    const card = heroState.card;
    if (!card.def.giggles[heroState.state]) return;
    const foot = boneBox(hero.skeleton.findBone('teleport_anchor'), FOOT);
    for (const h of card.hands) {
      if (h.phase !== 'loop' || h.t < HAND_ACTIVE.from || h.t > HAND_ACTIVE.to) continue;
      const box = boneBox(h.skel.skeleton.findBone('collider'), h.box);
      if (overlap(foot, box)) { tickled(); return; }
    }
  }

  function updateSkel(s, x, y, dt) {
    s.state.update(dt);
    s.state.apply(s.skeleton);
    s.skeleton.x = x; s.skeleton.y = y;
    s.skeleton.updateWorldTransform();
  }

  function update(dt) {
    for (const c of cards) {
      if (c.tween) {
        const tw = c.tween;
        tw.t += dt;
        const k = Math.max(0, Math.min(1, tw.t / tw.d)), e = 1 - (1 - k) * (1 - k);
        c.x = tw.fx + (tw.tx - tw.fx) * e;
        c.y = tw.fy + (tw.ty - tw.fy) * e;
        if (k >= 1) { c.tween = null; tw.onDone && tw.onDone(); }
      }
      if (c.satT < 1) {
        c.satT = Math.min(1, c.satT + dt / SAT_DURATION);
        const e = 1 - (1 - c.satT) * (1 - c.satT);
        c.sat = c.satFrom + (c.satTo - c.satFrom) * e;
      }
      updateSkel(c.back, c.x, c.y, dt);
      if (c.front) updateSkel(c.front, c.x, c.y, dt);
      updateSkel(c.ropes, c.x, c.y, dt);
      for (const h of c.hands) updateHand(c, h, dt);
    }
    const hc = heroState.card;
    updateSkel(hero, hc.x + hc.def.hero.x, hc.y + hc.def.hero.y, dt);
    updateSkel(fingers, hc.x + hc.def.hero.x, hc.y + hc.def.hero.y, dt);
    checkTickle();
    if (heroState.phase === 'fallen') {
      heroState.timer -= dt;
      if (heroState.timer <= 0) rescue();
    }
  }

  function pmaBlend() { renderer.batcher.setBlendMode(spine.BlendMode.Normal, true); }

  const SHADOW_TINT = new spine.Color(0.678 * 0.333, 0.431 * 0.333, 0.298 * 0.333, 0.333);

  function quad(t, cx, cy, w, h, color) {
    pmaBlend();
    renderer.drawTexture(t, cx - w / 2, cy - h / 2, w, h, color);
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

  function drawCard(c) {
    setSat(c.sat);
    quad(tex.card_shadow, c.x + SHADOW.dx, c.y + SHADOW.dy, SHADOW.w, SHADOW.h, SHADOW_TINT);
    renderer.end();
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, c.bit, c.bit);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    renderer.drawSkeleton(c.back.skeleton, c.back.pma);
    for (const h of c.hands) renderer.drawSkeleton(h.skel.skeleton, h.skel.pma);
    const heroHere = heroState.card === c;
    if (heroHere) renderer.drawSkeleton(hero.skeleton, hero.pma);
    if (c.front) renderer.drawSkeleton(c.front.skeleton, c.front.pma);
    renderer.drawSkeleton(c.ropes.skeleton, c.ropes.pma);
    if (heroHere) renderer.drawSkeleton(fingers.skeleton, fingers.pma);
    renderer.end();
    gl.disable(gl.STENCIL_TEST);
    quad(tex.card_frame, c.x, c.y, FRAME.w, FRAME.h);
    if (c.locked) quad(tex.lock, c.x - 0.78, c.y + 1.33, 0.62, 0.62);
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
    for (const c of order) drawCard(c);
    renderer.end();
    requestAnimationFrame(frame);
  }
})();
