/* The Guardia — dashboard script: navigation, editor, AI assistant, image library, import & push runners. */
(function () {
  'use strict';
  var body = document.body;
  var base = body.getAttribute('data-base') || '';
  var csrf = body.getAttribute('data-csrf') || '';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function api(action, data) {
    var fd = data instanceof FormData ? data : new FormData();
    if (!(data instanceof FormData)) { Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); }); }
    fd.append('action', action);
    fd.append('csrf', csrf);
    return fetch(base + '/admin/api.php', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return { error: 'Server error (' + r.status + ')' }; }); })
      .then(function (j) { if (j.error) throw new Error(j.error); return j; });
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  // ---- Layout ----
  var navBtn = $('.js-nav');
  navBtn && navBtn.addEventListener('click', function () { $('#a-nav').classList.toggle('open'); });
  $$('.js-check-all').forEach(function (c) {
    c.addEventListener('change', function () { $$('input[name="ids[]"]', c.closest('form')).forEach(function (x) { x.checked = c.checked; }); });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.js-confirm');
    if (b && !window.confirm(b.getAttribute('data-confirm') || 'Are you sure?')) e.preventDefault();
  });
  $$('.js-copy').forEach(function (b) {
    b.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(b.getAttribute('data-copy')); b.textContent = '✔'; });
  });

  // ---- Chart tooltips ----
  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  body.appendChild(tip);
  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px';
  });

  // ---- Story editor ----
  var form = $('#editor-form');
  if (form) {
    var rte = $('#rte');
    var src = $('#f-body');
    var title = $('#f-title');
    var standfirst = $('#f-standfirst');
    var seoTitle = $('#f-seo-title');
    var seoDesc = $('#f-seo-desc');
    var slug = $('#f-slug');
    var kw = $('#f-kw');
    var sourceMode = false;
    var site = form.getAttribute('data-site');

    rte.innerHTML = src.value;
    src.hidden = true;
    rte.hidden = false;
    function sync() { if (!sourceMode) src.value = rte.innerHTML; }
    rte.addEventListener('input', function () { sync(); update(); });
    rte.addEventListener('paste', function (e) {
      // Paste as clean text paragraphs (avoids hidden Word/website formatting).
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;
      e.preventDefault();
      var html = text.split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
      document.execCommand('insertHTML', false, html);
    });
    form.addEventListener('submit', function () { if (!sourceMode) src.value = rte.innerHTML; });

    $$('.rte-bar button').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        var cmd = b.getAttribute('data-cmd'), block = b.getAttribute('data-block'), act = b.getAttribute('data-act');
        if (act === 'source') {
          sourceMode = !sourceMode;
          if (sourceMode) { src.value = rte.innerHTML; src.hidden = false; rte.hidden = true; }
          else { rte.innerHTML = src.value; src.hidden = true; rte.hidden = false; }
          b.classList.toggle('on', sourceMode);
          return;
        }
        if (sourceMode) return;
        rte.focus();
        if (cmd) document.execCommand(cmd, false, null);
        if (block) document.execCommand('formatBlock', false, '<' + block + '>');
        if (act === 'link') {
          var u = window.prompt('Link address (https://…)', 'https://');
          if (u && /^(https?:\/\/|\/|mailto:)/i.test(u)) document.execCommand('createLink', false, u);
        }
        if (act === 'video') {
          var v = window.prompt('YouTube link');
          var m = v && v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
          if (m) document.execCommand('insertHTML', false, '<p><iframe src="https://www.youtube-nocookie.com/embed/' + m[1] + '" title="Video" width="560" height="315" allowfullscreen></iframe></p><p><br></p>');
        }
        if (act === 'keypoints') {
          document.execCommand('insertHTML', false, '<aside class="key-points"><h3>Key points</h3><ul><li>…</li><li>…</li></ul></aside><p><br></p>');
        }
        if (act === 'image') { openLibrary('inline'); }
        sync();
        update();
      });
    });

    // Word count, SEO preview and checks
    function words(t) { return (t.match(/[\p{L}\p{N}’']+/gu) || []).length; }
    function textOf(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }
    function slugify(s) {
      return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90).replace(/-[^-]*$/, function (m) { return s.length > 90 ? '' : m; });
    }
    function counter(el) {
      var c = $('.count[data-for="' + el.id + '"]');
      if (!c) return;
      var max = parseInt(c.getAttribute('data-max'), 10), n = el.value.length || (el === seoTitle ? title.value.length : (standfirst.value.length));
      c.textContent = n + ' / ' + max;
      c.className = 'count ' + (n > max ? 'over' : n > max * 0.7 ? 'good' : '');
    }
    function update() {
      var html = sourceMode ? src.value : rte.innerHTML;
      var text = textOf(html);
      var n = words(text);
      $('#wordcount').textContent = n;
      $('#readtime').textContent = Math.max(1, Math.round(n / 230));
      var t = seoTitle.value || title.value;
      var d = seoDesc.value || standfirst.value || text.slice(0, 160);
      var s = slug.value || slugify(title.value);
      $('#serp-title').textContent = (t.length > 60 ? t.slice(0, 58) + '…' : t) || 'Headline';
      $('#serp-desc').textContent = d.length > 158 ? d.slice(0, 155) + '…' : d;
      $('#serp-path').textContent = new Date().getFullYear() + ' › ' + (s || 'story');
      counter(seoTitle);
      counter(seoDesc);
      // Checks
      var k = kw.value.trim().toLowerCase();
      var first = textOf((html.match(/<p[^>]*>[\s\S]*?<\/p>/i) || [''])[0]).toLowerCase();
      var checks = [
        [title.value.length >= 40 && title.value.length <= 90, 'Headline 40–90 characters (' + title.value.length + ')'],
        [standfirst.value.length >= 60, 'Summary under the headline written'],
        [n >= 300, 'At least 300 words (' + n + ')'],
        [/<h2/i.test(html) || n < 450, 'Subheadings (H2) in longer stories'],
        [!!k, 'Focus keyword set'],
        [!!k && t.toLowerCase().indexOf(k) !== -1, 'Keyword in the title'],
        [!!k && first.indexOf(k) !== -1, 'Keyword in the first paragraph'],
        [!!k && d.toLowerCase().indexOf(k) !== -1, 'Keyword in the meta description'],
        [d.length >= 120 && d.length <= 160, 'Description 120–160 characters (' + d.length + ')'],
        [$('#f-tags').value.split(',').filter(function (x) { return x.trim(); }).length >= 3, 'At least 3 tags'],
        [!!$('#f-image-id').value || !!form.querySelector('input[name=image_file]').value, 'Main image (needed for Google Discover & social)'],
        [!!$('#f-image-alt').value || !$('#f-image-id').value, 'Image alt text'],
        [/<a\s/i.test(html), 'At least one link (source or related story)'],
        [!!$('#f-cat').value, 'Section chosen']
      ];
      var ok = checks.filter(function (c) { return c[0]; }).length;
      var score = Math.round(ok / checks.length * 100);
      var sc = $('#seo-score');
      sc.textContent = score + '/100';
      sc.className = 'seo-score ' + (score >= 80 ? 'good' : score >= 55 ? 'mid' : 'bad');
      $('#seo-checks').innerHTML = checks.map(function (c) { return '<li class="' + (c[0] ? 'ok' : 'no') + '">' + (c[0] ? '✔' : '✘') + ' ' + esc(c[1]) + '</li>'; }).join('');
    }
    [title, standfirst, seoTitle, seoDesc, slug, kw, $('#f-tags'), $('#f-cat'), $('#f-image-alt'), src].forEach(function (el) { el && el.addEventListener('input', update); });
    form.querySelector('input[name=image_file]').addEventListener('change', update);
    update();

    // ---- AI assistant ----
    var status = $('.ai-status');
    function busy(on, msg) {
      $$('.js-ai-write, .js-ai-seo').forEach(function (b) { b.disabled = on; });
      status.textContent = msg || '';
      status.classList.toggle('spin', on);
    }
    function showExtras(st) {
      var res = $('.ai-result');
      res.hidden = false;
      var v = $('.ai-verify', res), alts = $('.ai-alts', res);
      var vs = st.verify_notes || [], hs = st.alt_headlines || [];
      v.hidden = !vs.length;
      $('ul', v).innerHTML = vs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      alts.hidden = !hs.length;
      $('ul', alts).innerHTML = hs.map(function (x) { return '<li><button type="button" class="link">' + esc(x) + '</button></li>'; }).join('');
      $$('button', alts).forEach(function (b) { b.addEventListener('click', function () { title.value = b.textContent; update(); }); });
    }
    function applyMeta(st) {
      if (st.seo_title) seoTitle.value = st.seo_title;
      if (st.meta_description) seoDesc.value = st.meta_description;
      if (st.focus_keyword) kw.value = st.focus_keyword;
      if (st.slug && !slug.value) slug.value = st.slug;
      if (st.tags && st.tags.length) $('#f-tags').value = st.tags.join(', ');
      if (st.category_id && !$('#f-cat').value) $('#f-cat').value = st.category_id;
      if (st.image_alt && !$('#f-image-alt').value) $('#f-image-alt').value = st.image_alt;
    }
    var writeBtn = $('.js-ai-write');
    writeBtn && writeBtn.addEventListener('click', function () {
      var notes = $('#ai-notes').value.trim();
      if (notes.length < 40) { status.textContent = 'Add more facts to the notes first.'; return; }
      if ((rte.textContent.trim().length > 50) && !window.confirm('Replace the current text with the AI draft?')) return;
      busy(true, 'Writing… this can take up to a minute.');
      api('ai_write', {
        notes: notes, type: form.querySelector('[name=ai_type]').value, length: form.querySelector('[name=ai_length]').value,
        lang: form.querySelector('[name=ai_lang]').value, source: form.querySelector('[name=ai_source]').value, headline: title.value
      }).then(function (j) {
        var st = j.story;
        title.value = st.headline || title.value;
        standfirst.value = st.standfirst || '';
        rte.innerHTML = st.body_html || '';
        sync();
        if (st.location) $('#f-location').value = st.location;
        slug.value = st.slug || '';
        applyMeta(st);
        showExtras(st);
        update();
        busy(false, 'Done. Read it carefully and check every fact before publishing.');
      }).catch(function (e) { busy(false, e.message); });
    });
    var seoBtn = $('.js-ai-seo');
    seoBtn && seoBtn.addEventListener('click', function () {
      busy(true, 'Analysing…');
      api('ai_seo', { title: title.value, body: sourceMode ? src.value : rte.innerHTML }).then(function (j) {
        applyMeta(j.story);
        if (j.story.standfirst && !standfirst.value) standfirst.value = j.story.standfirst;
        showExtras(j.story);
        update();
        busy(false, 'SEO fields updated.');
      }).catch(function (e) { busy(false, e.message); });
    });

    // ---- Image library ----
    var dlg = $('#media-dialog');
    var target = 'featured';
    var savedRange = null;
    function openLibrary(t) {
      target = t;
      var sel = window.getSelection();
      savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      loadMedia('');
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    }
    function loadMedia(q) {
      api('media_list', { q: q }).then(function (j) {
        $('#media-grid').innerHTML = j.items.map(function (m) {
          return '<button type="button" class="media-item" data-m=\'' + esc(JSON.stringify(m)).replace(/'/g, '&#39;') + '\'><img src="' + esc(m.thumb) + '" alt="" loading="lazy"><span>' + esc(m.alt || m.caption || ('#' + m.id)) + '</span></button>';
        }).join('') || '<p class="hint">No images yet — upload one.</p>';
      }).catch(function (e) { $('#media-grid').textContent = e.message; });
    }
    function choose(m) {
      if (target === 'featured') {
        $('#f-image-id').value = m.id;
        $('#img-preview').innerHTML = '<img src="' + esc(m.thumb) + '" alt="">';
        $('#f-image-alt').value = m.alt || '';
        $('#f-image-caption').value = m.caption || '';
        $('#f-image-credit').value = m.credit || '';
      } else {
        rte.focus();
        if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
        var cap = [m.caption, m.credit ? 'Photograph: ' + m.credit : ''].filter(Boolean).join(' ');
        document.execCommand('insertHTML', false, '<figure><img src="' + esc(m.src) + '" alt="' + esc(m.alt) + '" width="' + m.width + '" height="' + m.height + '">' + (cap ? '<figcaption>' + esc(cap) + '</figcaption>' : '') + '</figure><p><br></p>');
        sync();
      }
      dlg.close ? dlg.close() : dlg.removeAttribute('open');
      update();
    }
    if (dlg) {
      $('#media-grid').addEventListener('click', function (e) {
        var b = e.target.closest('.media-item');
        if (b) choose(JSON.parse(b.getAttribute('data-m')));
      });
      var t;
      $('#media-q').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { loadMedia(e.target.value); }, 300); });
      $('#media-upload').addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (!f) return;
        var fd = new FormData();
        fd.append('file', f);
        fd.append('alt', window.prompt('Describe the image (alt text):', '') || '');
        fd.append('credit', window.prompt('Photo credit:', '') || '');
        $('#media-grid').innerHTML = '<p class="hint">Uploading…</p>';
        api('media_upload', fd).then(function (j) { choose(j.item); }).catch(function (er) { $('#media-grid').textContent = er.message; });
      });
      $$('.js-pick-image').forEach(function (b) { b.addEventListener('click', function () { openLibrary('featured'); }); });
      $('.js-clear-image').addEventListener('click', function () {
        $('#f-image-id').value = '';
        $('#img-preview').innerHTML = '<span class="muted">No image</span>';
        update();
      });
    }
  }

  // ---- Import runner ----
  $$('.js-import').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.closest('[data-source]');
      var out = $('.import-log', box);
      var stopBtn = $('.js-import-stop', box);
      var mode = b.getAttribute('data-mode');
      var stopped = false, total = 0;
      $$('.js-import', box).forEach(function (x) { x.disabled = true; });
      stopBtn.hidden = false;
      stopBtn.onclick = function () { stopped = true; out.textContent += '\nStopping after this step…'; };
      out.hidden = false;
      out.textContent = 'Working…';
      (function step() {
        api('import_step', { source: box.getAttribute('data-source'), mode: mode }).then(function (r) {
          total += r.imported;
          out.textContent = 'Imported this run: ' + total + ' · pages read: ' + r.pages + ' · stories from this source: ' + r.total + (r.error ? '\nError: ' + r.error : '');
          if (!r.done && !r.error && !stopped && mode === 'backfill') return step();
          out.textContent += r.done ? '\nFinished.' : '';
          $$('.js-import', box).forEach(function (x) { x.disabled = false; });
          stopBtn.hidden = true;
        }).catch(function (e) {
          out.textContent += '\n' + e.message;
          $$('.js-import', box).forEach(function (x) { x.disabled = false; });
          stopBtn.hidden = true;
        });
      })();
    });
  });

  // ---- AI newsroom: run one step on demand ----
  var stepBtn = $('.js-newsroom-step');
  stepBtn && stepBtn.addEventListener('click', function () {
    var st = $('.newsroom-status');
    stepBtn.disabled = true;
    st.textContent = 'Working… a research or review step can take 1–4 minutes.';
    api('newsroom_step', {}).then(function (j) {
      st.textContent = j.did;
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) { st.textContent = e.message; stepBtn.disabled = false; });
  });
  var log = $('#chat-log');
  if (log) log.scrollTop = log.scrollHeight;

  // ---- Push sending progress ----
  var pushBox = $('[data-push-message]');
  if (pushBox) {
    (function step() {
      api('push_step', { message: pushBox.getAttribute('data-push-message') }).then(function (j) {
        var m = j.message;
        pushBox.textContent = 'Sent ' + m.sent + ' of ' + m.total + (m.failed ? ' (' + m.failed + ' expired)' : '') + (m.status === 'done' ? ' — finished.' : '…');
        if (m.status !== 'done') setTimeout(step, 500);
      }).catch(function (e) { pushBox.textContent = e.message; });
    })();
  }
})();
