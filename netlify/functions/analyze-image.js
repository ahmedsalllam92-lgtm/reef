// netlify/functions/analyze-image.js
// فحص صور المشاريع — تحليل مرحلتين (اكتشاف ثم تحقق بالقصاصات) + ملخّص تنفيذي لكل الصور
// المفتاح: OPENAI_API_KEY (سري على الخادم) · النموذج: OPENAI_MODEL (اختياري، الافتراضي gpt-4o)

const OPENAI = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const DISCLAIMER = "نتائج الفحص مؤشرات أولية مساندة ولا تُعد اعتمادًا هندسيًا أو بديلًا عن المعاينة الميدانية ومراجعة المهندس المختص.";
const VALID_TYPES = ["سلامة","إنشائي","جودة"];
const VALID_SEV = ["عالية","متوسطة","منخفضة"];
const VALID_OWNER = ["المقاول","الاستشاري","المالك","المورد"];
const VALID_DEADLINE = ["فوري","خلال 24 ساعة","خلال أسبوع","قبل الاستلام"];
const VALID_RATING = ["جيد","مقبول","يحتاج تدخل","خطر"];
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function _s(x,max){ x=(""+(x==null?"":x)).replace(/\s+/g," ").trim(); return max?x.slice(0,max):x; }

function focusText(focus){
  return ({safety:"محور الفحص: السلامة والصحة المهنية فقط (معدات الوقاية الشخصية، الحواف والفتحات غير المحمية، الحفريات وتدعيمها، السقالات والسلالم، الكهرباء المؤقتة والكابلات، المعدات والرافعات، التخزين، الحريق، المخلفات ومخاطر التعثر، المياه الراكدة). أعِد فقط ملاحظات نوعها «سلامة».",
    structural:"محور الفحص: الإنشائي فقط (شروخ وأنماطها، تعشيش، حديد مكشوف أو صدئ أو غطاء خرساني غير كافٍ، فواصل الصب، الشدات والدعامات، رطوبة/تلف، تشوهات أو هبوط ظاهر، وصلات ولحامات وتثبيت الهياكل المعدنية). أعِد فقط ملاحظات نوعها «إنشائي».",
    quality:"محور الفحص: جودة التنفيذ فقط (استقامة ومحاذاة، تشطيبات ومونة، عزل مائي وحراري، دهانات، تمديدات وأنظمة كهروميكانيكية، تثبيت وتشطيب الأعمال المعدنية، النظافة وتنظيم الموقع، حماية الأعمال المنجزة). أعِد فقط ملاحظات نوعها «جودة».",
    all:"افحص كل المحاور: السلامة، والإنشائي، وجودة التنفيذ، وصنّف كل ملاحظة بنوعها الصحيح."})[focus] || "افحص كل المحاور.";
}
function ctxText(ctx){
  if(!ctx || typeof ctx!=="object") return "";
  var p=[]; if(ctx.name) p.push("المشروع: "+_s(ctx.name,160)); if(ctx.sector) p.push("القطاع: "+_s(ctx.sector,40)); if(ctx.ptype) p.push("نوع المشروع: "+_s(ctx.ptype,40));
  if(ctx.region) p.push("المنطقة: "+_s(ctx.region,40)); if(ctx.status) p.push("حالة المشروع: "+_s(ctx.status,40)); if(ctx.progress!=null && ctx.progress!=="") p.push("نسبة الإنجاز المسجلة: "+_s(ctx.progress,10));
  if(ctx.note) p.push("ملاحظة الفاحص: "+_s(ctx.note,300));
  return p.length?("\n\nسياق المشروع (استخدمه لفهم ما يُفترض أن يكون في الصورة، ولا تُبلّغ عن شيء غير ظاهر): "+p.join(" · ")+"."):"";
}

