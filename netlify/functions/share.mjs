// netlify/functions/share.mjs
// روابط مشاركة مؤقتة (عرض فقط): إنشاء · تحقق · تمديد · إيقاف · حذف
// التخزين: Netlify Blobs (متجر "reef-shares") · مفتاح الإدارة: SHARE_ADMIN_KEY (سري في إعدادات Netlify)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const J = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const store = () => globalThis.__REEF_SHARE_STORE || getStore({ name: "reef-shares", consistency: "strong" });
const pfStore = () => globalThis.__REEF_PF_STORE || getStore({ name: "reef-portfolio", consistency: "strong" });
const DAY = 864e5;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n || 120);
function expiryFrom(d, base) {
  if (d.until) { const t = Date.parse(d.until); if (!isNaN(t)) return t + (/T/.test(String(d.until)) ? 0 : DAY - 1); }
  const days = Math.max(1 / 24, Math.min(366, +d.days || 7));
  return (base || Date.now()) + days * DAY;
}
function safeEq(a, b) { a = Buffer.from(String(a || "")); b = Buffer.from(String(b || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); }
// نطاق الرابط: لوحة الأداء العامة (بفلاترها) أو لوحة مشروع واحد — بدونه يفتح المنصة كاملة للعرض فقط
function cleanScope(s) { if (!s || typeof s !== "object") return null; const v = clean(s.v, 8); if (v !== "dash" && v !== "pd" && v !== "live") return null;
  const o = { v }; if (v === "pd") { o.code = clean(s.code, 30); if (!o.code) return null; o.name = clean(s.name, 160); }
  if (v === "dash" && s.f && typeof s.f === "object") { o.f = {}; ["region", "sector", "ptype", "cat"].forEach(k => { const x = s.f[k]; if (Array.isArray(x)) o.f[k] = x.slice(0, 20).map(y => clean(y, 60)).filter(Boolean); else if (x) o.f[k] = clean(x, 60); }); }
  return o; }
function view(r) { const now = Date.now(); return { token: r.token, label: r.label, created: r.created, exp: r.exp, revoked: !!r.revoked, views: r.views || 0, lastView: r.lastView || null, scope: r.scope || null,
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
      return J(200, { ok: true, exp: r.exp, label: r.label, scope: r.scope || null });
    }
    // ===== آخر نسخة من المحفظة المرفوعة: يقرؤها الزائر برابط صالح (أو المسؤول بالمفتاح) =====
    if (d.action === "pf_get") {
      let ok = false;
      if (/^[A-Za-z0-9_-]{16,64}$/.test(tok)) { const r = await S.get(tok, { type: "json" }); ok = !!(r && !r.revoked && r.exp >= Date.now()); }
      if (!ok && process.env.SHARE_ADMIN_KEY && safeEq(d.key, process.env.SHARE_ADMIN_KEY)) ok = true;
      if (!ok) return J(403, { ok: false, error: "غير مصرح" });
      const P = pfStore(); const meta = await P.get("meta", { type: "json" });
      if (!meta) return J(200, { ok: true, none: true });
      if (d.since && String(d.since) === String(meta.at)) return J(200, { ok: true, same: true, at: meta.at });
      const pf = await P.get("pf", { type: "json" }); return J(200, { ok: true, pf });
    }
    if (d.action === "pm_put") {
      const M = d.d; if (!M || typeof M !== "object" || !Array.isArray(M.phases)) return J(400, { error: "بيانات الخريطة غير صالحة" });
      const body = JSON.stringify(M); if (body.length > 4000000) return J(413, { error: "حجم الخريطة كبير" });
      const at = String(d.at || new Date().toISOString()); if (isNaN(Date.parse(at))) return J(400, { error: "تاريخ غير صالح" });
      const P = pfStore(); const m = await P.get("pm_meta", { type: "json" });
      if (m && !d.force && Date.parse(m.at) >= Date.parse(at)) return J(200, { ok: true, kept: true, at: m.at });
      const hk = "pmh_" + Date.now(); await P.setJSON(hk, { at, by: clean(d.by, 60), d: M });
      const hist = ((m && m.hist) || []).concat([{ k: hk, at, by: clean(d.by, 60) }]); while (hist.length > 30) { const old = hist.shift(); try { await P.delete(old.k); } catch (e) {} }
      await P.setJSON("pm", { at, d: M }); await P.setJSON("pm_meta", { at, hist }); return J(200, { ok: true, at });
    }
    if (d.action === "pm_hist") { const m = await pfStore().get("pm_meta", { type: "json" }); return J(200, { ok: true, list: ((m && m.hist) || []).slice().reverse() }); }
    if (d.action === "pm_ver") { const k = clean(d.k, 40); if (!/^pmh_\d+$/.test(k)) return J(400, { error: "نسخة غير صالحة" }); const v = await pfStore().get(k, { type: "json" }); return J(200, { ok: !!v, d: v && v.d, at: v && v.at }); }
    if (d.action === "pm_get") {
      const P = pfStore(); const m = await P.get("pm_meta", { type: "json" });
      if (!m) return J(200, { ok: true, none: true });
      if (d.since && String(d.since) === String(m.at)) return J(200, { ok: true, same: true, at: m.at });
      const pm = await P.get("pm", { type: "json" }); return J(200, { ok: true, at: m.at, d: (pm && pm.d) || null });
    }
    if (d.action === "pe_get") {
      const P = pfStore(); const m = await P.get("pe_meta", { type: "json" });
      if (!m) return J(200, { ok: true, none: true });
      if (d.since && String(d.since) === String(m.at)) return J(200, { ok: true, same: true, at: m.at });
      const pe = await P.get("pe", { type: "json" }); return J(200, { ok: true, at: m.at, edits: (pe && pe.edits) || {} });
    }
    // ===== عمليات الإدارة (تتطلب المفتاح) =====
    const KEY = process.env.SHARE_ADMIN_KEY;
    if (!KEY) return J(500, { error: "لم يُضبط مفتاح الإدارة SHARE_ADMIN_KEY في إعدادات Netlify" });
    if (!safeEq(d.key, KEY)) return J(403, { error: "مفتاح الإدارة غير صحيح" });

    if (d.action === "create") {
      const token = crypto.randomBytes(18).toString("base64url");
      const r = { token, label: clean(d.label) || "رابط مشاركة", created: Date.now(), exp: expiryFrom(d), revoked: false, views: 0, scope: cleanScope(d.scope) };
      await S.setJSON(token, r); return J(200, { ok: true, link: view(r) });
    }
    if (d.action === "pf_put") {
      const pf = d.pf; if (!pf || !Array.isArray(pf.data) || !pf.data.length || pf.data.length > 2000) return J(400, { error: "بيانات المحفظة غير صالحة" });
      const P = pfStore(); const meta = await P.get("meta", { type: "json" });
      if (meta && !d.force && Date.parse(meta.at) >= Date.parse(pf.at)) return J(200, { ok: true, kept: true, at: meta.at });
      const rec = { name: clean(pf.name, 160), sheet: clean(pf.sheet, 80), at: String(pf.at || new Date().toISOString()), data: pf.data, cancelled: Array.isArray(pf.cancelled) ? pf.cancelled.slice(0, 2000) : [] };
      await P.setJSON("pf", rec); await P.setJSON("meta", { at: rec.at, name: rec.name, n: rec.data.length }); return J(200, { ok: true, at: rec.at });
    }
    if (d.action === "pe_put") {
      const E = d.edits; if (!E || typeof E !== "object" || Array.isArray(E)) return J(400, { error: "تعديلات غير صالحة" });
      const body = JSON.stringify(E); if (body.length > 2000000) return J(413, { error: "حجم التعديلات كبير" });
      const at = String(d.at || new Date().toISOString()); if (isNaN(Date.parse(at))) return J(400, { error: "تاريخ غير صالح" });
      const P = pfStore(); const m = await P.get("pe_meta", { type: "json" });
      if (m && !d.force && Date.parse(m.at) >= Date.parse(at)) return J(200, { ok: true, kept: true, at: m.at });
      await P.setJSON("pe", { at, edits: E }); await P.setJSON("pe_meta", { at, n: Object.keys(E).length }); return J(200, { ok: true, at });
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
