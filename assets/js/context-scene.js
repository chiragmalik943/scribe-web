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
   tilt, flatness and speed — a tornado seen slightly from above. The orbit's
   starting angle is solved from the particle's grid position, so at t = 0 the
   vortex *is* the stage-one layout: when the spin starts, nothing jumps.
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

  /* ── state ───────────────────────────────────────────────────────────── */
  var W = 0, H = 0, DPR = 1;
  var field = { x: 0, y: 0, w: 0, h: 0 };
  var axisX = 0, axisY = 0, bandR = 0, bandH = 0;
  var particles = [];
  var linkFlags = null;
  var pillFont = '500 12px Onest, ui-sans-serif, system-ui, sans-serif';
  var progress = 0;
  var accum = 0;      // seconds of orbital advance — gated, never runs backwards
  var elapsed = 0;    // real seconds on screen, for the stage-one idle bob
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

  /* ── build ───────────────────────────────────────────────────────────── */
  function build() {
    var rnd = mulberry32(20260915);
    particles = [];

    var narrow = W < 760;
    var labels = narrow
      ? LABELS.slice().sort(function (a, b) { return a[0].length - b[0].length; }).slice(0, 14)
      : LABELS;
    // Few enough that stage two still reads as the pills becoming dots, and
    // held back until stage three so they arrive with the mesh, not with the
    // transformation.
    var extraCount = narrow ? 11 : 20;

    var cols = narrow ? 2 : 3;
    var rows = Math.ceil(labels.length / cols);
    for (var i = 0; i < labels.length; i++) {
      particles.push(makeParticle(rnd, {
        nx: clamp((i % cols + 0.5) / cols + (rnd() - 0.5) * 0.52 / cols, 0.04, 0.96),
        ny: clamp((Math.floor(i / cols) + 0.5) / rows + (rnd() - 0.5) * 0.62 / rows, 0.03, 0.97),
        label: labels[i][0],
        kind: labels[i][1]
      }));
    }

    for (var j = 0; j < extraCount; j++) {
      particles.push(makeParticle(rnd, {
        nx: 0.06 + rnd() * 0.88,
        ny: 0.05 + rnd() * 0.90,
        label: null,
        kind: EXTRA_KINDS[(rnd() * EXTRA_KINDS.length) | 0]
      }));
    }

    particles.forEach(function (p, i) { p.linkOrder = i / particles.length; });
    linkFlags = new Uint8Array(particles.length * particles.length);
  }

  function makeParticle(rnd, opts) {
    return {
      label: opts.label,
      kind: opts.kind,
      colour: KIND[opts.kind] || KIND.fact,
      nx: opts.nx,
      ny: opts.ny,
      pillW: 0,

      /* orbit — every one of these is unique, which is what stops the cloud
         reading as a single rotating ring */
      radN:  0.30 + rnd() * 0.72,        // radius, as a share of the band
      flat:  0.11 + rnd() * 0.24,        // how flat its ellipse projects
      tilt:  (rnd() * 2 - 1) * 0.34,     // tilt of its orbital plane
      spin:  0.052 + rnd() * 0.082,      // rad/s — a turn every 45–120s
      dir:   rnd() < 0.5 ? -1 : 1,       // which half of the orbit it starts on
      bob:   rnd() * TAU,

      /* the dot it keeps: some grow out of the pill, some shrink into it */
      r: 3.0 + rnd() * 5.8,
      stagger: rnd() * 0.10,
      baseAlpha: opts.label ? 1 : 0.52 + rnd() * 0.40,
      isExtra: !opts.label,

      x: 0, y: 0, alpha: 0, depth: 0, sizeMul: 1
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
    bandR = bandW * 0.52;
    bandH = field.h * 0.94;

    pillFont = '500 ' + (W < 760 ? 11 : 12) + 'px Onest, ui-sans-serif, system-ui, sans-serif';

    if (!particles.length) build();

    ctx.font = pillFont;
    particles.forEach(function (p) {
      p.pillW = p.label ? DOT_INSET + 9 + ctx.measureText(p.label).width + 14 : 0;
      // pills are laid out by their visible centre; the dot then sits at the
      // left of that box, and the dot is what the rest of the scene tracks
      var cxCell = field.x + p.nx * field.w;
      p.gx = cxCell - p.pillW / 2 + DOT_INSET;
      p.gy = field.y + p.ny * field.h;
    });

    relaxPills();
    solveOrbits();
  }

  /* A jittered grid knows nothing about how long each label is; a few passes
     of horizontal separation stop two pills sitting on top of each other. */
  function relaxPills() {
    var pills = particles.filter(function (p) { return p.label; });
    for (var pass = 0; pass < 9; pass++) {
      for (var i = 0; i < pills.length; i++) {
        for (var j = i + 1; j < pills.length; j++) {
          var a = pills[i], b = pills[j];
          if (Math.abs(a.gy - b.gy) > PILL_H + 12) continue;
          var need = (a.pillW + b.pillW) / 2 + 22;
          var dx = (b.gx - b.pillW / 2) - (a.gx - a.pillW / 2);
          var dist = Math.abs(dx) || 0.01;
          if (dist >= need) continue;
          var push = (need - dist) / 2;
          var dir = dx < 0 ? -1 : 1;
          a.gx -= push * dir;
          b.gx += push * dir;
        }
      }
      for (var k = 0; k < pills.length; k++) {
        var q = pills[k];
        var left = field.x - 84, right = field.x + field.w + 84;
        q.gx = clamp(q.gx, left + DOT_INSET, right - q.pillW + DOT_INSET);
      }
    }
  }

  /* Solve each orbit so that at accum = 0 it passes exactly through the grid
     position. That is the whole trick behind "the spin starts and nothing
     moves to somewhere new".

     Projected offset from the axis, for angle t:
       ex = R·cos t,  ey = R·flat·sin t
       px = ex·cosT − ey·sinT
       py = ex·sinT + ey·cosT
     so  px = R·(cosT·cos t − flat·sinT·sin t) = R·C·cos(t + phi)
     which inverts for t. Whatever vertical offset is left over becomes the
     particle's fixed height on the axis.                                    */
  function solveOrbits() {
    particles.forEach(function (p) {
      var cosT = Math.cos(p.tilt), sinT = Math.sin(p.tilt);
      p.cosT = cosT; p.sinT = sinT;

      var dx = p.gx - axisX;
      var C = Math.hypot(cosT, p.flat * sinT);
      var phi = Math.atan2(p.flat * sinT, cosT);

      p.R = Math.max(Math.abs(dx) / C + 6, bandR * p.radN);
      p.theta0 = p.dir * Math.acos(clamp(dx / (p.R * C), -1, 1)) - phi;

      var ex = p.R * Math.cos(p.theta0);
      var ey = p.R * p.flat * Math.sin(p.theta0);
      p.hOff = (p.gy - axisY) - (ex * sinT + ey * cosT);
      // where it sits top-to-bottom, which is what shapes the cone later
      p.u = clamp((p.hOff + bandH / 2) / bandH, 0, 1);
    });
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
  function place(orbit, funnel, cardCy) {
    var spinMul = lerp(1, 2.8, funnel);
    var bobFade = 1 - orbit;
    var tiltMul = lerp(1, 0.32, funnel);   // keeps the cone's outline crisp

    // the cone it collapses into: a mouth just under the copy, a tip behind
    // the middle of the screen
    var mouthY = field.y + 24;
    var tipY = cardCy + 24;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var theta = p.theta0 + p.spin * accum * spinMul;

      // radius and height are blended from the free cloud into the cone, so
      // `u` (where the particle sits top to bottom) becomes its depth down
      // the funnel
      var coneR = bandR * (0.05 + 1.18 * Math.pow(1 - p.u, 0.9)) *
                  (0.82 + 0.36 * p.radN);
      var R = lerp(p.R, coneR, funnel);
      var cy = lerp(axisY + p.hOff, lerp(mouthY, tipY, p.u), funnel);
      p.cone = lerp(1, coneR / bandR, funnel);

      var ex = R * Math.cos(theta);
      var ey = R * p.flat * Math.sin(theta);
      var x = axisX + ex * p.cosT * 1 - ey * p.sinT * tiltMul;
      var y = cy + ex * p.sinT * tiltMul + ey * p.cosT;

      // stage one is still: a small idle bob keeps it alive without moving
      // anything far enough to collide
      if (bobFade > 0.001) {
        x += Math.sin(elapsed * 0.52 + p.bob) * 3.4 * bobFade;
        y += Math.cos(elapsed * 0.41 + p.bob * 1.7) * 2.4 * bobFade;
      }

      p.x = x;
      p.y = y;

      // sin(theta) is how far round the axis it is: +1 nearest the viewer
      var depthN = (Math.sin(theta) + 1) / 2;
      p.depth = lerp(0.5, depthN, orbit);
      p.sizeMul = lerp(1, lerp(0.80, 1.20, p.depth), orbit);
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
        var left = p.x - DOT_INSET;
        var top = p.y - PILL_H / 2;
        var pa = a * p.mPill;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.tilt * 0.34 * (1 - p.mCollapse));
        ctx.translate(-p.x, -p.y);

        roundRect(left, top, w, PILL_H, PILL_H / 2);
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
          ctx.fillText(p.label, p.x + 9, p.y + 0.5);
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
    var cy = lerp(axisY, field.y + availH * 0.64, funnel);
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

    var orbit   = ss(p, 0.10, 0.34);   // the spin takes over from the idle bob
    var extras  = ss(p, 0.28, 0.54);   // the few unlabelled signals arrive
    var links   = ss(p, 0.34, 0.62);   // the mesh knits
    var clarity = ss(p, 0.55, 0.88);   // the screen surfaces, then is solid
    var grow    = ss(p, 0.70, 0.92);   // …and takes the centre
    var funnel  = ss(p, 0.64, 0.92);   // the cloud cones in behind it
    var dim     = 1 - ss(p, 0.54, 0.84) * 0.34;
    var hide    = ss(p, 0.76, 0.93);      // nothing draws over a solid screen

    elapsed += dt;
    accum += dt * (0.12 + 0.88 * orbit);

    var r = cardRect(grow, funnel);
    place(orbit, funnel, r.cy);

    var i, q;
    for (i = 0; i < particles.length; i++) {
      q = particles[i];

      var lp = p - q.stagger;
      q.mText     = 1 - ss(lp, 0.04, 0.15);                   // the words go
      q.mCollapse = Math.pow(ss(lp, 0.05, 0.26), 1.45);       // the pill closes
      q.mPill     = 1 - ss(lp, 0.11, 0.25);                   // …and fades out
      q.mDot      = ss(lp, 0.12, 0.32);                       // the dot resizes

      var copyFade = ss(q.y, field.y - 50, field.y + 18);
      var edgeFade = ss(q.x, -30, 40) * (1 - ss(q.x, W - 40, W + 30));
      var depthFade = lerp(1, lerp(0.56, 1, q.depth), orbit);

      q.alpha = q.baseAlpha * copyFade * edgeFade * depthFade *
                (q.isExtra ? extras : 1);

      // a particle in front of the screen fades only where it would cover it,
      // so the funnel's mouth survives while its body disappears behind
      q.overCard = hide > 0.002 && q.depth > 0.5
        ? 1 - hide * insideCard(q.x, q.y, r)
        : 1;

      // the narrow end of the funnel is taken into the screen, not stacked
      // up on the axis behind it
      q.alpha *= 1 - funnel * (1 - ss(q.cone, 0.06, 0.26));
    }

    ctx.clearRect(0, 0, W, H);

    for (i = 0; i < particles.length; i++) {
      q = particles[i];
      if (q.depth <= 0.5) drawParticle(q, dim);
    }
    drawMesh(links, dim * lerp(1, 0.88, funnel));
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
    accum = 0; elapsed = 0;
    place(1, 0, axisY);
    var r = cardRect(1, 0);
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
