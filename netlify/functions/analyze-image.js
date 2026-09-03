// netlify/functions/analyze-image.js
// فحص صور المشاريع — تحليل مرحلتين (اكتشاف ثم تحقق بالقصاصات) بأسلوب منصة مروج
// المفتاح: OPENAI_API_KEY (سري على الخادم)

const OPENAI = "https://api.openai.com/v1/chat/completions";
const DISCLAIMER = "نتائج الفحص مؤشرات أولية مساندة ولا تُعد اعتمادًا هندسيًا أو بديلًا عن المعاينة الميدانية ومراجعة المهندس المختص.";
const VALID_TYPES = ["سلامة","إنشائي","جودة"];
const VALID_SEV = ["عالية","متوسطة","منخفضة"];
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }

function focusText(focus){
  return ({safety:"محور الفحص: السلامة والصحة المهنية فقط (معدات وقاية، خوذ، حواف وفتحات غير محمية، حفريات، كابلات كهربائية، مياه راكدة، مخلفات ومخاطر تعثر، سوء تخزين). أعِد فقط ملاحظات نوعها «سلامة».",
    structural:"محور الفحص: المشاكل الإنشائية فقط (شروخ، تعشيش خرساني، حديد مكشوف/غير مغطى، رطوبة/تلف ظاهر، رداءة صبّ). أعِد فقط ملاحظات نوعها «إنشائي».",
    quality:"محور الفحص: جودة التنفيذ والتشطيبات فقط (تشطيبات غير مطابقة، محاذاة، مونة، دهانات، عزل، تنظيم). أعِد فقط ملاحظات نوعها «جودة».",
    all:"افحص كل المحاور: السلامة، والإنشائية، وجودة التنفيذ، وصنّف كل ملاحظة بنوعها الصحيح."})[focus] || "افحص كل المحاور.";
}

// ===== المرحلة 1: الاكتشاف =====
function detectPrompt(focus){
  return "أنت مهندس فحص ميداني خبير في مشاريع البناء والتشييد والكهروميكانيكية والغطاء النباتي، مطّلع على كود البناء السعودي ومتطلبات السلامة. "+focusText(focus)+"\n\n"
  +"نفّذ تحليلًا منهجيًا:\n"
  +"1) افهم المشهد: نوع الموقع، مرحلة التنفيذ، العناصر الإنشائية والمواد والمعدات الظاهرة.\n"
  +"2) احصر العناصر المرئية (أعمدة، قواعد، مسامير، حديد تسليح، فتحات، مخلفات، كابلات، مياه، سقالات، حواف...).\n"
  +"3) افحص على محاور منفصلة: السلامة، الأعمال المعدنية، الخرسانة والقواعد، حديد التسليح، جودة التركيب، النظافة والمخلفات، المخاطر البيئية.\n"
  +"4) قسّم الصورة ذهنيًا لشبكة 3×3 وافحص كل منطقة؛ المقدمة أولى من الخلفية.\n\n"
  +"قواعد صارمة: لا تُبلّغ عن مشكلة إلا إن كان دليلها المرئي واضحًا في الصورة؛ لا تفترض نشاطًا غير ظاهر ولا تفتعل ملاحظات. عدم وجود مشكلة لا يعني سلامة الموقع بالكامل. لا تستنتج ميلًا أو ضعفًا أو عدم مطابقة أبعاد دون دليل كافٍ. استخدم صياغة تحفظية للمشتبه فيه.\n\n"
  +"لكل ملاحظة: صندوق إحاطة bbox بإحداثيات نسبية (x,y للركن العلوي الأيسر و w,h العرض/الارتفاع، كلها بين 0 و 1)، ومركز center (cx,cy نسبة مئوية 0–100)، ونسبة ثقة confidence (0–100)، وحالة تحقق verificationStatus من: «مؤكد» أو «مشتبه» أو «يحتاج فحص ميداني».\n\n"
  +"أعِد JSON فقط: {\"scene\":\"وصف موجز للمشهد\",\"notes\":[{\"bbox\":{\"x\":0.5,\"y\":0.3,\"w\":0.2,\"h\":0.15},\"cx\":60,\"cy\":37,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":85,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\",\"problem\":\"وصف فني دقيق\",\"evidence\":\"الدليل المرئي\",\"immediate\":\"إجراء فوري\",\"fix\":\"معالجة (للكبيرة: إجراء فوري ثم حل جذري مع اشتراط اعتماد مهندس مختص)\",\"specialty\":\"التخصص المطلوب\"}]}. رتّب من الأعلى خطورة للأقل. إن لم تجد مشاكل أعِد notes فارغة. اكتب بالعربية.";
}

