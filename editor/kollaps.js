/* ============================================================
   Collapsible list: show the first N items, fade out the rest behind a
   button. Self-hosted in editor/, copied to dist/admin/ by the build.
   Link it from the template with
   <script src="/admin/kollaps.js" defer></script>.

   Mark the list container with data-collapsible="N" (defaults to 3).
   Optionally data-collapsible-noun="forestillinger" tunes the label in
   the button. The fade colour matches the surrounding background;
   override with --collapsible-fade (defaults to --color-bg).

   Admins always see every item, unwrapped, so they can move and edit
   the full list. Hidden items (.is-hidden-item) never count toward N.

   This file wraps the DOM: it puts the list container inside its own
   scaffolding (a .collapsible box, a fade layer, a "show more" button).
   The admin's undo replaces innerHTML across the whole edit region and
   then fires adm:restored; the snapshot brings that scaffolding back as
   dead markup with no listeners attached. So init() always tears the
   old scaffolding down first, for every matching container currently on
   the page, before it decides whether to build anything new. Skipping
   that step would double-wrap the list on every undo, or leave a dead
   "show more" button behind. Self-contained: injects its own minimal
   CSS.
   ============================================================ */
(function () {
  'use strict';
  function isAdmin() {
    try { return !!(sessionStorage.getItem('admin_pin') || localStorage.getItem('admin_pin')); }
    catch (e) { return false; }
  }

  // Undo the scaffolding from an earlier run so init() can rebuild it, or
  // leave the list alone entirely when the current visitor is an admin.
  // The wrapper markup survives an admin undo (it is part of the snapshot)
  // while its own listeners do not, so this must run before anything else
  // in init(), unconditionally, not only on the non-admin build path.
  function teardown(grid) {
    var wrap = grid.parentNode;
    if (!wrap || !wrap.classList || !wrap.classList.contains('collapsible')) return;
    var btnWrap = wrap.nextElementSibling;
    wrap.parentNode.insertBefore(grid, wrap);
    if (btnWrap && btnWrap.classList.contains('collapsible-more-wrap')) btnWrap.remove();
    wrap.remove();
  }

  // Buttons we have already wired a click listener to. NOT a marker class:
  // a button restored from an undo snapshot would carry the class while its
  // listener died with the old node, so a class check would silently skip
  // rebinding the one button that actually needs it. Every button built
  // here is a freshly created element, so this WeakSet always sees a new
  // key on a fresh build pass and rebinds; it exists as the same defensive
  // guard detail-modal.js uses for its cards, in case a future change ever
  // reuses a button node instead of recreating it.
  var boundButtons = new WeakSet();

  var cssDone = false;
  function injectCss() {
    if (cssDone) return; // init() can re-run; never inject the stylesheet twice
    cssDone = true;
    var s = document.createElement('style');
    s.textContent =
      '.collapsible{position:relative;overflow:hidden;transition:max-height .55s cubic-bezier(.16,1,.3,1)}' +
      '.collapsible__fade{position:absolute;left:0;right:0;bottom:0;height:160px;z-index:2;pointer-events:none;' +
        'opacity:0;transition:opacity .35s ease;background:linear-gradient(to bottom,transparent,var(--collapsible-fade,var(--color-bg)))}' +
      '.collapsible-more-wrap{text-align:center;margin-top:1.6rem;position:relative;z-index:3}';
    document.head.appendChild(s);
  }

  // Idempotent: always tears down before it (maybe) builds, so it is safe
  // to re-run on 'adm:restored'.
  function init() {
    // Rip out any existing scaffolding first, for every container currently
    // on the page, before deciding anything below. A restored snapshot can
    // bring this scaffolding back as dead markup, and it must never survive
    // an init() pass, admin or not.
    [].slice.call(document.querySelectorAll('[data-collapsible]')).forEach(function (grid) {
      teardown(grid);
    });
    if (isAdmin()) return; // admin manages the full, unwrapped list
    var grids = [].slice.call(document.querySelectorAll('[data-collapsible]'));
    if (!grids.length) return;
    injectCss();
    grids.forEach(function (grid) {
      var n = parseInt(grid.getAttribute('data-collapsible'), 10) || 3;
      var noun = grid.getAttribute('data-collapsible-noun') || '';
      var items = [].slice.call(grid.querySelectorAll('[data-list-item]'))
        .filter(function (it) { return !it.classList.contains('is-hidden-item'); });
      if (items.length <= n) return;

      var wrap = document.createElement('div');
      wrap.className = 'collapsible';
      grid.parentNode.insertBefore(wrap, grid);
      wrap.appendChild(grid);
      var fade = document.createElement('div');
      fade.className = 'collapsible__fade';
      wrap.appendChild(fade);

      var btnWrap = document.createElement('div');
      btnWrap.className = 'collapsible-more-wrap';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn collapsible-more';
      var rest = items.length - n;
      var moreText = 'Vis ' + rest + (noun ? ' ' + noun : '') + ' til';
      btn.textContent = moreText;
      btnWrap.appendChild(btn);
      wrap.parentNode.insertBefore(btnWrap, wrap.nextSibling);

      var collapsed = true;
      function collapsedHeight() {
        return Math.round(items[n - 1].getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 72);
      }
      function collapse() {
        collapsed = true; fade.style.opacity = '1';
        wrap.style.maxHeight = collapsedHeight() + 'px';
        btn.textContent = moreText;
      }
      function expand() {
        collapsed = false; fade.style.opacity = '0';
        wrap.style.maxHeight = wrap.scrollHeight + 'px';
        btn.textContent = 'Vis færre';
        setTimeout(function () { if (!collapsed) wrap.style.maxHeight = 'none'; }, 650);
      }
      if (!boundButtons.has(btn)) {
        boundButtons.add(btn);
        btn.addEventListener('click', function () {
          if (collapsed) expand();
          else { collapse(); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
      }
      collapse();
      // `isConnected` keeps a torn-down wrap's stale closure from measuring a
      // detached node (these window listeners outlive their wrapper).
      window.addEventListener('load', function () { if (collapsed && wrap.isConnected) wrap.style.maxHeight = collapsedHeight() + 'px'; });
      var rt;
      window.addEventListener('resize', function () {
        if (!collapsed || !wrap.isConnected) return;
        clearTimeout(rt);
        rt = setTimeout(function () { if (wrap.isConnected) wrap.style.maxHeight = collapsedHeight() + 'px'; }, 150);
      });
    });
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  // Rebind after the admin's undo replaces <main>'s innerHTML (see editor/edit.js).
  document.addEventListener('adm:restored', init);
})();
