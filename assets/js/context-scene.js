/* ============================================================================
   context-scene.js — the pinned "Project context" scene
   ----------------------------------------------------------------------------
   One canvas, one particle system, five stages. Scroll position drives a single
   progress value; every visual property is a curve read off it, so the five
   stages are one continuous transformation rather than five animations.

     0.00  Everything       labelled pills, each led by a coloured insight dot
     0.19  Signals          the pill contracts into that same dot, which resizes
     0.38  Relationships    a live nearest-neighbour mesh knits the cloud
     0.57  Context          a Scribe screen surfaces inside the cloud
     0.76  Useful output    the cloud funnels into a cone behind the screen,
                            which ends fully opaque, then holds

   THE MOTION MODEL
   Every particle orbits one shared vertical axis at its own radius, height,
   tilt, flatness and share of the rotation — a tornado seen slightly from
   above, so no two paths trace the same line. That rotation never stops: it
   drifts on its own, every pixel of scroll injects velocity on top of it, and
   scrolling back runs it backwards. Nothing else moves the particles.
   `sin(theta)` doubles as depth, which drives size, opacity and whether the
   particle draws in front of or behind the screen.

   THE PILL AND THE DOT ARE THE SAME OBJECT. A particle's (x, y) is always its
   dot. The pill is drawn extending to the right of it and contracts back into
   it, so the dot you read in stage one is the dot you follow to the end.
   ========================================================================== */

