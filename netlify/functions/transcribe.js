// netlify/functions/transcribe.js
// تفريغ الاجتماعات عبر AssemblyAI (عربي + تمييز المتحدّثين)
// المفتاح يُقرأ من متغيّر البيئة ASSEMBLYAI_API_KEY (سري على الخادم)

const AAI = "https://api.assemblyai.com/v2";
const WORD_BOOST = ["ريف","برنامج ريف","التنمية الريفية","وزارة البيئة والمياه والزراعة","مستخلص","المستخلص","تعميد","التعميد","أمر مباشرة","محضر تسليم الموقع","المقاول","الاستشاري","إدارة المشاريع","إدارة القطاعات","إدارة الخدمات المشتركة","المزارع النموذجية","الجبيل","نجران","جازان","عسير","الباحة","الجدول الزمني","نطاق العمل","الميزانية","الدفعة","نسبة الإنجاز","الترسية","المنافسة","الكراسات","خطاب الضمان","التحليل الفني","لجنة فحص العروض","المخطط","الفكرة التصميمية","المتطلبات","الطرح","التنفيذ","الإغلاق"];


exports.handler = async function (event) {
  const KEY = process.env.ASSEMBLYAI_API_KEY;
  const JSONH = { "content-type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSONH, body: JSON.stringify({ error: "POST only" }) };
  }
  if (!KEY) {
    return { statusCode: 500, headers: JSONH, body: JSON.stringify({ error: "مفتاح AssemblyAI غير مضبوط في إعدادات Netlify" }) };
  }

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers: JSONH, body: JSON.stringify({ error: "طلب غير صالح" }) }; }

  const AUTH = { authorization: KEY };

  try {
    // ---- الوضع 2: فحص حالة التفريغ ----
    if (data.id) {
      const r = await fetch(AAI + "/transcript/" + data.id, { headers: AUTH });
      const j = await r.json();
      if (j.status === "completed") {
        let text = "";
        if (j.utterances && j.utterances.length) {
          text = j.utterances.map(function (u) {
            var n = (typeof u.speaker === "string") ? (u.speaker.charCodeAt(0) - 64) : u.speaker;
            if (!n || n < 1) n = u.speaker;
            return "المتحدّث " + n + ": " + u.text;
          }).join("\n\n");
        } else {
          text = j.text || "";
        }
        return { statusCode: 200, headers: JSONH, body: JSON.stringify({ status: "completed", text: text }) };
      }
      if (j.status === "error") {
        return { statusCode: 200, headers: JSONH, body: JSON.stringify({ status: "error", error: j.error || "خطأ في التفريغ" }) };
      }
      return { statusCode: 200, headers: JSONH, body: JSON.stringify({ status: j.status || "processing" }) };
    }

    // ---- الوضع 1: بدء التفريغ (رفع الصوت + إنشاء المهمة) ----
    if (data.audio) {
      const buf = Buffer.from(data.audio, "base64");

      // 1) رفع الصوت
      const up = await fetch(AAI + "/upload", {
        method: "POST",
        headers: Object.assign({}, AUTH, { "content-type": "application/octet-stream" }),
        body: buf
      });
      const uj = await up.json();
      if (!uj.upload_url) {
        return { statusCode: 502, headers: JSONH, body: JSON.stringify({ error: "فشل رفع الصوت لخدمة التفريغ" }) };
      }

      // 2) إنشاء مهمة التفريغ (عربي + تمييز المتحدّثين)
      const tr = await fetch(AAI + "/transcript", {
        method: "POST",
        headers: Object.assign({}, AUTH, JSONH),
        body: JSON.stringify({
          audio_url: uj.upload_url,
          language_code: "ar",
          speaker_labels: true,
          punctuate: true,
          format_text: true,
          word_boost: WORD_BOOST,
          boost_param: "high"
        })
      });
      const tj = await tr.json();
      if (!tj.id) {
        return { statusCode: 502, headers: JSONH, body: JSON.stringify({ error: (tj.error || "فشل إنشاء مهمة التفريغ") }) };
      }
      return { statusCode: 200, headers: JSONH, body: JSON.stringify({ id: tj.id }) };
    }

    return { statusCode: 400, headers: JSONH, body: JSON.stringify({ error: "لا يوجد صوت أو معرّف" }) };
  } catch (err) {
    return { statusCode: 500, headers: JSONH, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