// ===== المرحلة 1: الاكتشاف =====
function detectPrompt(focus,ctx){
  return "أنت مهندس فحص ميداني أول (سلامة وإنشاءات وجودة) خبير في مشاريع البناء والتشييد والأعمال الكهروميكانيكية والمشاريع الزراعية (بيوت محمية، مناحل، مزارع سمكية، مستودعات ومراكز تسويق)، ومطّلع على كود البناء السعودي ولوائح السلامة المعتمدة في المملكة. "+focusText(focus)+ctxText(ctx)+"\n\n"
  +"منهجية التحليل:\n"
  +"1) افهم المشهد أولاً: نوع الموقع، مرحلة التنفيذ الظاهرة، العناصر والمواد والمعدات والعمالة الظاهرة.\n"
  +"2) قسّم الصورة إلى شبكة 3×3 وافحص كل منطقة، المقدمة قبل الخلفية.\n"
  +"3) لكل ملاحظة اسأل: ما الدليل المرئي بالضبط؟ لماذا هو مشكلة (الأثر/الخطر)؟ ما الإجراء المحدد الذي يحلها؟ من المسؤول؟ وما المهلة المناسبة؟\n\n"
  +"قواعد الجودة (إلزامية):\n"
  +"- لا تُبلّغ إلا عن مشكلة دليلها ظاهر بوضوح في الصورة. ممنوع الملاحظات العامة غير المرتبطة بعنصر محدد (مثل «يجب الالتزام بمعايير السلامة») وممنوع افتراض ما لا يظهر.\n"
  +"- اذكر العنصر المحدد وموضعه بالكلمات (مثلاً «حديد الأعمدة البارزة يمين الصورة أسفل») في الحقل where.\n"
  +"- اكتب المشكلة بصياغة فنية دقيقة وقابلة للقياس قدر الإمكان، وتجنب التكرار: إن تكررت المشكلة نفسها في أكثر من موضع فاجمعها في ملاحظة واحدة واذكر المواضع.\n"
  +"- المعالجة يجب أن تكون خطوات عملية محددة (ماذا يُعمل وكيف) لا نصائح عامة؛ وللحالات الإنشائية الكبيرة: إجراء فوري ثم حل جذري باعتماد مهندس مختص.\n"
  +"- المرجع ref: اذكر مرجعاً (مثل كود البناء السعودي SBC أو اشتراطات الدفاع المدني) فقط إن كنت متأكداً من انطباقه، وإلا اتركه فارغاً.\n"
  +"- الثقة confidence تعكس وضوح الدليل لا خطورة المشكلة؛ ما لا يمكن الجزم به يُصنّف «مشتبه» أو «يحتاج فحص ميداني».\n"
  +"- أعِد بحد أقصى 8 ملاحظات هي الأهم، مرتبة من الأخطر.\n"
  +"- سجّل أيضاً حتى 3 ممارسات جيدة ظاهرة (positives) إن وُجدت، وما لا يمكن الحكم عليه من الصورة (limits) باختصار.\n\n"
  +"لكل ملاحظة: bbox بإحداثيات نسبية بين 0 و 1 (x,y للركن العلوي الأيسر، w,h)، وcx,cy مركزها كنسبة مئوية 0–100.\n\n"
  +"أعِد JSON فقط بالشكل: {\"scene\":\"وصف موجز للمشهد\",\"overall\":{\"stage\":\"مرحلة التنفيذ الظاهرة\",\"rating\":\"جيد|مقبول|يحتاج تدخل|خطر\",\"summary\":\"تقييم عام في جملتين يذكر أهم ما يلزم\"},"
  +"\"positives\":[\"ممارسة جيدة ظاهرة\"],\"limits\":[\"ما لا يمكن الحكم عليه من الصورة\"],"
  +"\"notes\":[{\"bbox\":{\"x\":0.5,\"y\":0.3,\"w\":0.2,\"h\":0.15},\"cx\":60,\"cy\":37,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":85,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\","
  +"\"problem\":\"عنوان فني دقيق للمشكلة\",\"where\":\"العنصر وموضعه في الصورة\",\"evidence\":\"الدليل المرئي\",\"impact\":\"الأثر أو الخطر المترتب\",\"immediate\":\"إجراء فوري\",\"fix\":\"معالجة عملية محددة\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"ref\":\"مرجع إن كان مؤكداً\",\"specialty\":\"التخصص المطلوب\"}]}. "
  +"إن لم تجد مشاكل أعِد notes فارغة مع تقييم عام. اكتب بالعربية الفصحى المهنية.";
}

// ===== المرحلة 2: التحقق بالقصاصة =====
function verifyPrompt(ctx){
  return "أنت مهندس فحص ميداني أول. سأعطيك الصورة الأصلية ثم قصاصة مكبّرة لمنطقة يُشتبه أن بها ملاحظة، مع العنوان والوصف المقترحين."+ctxText(ctx)+"\n"
  +"مهمتك: تحقق بصرامة هل ما في القصاصة يطابق الملاحظة فعلاً. ارفض (match:false) إن كان الدليل غير كافٍ، أو كانت الملاحظة عامة لا ترتبط بعنصر ظاهر، أو كانت قراءة خاطئة لظل/انعكاس/مادة سليمة. إن قبلتها فحسّن الصياغة لتكون أدق وأكثر تحديداً، وصحّح النوع والخطورة والموضع والمعالجة إن لزم.\n"
  +"أعِد JSON فقط: {\"match\":true|false,\"reason\":\"سبب القبول أو الرفض باختصار\",\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":0-100,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\",\"problem\":\"عنوان مصحّح\",\"where\":\"الموضع\",\"evidence\":\"الدليل\",\"impact\":\"الأثر\",\"immediate\":\"إجراء فوري\",\"fix\":\"معالجة\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"ref\":\"مرجع إن كان مؤكداً\",\"specialty\":\"التخصص\"}. اكتب بالعربية.";
}

