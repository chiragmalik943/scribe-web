/* ============================================================================
   stack.js — the stacking cards in "Why Scribe"
   ----------------------------------------------------------------------------
   The stack itself is pure CSS: every panel is `position: sticky; top: 0` and
   one viewport tall, inside a single tall parent, so panel n+1 rises and comes
   to rest exactly over panel n.

   This file adds the depth cue. As the next card approaches, the one underneath
   shrinks slightly and dims, so the pile reads as cards on top of each other
   rather than one card being replaced. Below the tablet breakpoint the CSS
   flattens the stack into ordinary cards and this does nothing.
   ========================================================================== */

(function () {
  'use strict';

  var MIN_WIDTH = 901;          // matches the responsive.css breakpoint
  var MAX_SHRINK = 0.055;       // how much a covered card scales down
  var MAX_FADE = 0.30;          // how far a covered card dims

  var lists = [];
  var ticking = false;
  var enabled = false;

  function collect() {
    lists = Array.prototype.map.call(
      document.querySelectorAll('[data-stack]'),
      function (list) {
        return {
          root: list,
          cards: Array.prototype.map.call(
            list.querySelectorAll('.stack-panel'),
            function (panel) {
              return { panel: panel, card: panel.querySelector('.stack-card') };
            }
          )
        };
      }
    ).filter(function (l) { return l.cards.length > 1; });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function update() {
    ticking = false;
    var vh = window.innerHeight;

    lists.forEach(function (list) {
      list.cards.forEach(function (item, i) {
        var next = list.cards[i + 1];
        if (!next || !item.card) {
          if (item.card) {
            item.card.style.setProperty('--stack-scale', 1);
            item.card.style.opacity = '';
          }
          return;
        }

        // 0 while the next panel is still a full viewport away,
        // 1 once it has arrived at the top and fully covers this one.
        var top = next.panel.getBoundingClientRect().top;
        var p = clamp(1 - top / vh, 0, 1);
        // ease the tail so the last of the movement is gentle
        var eased = p * p * (3 - 2 * p);

        item.card.style.setProperty('--stack-scale', (1 - MAX_SHRINK * eased).toFixed(4));
        item.card.style.opacity = (1 - MAX_FADE * eased).toFixed(3);
      });
    });
  }

  function onScroll() {
    if (!enabled || ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function reset() {
    lists.forEach(function (list) {
      list.cards.forEach(function (item) {
        if (!item.card) return;
        item.card.style.removeProperty('--stack-scale');
        item.card.style.opacity = '';
      });
    });
  }

  function evaluate() {
    var should = window.innerWidth >= MIN_WIDTH &&
                 !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (should === enabled) return;
    enabled = should;
    if (enabled) { update(); } else { reset(); }
  }

  function init() {
    collect();
    if (!lists.length) return;
    evaluate();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { evaluate(); onScroll(); }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
