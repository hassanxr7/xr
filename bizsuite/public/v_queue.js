// Barber waiting queue: ticket numbers, estimated wait, who is in the chair, finish = record the visit and take payment.
// "TV screen" shows now serving / next for a screen on the shop wall.
import { S, h, t, get, post, money, plain, parseMoney, can, sel, toast, errText, modal, formModal, clear, methodsAll, payRows, uuid, hashQ, busy, icon, openWhatsApp, branchesOf, openDoc, pill, askReason } from './core.js';

export async function queue(r) {
  const list = branchesOf('services'); if (!list.length) return h('div', { class: 'card empty' }, t('No data yet'));
  const b = list.find((x) => x.id === Number(r.q.branch_id)) || list[0]; const ccy = b.currency;
  const [svc, team] = await Promise.all([get('/services', { branch_id: b.id }), get('/branches/' + b.id + '/team')]);
  const services = svc.rows.filter((s) => s.active); const barbers = team.rows.filter((u) => u.role === 'Barber');
  const root = h('div', { class: 'stack' }); const body = h('div', { class: 'stack' }); const head = h('div', { class: 'row' });
  const addBtn = can('services.create') ? h('button', { class: 'btn p', onclick: () => addDialog() }, icon('plus'), t('Add customer')) : null;
  root.append(h('div', { class: 'card row' }, h('div', {}, h('h1', {}, t('Waiting queue')), h('small', { class: 'muted' }, b.name)), h('span', { style: 'flex:1' }), head,
    list.length > 1 ? sel(list.map((x) => ({ value: x.id, label: x.name })), b.id, (v) => { location.hash = hashQ('/queue', { branch_id: v }); }, { 'aria-label': t('Branch') }) : null,
    h('button', { class: 'btn', onclick: () => tv() }, icon('maximize'), t('TV screen')), addBtn), body);

  function addDialog() {
    formModal({ title: t('Add customer'), fields: [{ name: 'customer_name', label: 'Customer name' }, { name: 'phone', label: 'Phone (for WhatsApp)' }, { name: 'service_id', label: 'Service', type: 'select', num: true, placeholder: '—', options: services.map((s) => ({ value: s.id, label: `${s.name} · ${money(s.price, ccy)}` })) }, { name: 'barber_id', label: 'Preferred barber', type: 'select', num: true, placeholder: t('Any barber'), options: barbers.map((u) => ({ value: u.id, label: u.name })) }],
      submit: async (v) => { const x = await post('/queue', { branch_id: b.id, ...v }); toast(`${t('Ticket')} #${x.ticket}`, 'ok'); refresh(); } });
  }
  async function finishDialog(q) {
    const methods = await methodsAll(); const sv = sel(services.map((s) => ({ value: s.id, label: `${s.name} · ${money(s.price, ccy)}` })), q.service_id || services[0]?.id, () => draw(), { 'aria-label': t('Service') });
    const tip = h('input', { inputmode: 'decimal', placeholder: '0', style: 'width:110px', 'aria-label': t('Tip') }); const tot = h('div', { class: 'big' }); const price = () => services.find((s) => s.id === Number(sv.value))?.price || 0;
    const pr = payRows(ccy, methods, () => price()); const draw = () => { tot.textContent = money(price(), ccy); }; draw(); pr.add(plain(price(), ccy)); const key = uuid();
    modal({ title: `#${q.ticket} ${q.customer_name || ''} · ${q.barber_name || ''}`, body: h('div', { class: 'stack' }, h('label', { class: 'f' }, t('Service done'), sv), tot, h('label', { class: 'f' }, t('Tip'), tip), h('h3', {}, t('Payments')), pr.el),
      actions: (close) => { const ok = h('button', { class: 'btn p' }, t('Finish and record visit')); ok.onclick = busy(ok, async () => { let tp = 0; try { tp = tip.value ? parseMoney(tip.value, ccy) : 0; } catch { throw new Error(t('err.invalid_amount')); }
        const s = await post(`/queue/${q.id}/finish`, { service_id: Number(sv.value), tip: tp || undefined, payments: pr.read() }, { idem: key }); close(); toast(t('Visit recorded'), 'ok'); refresh();
        modal({ title: s.ref, body: h('div', { class: 'big' }, money(s.total, ccy)), actions: (c) => [h('button', { class: 'btn', onclick: () => openDoc('/print/sale/' + s.id, { mode: 'thermal' }) }, t('Thermal receipt')), h('button', { class: 'btn p', onclick: c }, t('OK'))] }); }); return [h('button', { class: 'btn', onclick: close }, t('Cancel')), ok]; } });
  }
  const act = (label, fn, cls = '') => { const x = h('button', { class: 'btn s ' + cls }, label); x.onclick = busy(x, fn); return x; };
  function ticket(q) {
    const can_ = (q.barber_id && q.barber_id === S.user.id) || can('services.create');
    const bsel = can('services.create') && q.status === 'waiting' ? sel([{ value: '', label: t('Barber') }, ...barbers.map((u) => ({ value: u.id, label: u.name }))], q.barber_id || '', null, { 'aria-label': t('Barber') }) : null;
    const actions = [];
    if (q.status === 'waiting' && can_) actions.push(bsel, act(t('Start'), async () => { await post(`/queue/${q.id}/start`, { barber_id: bsel?.value ? Number(bsel.value) : undefined }); refresh(); }, 'p'));
    if (q.status === 'serving' && can_) actions.push(act(t('Finish & pay'), async () => finishDialog(q), 'p'));
    if (['waiting', 'serving'].includes(q.status) && can_) actions.push(act(t('Left'), async () => { await post(`/queue/${q.id}/leave`); refresh(); }));
    if (q.phone && q.status === 'waiting') actions.push(h('button', { class: 'btn s', title: 'WhatsApp', onclick: () => openWhatsApp(q.phone, t('Hello {name}, it is your turn at {shop}. Please come now. Ticket #{no}.', { name: q.customer_name || '', shop: b.name, no: q.ticket })) }, icon('message-circle')));
    return h('div', { class: 'ticket ' + q.status }, h('div', { class: 'row sb' }, h('span', { class: 'no' }, '#' + q.ticket), pill(q.status === 'serving' ? 'in_progress' : q.status === 'waiting' ? 'pending' : q.status === 'done' ? 'completed' : 'cancelled', null)),
      h('div', {}, h('b', {}, q.customer_name || t('Walk-in')), q.phone ? h('small', { class: 'muted' }, ' · ' + q.phone) : null),
      h('small', { class: 'muted' }, [q.service_name, q.barber_name ? (q.status === 'waiting' ? `${t('prefers')} ${q.barber_name}` : q.barber_name) : null].filter(Boolean).join(' · ') || '—'),
      h('small', {}, q.status === 'waiting' ? `${t('Waiting')} ${q.waited_min} ${t('min')} · ${t('about')} ${q.est_wait_min} ${t('min')} ${t('left')}` : q.status === 'serving' ? `${t('In the chair')} ${q.serving_min} ${t('min')}` : q.sale_ref || ''),
      actions.length ? h('div', { class: 'row' }, actions) : null);
  }
  let last = null;
  async function refresh() {
    let d; try { d = await get('/queue', { branch_id: b.id }); } catch (e) { clear(body); body.append(h('div', { class: 'card' }, errText(e))); return; } last = d;
    clear(head); head.append(h('span', { class: 'pill warn' }, `${d.waiting} ${t('waiting')}`), h('span', { class: 'pill ok' }, `${d.serving} ${t('in the chair')}`), h('span', { class: 'pill' }, `${d.done} ${t('done today')}`), h('small', { class: 'muted' }, `≈ ${d.avg_service_min} ${t('min per customer')}`));
    const sec = (title, rows, empty) => h('div', { class: 'card' }, h('h2', {}, title), rows.length ? h('div', { class: 'queue' }, rows.map(ticket)) : h('div', { class: 'empty' }, empty));
    clear(body); body.append(sec(t('In the chair'), d.rows.filter((x) => x.status === 'serving'), t('Nobody is being served')), sec(t('Waiting'), d.rows.filter((x) => x.status === 'waiting'), t('Nobody is waiting')),
      h('div', { class: 'card' }, h('h2', {}, t('Finished today')), d.rows.filter((x) => ['done', 'left'].includes(x.status)).length ? h('div', { class: 'row' }, d.rows.filter((x) => ['done', 'left'].includes(x.status)).map((x) => h('span', { class: 'pill ' + (x.status === 'done' ? 'ok' : '') }, `#${x.ticket} ${x.customer_name || ''} ${x.barber_name ? '· ' + x.barber_name : ''}`))) : h('div', { class: 'empty' }, t('No data yet'))));
  }
  function tv() {
    const screen = h('div', { class: 'tvq' }); const ov = h('div', { class: 'tvwrap', onclick: () => { ov.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } }, screen);
    const paint = () => { if (!last) return; clear(screen); const serving = last.rows.filter((x) => x.status === 'serving'), waiting = last.rows.filter((x) => x.status === 'waiting');
      screen.append(h('div', { class: 'tvbrand' }, b.name), h('div', { class: 'tvcol' }, h('div', { class: 'tvh' }, t('Now serving')), serving.length ? serving.map((x) => h('div', { class: 'tvbig' }, '#' + x.ticket, h('small', {}, x.barber_name || ''))) : h('div', { class: 'tvsmall' }, '—')),
        h('div', { class: 'tvcol' }, h('div', { class: 'tvh' }, t('Next')), waiting.slice(0, 6).map((x) => h('div', { class: 'tvmid' }, '#' + x.ticket, h('small', {}, `≈ ${x.est_wait_min} ${t('min')}`))))); };
    document.body.append(ov); paint(); ov.requestFullscreen?.().catch(() => {}); const iv = setInterval(() => { if (!document.body.contains(ov)) return clearInterval(iv); refresh().then(paint); }, 15000);
  }
  await refresh();
  const timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); if (!document.querySelector('.overlay')) refresh(); }, 15000);
  void askReason; return root;
}