// ===== الملخّص التنفيذي لكل الصور =====
function summaryPrompt(ctx){
  return "أنت مدير فحص فني تكتب ملخّصاً تنفيذياً لتقرير زيارة موقع."+ctxText(ctx)+"\nستصلك ملاحظات معتمدة من عدة صور (لكل ملاحظة رقم صورة ورقم ملاحظة). "
  +"اكتب: حكماً عاماً على حالة الموقع، ومستوى المخاطر، وأهم الإجراءات مرتبة بالأولوية مع ربط كل إجراء بأرقام الملاحظات التي يعالجها، وتجميع الملاحظات المتشابهة في إجراء واحد. لا تضف مشاكل غير موجودة في الملاحظات.\n"
  +"أعِد JSON فقط: {\"risk\":\"مرتفع|متوسط|منخفض\",\"verdict\":\"فقرة من 2-3 جمل\",\"actions\":[{\"action\":\"إجراء محدد\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"refs\":[\"ص1-م2\"]}],\"themes\":[\"نمط متكرر لاحظته\"]}. بحد أقصى 7 إجراءات و4 أنماط. اكتب بالعربية.";
}

async function callOpenAI(OKEY, messages, maxTok){
  var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
    body: JSON.stringify({ model:MODEL, temperature:0.1, max_tokens:maxTok||3200, response_format:{type:"json_object"}, messages:messages }) });
  var j = await r.json();
  if(j.error) throw new Error(j.error.message||"خطأ من OpenAI");
  var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "{}";
  try{ return JSON.parse(txt); }catch(e){ return {}; }
}
function pick(v,list,d){ return list.indexOf(v)>=0?v:d; }
function cleanNote(n, focusName){
  if(!n || typeof n!=="object") return null;
  var type = pick(n.type,VALID_TYPES,"جودة");
  if(focusName!=="all" && type!==focusName) return null;
  var problem=_s(n.problem,300); if(!problem) return null;
  var sev = pick(n.severity,VALID_SEV,"متوسطة");
  var conf = (n.confidence==null||n.confidence==="")?60:Math.max(0,Math.min(100, parseInt(n.confidence,10)||0));
  var vs = ["مؤكد","مشتبه","يحتاج فحص ميداني"].indexOf(n.verificationStatus)>=0 ? n.verificationStatus : (conf<55?"مشتبه":"مؤكد");
  var bb = n.bbox, bbox=null;
  if(bb && typeof bb.x==="number"){ var c=function(v){ v=+v; if(v>1.5) v=v/100; return Math.max(0,Math.min(1,v)); };
    bbox={x:c(bb.x),y:c(bb.y),w:c(bb.w),h:c(bb.h)}; if(bbox.w<=0||bbox.h<=0) bbox=null; }
  var cx = (typeof n.cx==="number")?n.cx:(bbox?(bbox.x+bbox.w/2)*100:null);
  var cy = (typeof n.cy==="number")?n.cy:(bbox?(bbox.y+bbox.h/2)*100:null);
  return { type:type, severity: sev, confidence:conf, needsReview:(conf>0 && conf<55), verificationStatus:vs,
    problem:problem, where:_s(n.where,200), evidence:_s(n.evidence,300), impact:_s(n.impact,250), immediate:_s(n.immediate,250),
    fix:_s(n.fix,400), owner:pick(n.owner,VALID_OWNER,""), deadline:pick(n.deadline,VALID_DEADLINE,""), ref:_s(n.ref,120), specialty:_s(n.specialty,60),
    bbox:bbox, x:cx, y:cy, status:"new" };
}
function strList(a,max,len){ return (Array.isArray(a)?a:[]).map(function(x){ return _s(x,len||160); }).filter(Boolean).slice(0,max); }