(function () {
  'use strict';

  var scene = document.querySelector('[data-context-scene]');
  if (!scene) return;

  var rail   = scene.querySelector('.ctx__rail');
  var pin    = scene.querySelector('.ctx__pin');
  var canvas = scene.querySelector('.ctx__canvas');
  var caps   = toArray(scene.querySelectorAll('.ctx__caption'));
  var ticks  = toArray(scene.querySelectorAll('.ctx__tick'));
  var copyEl = scene.querySelector('.ctx__copy');
  if (!rail || !pin || !canvas) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── palette ─────────────────────────────────────────────────────────── */
  var css = getComputedStyle(document.documentElement);
  function token(name, fallback) {
    var v = css.getPropertyValue(name).trim();
    return v || fallback;
  }
  var INK     = rgb(token('--ink', '#1C1A15'));
  var INK2    = rgb(token('--ink-2', '#56524A'));
  var PAGE    = rgb(token('--bg', '#FBFAF6'));
  var PILL_BG = rgb('#FFFFFF');

  /* One colour per kind of insight, borrowed from the app's own vocabulary.
     The dot in front of a pill says what sort of thing was said; that same
     dot is what survives into the cloud. */
  var KIND = {
    decision: rgb('#0A7548'),   // something settled
    question: rgb('#1570EF'),   // asked and still open
    task:     rgb('#B45309'),   // someone owes something
    risk:     rgb('#C2410C'),   // conflicts, discrepancies, blockers
    fact:     rgb('#96918689'.slice(0, 7))
  };
  KIND.fact = rgb('#969186');

  /* ── the things people said ──────────────────────────────────────────────
     Real fragments from the product's own sample project, each tagged with
     the kind of insight it is.                                             */
  var LABELS = [
    ['400 seats',            'decision'],
    ['March go-live',        'decision'],
    ['Legal must clear DPA', 'risk'],
    ['Who owns SSO?',        'question'],
    ['Uplift holds at 4%',   'decision'],
    ['Two-year term',        'decision'],
    ['Everything runs in AWS', 'risk'],
    ['250 in the sheet',     'risk'],
    ['Deep-dive on the 25th', 'task'],
    ['Send pricing by Friday', 'task'],
    ['Revisit at 90 days',   'decision'],
    ['Security review first', 'risk'],
    ['60 clinicians',        'fact'],
    ['Migration goes first', 'decision'],
    ['Headcount is the limit', 'fact'],
    ['Numbers before Friday', 'task'],
    ['Take-home: four hours', 'decision'],
    ['Data modelling gaps',  'fact'],
    ['Renewals hold at 6%',  'risk'],
    ['Incident note by Friday', 'task'],
    ['Backfills too?',       'question'],
    ['Contractor budget?',   'question'],
    ['Karen sends the draft', 'task'],
    ['Confirm it in writing', 'task'],
    ['Tom will come back',   'question'],
    ['GCP was our assumption', 'risk']
  ];
  var EXTRA_KINDS = ['fact', 'fact', 'fact', 'decision', 'task', 'question', 'risk'];

  var STAGE_AT = [0, 0.19, 0.38, 0.57, 0.76];

  /* ── geometry constants ──────────────────────────────────────────────── */
  var PILL_H    = 26;    // pill height in stage one
  var DOT_INSET = 13;    // distance from the pill's left edge to the dot centre
  var DOT_R     = 3.6;   // the dot's radius while it sits inside a pill
  var TAU       = Math.PI * 2;
  var V_SQUASH  = 0.42;  // how much of the orbit's vertical travel is kept

  /* ── how the tornado turns ───────────────────────────────────────────────
     The rotation never stops: AMBIENT keeps it drifting on its own, and every
     pixel of scroll injects velocity on top — positive scrolling down, so the
     near face of the cloud sweeps left to right faster, negative scrolling up,
     so it runs backwards. The injection decays, which gives it the weight of
     a flywheel rather than the twitchiness of a direct mapping.            */
  var AMBIENT  = 0.085;   // rad/s with no input at all
  var IMPULSE  = 0.024;   // rad/s added per pixel scrolled
  var DECAY    = 0.88;    // per 1/60s
  var MAX_SPIN = 5.0;     // rad/s, so a flick cannot spin it into a blur

  /* ── state ───────────────────────────────────────────────────────────── */
  var W = 0, H = 0, DPR = 1;
  var field = { x: 0, y: 0, w: 0, h: 0 };
  var axisX = 0, axisY = 0, bandR = 0, bandH = 0, pillHalf = 0;
  var particles = [];
  var linkFlags = null;
  var pillFont = '500 12px Onest, ui-sans-serif, system-ui, sans-serif';
  var progress = 0;
  var angle = 0;      // the one rotation everything is driven from
  var spinVel = 0;    // extra rad/s injected by scrolling, decaying
  var lastScrollY = 0;
  var lastT = 0;
  var running = false;
  var visible = false;
  var stageIndex = -1;

  var shot = new Image();
  var shotReady = false;
  shot.decoding = 'async';
  shot.onload = function () { shotReady = true; if (reduced) drawStatic(); else request(); };
  shot.src = canvas.getAttribute('data-shot') || 'assets/img/app/project.webp';

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ss(v, a, b) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function rgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ── build ───────────────────────────────────────────────────────────────
     There is no static grid any more: the cloud is always turning, so the
     layout has to look well spread at *every* angle, not just at the start.

     Heights are handed out evenly down the column, and each particle's angle
     is its height rank times the golden angle (137.5°). That keeps anything
     at a similar height far apart around the axis — and anything at a similar
     angle far apart in height — so the projection never bunches up, however
     far it has turned.                                                      */
  function build() {
    var rnd = mulberry32(20260915);
    particles = [];

    var narrow = W < 760;
    var pool = LABELS.slice();
    if (narrow) pool.sort(function (a, b) { return a[0].length - b[0].length; });
    var labels = pool.slice(0, narrow ? 12 : 20);
    // Few enough that stage two still reads as the pills becoming dots, and
    // held back until stage three so they arrive with the mesh.
    var extraCount = narrow ? 12 : 20;

    // Pills take evenly spaced slots down the column so no two of them are
    // ever vertical neighbours; the unlabelled dots fill in around them.
    var n = labels.length + extraCount;
    var items = new Array(n);
    labels.forEach(function (l, i) {
      items[Math.round(i * n / labels.length)] = { label: l[0], kind: l[1] };
    });
    for (var slot = 0, e = 0; slot < n; slot++) {
      if (items[slot]) continue;
      items[slot] = { label: null, kind: EXTRA_KINDS[(rnd() * EXTRA_KINDS.length) | 0] };
      e++;
    }

    var GOLDEN = Math.PI * (3 - Math.sqrt(5));
    items.forEach(function (it, i) {
      var p = makeParticle(rnd, it);
      p.u = (i + 0.5) / n + (rnd() - 0.5) * 0.45 / n;
      p.theta0 = (i * GOLDEN) % TAU;
      p.radN = 0.46 + 0.54 * ((i * 0.6180339887) % 1);
      p.linkOrder = i / n;
      particles.push(p);
    });

    linkFlags = new Uint8Array(n * n);
  }

  function makeParticle(rnd, opts) {
    return {
      label: opts.label,
      kind: opts.kind,
      colour: KIND[opts.kind] || KIND.fact,
      pillW: 0,

      /* every orbit is its own: a unique tilt, flatness and share of the
         shared rotation, so no two paths trace the same line */
      flat:  0.11 + rnd() * 0.24,        // how flat its ellipse projects
      tilt:  (rnd() * 2 - 1) * 0.34,     // tilt of its orbital plane
      spin:  0.82 + rnd() * 0.40,        // its share of the shared rotation

      /* the dot it keeps: some grow out of the pill, some shrink into it */
      r: 3.0 + rnd() * 5.8,
      stagger: rnd() * 0.10,
      baseAlpha: opts.label ? 1 : 0.52 + rnd() * 0.40,
      isExtra: !opts.label,

      x: 0, y: 0, alpha: 0, depth: 0.5, sizeMul: 1, depthFade: 1,
      mText: 1, mCollapse: 0, mPill: 1, mDot: 0
    };
  }

  /* ── layout ──────────────────────────────────────────────────────────── */
  function layout() {
    var rect = pin.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(420, Math.round(rect.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var copyBottom = 0.30 * H;
    if (copyEl) copyBottom = (copyEl.getBoundingClientRect().bottom - rect.top) + 16;

    // the illustration lives in the middle of the screen, not across it
    var bandW = clamp(W * 0.52, 320, 760);
    field.x = (W - bandW) / 2;
    field.w = bandW;
    field.y = clamp(copyBottom, H * 0.20, H * 0.52);
    field.h = Math.max(140, H * 0.965 - field.y);

    axisX = W / 2;
    axisY = field.y + field.h * 0.5;
    bandR = bandW * 0.50;
    bandH = field.h * 0.80;

    pillFont = '500 ' + (W < 760 ? 11 : 12) + 'px Onest, ui-sans-serif, system-ui, sans-serif';

    if (!particles.length) build();

    ctx.font = pillFont;
    var pillSum = 0, pillN = 0;
    particles.forEach(function (p) {
      p.pillW = p.label ? DOT_INSET + 9 + ctx.measureText(p.label).width + 14 : 0;
      if (p.label) { pillSum += p.pillW; pillN++; }
      p.R = bandR * p.radN;
      p.hOff = (p.u - 0.5) * bandH;
      p.cosT = Math.cos(p.tilt);
      p.sinT = Math.sin(p.tilt);
    });
    // a pill hangs to the right of its dot, so while they are pills the whole
    // cloud is nudged left to keep the composition centred
    pillHalf = pillN ? (pillSum / pillN) * 0.5 : 0;
  }

  /* ── progress ────────────────────────────────────────────────────────── */
  function readProgress() {
    var r = rail.getBoundingClientRect();
    var span = r.height - pin.offsetHeight;
    if (span <= 0) return 0;
    return clamp(-r.top / span, 0, 1);
  }

  function setStage(p) {
    var idx = 0;
    for (var i = 0; i < STAGE_AT.length; i++) if (p >= STAGE_AT[i]) idx = i;
    if (idx === stageIndex) return;
    stageIndex = idx;
    caps.forEach(function (el, i) { el.classList.toggle('is-on', i === idx); });
    ticks.forEach(function (el, i) { el.classList.toggle('is-on', i <= idx); });
    scene.setAttribute('data-stage', String(idx + 1));
  }

  /* ── the vortex ──────────────────────────────────────────────────────────
     Places every particle for the current frame and fills in depth, size and
     opacity. `funnel` tightens the cloud into a cone that collapses onto the
     axis, which is also where the screen is.                                */
  function place(form, sink, cardCy, cardH, shiftX) {
    var tiltMul = lerp(1, 0.32, form);   // keeps the cone's outline crisp

    // While the cone is forming, its mouth sits just under the copy and its
    // tip behind the middle of the screen. As it sinks, mouth and tip both
    // pull inside the screen's rectangle until there is nothing left outside.
    var mouthY = lerp(field.y + 24, cardCy - cardH * 0.24, sink);
    var tipY = lerp(cardCy + 24, cardCy, sink);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      // the angle runs backwards so the near face of the cloud — the bigger,
      // more opaque half — travels left to right
      var theta = p.theta0 - angle * p.spin;

      // radius and height blend from the free cloud into the cone, so `u`
      // (where the particle sits top to bottom) becomes its depth down the
      // funnel; `sink` then draws the whole cone in behind the screen
      var coneR = bandR * (0.05 + 1.18 * Math.pow(1 - p.u, 0.9)) *
                  (0.82 + 0.36 * p.radN) * lerp(1, 0.17, sink);
      var R = lerp(p.R * lerp(0.86, 1, p.mDot || 0), coneR, form);
      var cy = lerp(axisY + p.hOff, lerp(mouthY, tipY, p.u), form);
      p.cone = lerp(1, coneR / bandR, form);

      // A pill keeps to its lane — its orbit is tilted and dished less than a
      // dot's — and opens out into the full path as it becomes one. Vertical
      // travel is squashed either way, so nothing sails off the top or bottom.
      var open = p.label ? lerp(0.45, 1, p.mDot) : 1;
      var flat = p.flat * open;
      var sinT = p.sinT * open;

      var ex = R * Math.cos(theta);
      var ey = R * flat * Math.sin(theta);
      p.x = axisX + shiftX + ex * p.cosT - ey * sinT * tiltMul;
      p.y = cy + (ex * sinT * tiltMul + ey * p.cosT) * V_SQUASH;

      // sin(theta) is how far round the axis it is: +1 nearest the viewer.
      // It always sorts the draw order; how strongly it changes size and
      // opacity grows as the pill becomes a dot, so stage one stays readable.
      p.depth = (Math.sin(theta) + 1) / 2;
      var strength = lerp(0.72, 1, p.mDot || 0);
      p.sizeMul = lerp(1, lerp(0.80, 1.20, p.depth), strength);
      p.depthFade = lerp(1, lerp(0.56, 1, p.depth), strength);
    }
  }

  /* ── drawing ─────────────────────────────────────────────────────────── */
  function drawParticle(p, dim) {
    var a = p.alpha * dim;
    if (a <= 0.004) return;

    var dotR = lerp(DOT_R, p.r, p.mDot) * p.sizeMul;

    // the pill, still contracting back toward its dot
    if (p.label && p.mPill > 0.01) {
      var w = p.pillW * (1 - p.mCollapse);
      if (w > DOT_INSET * 1.6) {
        var pa = a * p.mPill;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.tilt * 0.34 * (1 - p.mCollapse));
        ctx.scale(p.sizeMul, p.sizeMul);
        ctx.translate(-p.x / p.sizeMul, -p.y / p.sizeMul);
        var sx = p.x / p.sizeMul, sy = p.y / p.sizeMul;

        roundRect(sx - DOT_INSET, sy - PILL_H / 2, w, PILL_H, PILL_H / 2);
        ctx.fillStyle = rgba(PILL_BG, pa * 0.97);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(INK, pa * 0.26);
        ctx.stroke();

        if (p.mText > 0.01) {
          ctx.clip();                      // the words wipe away as it closes
          ctx.font = pillFont;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = rgba(INK2, pa * p.mText);
          ctx.fillText(p.label, sx + 9, sy + 0.5);
        }
        ctx.restore();
      }
    }

    // the dot, which was always there
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, dotR), 0, TAU);
    ctx.fillStyle = rgba(p.colour, a);
    ctx.fill();
  }

  /* A live nearest-neighbour mesh: every dot reaches for its three closest
     neighbours, so the whole field reads as one point cloud rather than a few
     joined-up pairs. Recomputed each frame, so it reorganises as they move. */
  function drawMesh(links, dim) {
    if (links <= 0.002 || !linkFlags) return;
    var n = particles.length;
    var maxLen = Math.max(190, field.w * 0.62);
    var maxSq = maxLen * maxLen;
    linkFlags.fill(0);

    ctx.save();
    ctx.setLineDash([1.7, 4]);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    for (var i = 0; i < n; i++) {
      var a = particles[i];
      if (a.alpha <= 0.02 || links <= a.linkOrder * 0.42) continue;

      var b1 = -1, b2 = -1, b3 = -1;
      var d1 = Infinity, d2 = Infinity, d3 = Infinity;
      for (var j = 0; j < n; j++) {
        if (j === i) continue;
        var q = particles[j];
        if (q.alpha <= 0.02) continue;
        var dx = q.x - a.x, dy = q.y - a.y;
        var d = dx * dx + dy * dy;
        if (d < d1) { if (d2 <= maxSq) { d3 = d2; b3 = b2; } d2 = d1; b2 = b1; d1 = d; b1 = j; }
        else if (d <= maxSq) {
          if (d < d2) { d3 = d2; b3 = b2; d2 = d; b2 = j; }
          else if (d < d3) { d3 = d; b3 = j; }
        }
      }

      var fade = ss(links, a.linkOrder * 0.42, a.linkOrder * 0.42 + 0.26);
      strokeLink(i, b1, d1, maxLen, fade, dim);
      strokeLink(i, b2, d2, maxLen, fade, dim);
      strokeLink(i, b3, d3, maxLen, fade, dim);
    }
    ctx.restore();
  }

  function strokeLink(i, j, dSq, maxLen, fade, dim) {
    if (j < 0) return;
    var key = i < j ? i * particles.length + j : j * particles.length + i;
    if (linkFlags[key]) return;
    linkFlags[key] = 1;

    var a = particles[i], b = particles[j];
    var d = Math.sqrt(dSq);
    var lenFade = 1 - ss(d, maxLen * 0.60, maxLen * 1.25);
    var alpha = 0.52 * fade * lenFade * dim * (0.45 + 0.55 * Math.min(a.alpha, b.alpha));
    if (alpha <= 0.008) return;

    // the warmer of the two ends tints the line, so clusters of one kind read
    var warm = a.kind !== 'fact' ? a.colour : (b.kind !== 'fact' ? b.colour : INK2);
    ctx.strokeStyle = rgba(warm, alpha);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /* 1 well inside the screen's rectangle, 0 well outside, soft in between */
  function insideCard(x, y, r) {
    var pad = 26;
    var fx = ss(x, r.x - pad, r.x + pad) * (1 - ss(x, r.x + r.w - pad, r.x + r.w + pad));
    var fy = ss(y, r.y - pad, r.y + pad) * (1 - ss(y, r.y + r.h - pad, r.y + r.h + pad));
    return fx * fy;
  }

  function cardRect(grow, funnel) {
    var aspect = (shot.naturalWidth / shot.naturalHeight) || 1.6;
    var availH = Math.max(160, H * 0.965 - field.y);
    var maxW = Math.min(W * (W < 760 ? 0.84 : 0.48), (availH * 0.78) * aspect);
    var w = maxW * lerp(0.50, 1, easeOut(grow));
    var h = w / aspect;
    var cy = lerp(axisY, field.y + availH * 0.58, funnel);
    return { x: W / 2 - w / 2, y: cy - h / 2, w: w, h: h, cy: cy };
  }

  function drawShot(clarity, grow, r) {
    if (!shotReady || clarity <= 0.004) return;

    var blur = (1 - ss(clarity, 0, 0.55)) * 10;
    var alpha = ss(clarity, 0, 0.42);
    var wash = (1 - ss(clarity, 0.06, 0.80)) * 0.58;

    ctx.save();
    ctx.save();
    ctx.shadowColor = 'rgba(28,26,21,' + (0.22 * clarity).toFixed(3) + ')';
    ctx.shadowBlur = 50 * clarity;
    ctx.shadowOffsetY = 22 * clarity;
    roundRect(r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = rgba(PAGE, Math.min(1, clarity * 1.35));
    ctx.fill();
    ctx.restore();

    roundRect(r.x, r.y, r.w, r.h, 12);
    ctx.clip();
    if (blur > 0.4 && 'filter' in ctx) ctx.filter = 'blur(' + blur.toFixed(1) + 'px)';
    ctx.globalAlpha = alpha;
    ctx.drawImage(shot, r.x - blur, r.y - blur, r.w + blur * 2, r.h + blur * 2);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    if (wash > 0.002) {
      ctx.fillStyle = rgba(PAGE, wash);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();

    ctx.save();
    roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(INK, 0.11 * clarity);
    ctx.stroke();
    ctx.restore();
  }

  /* ── frame ───────────────────────────────────────────────────────────── */
  function frame(now) {
    running = false;
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
    lastT = now;

    progress = readProgress();
    setStage(progress);
    var p = progress;

    var extras  = ss(p, 0.28, 0.54);   // the few unlabelled signals arrive
    var links   = ss(p, 0.34, 0.62);   // the mesh knits
    var clarity = ss(p, 0.55, 0.88);   // the screen surfaces, then is solid
    var grow    = ss(p, 0.70, 0.92);   // …and takes the centre
    var form    = ss(p, 0.62, 0.84);   // the cloud takes the shape of a cone
    var sink    = ss(p, 0.80, 0.96);   // …and is drawn entirely in behind it
    var dim     = 1 - ss(p, 0.54, 0.84) * 0.34;
    var hide    = ss(p, 0.74, 0.90);   // nothing draws over a solid screen

    // the rotation: an ambient drift plus whatever the scroll just injected
    var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (dt) {
      spinVel = clamp(spinVel * Math.pow(DECAY, dt * 60) + (sy - lastScrollY) * IMPULSE,
                      -MAX_SPIN, MAX_SPIN);
      angle += (AMBIENT + spinVel) * dt;
    }
    lastScrollY = sy;

    var r = cardRect(grow, form);
    place(form, sink, r.cy, r.h,
          -pillHalf * (W < 760 ? 0.35 : 1) * (1 - ss(p, 0.05, 0.28)));

    var i, q;
    for (i = 0; i < particles.length; i++) {
      q = particles[i];

      var lp = p - q.stagger;
      q.mText     = 1 - ss(lp, 0.05, 0.17);                   // the words go
      q.mCollapse = Math.pow(ss(lp, 0.05, 0.26), 1.45);       // the pill closes
      q.mPill     = 1 - ss(lp, 0.08, 0.20);                   // …and fades out
      q.mDot      = ss(lp, 0.12, 0.32);                       // the dot resizes

      var copyFade = ss(q.y, field.y - 50, field.y + 18) *
                     (1 - ss(q.y, H - 46, H + 10));
      var edgeFade = ss(q.x, -30, 40) * (1 - ss(q.x, W - 40, W + 30));

      q.alpha = q.baseAlpha * copyFade * edgeFade * q.depthFade *
                (q.isExtra ? extras : 1);

      // a particle in front of the screen fades only where it would cover it,
      // so the funnel's mouth survives while its body disappears behind
      q.overCard = hide > 0.002 && q.depth > 0.5
        ? 1 - hide * insideCard(q.x, q.y, r)
        : 1;

      // the narrow end of the funnel is taken into the screen, not stacked
      // up on the axis behind it
      q.alpha *= 1 - form * (1 - ss(q.cone, 0.06, 0.26));
      // and the last of it goes with the cone, so the screen ends alone
      q.alpha *= 1 - ss(p, 0.90, 0.99);
    }

    ctx.clearRect(0, 0, W, H);

    for (i = 0; i < particles.length; i++) {
      q = particles[i];
      if (q.depth <= 0.5) drawParticle(q, dim);
    }
    drawMesh(links, dim * lerp(1, 0.88, form) * (1 - ss(p, 0.88, 0.97)));
    drawShot(clarity, grow, r);
    for (i = 0; i < particles.length; i++) {
      q = particles[i];
      if (q.depth > 0.5) drawParticle(q, dim * q.overCard);
    }

    if (visible) request();
  }

  function request() {
    if (running || !visible || reduced) return;
    running = true;
    requestAnimationFrame(frame);
  }

  /* ── the reduced-motion version ──────────────────────────────────────── */
  function drawStatic() {
    layout();
    angle = 0; spinVel = 0;
    var r0 = cardRect(1, 0);
    place(0, 0, r0.cy, r0.h, 0);
    var r = r0;
    var i, q;
    for (i = 0; i < particles.length; i++) {
      q = particles[i];
      q.mText = 0; q.mCollapse = 1; q.mPill = 0; q.mDot = 1;
      q.alpha = q.baseAlpha * ss(q.y, field.y - 50, field.y + 18) *
                lerp(0.42, 1, q.depth);
      q.overCard = 1;
    }
    ctx.clearRect(0, 0, W, H);
    for (i = 0; i < particles.length; i++) { q = particles[i]; if (q.depth <= 0.5) drawParticle(q, 0.7); }
    drawMesh(1, 0.7);
    drawShot(1, 1, r);
    for (i = 0; i < particles.length; i++) { q = particles[i]; if (q.depth > 0.5) drawParticle(q, 0.7); }
  }

  /* ── wiring ──────────────────────────────────────────────────────────── */
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function start() {
    if (reduced) {
      scene.classList.add('is-static');
      caps.forEach(function (el) { el.classList.add('is-on'); });
      ticks.forEach(function (el) { el.classList.add('is-on'); });
      drawStatic();
      window.addEventListener('resize', debounce(drawStatic, 180), { passive: true });
      return;
    }

    layout();
    setStage(0);
    visible = true;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) { lastT = 0; request(); }
      }, { rootMargin: '140px 0px' }).observe(scene);
    }

    request();
    window.addEventListener('resize', debounce(function () {
      layout();
      lastT = 0;
      request();
    }, 160), { passive: true });
  }

  // canvas text needs the webfont, and re-laying out resizes (and clears) the
  // canvas, so the frame has to be drawn again afterwards
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (reduced) { drawStatic(); return; }
      layout();
      lastT = 0;
      request();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
