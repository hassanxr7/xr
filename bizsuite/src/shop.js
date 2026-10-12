// "I bought these" in one step for the shop manager: creates the product with its size/colour variants, receives the stock
// through a purchase (weighted-average cost, supplier balance) and optionally records what was paid - all in one transaction.
// Every variant's SKU is what its QR label encodes.
import { bad, notFound } from './errors.js';
import { int, mulBp } from './money.js';
import { str } from './admin.js';
import { createProduct, createPurchase, maxDisc } from './inventory.js';
import { recordPayment } from './payments.js';
import { saveSupplier } from './finance.js';

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
const code = (s, n) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, n);

export function stockIn(ctx, b) {
  ctx.need('products.create'); ctx.need('purchases.create');
  const br = ctx.branch(b.branch_id); ctx.requireModule(br, 'purchases');
  const name = str(b.name, 'name', { max: 120 }); const qty = int(b.qty, 'qty', { min: 1, max: 100000 });
  const cost = int(b.cost, 'cost', { min: 0 }), price = int(b.price, 'price', { min: 0 }); const max_discount_bp = maxDisc(b.max_discount_bp);
  if (price < cost && !b.allow_loss) throw bad('price_below_cost', 'The selling price is lower than the cost');
  const sizes = list(b.sizes), colors = list(b.colors); const prefix = code(b.sku_prefix, 16) || `${br.code}-${code(name, 8) || 'ITEM'}`;
  return ctx.tx(() => {
    let supplierId = b.supplier_id ? Number(b.supplier_id) : null;
    if (!supplierId) { const nm = String(b.supplier_name || '').trim() || 'Local market'; supplierId = ctx.get('SELECT id FROM suppliers WHERE org_id=? AND name=?', ctx.org_id, nm)?.id || saveSupplier(ctx, null, { name: nm }).id; }
    else if (!ctx.get('SELECT 1 x FROM suppliers WHERE id=? AND org_id=?', supplierId, ctx.org_id)) throw notFound('supplier');
    let sku = prefix; for (let n = 2; ctx.get('SELECT 1 x FROM variants WHERE org_id=? AND (sku=? OR sku LIKE ?)', ctx.org_id, sku, sku + '-%'); n++) sku = `${prefix}${n}`; // keep SKUs unique
    const variants = [];
    for (const s of sizes.length ? sizes : [null]) for (const c of colors.length ? colors : [null])
      variants.push({ sku: [sku, s && code(s, 6), c && code(c, 3)].filter(Boolean).join('-'), attrs: { ...(s ? { size: s } : {}), ...(c ? { color: c } : {}) }, cost, price, min_stock: int(b.min_stock ?? 0, 'min_stock', { min: 0 }), max_discount_bp });
    const p = createProduct(ctx, { business_id: br.business_id, name, category: b.category || null, brand: b.brand || null, kind: 'standard', image_file_id: b.image_file_id || null, variants });
    const vids = ctx.all('SELECT id FROM variants WHERE product_id=? ORDER BY id', p.id).map((r) => r.id);
    const po = createPurchase(ctx, { branch_id: br.id, supplier_id: supplierId, receive_now: true, note: b.note || null, lines: vids.map((id) => ({ variant_id: id, qty, unit_cost: cost })) });
    const total = qty * cost * vids.length; const paid = b.paid === 'full' ? total : int(b.paid ?? 0, 'paid', { min: 0 });
    if (paid > total) throw bad('overpayment', 'Payments exceed the total');
    if (paid) recordPayment(ctx, { party_type: 'purchase', party_id: po.id, method_id: b.method_id, amount: paid });
    const unitMin = price - mulBp(price, max_discount_bp || 0);
    ctx.audit('shop.stock_in', 'product', p.id, null, { qty, variants: vids.length, cost, price, max_discount_bp, purchase_id: po.id, paid }, br.id);
    return { product_id: p.id, variant_ids: vids, purchase_id: po.id, units: qty * vids.length, total_cost: total, paid,
      expected: { revenue: qty * vids.length * price, profit: qty * vids.length * (price - cost), profit_at_max_discount: qty * vids.length * (unitMin - cost) } };
  });
}
