// netlify/functions/transcribe.js
// تفريغ الاجتماعات: AssemblyAI (تفريغ + تمييز المتحدّثين) + GPT (تدقيق أمين بمسرد أسماء) + محضر اجتماع منظّم
// المفاتيح: ASSEMBLYAI_API_KEY و OPENAI_API_KEY (سرّية على الخادم) · النموذج: OPENAI_MODEL (اختياري)
//
// الأوضاع:
//   {audio|url, speakers, terms[]}      → بدء التفريغ (يرجع id)
//   {id, fast:true}                     → حالة التفريغ؛ عند الاكتمال يرجع النص الخام والمتحدّثين فوراً (التدقيق يتم على أجزاء من المتصفح)
//   {mode:"enhance", text, glossary[]}  → تدقيق جزء من التفريغ
//   {mode:"extract", text, ...}         → استخلاص نقاط جزء من اجتماع طويل
//   {mode:"minutes", text, ...}         → محضر الاجتماع بالأقسام المعتمدة

const AAI = "https://api.assemblyai.com/v2";
const OPENAI = "https://api.openai.com/v1/chat/completions";
const MODELS = [process.env.OPENAI_MODEL, "gpt-4.1", "gpt-4o"].filter(Boolean);
const WORD_BOOST = ["ريف","برنامج ريف","التنمية الريفية","وزارة البيئة والمياه والزراعة","مستخلص","المستخلص","تعميد","التعميد","أمر مباشرة","محضر تسليم الموقع","المقاول","الاستشاري","إدارة المشاريع","إدارة القطاعات","إدارة الخدمات المشتركة","المزارع النموذجية","الجدول الزمني","نطاق العمل","الميزانية","الدفعة","نسبة الإنجاز","الترسية","المنافسة","الكراسات","خطاب الضمان","التحليل الفني","لجنة فحص العروض","الطرح","التنفيذ","الإغلاق","الاستلام الابتدائي","الاستلام النهائي","أمر تغيير","تمديد","الحيود","المحفظة","الإنذار","عدم المطابقة","التصريح البيئي","الصك","التخصيص","الوكيل","الفروع","مدير الإدارة","PMO"];

function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function _s(x,max){ x=(""+(x==null?"":x)).replace(/[ \t]+/g," ").trim(); return max?x.slice(0,max):x; }
function _list(a,n,max){ return (Array.isArray(a)?a:[]).map(function(x){ return _s(x,max||120); }).filter(Boolean).slice(0,n); }

async function _gpt(openaiKey, sys, user, json, maxTok){
  var last=null;
  for(var i=0;i<MODELS.length;i++){
    var body={ model:MODELS[i], temperature:0, messages:[ {role:"system",content:sys}, {role:"user",content:user} ] };
    if(json) body.response_format={type:"json_object"}; if(maxTok) body.max_tokens=maxTok;
    var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+openaiKey, "content-type":"application/json" }, body: JSON.stringify(body) });
    var j = await r.json();
    if(j && j.error){ last=j.error.message||"خطأ من OpenAI"; if(/model|does not exist|not found|access/i.test(last)) continue; throw new Error(last); }
    return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  }
  throw new Error(last||"تعذّر الوصول إلى نموذج OpenAI");
}

// تدقيق أمين لجزء من التفريغ مع مسرد الأسماء والمصطلحات
async function _enhance(rawText, glossary, openaiKey){
  if(!openaiKey) return null;
  var sys = "أنت مدقّق لغوي لمحاضر اجتماعات برنامج حكومي سعودي (برنامج ريف). ستستلم جزءاً من تفريغ آلي (Speech-to-Text) لاجتماع باللهجة السعودية، فيه أخطاء تعرّف على الكلمات والأسماء. "
    +"قواعد صارمة: (1) صحّح أخطاء التعرّف عندما يكون التصحيح شبه مؤكد من السياق، وخاصة أسماء الأشخاص والمشاريع والجهات والمصطلحات: طابقها مع «المسرد» المرفق إن كان النطق قريباً منها. "
    +"(2) ممنوع اختراع أو إضافة أي جملة أو معلومة غير موجودة؛ الكلام غير المفهوم يُترك كما هو أو يُكتب [غير واضح]. (3) حافظ على أسطر المتحدّثين «المتحدّث N:» (أو الأسماء) كما هي تماماً وبنفس الترتيب، وكل مداخلة في فقرة. "
    +"(4) احذف التكرار الصوتي وكلمات الحشو فقط (مثل: آآ، يعني يعني) دون تغيير المعنى. (5) لا تعِد صياغة الجمل الواضحة ولا تحوّلها للفصحى. (6) أعد النص المدقّق فقط، بلا مقدمة أو ملخص أو عناوين.";
  var g = _list(glossary,250,90);
  var u = (g.length?("المسرد (أسماء ومصطلحات صحيحة):\n"+g.join("، ")+"\n\n"):"")+"جزء التفريغ:\n\n"+String(rawText||"").slice(0,9000);
  try{ var t = await _gpt(openaiKey, sys, u, false, 6000); return t||null; }catch(e){ return null; }
}

