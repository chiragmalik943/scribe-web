/* ============================================================================
   ui.js — interactive chrome
   ----------------------------------------------------------------------------
   Navigation state, the mobile menu, tab groups, the FAQ accordion, the pricing
   period switch, the integrations filter and the contact form. Each block bails
   out quietly when its markup is not on the page, so every page can load the
   same file.
   ========================================================================== */

(function () {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  /* ── nav: border once the page has moved ───────────────────────────────── */
  function initNav() {
    var nav = $('.nav');
    if (!nav) return;
    var ticking = false;
    function check() {
      ticking = false;
      nav.classList.toggle('is-stuck', window.scrollY > 8);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(check);
    }, { passive: true });
    check();
  }

  /* ── mobile menu ───────────────────────────────────────────────────────── */
  function initMobileMenu() {
    var toggle = $('.nav__toggle');
    var menu = $('.mobile-menu');
    if (!toggle || !menu) return;

    function setOpen(open) {
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    }

    toggle.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('menu-open'));
    });
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1000) setOpen(false);
    });
  }

  /* ── tabs ──────────────────────────────────────────────────────────────── */
  function initTabs() {
    $$('[data-tabs]').forEach(function (group) {
      var tabs = $$('[role="tab"]', group);
      var panels = $$('[role="tabpanel"]', group);
      if (!tabs.length) return;

      function select(index) {
        tabs.forEach(function (tab, i) {
          var on = i === index;
          tab.setAttribute('aria-selected', String(on));
          tab.setAttribute('tabindex', on ? '0' : '-1');
          if (panels[i]) panels[i].classList.toggle('is-active', on);
        });
      }

      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { select(i); });
        tab.addEventListener('keydown', function (e) {
          var next = e.key === 'ArrowRight' ? i + 1
                   : e.key === 'ArrowLeft'  ? i - 1 : null;
          if (next === null) return;
          e.preventDefault();
          var target = (next + tabs.length) % tabs.length;
          select(target);
          tabs[target].focus();
        });
      });

      select(0);
    });
  }

  /* ── accordion ─────────────────────────────────────────────────────────── */
  function initAccordion() {
    $$('[data-accordion]').forEach(function (acc) {
      var single = acc.dataset.accordion === 'single';
      $$('.acc__item', acc).forEach(function (item) {
        var btn = $('.acc__btn', item);
        if (!btn) return;
        btn.addEventListener('click', function () {
          var open = item.classList.contains('is-open');
          if (single) {
            $$('.acc__item', acc).forEach(function (other) {
              other.classList.remove('is-open');
              var b = $('.acc__btn', other);
              if (b) b.setAttribute('aria-expanded', 'false');
            });
          }
          item.classList.toggle('is-open', !open);
          btn.setAttribute('aria-expanded', String(!open));
        });
      });
    });
  }

  /* ── pricing period switch ─────────────────────────────────────────────── */
  function initPricingSwitch() {
    var sw = $('[data-price-switch]');
    if (!sw) return;

    var amounts = $$('[data-monthly]');
    var labels = $$('.switch__label', sw);

    function apply(yearly) {
      sw.setAttribute('aria-checked', String(yearly));
      if (labels[0]) labels[0].classList.toggle('is-on', !yearly);
      if (labels[1]) labels[1].classList.toggle('is-on', yearly);

      amounts.forEach(function (el) {
        var next = yearly ? el.dataset.yearly : el.dataset.monthly;
        if (el.textContent === next) return;
        el.style.opacity = '0';
        window.setTimeout(function () {
          el.textContent = next;
          el.style.opacity = '1';
        }, 130);
      });

      $$('[data-per]').forEach(function (el) {
        el.textContent = yearly ? '/mo, billed yearly' : '/mo';
      });
    }

    sw.addEventListener('click', function () {
      apply(sw.getAttribute('aria-checked') !== 'true');
    });
    sw.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      apply(sw.getAttribute('aria-checked') !== 'true');
    });

    apply(false);
  }

  /* ── integrations filter ───────────────────────────────────────────────── */
  function initFilter() {
    var input = $('[data-filter-input]');
    var list = $('[data-filter-list]');
    if (!input || !list) return;

    var empty = $('[data-filter-empty]');

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      $$('[data-filter-item]', list).forEach(function (item) {
        var hit = !q || item.dataset.filterItem.toLowerCase().indexOf(q) !== -1;
        item.classList.toggle('is-hidden', !hit);
        if (hit) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
    });
  }

  /* ── contact form ──────────────────────────────────────────────────────────
     No backend here. The form validates, then shows a confirmation so the page
     can be demonstrated; wire `action`/`method` up to your own endpoint.      */
  function initForm() {
    var form = $('[data-contact-form]');
    if (!form) return;
    var status = $('[data-form-status]', form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (status) {
        status.classList.add('is-shown');
        status.textContent = 'Thanks — we have your message and will reply within one working day.';
      }
      form.reset();
    });
  }

  /* ── footer year ───────────────────────────────────────────────────────── */
  function initYear() {
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  function init() {
    initNav();
    initMobileMenu();
    initTabs();
    initAccordion();
    initPricingSwitch();
    initFilter();
    initForm();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
