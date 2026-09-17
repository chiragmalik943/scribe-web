/* ============================================================================
   hero-scene.js — the interactive "project context" illustration in the hero
   ----------------------------------------------------------------------------
   One canvas. A project card sits in the middle; fragments of what was said on
   earlier calls orbit it on a tilted ring. Each fragment is a pill led by a
   coloured dot that says what kind of thing it is, and a hair-thin thread runs
   from it to the edge of the card — the picture of a project holding everything
   it has been told.

   It is interactive on purpose: the claim the section makes is that Scribe
   reads a fragment against the project, so pointing at one should show you the
   reading. Hover, tap, or arrow-key a fragment and the card stops summarising
   and answers for that line instead.

     hover / tap / arrow keys   select a fragment — the card shows the reading
     drag                       spins the ring, with a flywheel's weight
     nothing at all             it drifts on its own, slowly

   It shares the app's insight vocabulary with context-scene.js (green decision,
   blue question, amber task, orange risk, grey detail) but no code: this one
   answers to the pointer, that one answers to scroll.

   Under `prefers-reduced-motion: reduce` the ring does not turn — the scene
   composes one still frame and selection still works.
   ========================================================================== */

(function () {
  'use strict';

  var scene = document.querySelector('[data-hero-scene]');
  if (!scene) return;

  var canvas = scene.querySelector('[data-hero-canvas]');
  if (!canvas) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var hint    = scene.querySelector('[data-hero-hint]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── palette ─────────────────────────────────────────────────────────── */
  var css = getComputedStyle(document.documentElement);
  function token(name, fallback) {
    var v = css.getPropertyValue(name).trim();
    return v || fallback;
  }
  var INK    = token('--ink', '#1C1A15');
  var INK2   = token('--ink-2', '#56524A');
  var INK3   = token('--ink-3', '#8C887E');
  var LINE   = 'rgba(28, 26, 21, .12)';
  var ACCENT = token('--accent', '#0548CF');

  /* One colour per kind of insight — the same vocabulary the app uses. */
  var KIND = {
    decision: { c: '#0A7548', label: 'Decision' },
    question: { c: '#1570EF', label: 'Open question' },
    task:     { c: '#B45309', label: 'Task' },
    risk:     { c: '#C2410C', label: 'Watchout' },
    fact:     { c: '#969186', label: 'Detail' }
  };

  /* ── what the project has been told ──────────────────────────────────────
     `said` is the line as it was spoken on a call; `read` is what Scribe makes
     of it once it is held against everything else in the project.          */
  var FRAGMENTS = [
    { said: '400 seats',            kind: 'risk',     from: 'Commercials · 2 Sep',
      read: 'The July pricing sheet still says 250. Two numbers, one contract.' },
    { said: 'March go-live',        kind: 'decision', from: 'Kick-off · 14 Jul',
      read: 'Agreed on the kick-off and never revisited. Migration depends on it.' },
    { said: 'Who owns SSO?',        kind: 'question', from: 'Technical · 4 Aug',
      read: 'Asked three calls ago. Nobody has answered it since.' },
    { said: 'Send pricing by Friday', kind: 'task',   from: 'Commercials · 2 Sep',
      read: 'Owed by Karen, due Friday. Nothing has been sent yet.' },
    { said: 'Legal must clear DPA', kind: 'risk',     from: 'Security · 21 Aug',
      read: 'Sits before the March date and has no owner on it.' },
    { said: 'Uplift holds at 4%',   kind: 'decision', from: 'Commercials · 2 Sep',
      read: 'The renewals note from June says 6%. Both are on record.' },
    { said: '60 clinicians',        kind: 'fact',     from: 'Discovery · 9 Jul',
      read: 'Quoted as the pilot group every time it has come up.' },
    { said: 'Deep-dive on the 25th', kind: 'task',    from: 'Technical · 4 Aug',
      read: 'Scheduled, but no agenda and no invite has gone out.' },
    { said: 'Backfills too?',       kind: 'question', from: 'Discovery · 9 Jul',
      read: 'Raised once, answered never — and it changes the seat count.' },
    { said: 'Security review first', kind: 'risk',    from: 'Security · 21 Aug',
      read: 'Blocks the pilot, and the pilot is what March depends on.' },
    { said: 'Two-year term',        kind: 'decision', from: 'Commercials · 2 Sep',
      read: 'Settled. Every later call has been consistent with it.' },
    { said: 'Revisit at 90 days',   kind: 'decision', from: 'Kick-off · 14 Jul',
      read: 'Lands mid-December, before the March date is under pressure.' }
  ];

  /* What the card says when nothing is selected. */
  var SUMMARY = [
    { kind: 'risk',     text: '3 watchouts across 9 calls' },
    { kind: 'decision', text: '12 decisions, all sourced' },
    { kind: 'question', text: '5 questions still open' }
  ];

  /* ── motion ──────────────────────────────────────────────────────────── */
  var AMBIENT = 0.085;   // rad/s with no input at all
  var DRAG    = 0.011;   // rad/s injected per pixel dragged
  var EASE_BACK = 2.2;   // how fast it eases back to ambient — the flywheel
  var MAX     = 3.2;

  var UI  = 'Onest, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var TAU = Math.PI * 2;

  /* ── state ───────────────────────────────────────────────────────────── */
  var W = 0, H = 0, dpr = 1;
  var small = false;
  var items = [];          // the live ring, rebuilt on resize
  var card  = { x: 0, y: 0, w: 0, h: 0 };
  var ringX = 0, ringY = 0;

  var angle = 0, spin = AMBIENT, last = 0, running = false, visible = true;
  var pointer = { x: 0, y: 0, inside: false };
  var dragging = false, dragX = 0, dragged = 0;

  var hover = -1;          // what the pointer is over
  var pinned = -1;         // what was clicked or arrow-keyed
  var shown = -1;          // what the card is currently showing
  var mix = 1;             // 0 while the card swaps what it shows
  var touched = false;     // any interaction at all — retires the hint

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function alpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* Wrap `text` to `width`, at most `maxLines` lines, ellipsing the last. */
  function wrap(text, width, maxLines) {
    var words = text.split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) break;
      } else {
        line = next;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines) {
      var tail = lines[maxLines - 1];
      if (ctx.measureText(tail).width > width) {
        while (tail.length > 1 && ctx.measureText(tail + '…').width > width) tail = tail.slice(0, -1);
        lines[maxLines - 1] = tail + '…';
      }
    }
    return lines;
  }

  /* Where a thread from `p` should stop: the card's edge, not its middle. */
  function edgePoint(px, py) {
    var dx = px - card.x, dy = py - card.y;
    if (!dx && !dy) return { x: card.x, y: card.y };
    var hw = card.w / 2 + 8, hh = card.h / 2 + 8;
    var t = Math.min(Math.abs(dx) > 1e-4 ? hw / Math.abs(dx) : Infinity,
                     Math.abs(dy) > 1e-4 ? hh / Math.abs(dy) : Infinity);
    t = Math.min(t, 1);
    return { x: card.x + dx * t, y: card.y + dy * t };
  }

  /* ── layout ──────────────────────────────────────────────────────────── */
  function layout() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    small = W < 620;

    card.w = clamp(W * 0.34, 236, 340);
    card.h = small ? 176 : 190;
    card.x = W / 2;
    card.y = H / 2;

    ringX = (W - card.w) / 2 + card.w * 0.20;
    ringX = Math.min(ringX, W / 2 - 24);
    ringY = H * (small ? 0.32 : 0.35);

    var count = small ? 8 : FRAGMENTS.length;
    if (items.length !== count) {
      items = [];
      for (var i = 0; i < count; i++) {
        var f = FRAGMENTS[i];
        items.push({
          i: i,
          f: f,
          /* Evenly spaced around the ring, then lifted by an amount that does
             not repeat with the spacing, so the ring never stacks into rows. */
          phase: (i / count) * TAU,
          lift: (((i * 5) % count) / (count - 1) - 0.5) * (small ? 0.32 : 0.46),
          x: 0, y: 0, w: 0, h: 0, d: 0
        });
      }
    }
    measure();
  }

  /* Pill widths depend on the font, which may still be loading. */
  function measure() {
    ctx.font = '500 ' + (small ? 12 : 13) + 'px ' + UI;
    items.forEach(function (it) {
      it.textW = ctx.measureText(it.f.said).width;
    });
  }

  /* ── the ring ────────────────────────────────────────────────────────── */
  function place() {
    var base = small ? 12 : 13;
    var a, i, it;

    for (i = 0; i < items.length; i++) {
      it = items[i];
      a = angle + it.phase;
      var s = Math.sin(a);                  // +1 nearest the viewer
      var d = (s + 1) / 2;
      var hot = (i === active());

      /* size first — the keep-out below needs to know how wide the pill is */
      var sc = 0.82 + d * 0.24;
      if (hot) sc = Math.max(sc, 1.04);
      it.d  = d;
      it.sc = sc;
      it.h  = (small ? 24 : 26) * sc;
      it.w  = (10 + 4 + 8 + 12) * sc + it.textW * sc;
      it.fs = base * sc;
      it.a  = hot ? 1 : 0.40 + d * 0.60;

      it.x = card.x + Math.cos(a) * ringX;
      it.y = card.y + s * ringY * 0.52 + it.lift * H;

      /* Keep the card readable. A pill whose box would cross the card is
         pushed clear of it — below when it is in front, above when it is
         behind. The push is weighted by how much of the card it would cover,
         and a pill's front/back sense only flips at the far left and right of
         the ring, where the push is already zero, so nothing ever jumps. */
      var touch = card.w / 2 + it.w / 2;                 // boxes just meet here
      var over = clamp((touch + 56 - Math.abs(it.x - card.x)) / 56, 0, 1);
      if (over > 0) {
        var need = card.h / 2 + it.h / 2 + 12;
        var want = card.y + (s >= 0 ? 1 : -1) * Math.max(Math.abs(it.y - card.y), need);
        it.y += (want - it.y) * over;
      }
    }
  }

  function active() { return pinned >= 0 ? pinned : hover; }

  /* ── drawing ─────────────────────────────────────────────────────────── */
  function drawThread(it, hot) {
    var e = edgePoint(it.x, it.y);
    var mx = (it.x + e.x) / 2, my = (it.y + e.y) / 2;
    ctx.beginPath();
    ctx.moveTo(it.x, it.y);
    ctx.quadraticCurveTo(mx + (card.x - mx) * 0.22, my + (card.y - my) * 0.22, e.x, e.y);
    if (hot) {
      ctx.strokeStyle = alpha(KIND[it.f.kind].c, 0.55);
      ctx.lineWidth = 1.3;
    } else {
      ctx.strokeStyle = 'rgba(28, 26, 21, ' + (0.045 + it.d * 0.045).toFixed(3) + ')';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  function drawPill(it, hot) {
    var w = it.w, h = it.h, x = it.x - w / 2, y = it.y - h / 2, r = h / 2;
    var col = KIND[it.f.kind].c;

    ctx.globalAlpha = it.a;
    if (hot) {
      ctx.shadowColor = 'rgba(28, 26, 21, .18)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 5;
    }
    roundRect(x, y, w, h, r);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? alpha(col, 0.45) : LINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 11 * it.sc, it.y, 3.4 * it.sc, 0, TAU);
    ctx.fillStyle = col;
    ctx.fill();

    ctx.font = '500 ' + it.fs.toFixed(1) + 'px ' + UI;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hot ? INK : INK2;
    ctx.fillText(it.f.said, x + (11 + 3.4 + 8) * it.sc, it.y + 0.5);
    ctx.globalAlpha = 1;
  }

  function drawCard() {
    var x = card.x - card.w / 2, y = card.y - card.h / 2;
    var pad = 16;

    ctx.shadowColor = 'rgba(28, 26, 21, .16)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    roundRect(x, y, card.w, card.h, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE;
    ctx.stroke();

    /* header */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 12.5px ' + UI;
    ctx.fillStyle = INK;
    ctx.fillText('Acme rollout', x + pad, y + pad + 11);
    ctx.font = '400 11px ' + UI;
    ctx.fillStyle = INK3;
    ctx.textAlign = 'right';
    ctx.fillText('9 calls', x + card.w - pad, y + pad + 11);
    ctx.textAlign = 'left';

    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad + 24.5);
    ctx.lineTo(x + card.w - pad, y + pad + 24.5);
    ctx.strokeStyle = LINE;
    ctx.stroke();

    /* body — cross-fades whenever what it answers for changes */
    var top = y + pad + 24, bottom = y + card.h;
    ctx.save();
    roundRect(x + 1, top, card.w - 2, bottom - top - 1, 12);
    ctx.clip();
    ctx.globalAlpha = mix;
    if (shown < 0) drawSummary(x, top, pad);
    else drawReading(items[shown] || { f: FRAGMENTS[shown] }, x, top, pad);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawSummary(x, top, pad) {
    ctx.font = '400 11.5px ' + UI;
    ctx.fillStyle = INK3;
    ctx.fillText('What the project holds', x + pad, top + 22);

    var ty = top + 48;
    SUMMARY.forEach(function (row) {
      ctx.beginPath();
      ctx.arc(x + pad + 4, ty - 4, 3.6, 0, TAU);
      ctx.fillStyle = KIND[row.kind].c;
      ctx.fill();
      ctx.font = '400 13px ' + UI;
      ctx.fillStyle = INK2;
      ctx.fillText(row.text, x + pad + 16, ty);
      ty += 26;
    });
  }

  function drawReading(it, x, top, pad) {
    var f = it.f, k = KIND[f.kind], w = card.w - pad * 2;

    ctx.font = '500 10px ' + UI;
    ctx.fillStyle = k.c;
    ctx.fillText(k.label.toUpperCase(), x + pad, top + 20);

    ctx.font = '400 10.5px ' + UI;
    ctx.fillStyle = INK3;
    ctx.textAlign = 'right';
    ctx.fillText(f.from, x + card.w - pad, top + 20);
    ctx.textAlign = 'left';

    ctx.font = '500 14px ' + UI;
    ctx.fillStyle = INK;
    var said = wrap('“' + f.said + '”', w, 2);
    var ty = top + 44;
    said.forEach(function (line) { ctx.fillText(line, x + pad, ty); ty += 19; });

    ctx.font = '400 12.5px ' + UI;
    ctx.fillStyle = INK2;
    ty += 6;
    wrap(f.read, w, 3).forEach(function (line) { ctx.fillText(line, x + pad, ty); ty += 18; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    place();

    var a = active();
    var order = items.slice().sort(function (p, q) { return p.d - q.d; });

    order.forEach(function (it) { if (it.i !== a) drawThread(it, false); });
    order.forEach(function (it) { if (it.d < 0.5 && it.i !== a) drawPill(it, false); });
    drawCard();
    order.forEach(function (it) { if (it.d >= 0.5 && it.i !== a) drawPill(it, false); });

    if (a >= 0 && items[a]) {
      drawThread(items[a], true);
      drawPill(items[a], true);
    }
  }

  /* ── loop ────────────────────────────────────────────────────────────── */
  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    if (!reduced) {
      /* One rule covers both behaviours: the ring is always easing back to its
         ambient drift, so a flick decays like a flywheel and pointing at a
         fragment brings it almost to a stop while you read. */
      if (!dragging) {
        var target = active() >= 0 ? AMBIENT * 0.12 : AMBIENT;
        spin += (target - spin) * Math.min(1, dt * EASE_BACK);
      }
      angle += spin * dt;
    }

    /* the card's cross-fade */
    var want = active();
    if (want !== shown) {
      mix -= dt * 6;
      if (mix <= 0) { shown = want; mix = 0; }
    } else if (mix < 1) {
      mix = Math.min(1, mix + dt * 6);
    }

    draw();
    window.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    window.requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  /* ── interaction ─────────────────────────────────────────────────────── */
  function hit(px, py) {
    var best = -1, bestD = -1;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var dx = Math.abs(px - it.x), dy = Math.abs(py - it.y);
      if (dx <= it.w / 2 + 4 && dy <= it.h / 2 + 5 && it.d > bestD) { best = i; bestD = it.d; }
    }
    return best;
  }

  function retireHint() {
    if (touched || !hint) return;
    touched = true;
    hint.classList.add('is-gone');
  }

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.inside = true;

    if (dragging) {
      var dx = e.clientX - dragX;
      dragX = e.clientX;
      dragged += Math.abs(dx);
      spin = clamp(spin + dx * DRAG, -MAX, MAX);
      return;
    }
    var h = hit(pointer.x, pointer.y);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h >= 0 ? 'pointer' : 'grab';
      if (h >= 0) retireHint();
    }
  });

  canvas.addEventListener('pointerleave', function () {
    pointer.inside = false;
    hover = -1;
    dragging = false;
  });

  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    dragX = e.clientX;
    dragged = 0;
    canvas.style.cursor = 'grabbing';
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    retireHint();
  });

  canvas.addEventListener('pointerup', function (e) {
    dragging = false;
    canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
    if (dragged > 6) return;                 // that was a drag, not a tap
    var r = canvas.getBoundingClientRect();
    var h = hit(e.clientX - r.left, e.clientY - r.top);
    hover = h;
    pinned = (h >= 0 && h === pinned) ? -1 : h;
  });

  /* keyboard — the same tour, without a pointer */
  canvas.addEventListener('keydown', function (e) {
    var n = items.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      pinned = pinned < 0 ? 0 : (pinned + 1) % n;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      pinned = pinned <= 0 ? n - 1 : pinned - 1;
    } else if (e.key === 'Escape') {
      pinned = -1;
    } else {
      return;
    }
    e.preventDefault();
    retireHint();
  });
  canvas.addEventListener('blur', function () { pinned = -1; });

  /* ── lifecycle ───────────────────────────────────────────────────────── */
  var resizeTimer;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { layout(); draw(); }, 140);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { rootMargin: '120px' }).observe(scene);
  } else {
    start();
  }

  layout();
  if (reduced) { angle = 0.42; draw(); }
  start();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); draw(); });
  }
})();
