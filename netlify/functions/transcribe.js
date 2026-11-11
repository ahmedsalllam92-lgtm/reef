// netlify/functions/transcribe.js
// تفريغ الاجتماعات: AssemblyAI (تفريغ + تمييز المتحدّثين) + GPT (تصحيح أمين) + محضر اجتماع منظّم
// المفاتيح: ASSEMBLYAI_API_KEY و OPENAI_API_KEY (سرّية على الخادم) · النموذج: OPENAI_MODEL (اختياري)

const AAI = "https://api.assemblyai.com/v2";
const OPENAI = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const WORD_BOOST = ["ريف","برنامج ريف","التنمية الريفية","وزارة البيئة والمياه والزراعة","مستخلص","المستخلص","تعميد","التعميد","أمر مباشرة","محضر تسليم الموقع","المقاول","الاستشاري","إدارة المشاريع","إدارة القطاعات","إدارة الخدمات المشتركة","المزارع النموذجية","الجبيل","نجران","جازان","عسير","الباحة","الجدول الزمني","نطاق العمل","الميزانية","الدفعة","نسبة الإنجاز","الترسية","المنافسة","الكراسات","خطاب الضمان","التحليل الفني","لجنة فحص العروض","المخطط","الفكرة التصميمية","المتطلبات","الطرح","التنفيذ","الإغلاق","أصناف","عسل","فاكهة","تمور","قطاع زراعي","قطاع حيواني","قطاع مائي"];

function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function _s(x,max){ x=(""+(x==null?"":x)).replace(/[ \t]+/g," ").trim(); return max?x.slice(0,max):x; }

async function _gpt(openaiKey, sys, user, json, maxTok){
  var body={ model:MODEL, temperature:0, messages:[ {role:"system",content:sys}, {role:"user",content:user} ] };
  if(json) body.response_format={type:"json_object"}; if(maxTok) body.max_tokens=maxTok;
  var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+openaiKey, "content-type":"application/json" }, body: JSON.stringify(body) });
  var j = await r.json();
  if(j && j.error) throw new Error(j.error.message||"خطأ من OpenAI");
  return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}

// تصحيح أمين للتفريغ (بدون ملخّص — المحضر يُنشأ منفصلاً)
async function _enhance(rawText, openaiKey){
  if(!openaiKey) return null;
  var sys = "أنت مدقّق لغوي لمحاضر اجتماعات. ستستلم تفريغًا خامًا (Speech-to-Text) لاجتماع باللهجة السعودية قد يحوي أخطاء في التعرّف على الكلمات. قواعد صارمة: (1) صحّح أخطاء التعرّف فقط عندما يكون التصحيح شبه مؤكد من السياق (مصطلح واضح كُتب خطأ). (2) ممنوع اختراع أو إضافة أي جملة أو معلومة غير موجودة؛ الغامض أو الناقص يُترك كما هو حرفيًا. (3) حافظ على تقسيم المتحدّثين وأسمائهم «المتحدّث N:» كما هي تمامًا وبنفس الترتيب، وكل مداخلة في فقرة. (4) لا تغيّر المعنى ولا تعيد صياغة الجمل الواضحة. (5) إن كان التفريغ قصيرًا جدًا أو غير مفهوم فاكتبه كما هو وأضف في أوله: «(ملاحظة: جودة التسجيل ضعيفة، يُنصح بإعادة التسجيل بصوت أوضح)». (6) لا تضف ملخّصًا ولا عناوين — أعد التفريغ المصحّح فقط.";
  try{ var t = await _gpt(openaiKey, sys, "التفريغ الخام:\n\n"+rawText, false); return t||null; }catch(e){ return null; }
}