exports.handler = async function (event) {
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});
  let data; try { data = JSON.parse(event.body || "{}"); } catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  var focus = data.focus || "all";
  var focusName = {safety:"سلامة", structural:"إنشائي", quality:"جودة", all:"all"}[focus] || "all";
  var ctx = (data.ctx && typeof data.ctx==="object") ? data.ctx : null;

  try {
    // ===== الملخّص التنفيذي =====
    if (data.mode==="summary") {
      var list = Array.isArray(data.notes)?data.notes.slice(0,80):[];
      if(!list.length) return _json(200,{risk:"منخفض",verdict:"لا توجد ملاحظات مدرجة.",actions:[],themes:[]});
      var txt = list.map(function(n){ return "["+_s(n.ref,12)+"] ("+_s(n.type,10)+"/"+_s(n.severity,10)+") "+_s(n.problem,200)+(n.where?" — الموضع: "+_s(n.where,120):"")+(n.fix?" — المعالجة: "+_s(n.fix,200):""); }).join("\n");
      var s = await callOpenAI(OKEY, [ {role:"system",content:summaryPrompt(ctx)}, {role:"user",content:"الملاحظات:\n"+txt} ], 1600);
      return _json(200, { risk:pick(s.risk,["مرتفع","متوسط","منخفض"],"متوسط"), verdict:_s(s.verdict,700),
        actions:(Array.isArray(s.actions)?s.actions:[]).slice(0,7).map(function(a){ return {action:_s(a&&a.action,260),owner:pick(a&&a.owner,VALID_OWNER,""),deadline:pick(a&&a.deadline,VALID_DEADLINE,""),refs:strList(a&&a.refs,12,12)}; }).filter(function(a){ return a.action; }),
        themes:strList(s.themes,4,200) });
    }

    // ===== وضع التحقق =====
    if (data.mode==="verify") {
      if(!data.image || !data.crop) return _json(400,{error:"ناقص الصورة أو القصاصة"});
      var vres = await callOpenAI(OKEY, [
        {role:"system",content:verifyPrompt(ctx)},
        {role:"user",content:[
          {type:"text",text:"العنوان المقترح: "+_s(data.title,300)+"\nالنوع المقترح: "+_s(data.type,20)+(data.where?"\nالموضع المقترح: "+_s(data.where,200):"")+(data.evidence?"\nالدليل المقترح: "+_s(data.evidence,300):"")+"\n\nالصورة الأصلية ثم القصاصة المكبّرة:"},
          {type:"image_url",image_url:{url:data.image,detail:"low"}},
          {type:"image_url",image_url:{url:data.crop,detail:"high"}}
        ]}
      ], 1100);
      if(vres && vres.match!==false){ var cv=cleanNote(Object.assign({problem:data.title,type:data.type},vres),"all"); if(cv){ cv.match=true; cv.reason=_s(vres.reason,200); delete cv.bbox; delete cv.x; delete cv.y; delete cv.status; delete cv.needsReview; if(vres.confidence==null) delete cv.confidence; if(!vres.severity) delete cv.severity; if(!vres.type) delete cv.type; if(!vres.verificationStatus) delete cv.verificationStatus; if(!vres.problem) delete cv.problem;
        ["where","evidence","impact","immediate","fix","owner","deadline","ref","specialty"].forEach(function(k){ if(!cv[k]) delete cv[k]; }); return _json(200,cv); } }
      return _json(200, {match:vres?vres.match:true, reason:_s(vres&&vres.reason,200)});
    }

    // ===== وضع الاكتشاف (افتراضي) =====
    if (!data.image) return _json(400,{error:"لا توجد صورة"});
    if (typeof data.image==="string" && data.image.length > 7000000) return _json(413,{error:"حجم الصورة كبير جدًا — يرجى ضغطها قبل الرفع"});
    var det = await callOpenAI(OKEY, [
      {role:"system",content:detectPrompt(focus,ctx)},
      {role:"user",content:[ {type:"text",text:"افحص هذه الصورة وأعِد النتيجة بصيغة JSON."}, {type:"image_url",image_url:{url:data.image,detail:"high"}} ]}
    ], 3600);
    var raw = Array.isArray(det.notes)?det.notes:[];
    var clean=[]; raw.forEach(function(n){ var c=cleanNote(n,focusName); if(c) clean.push(c); });
    var rank={"عالية":0,"متوسطة":1,"منخفضة":2};
    clean.sort(function(a,b){ var ra=(rank[a.severity]||1)-(rank[b.severity]||1); return ra!==0?ra:(b.confidence-a.confidence); });
    clean=clean.slice(0,8);
    var ov=det.overall&&typeof det.overall==="object"?det.overall:{};
    return _json(200, { scene:_s(det.scene,400), overall:{stage:_s(ov.stage,120),rating:pick(ov.rating,VALID_RATING,""),summary:_s(ov.summary,500)},
      positives:strList(det.positives,3), limits:strList(det.limits,3), notes: clean, disclaimer: DISCLAIMER, focus: focusName });
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