function _minutesSys(partial){
  return "أنت أمين سر محترف تُعدّ محاضر اجتماعات رسمية لبرنامج ريف (برنامج التنمية الريفية الزراعية المستدامة). "
   +(partial?"ستستلم جزءاً من تفريغ اجتماع طويل؛ استخلص منه فقط. ":"ستستلم تفريغ اجتماع (قد يكون بالعامية) أو نقاطاً مدخلة يدوياً، مع بيانات الاجتماع وأسماء الحضور وربما مهام الاجتماع السابق. ")
   +"اكتب بالعربية الفصحى الرسمية المختصرة بأسلوب المحاضر الحكومية (تمت مناقشة… / تم التوجيه بـ… / تم الاتفاق على…)، وبالاعتماد فقط على ما ورد فعلاً: ممنوع إضافة قرارات أو مهام أو مواعيد أو أسماء لم تُذكر. "
   +"المسؤول عن التنفيذ: استخدم الاسم كما ورد في قائمة الحضور إن كان مطابقاً لمن ذُكر، وإن لم يُحدَّد صراحة فاكتب «غير محدد». "
   +"أعد JSON فقط بهذا الشكل: {\"disc\":[\"بند من ملخص النقاشات (جملة أو جملتان لكل بند)\"],\"decisions\":[{\"task\":\"قرار أو توصية أو تكليف محدد\",\"owner\":\"المسؤول عن التنفيذ أو غير محدد\",\"due\":\"الموعد إن ذُكر وإلا فارغ\"}],"
   +"\"prev\":[{\"task\":\"مهمة من الاجتماع السابق\",\"owner\":\"\",\"status\":\"مستمر أو قيد التنفيذ أو تم\"}],\"next\":\"موعد الاجتماع القادم إن ذُكر وإلا فارغ\",\"summary\":\"جملة تلخّص الاجتماع\"}. "
   +"قواعد prev: إن أُرفقت مهام الاجتماع السابق فأعدها كلها بنفس نصها ومسؤوليها، وحدّث حالتها فقط إن نوقشت (تم = أُنجزت، قيد التنفيذ = بدأ العمل عليها، مستمر = لم تكتمل)، وإلا أبقِ حالتها كما وردت. وإن لم تُرفق فاستخرج فقط ما نوقش صراحةً كمتابعة لمهام سابقة. "
   +"بحد أقصى 20 بنداً للنقاشات و20 قراراً. إن كان النص لا يكفي لاستخلاص محضر فاجعل summary يوضّح ذلك وباقي الحقول فارغة.";
}
function _minutesUser(d){
  var att=_list(d.attendees,60,80), prev=(Array.isArray(d.prev)?d.prev:[]).slice(0,40).map(function(x,i){ return (i+1)+". "+_s(x&&x.task,300)+" — المسؤول: "+(_s(x&&x.owner,80)||"غير محدد")+" — الحالة: "+(_s(x&&x.status,30)||"مستمر"); });
  return "موضوع الاجتماع: "+_s(d.title,300)+(att.length?("\nأسماء الحضور: "+att.join("، ")):"")+(prev.length?("\nمهام الاجتماع السابق:\n"+prev.join("\n")):"")
    +(d.notes?("\nملاحظات المُسجِّل: "+_s(d.notes,2000)):"")+"\n\n"+(d.manual?"النقاط المدخلة يدوياً (أعد صياغتها رسمياً دون إضافة):\n":(d.merged?"نقاط مستخلصة من أجزاء الاجتماع (ادمج المكرر وصُغ المحضر النهائي):\n":"التفريغ:\n"))+String(d.text||"").slice(0,60000);
}
function _clean(j){ var arr=function(a,n){ return (Array.isArray(a)?a:[]).slice(0,n); };
  return { summary:_s(j.summary,800),
    disc:arr(j.disc,25).map(function(x){ return _s(typeof x==="string"?x:(x&&x.text),600); }).filter(Boolean),
    decisions:arr(j.decisions,25).map(function(a){ return typeof a==="string"?{task:_s(a,500),owner:"غير محدد",due:""}:{task:_s(a&&a.task,500),owner:_s(a&&a.owner,100)||"غير محدد",due:_s(a&&a.due,60)}; }).filter(function(a){ return a.task; }),
    prev:arr(j.prev,40).map(function(a){ return {task:_s(a&&a.task,500),owner:_s(a&&a.owner,100),status:_s(a&&a.status,30)||"مستمر"}; }).filter(function(a){ return a.task; }),
    next:_s(j.next,160) }; }
async function _minutes(d, openaiKey, partial){
  var t = await _gpt(openaiKey, _minutesSys(partial), _minutesUser(d), true, 4000);
  var j; try{ j=JSON.parse(t); }catch(e){ j={}; }
  return _clean(j);
}

