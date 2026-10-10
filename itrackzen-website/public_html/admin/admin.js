/* Generic JSON form editor: strings, numbers, booleans, lists and nested objects. */
(function () {
  'use strict';
  var A = window.ADMIN, model = A.data, root = document.getElementById('editor'), status = document.getElementById('status');
  var raw = document.getElementById('raw'), rawMode = false;
  var el = function (t, c, txt) { var n = document.createElement(t); if (c) { n.className = c; } if (txt != null) { n.textContent = txt; } return n; };
  var isImg = function (k) { return /(image|logo|photo|icon_url)$/i.test(k); };
  var pretty = function (k) { return String(k).replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); };
  function blank(sample) {
    if (Array.isArray(sample)) { return []; }
    if (sample && typeof sample === 'object') { var o = {}; Object.keys(sample).forEach(function (k) { o[k] = blank(sample[k]); }); return o; }
    if (typeof sample === 'number') { return 0; } if (typeof sample === 'boolean') { return false; } return '';
  }
  function titleOf(it, i) {
    if (it && typeof it === 'object') { var v = it.title || it.name || it.q || it.label || it.h || it.feature || it.slug || it.key || it.n; if (v) { return (i + 1) + '. ' + String(v).slice(0, 70); } }
    return 'Item ' + (i + 1);
  }
  function build(parent, obj, key) {
    var v = obj[key];
    var wrap = el('div', 'field');
    var lab = el('label', null, pretty(key)); wrap.appendChild(lab);
    if (Array.isArray(v)) {
      if (v.every(function (x) { return typeof x === 'string'; })) {
        var ta = el('textarea'); ta.value = v.join('\n'); ta.rows = Math.min(Math.max(v.length + 1, 3), 16);
        lab.appendChild(el('span', 'hint', ' (one per line)'));
        ta.addEventListener('input', function () { obj[key] = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); });
        wrap.appendChild(ta);
      } else { wrap.appendChild(buildList(v)); }
    } else if (v && typeof v === 'object') {
      var node = el('div', 'node'); Object.keys(v).forEach(function (k) { build(node, v, k); }); wrap.appendChild(node);
    } else if (typeof v === 'boolean') {
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = v; cb.addEventListener('change', function () { obj[key] = cb.checked; }); lab.prepend(cb); lab.appendChild(document.createTextNode(' '));
    } else if (typeof v === 'number') {
      var n = el('input'); n.type = 'number'; n.value = v; n.addEventListener('input', function () { obj[key] = n.value === '' ? 0 : Number(n.value); }); wrap.appendChild(n);
    } else {
      var s = String(v == null ? '' : v), long = s.length > 90 || s.indexOf('\n') > -1 || /^(text|a|p|intro|description|summary|mission|body|subtext|tagline_long)$/i.test(key);
      var f = el(long ? 'textarea' : 'input'); f.value = s; if (long) { f.rows = Math.min(Math.max(Math.ceil(s.length / 90) + 1, 3), 10); }
      if (isImg(key)) { lab.appendChild(el('span', 'hint', ' (path from Media library, e.g. /assets/uploads/photo.jpg)')); }
      f.addEventListener('input', function () { obj[key] = f.value; }); wrap.appendChild(f);
    }
    parent.appendChild(wrap);
  }
  function buildList(arr) {
    var box = el('div');
    function render() {
      box.innerHTML = '';
      arr.forEach(function (it, i) {
        var item = el('div', 'item'), head = el('div', 'item-h'), body = el('div', 'item-b'), tools = el('div', 'tools');
        head.appendChild(el('span', null, titleOf(it, i)));
        var mk = function (t, fn, title) { var b = el('button', null, t); b.type = 'button'; b.title = title; b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); tools.appendChild(b); };
        mk('↑', function () { if (i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); render(); } }, 'Move up');
        mk('↓', function () { if (i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); render(); } }, 'Move down');
        mk('⧉', function () { arr.splice(i + 1, 0, JSON.parse(JSON.stringify(it))); render(); }, 'Duplicate');
        mk('✕', function () { if (confirm('Delete this item?')) { arr.splice(i, 1); render(); } }, 'Delete');
        head.appendChild(tools); item.appendChild(head);
        body.hidden = arr.length > 6; head.addEventListener('click', function () { body.hidden = !body.hidden; });
        if (it && typeof it === 'object') { Object.keys(it).forEach(function (k) { build(body, it, k); }); }
        else { var inp = el('input'); inp.value = it; inp.addEventListener('input', function () { arr[i] = inp.value; }); body.appendChild(inp); }
        item.appendChild(body); box.appendChild(item);
      });
      var add = el('button', null, '+ Add item'); add.type = 'button';
      add.addEventListener('click', function () { arr.push(arr.length ? blank(arr[arr.length - 1]) : ''); render(); });
      box.appendChild(add);
    }
    render(); return box;
  }
  function renderAll() { root.innerHTML = ''; if (Array.isArray(model)) { root.appendChild(buildList(model)); } else { Object.keys(model).forEach(function (k) { build(root, model, k); }); } }
  renderAll();

  document.getElementById('toggle-raw').addEventListener('click', function () {
    if (!rawMode) { raw.value = JSON.stringify(model, null, 2); raw.hidden = false; root.hidden = true; this.textContent = 'Form view'; }
    else { try { model = JSON.parse(raw.value); } catch (e) { alert('Invalid JSON: ' + e.message); return; } raw.hidden = true; root.hidden = false; renderAll(); this.textContent = 'Raw JSON'; }
    rawMode = !rawMode;
  });
  document.getElementById('save').addEventListener('click', function () {
    var payload;
    if (rawMode) { try { model = JSON.parse(raw.value); } catch (e) { alert('Invalid JSON: ' + e.message); return; } }
    payload = JSON.stringify(model);
    var fd = new FormData(); fd.append('action', 'save'); fd.append('csrf', A.csrf); fd.append('file', A.file); fd.append('json', payload);
    status.className = ''; status.textContent = 'Saving...';
    fetch('/admin/', { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(function (r) { status.className = r.ok ? 'ok' : 'err'; status.textContent = r.message; })
      .catch(function () { status.className = 'err'; status.textContent = 'Save failed. Check your connection and try again.'; });
  });
  window.addEventListener('beforeunload', function () {});
})();