// محضر اجتماع منظّم من التفريغ النهائي (بعد تسمية المتحدّثين)
async function _minutes(d, openaiKey){
  var sys = "أنت أمين سر محترف تُعدّ محاضر اجتماعات رسمية لبرنامج حكومي. ستستلم تفريغ اجتماع (قد يكون بالعامية) مع عنوانه وقائمة الحضور إن وُجدت. "
   +"اكتب محضرًا رسميًا بالعربية الفصحى المختصرة، بالاعتماد فقط على ما قيل فعلًا في التفريغ: ممنوع إضافة قرارات أو مهام أو مواعيد أو أسماء لم تُذكر. "
   +"إن لم يُذكر مسؤول المهمة صراحة اكتب «غير محدد»، وإن لم يُذكر موعد اكتب «غير محدد». اذكر في speaker اسم المتحدث كما ورد في التفريغ إن كانت النقطة منسوبة لمتحدث معين. "
   +"أعِد JSON فقط: {\"summary\":\"ملخص الاجتماع في 2-4 جمل\",\"topics\":[{\"title\":\"محور النقاش\",\"points\":[{\"text\":\"نقطة نوقشت\",\"speaker\":\"\"}]}],"
   +"\"decisions\":[\"قرار تم الاتفاق عليه صراحة\"],\"actions\":[{\"task\":\"مهمة محددة\",\"owner\":\"المسؤول أو غير محدد\",\"due\":\"الموعد أو غير محدد\"}],"
   +"\"open\":[\"نقطة معلّقة تحتاج متابعة\"],\"next\":\"موعد الاجتماع القادم إن ذُكر وإلا فارغ\"}. "
   +"بحد أقصى 6 محاور و12 قرارًا و15 مهمة. إن كان التفريغ لا يكفي لاستخلاص محضر فأعد summary يوضّح ذلك وباقي الحقول فارغة.";
  var u = "عنوان الاجتماع: "+_s(d.title,200)+(d.attendees?("\nالحضور: "+_s(d.attendees,600)):"")+(d.notes?("\nملاحظات يدوية من المُسجِّل: "+_s(d.notes,1500)):"")+"\n\nالتفريغ:\n"+String(d.text||"").slice(0,60000);
  var t = await _gpt(openaiKey, sys, u, true, 3500);
  var j; try{ j=JSON.parse(t); }catch(e){ j={}; }
  var arr=function(a,n){ return (Array.isArray(a)?a:[]).slice(0,n); };
  return { summary:_s(j.summary,1200),
    topics:arr(j.topics,6).map(function(x){ return {title:_s(x&&x.title,160), points:arr(x&&x.points,10).map(function(p){ return typeof p==="string"?{text:_s(p,400),speaker:""}:{text:_s(p&&p.text,400),speaker:_s(p&&p.speaker,60)}; }).filter(function(p){ return p.text; })}; }).filter(function(x){ return x.title||x.points.length; }),
    decisions:arr(j.decisions,12).map(function(x){ return _s(x,400); }).filter(Boolean),
    actions:arr(j.actions,15).map(function(a){ return {task:_s(a&&a.task,300),owner:_s(a&&a.owner,80)||"غير محدد",due:_s(a&&a.due,60)||"غير محدد"}; }).filter(function(a){ return a.task; }),
    open:arr(j.open,8).map(function(x){ return _s(x,300); }).filter(Boolean), next:_s(j.next,120) };
}

// إنشاء مهمة التفريغ مع بدائل آمنة إن رفضت الخدمة الإعدادات (اسم نموذج/تعزيز كلمات غير مدعوم)
async function _submit(AUTH, audioUrl, speakers){
  var base={ audio_url:audioUrl, language_code:"ar", speaker_labels:true, punctuate:true, format_text:true };
  if(speakers>=2 && speakers<=10) base.speakers_expected=speakers;
  var tries=[ Object.assign({},base,{ speech_models:["universal-3-5-pro","universal-2"], word_boost:WORD_BOOST, boost_param:"default" }),
              Object.assign({},base,{ word_boost:WORD_BOOST, boost_param:"default" }),
              Object.assign({},base) ];
  var last=null;
  for(var i=0;i<tries.length;i++){
    var tr = await fetch(AAI + "/transcript", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/json"}), body: JSON.stringify(tries[i]) });
    var tj = await tr.json();
    if(tj && tj.id) return { id:tj.id, cfg:i };
    last=(tj && tj.error) || "فشل إنشاء مهمة التفريغ";
    if(!/model|boost|speaker|param|support|invalid|unknown/i.test(String(last))) break;
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
    // محضر الاجتماع
    if (data.mode==="minutes") {
      if(!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});
      if(!data.text || String(data.text).trim().length<20) return _json(400,{error:"التفريغ قصير جدًا لإعداد محضر"});
      return _json(200, await _minutes(data, OKEY));
    }

    if (!KEY) return _json(500,{error:"مفتاح AssemblyAI غير مضبوط في إعدادات Netlify"});
    const AUTH = { authorization: KEY };

    // فحص الحالة + التصحيح عند الاكتمال
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
        var smart = await _enhance(raw, OKEY);
        // أمان: لو أسقط التصحيح متحدّثين أو قصّر النص كثيرًا نعتمد الخام
        if(smart){ var lost=speakers.some(function(s){ return smart.indexOf(s.label)<0; }); if(lost || smart.length < raw.length*0.6) smart=null; }
        return _json(200,{ status:"completed", text: smart||raw, raw: raw, enhanced: !!smart, speakers: speakers, duration: j.audio_duration||null });
      }
      if (j.status === "error") return _json(200,{status:"error", error:j.error||"خطأ في التفريغ"});
      return _json(200,{status:j.status||"processing"});
    }

    // بدء التفريغ من رابط (للتسجيلات الطويلة المرفوعة مسبقًا)
    if (data.url) {
      if(!/^https:\/\//.test(String(data.url))) return _json(400,{error:"رابط غير صالح"});
      var s1 = await _submit(AUTH, data.url, +data.speakers||0);
      return _json(200,{ id:s1.id, cfg:s1.cfg });
    }

    // بدء التفريغ من صوت مرسل مباشرة (حتى ~4 ميجا)
    if (data.audio) {
      const buf = Buffer.from(data.audio, "base64");
      const up = await fetch(AAI + "/upload", { method:"POST", headers:Object.assign({},AUTH,{"content-type":"application/octet-stream"}), body:buf });
      const uj = await up.json();
      if (!uj.upload_url) return _json(502,{error:"فشل رفع الصوت لخدمة التفريغ"});
      var s2 = await _submit(AUTH, uj.upload_url, +data.speakers||0);
      return _json(200,{ id:s2.id, cfg:s2.cfg });
    }

    return _json(400,{error:"لا يوجد صوت أو معرّف"});
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
