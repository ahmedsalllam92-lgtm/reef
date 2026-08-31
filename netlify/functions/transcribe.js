// netlify/functions/transcribe.js
// تفريغ الاجتماعات: AssemblyAI (تفريغ + تمييز المتحدّثين) + GPT-4o (تصحيح ذكي + ملخّص)
// المفاتيح: ASSEMBLYAI_API_KEY و OPENAI_API_KEY (سرّية على الخادم)

const AAI = "https://api.assemblyai.com/v2";
const OPENAI = "https://api.openai.com/v1/chat/completions";
const WORD_BOOST = ["ريف","برنامج ريف","التنمية الريفية","وزارة البيئة والمياه والزراعة","مستخلص","المستخلص","تعميد","التعميد","أمر مباشرة","محضر تسليم الموقع","المقاول","الاستشاري","إدارة المشاريع","إدارة القطاعات","إدارة الخدمات المشتركة","المزارع النموذجية","الجبيل","نجران","جازان","عسير","الباحة","الجدول الزمني","نطاق العمل","الميزانية","الدفعة","نسبة الإنجاز","الترسية","المنافسة","الكراسات","خطاب الضمان","التحليل الفني","لجنة فحص العروض","المخطط","الفكرة التصميمية","المتطلبات","الطرح","التنفيذ","الإغلاق","أصناف","عسل","فاكهة","تمور","قطاع زراعي","قطاع حيواني","قطاع مائي"];

function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }

// تصحيح ذكي عبر GPT-4o
async function _enhance(rawText, openaiKey){
  if(!openaiKey) return null;
  var sys = "أنت مساعد متخصّص في تنقيح محاضر اجتماعات إدارة مشاريع في برنامج ريف السعودي (تنمية زراعية). ستستلم تفريغًا خامًا لاجتماع باللهجة السعودية العامّية فيه أخطاء في التعرّف على الكلام. مهمتك: (1) صحّح الكلمات المغلوطة من السياق مع الحفاظ على المعنى، وصحّح مصطلحات المشاريع (مستخلص، تعميد، ترسية، أصناف عسل وفاكهة وتمور، قطاعات...). (2) حافظ على تقسيم المتحدّثين كما هو (المتحدّث 1، المتحدّث 2...). (3) رتّب النص بفقرات واضحة بالعربية الفصحى المبسّطة دون تغيير المضمون. (4) في النهاية أضف قسمًا بعنوان «الملخّص» يتضمّن: أبرز النقاط، القرارات، والمهام مع المسؤول عنها إن ذُكر. لا تخترع معلومات غير موجودة.";
  try{
    var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+openaiKey, "content-type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o", temperature:0.2, messages:[ {role:"system",content:sys}, {role:"user",content:"التفريغ الخام:\n\n"+rawText} ] }) });
    var j = await r.json();
    if(j && j.choices && j.choices[0] && j.choices[0].message) return j.choices[0].message.content;
  }catch(e){}
  return null;
}

exports.handler = async function (event) {
  const KEY = process.env.ASSEMBLYAI_API_KEY;
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!KEY) return _json(500,{error:"مفتاح AssemblyAI غير مضبوط في إعدادات Netlify"});

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch (e) { return _json(400,{error:"طلب غير صالح"}); }
  const AUTH = { authorization: KEY };

  try {
    // فحص الحالة + التصحيح الذكي عند الاكتمال
    if (data.id) {
      const r = await fetch(AAI + "/transcript/" + data.id, { headers: AUTH });
      const j = await r.json();
      if (j.status === "completed") {
        let raw = "";
        if (j.utterances && j.utterances.length) {
          raw = j.utterances.map(function (u) { var n=(typeof u.speaker==="string")?(u.speaker.charCodeAt(0)-64):u.speaker; if(!n||n<1)n=u.speaker; return "المتحدّث "+n+": "+u.text; }).join("\n\n");
        } else { raw = j.text || ""; }
        var smart = await _enhance(raw, OKEY);
        return _json(200,{ status:"completed", text: smart||raw, raw: raw, enhanced: !!smart });
      }
      if (j.status === "error") return _json(200,{status:"error", error:j.error||"خطأ في التفريغ"});
      return _json(200,{status:j.status||"processing"});
    }

    // بدء التفريغ
    if (data.audio) {
      const buf = Buffer.from(data.audio, "base64");
      const up = await fetch(AAI + "/upload", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/octet-stream"}), body:buf });
      const uj = await up.json();
      if (!uj.upload_url) return _json(502,{error:"فشل رفع الصوت لخدمة التفريغ"});
      const tr = await fetch(AAI + "/transcript", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/json"}),
        body: JSON.stringify({ audio_url:uj.upload_url, language_code:"ar", speech_model:"best", speaker_labels:true, punctuate:true, format_text:true, word_boost:WORD_BOOST, boost_param:"default" }) });
      const tj = await tr.json();
      if (!tj.id) return _json(502,{error:(tj.error||"فشل إنشاء مهمة التفريغ")});
      return _json(200,{ id: tj.id });
    }

    return _json(400,{error:"لا يوجد صوت أو معرّف"});
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
