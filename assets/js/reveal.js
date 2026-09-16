/* ============================================================================
   reveal.js — scroll-driven entrances
   ----------------------------------------------------------------------------
   Three effects, all driven by one IntersectionObserver:

     [data-reveal]          the element settles up into place
     [data-reveal="group"]  its direct children settle in sequence
     [data-split]           a display heading arrives one word at a time
     [data-count]           a number counts up the first time it is seen

   Everything is opt-in through data attributes, so markup stays readable and
   nothing is hidden unless the script is actually running.
   ========================================================================== */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── split display headings into words ─────────────────────────────────── */
  function splitHeading(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';

    var step = parseInt(el.dataset.splitStep || '38', 10);
    var index = 0;

    // Walk text nodes only, so nested <span class="soft"> colouring survives.
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();

      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement('span');
        span.className = 'split-word';
        span.textContent = part;
        span.style.setProperty('--word-delay', (index * step) + 'ms');
        index += 1;
        frag.appendChild(span);
      });

      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ── count-up numbers ──────────────────────────────────────────────────── */
  function countUp(el) {
    if (el.dataset.countDone) return;
    el.dataset.countDone = '1';

    var target = parseFloat(el.dataset.count);
    var decimals = parseInt(el.dataset.countDecimals || '0', 10);
    var prefix = el.dataset.countPrefix || '';
    var suffix = el.dataset.countSuffix || '';
    var duration = parseInt(el.dataset.countDuration || '1400', 10);

    if (isNaN(target)) return;
    if (reduced) {
      el.textContent = prefix + target.toFixed(decimals) + suffix;
      return;
    }

    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);           // easeOutCubic
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── observer ──────────────────────────────────────────────────────────── */
  function activate(el) {
    el.classList.add('is-in');
    el.querySelectorAll('[data-count]').forEach(countUp);
    if (el.hasAttribute('data-count')) countUp(el);
  }

  function init() {
    var targets = Array.prototype.slice.call(
      document.querySelectorAll('[data-reveal], [data-split], [data-count]')
    );

    // Prepare: stagger groups, split headings.
    targets.forEach(function (el) {
      if (el.hasAttribute('data-split')) splitHeading(el);

      if (el.getAttribute('data-reveal') === 'group') {
        var step = parseInt(el.dataset.revealStep || '90', 10);
        var base = parseInt(el.dataset.revealDelay || '0', 10);
        Array.prototype.forEach.call(el.children, function (child, i) {
          child.classList.add('reveal');
          child.style.setProperty('--reveal-delay', (base + i * step) + 'ms');
        });
      } else if (el.hasAttribute('data-reveal')) {
        el.classList.add('reveal');
        if (el.getAttribute('data-reveal') === 'soft') el.classList.add('reveal--soft');
        if (el.dataset.revealDelay) {
          el.style.setProperty('--reveal-delay', el.dataset.revealDelay + 'ms');
        }
      }
    });

    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach(activate);
      targets.forEach(function (el) {
        if (el.getAttribute('data-reveal') === 'group') {
          Array.prototype.forEach.call(el.children, function (c) { c.classList.add('is-in'); });
        }
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;

        if (el.getAttribute('data-reveal') === 'group') {
          Array.prototype.forEach.call(el.children, function (c) { c.classList.add('is-in'); });
          el.classList.add('is-in');
          el.querySelectorAll('[data-count]').forEach(countUp);
        } else {
          activate(el);
        }
        io.unobserve(el);
      });
    }, {
      root: null,
      // start the entrance a little before the element is fully on screen
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.08
    });

    targets.forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