// ===== المرحلة 2: التحقق بالقصاصة =====
function verifyPrompt(){
  return "أنت مهندس فحص ميداني. سأعطيك الصورة الأصلية ثم قصاصة مكبّرة لمنطقة يُشتبه أن بها ملاحظة، مع العنوان المقترح. مهمتك التحقق: هل ما في القصاصة يطابق العنوان فعلًا؟ صحّح النوع/الخطورة/الوصف إن لزم، وارفض الملاحظة إن لم يوجد دليل مرئي كافٍ. أعِد JSON فقط: {\"match\":true|false,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":0-100,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\",\"problem\":\"وصف مصحّح\",\"evidence\":\"الدليل\",\"immediate\":\"إجراء فوري\",\"fix\":\"معالجة\",\"specialty\":\"التخصص\"}. اكتب بالعربية.";
}

async function callOpenAI(OKEY, messages, maxTok){
  var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
    body: JSON.stringify({ model:"gpt-4o", temperature:0.1, max_tokens:maxTok||2800, response_format:{type:"json_object"}, messages:messages }) });
  var j = await r.json();
  if(j.error) throw new Error(j.error.message||"خطأ من OpenAI");
  var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "{}";
  try{ return JSON.parse(txt); }catch(e){ return {}; }
}
function cleanNote(n, focusName){
  var type = VALID_TYPES.indexOf(n.type)>=0 ? n.type : "جودة";
  if(focusName!=="all" && type!==focusName) return null;
  var sev = VALID_SEV.indexOf(n.severity)>=0 ? n.severity : "متوسطة";
  var conf = Math.max(0,Math.min(100, parseInt(n.confidence,10)||0));
  var vs = ["مؤكد","مشتبه","يحتاج فحص ميداني"].indexOf(n.verificationStatus)>=0 ? n.verificationStatus : (conf<55?"مشتبه":"مؤكد");
  var needsReview = conf>0 && conf<55;
  var bbox = (n.bbox && typeof n.bbox.x==="number") ? {x:+n.bbox.x,y:+n.bbox.y,w:+n.bbox.w,h:+n.bbox.h} : null;
  var cx = (typeof n.cx==="number")?n.cx:(bbox?(bbox.x+bbox.w/2)*100:null);
  var cy = (typeof n.cy==="number")?n.cy:(bbox?(bbox.y+bbox.h/2)*100:null);
  return { type:type, severity: sev, confidence:conf, needsReview:needsReview, verificationStatus:vs,
    problem:(""+(n.problem||"")).trim(), evidence:(""+(n.evidence||"")).trim(), immediate:(""+(n.immediate||"")).trim(),
    fix:(""+(n.fix||"")).trim(), specialty:(""+(n.specialty||"")).trim(),
    bbox:bbox, x:cx, y:cy, status:"new" };
}

exports.handler = async function (event) {
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});
  let data; try { data = JSON.parse(event.body || "{}"); } catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  var focus = data.focus || "all";
  var focusName = {safety:"سلامة", structural:"إنشائي", quality:"جودة", all:"all"}[focus] || "all";

  try {
    // ===== وضع التحقق =====
    if (data.mode==="verify") {
      if(!data.image || !data.crop) return _json(400,{error:"ناقص الصورة أو القصاصة"});
      var vres = await callOpenAI(OKEY, [
        {role:"system",content:verifyPrompt()},
        {role:"user",content:[
          {type:"text",text:"العنوان المقترح: "+(data.title||"")+"\nالنوع المقترح: "+(data.type||"")+"\n\nالصورة الأصلية ثم القصاصة المكبّرة:"},
          {type:"image_url",image_url:{url:data.image,detail:"low"}},
          {type:"image_url",image_url:{url:data.crop,detail:"high"}}
        ]}
      ], 900);
      return _json(200, vres);
    }

    // ===== وضع الاكتشاف (افتراضي) =====
    if (!data.image) return _json(400,{error:"لا توجد صورة"});
    if (typeof data.image==="string" && data.image.length > 7000000) return _json(413,{error:"حجم الصورة كبير جدًا — يرجى ضغطها قبل الرفع"});
    var det = await callOpenAI(OKEY, [
      {role:"system",content:detectPrompt(focus)},
      {role:"user",content:[ {type:"text",text:"افحص هذه الصورة وأعِد الاكتشاف بصيغة JSON."}, {type:"image_url",image_url:{url:data.image,detail:"high"}} ]}
    ], 2800);
    var raw = Array.isArray(det.notes)?det.notes:[];
    var clean=[]; raw.forEach(function(n){ var c=cleanNote(n,focusName); if(c) clean.push(c); });
    var rank={"عالية":0,"متوسطة":1,"منخفضة":2};
    clean.sort(function(a,b){ var ra=(rank[a.severity]||1)-(rank[b.severity]||1); return ra!==0?ra:(b.confidence-a.confidence); });
    return _json(200, { scene:(""+(det.scene||"")).trim(), notes: clean, disclaimer: DISCLAIMER, focus: focusName });
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};