// إنشاء مهمة التفريغ مع بدائل آمنة إن رفضت الخدمة الإعدادات
async function _submit(AUTH, audioUrl, speakers, terms){
  var boost=[], seen={};
  WORD_BOOST.concat(_list(terms,400,80)).forEach(function(w){ w=_s(w).split(/\s+/).slice(0,6).join(" "); if(w.length>1&&!seen[w]){ seen[w]=1; boost.push(w); } });
  boost=boost.slice(0,900);
  var base={ audio_url:audioUrl, language_code:"ar", speaker_labels:true, punctuate:true, format_text:true, disfluencies:false };
  if(speakers>=2 && speakers<=10) base.speakers_expected=speakers;
  var tries=[ Object.assign({},base,{ speech_models:["universal-3-5-pro","universal-2"], word_boost:boost, boost_param:"high" }),
              Object.assign({},base,{ speech_model:"universal", word_boost:boost, boost_param:"high" }),
              Object.assign({},base,{ word_boost:boost, boost_param:"default" }),
              Object.assign({},base) ];
  var last=null;
  for(var i=0;i<tries.length;i++){
    var tr = await fetch(AAI + "/transcript", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/json"}), body: JSON.stringify(tries[i]) });
    var tj = await tr.json();
    if(tj && tj.id) return { id:tj.id, cfg:i };
    last=(tj && tj.error) || "فشل إنشاء مهمة التفريغ";
    if(!/model|boost|speaker|param|support|invalid|unknown|disfluen/i.test(String(last))) break;
  }
  throw new Error(last);
}

exports.handler = async function (event) {
  const KEY = process.env.ASSEMBLYAI_API_KEY;
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  let data;
  try { data = JSON.parse(event.body || "{}"); } catch (e) { return _json(400,{error:"طلب غير صالح"}); }

  try {
    if (data.mode==="enhance") {
      if(!OKEY) return _json(200,{text:String(data.text||""),enhanced:false});
      var e1 = await _enhance(String(data.text||""), data.glossary, OKEY);
      return _json(200,{text:e1||String(data.text||""),enhanced:!!e1});
    }
    if (data.mode==="minutes" || data.mode==="extract") {
      if(!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});
      if(!data.text || String(data.text).trim().length<10) return _json(400,{error:"لا يوجد نص كافٍ لإعداد المحضر"});
      return _json(200, await _minutes(data, OKEY, data.mode==="extract"));
    }

    if (!KEY) return _json(500,{error:"مفتاح AssemblyAI غير مضبوط في إعدادات Netlify"});
    const AUTH = { authorization: KEY };

    if (data.id) {
      const r = await fetch(AAI + "/transcript/" + data.id, { headers: AUTH });
      const j = await r.json();
      if (j.status === "completed") {
        let raw = "", speakers = [];
        if (j.utterances && j.utterances.length) {
          var map={}, order=[];
          j.utterances.forEach(function(u){ var k=String(u.speaker); if(!map[k]){ order.push(k); map[k]={n:order.length,words:0,ms:0}; } var w=String(u.text||"").split(/\s+/).filter(Boolean).length; map[k].words+=w; map[k].ms+=Math.max(0,(u.end||0)-(u.start||0)); });
          raw = j.utterances.map(function (u) { return "المتحدّث "+map[String(u.speaker)].n+": "+u.text; }).join("\n\n");
          speakers = order.map(function(k){ return {label:"المتحدّث "+map[k].n, words:map[k].words, secs:Math.round(map[k].ms/1000)}; });
        } else { raw = j.text || ""; }
        if (data.fast) return _json(200,{ status:"completed", text: raw, raw: raw, enhanced:false, speakers: speakers, duration: j.audio_duration||null, confidence: j.confidence||null });
        var smart = await _enhance(raw.slice(0,9000), [], OKEY);
        if(smart){ var lost=speakers.some(function(s){ return smart.indexOf(s.label)<0; }); if(lost || smart.length < Math.min(raw.length,9000)*0.6 || raw.length>9000) smart=null; }
        return _json(200,{ status:"completed", text: smart||raw, raw: raw, enhanced: !!smart, speakers: speakers, duration: j.audio_duration||null });
      }
      if (j.status === "error") return _json(200,{status:"error", error:j.error||"خطأ في التفريغ"});
      return _json(200,{status:j.status||"processing"});
    }

    if (data.url) {
      if(!/^https:\/\//.test(String(data.url))) return _json(400,{error:"رابط غير صالح"});
      var s1 = await _submit(AUTH, data.url, +data.speakers||0, data.terms);
      return _json(200,{ id:s1.id, cfg:s1.cfg });
    }
    if (data.audio) {
      const buf = Buffer.from(data.audio, "base64");
      const up = await fetch(AAI + "/upload", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/octet-stream"}), body:buf });
      const uj = await up.json();
      if (!uj.upload_url) return _json(502,{error:"فشل رفع الصوت لخدمة التفريغ"});
      var s2 = await _submit(AUTH, uj.upload_url, +data.speakers||0, data.terms);
      return _json(200,{ id:s2.id, cfg:s2.cfg });
    }
    return _json(400,{error:"لا يوجد صوت أو معرّف"});
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
