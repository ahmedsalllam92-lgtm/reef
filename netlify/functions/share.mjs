// netlify/functions/share.mjs
// روابط مشاركة مؤقتة (عرض فقط): إنشاء · تحقق · تمديد · إيقاف · حذف
// التخزين: Netlify Blobs (متجر "reef-shares") · مفتاح الإدارة: SHARE_ADMIN_KEY (سري في إعدادات Netlify)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const J = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const store = () => globalThis.__REEF_SHARE_STORE || getStore({ name: "reef-shares", consistency: "strong" });
const DAY = 864e5;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n || 120);
function expiryFrom(d, base) {
  if (d.until) { const t = Date.parse(d.until); if (!isNaN(t)) return t + (/T/.test(String(d.until)) ? 0 : DAY - 1); }
  const days = Math.max(1 / 24, Math.min(366, +d.days || 7));
  return (base || Date.now()) + days * DAY;
}
function safeEq(a, b) { a = Buffer.from(String(a || "")); b = Buffer.from(String(b || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function view(r) { const now = Date.now(); return { token: r.token, label: r.label, created: r.created, exp: r.exp, revoked: !!r.revoked, views: r.views || 0, lastView: r.lastView || null,
  status: r.revoked ? "revoked" : (r.exp < now ? "expired" : "active") }; }

export default async (req) => {
  if (req.method !== "POST") return J(405, { error: "POST only" });
  let d; try { d = await req.json(); } catch (e) { return J(400, { error: "طلب غير صالح" }); }
  const S = store();
  const tok = clean(d.token, 64);
  try {
    // ===== تحقق الزائر (بدون مفتاح) =====
    if (d.action === "check") {
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(tok)) return J(200, { ok: false, why: "notfound" });
      const r = await S.get(tok, { type: "json" });
      if (!r) return J(200, { ok: false, why: "notfound" });
      if (r.revoked) return J(200, { ok: false, why: "revoked" });
      if (r.exp < Date.now()) return J(200, { ok: false, why: "expired", exp: r.exp });
      if (d.count) { r.views = (r.views || 0) + 1; r.lastView = Date.now(); await S.setJSON(tok, r); }
      return J(200, { ok: true, exp: r.exp, label: r.label });
    }
    // ===== عمليات الإدارة (تتطلب المفتاح) =====
    const KEY = process.env.SHARE_ADMIN_KEY;
    if (!KEY) return J(500, { error: "لم يُضبط مفتاح الإدارة SHARE_ADMIN_KEY في إعدادات Netlify" });
    if (!safeEq(d.key, KEY)) return J(403, { error: "مفتاح الإدارة غير صحيح" });

    if (d.action === "create") {
      const token = crypto.randomBytes(18).toString("base64url");
      const r = { token, label: clean(d.label) || "رابط مشاركة", created: Date.now(), exp: expiryFrom(d), revoked: false, views: 0 };
      await S.setJSON(token, r); return J(200, { ok: true, link: view(r) });
    }
    if (d.action === "list") {
      const { blobs } = await S.list();
      const all = (await Promise.all((blobs || []).map(b => S.get(b.key, { type: "json" })))).filter(Boolean).map(view).sort((a, b) => b.created - a.created);
      return J(200, { ok: true, links: all });
    }
    const r = tok ? await S.get(tok, { type: "json" }) : null;
    if (!r) return J(404, { error: "الرابط غير موجود" });
    if (d.action === "extend") { r.exp = d.until ? expiryFrom(d) : expiryFrom(d, Math.max(Date.now(), r.exp)); r.revoked = false; await S.setJSON(tok, r); return J(200, { ok: true, link: view(r) }); }
    if (d.action === "revoke") { r.revoked = true; r.revokedAt = Date.now(); await S.setJSON(tok, r); return J(200, { ok: true, link: view(r) }); }
    if (d.action === "restore") { r.revoked = false; await S.setJSON(tok, r); return J(200, { ok: true, link: view(r) }); }
    if (d.action === "rename") { r.label = clean(d.label) || r.label; await S.setJSON(tok, r); return J(200, { ok: true, link: view(r) }); }
    if (d.action === "delete") { await S.delete(tok); return J(200, { ok: true }); }
    return J(400, { error: "إجراء غير معروف" });
  } catch (err) {
    return J(500, { error: "تعذّر الوصول لمخزن الروابط: " + String(err && err.message || err).slice(0, 200) });
  }
};
