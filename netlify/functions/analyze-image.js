// netlify/functions/analyze-image.js
// فحص صورة موقع مشروع عبر GPT-4o Vision — نتائج موحّدة + تصفية نوع + نسبة ثقة
// المفتاح: OPENAI_API_KEY

const OPENAI = "https://api.openai.com/v1/chat/completions";
const DISCLAIMER = "نتائج الفحص مؤشرات أولية مساندة ولا تُعد اعتمادًا هندسيًا أو بديلًا عن المعاينة الميدانية ومراجعة المهندس المختص.";
const VALID_TYPES = ["سلامة","إنشائي","جودة"];
const VALID_SEV = ["عالية","متوسطة","منخفضة"];
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }

exports.handler = async function (event) {
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  if (!data.image) return _json(400,{error:"لا توجد صورة"});
  // حد حجم على الخادم (~ حماية من الطلبات الضخمة)
  if (typeof data.image==="string" && data.image.length > 7000000) return _json(413,{error:"حجم الصورة كبير جدًا — يرجى ضغطها قبل الرفع"});

  var focus = data.focus || "all";
  var focusName = {safety:"سلامة", structural:"إنشائي", quality:"جودة", all:"all"}[focus] || "all";
  var focusTxt = ({safety:"افحص مشاكل السلامة المهنية (SHE) فقط: معدّات الوقاية الشخصية، الخوذ، الحواف والفتحات غير المحمية، الحفريات، الكابلات الكهربائية المكشوفة، المياه الراكدة، المخلفات ومخاطر التعثر، سوء التخزين. أعِد فقط ملاحظات من نوع «سلامة».",
    structural:"افحص المشاكل الإنشائية فقط: الشروخ، التعشيش الخرساني، الحديد المكشوف/غير المغطى، الرطوبة/التلف الظاهر، الهبوط، رداءة الصبّ. أعِد فقط ملاحظات من نوع «إنشائي».",
    quality:"افحص جودة التنفيذ والتشطيبات فقط: التشطيبات غير المطابقة، المحاذاة، المونة، الدهانات، العزل، سوء التنظيم. أعِد فقط ملاحظات من نوع «جودة».",
    all:"افحص كل الجوانب: السلامة، والإنشائية، وجودة التنفيذ. صنّف كل ملاحظة بنوعها الصحيح."})[focus] || "افحص كل الجوانب.";

  var sys = "أنت خبير أول فحص جودة وسلامة في مشاريع البناء بخبرة تزيد عن 20 عامًا ومطّلع على كود البناء السعودي. سأعطيك صورة من موقع مشروع. "+focusTxt+"\n\nقواعد صارمة: (1) لا تُبلّغ عن مشكلة إلا إذا كانت مرئية فعلًا وواضحة في الصورة؛ لا تفترض نشاطًا غير ظاهر ولا تفتعل ملاحظات لملء الفراغ. عدم وجود مشكلة لا يعني سلامة الموقع بالكامل. (2) لكل ملاحظة قدّر نسبة ثقة (confidence) من 0 إلى 100 بناءً على وضوح الدليل البصري؛ إن كانت الثقة أقل من 55 اجعل needs_review=true. (3) درجة الخطورة بمعايير ثابتة: «عالية» = خطر على الأرواح أو سلامة المنشأ، «متوسطة» = يؤثر على الجودة أو قد يتطور، «منخفضة» = شكلي/طفيف. (4) لا تصدر توصية تنفيذية حاسمة (قص حديد، إزالة عنصر، إعادة صب، حقن شروخ، تدعيم) إلا مصحوبة بأنها لا تُنفّذ إلا بعد معاينة واعتماد مهندس مختص ومراجعة المخططات. (5) x و y إحداثيات مركز المشكلة كنسبة مئوية من أبعاد الصورة (x: 0 يسار→100 يمين، y: 0 أعلى→100 أسفل)؛ دقّق في وضعها فوق العنصر المقصود بالضبط.\n\nأعِد JSON فقط بهذا الشكل: {\"notes\":[{\"x\":63,\"y\":18,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":85,\"problem\":\"وصف فني دقيق\",\"evidence\":\"الدليل البصري الذي اعتمدت عليه\",\"immediate\":\"الإجراء الفوري المقترح\",\"fix\":\"المعالجة المقترحة (للمشاكل الكبيرة اذكر الإجراء الفوري ثم الحل الجذري مع اشتراط اعتماد مهندس مختص)\",\"specialty\":\"التخصص المطلوب لمراجعتها\"}], \"summary\":\"ملخّص هندسي موجز للأولويات\"}. رتّب من الأعلى خطورة للأقل. إن لم تجد مشاكل أعِد notes فارغة. اكتب بالعربية الفصحى.";

  try {
    var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o", temperature:0.1, max_tokens:2800, response_format:{type:"json_object"},
        messages:[ {role:"system",content:sys}, {role:"user",content:[ {type:"text",text:"افحص هذه الصورة وأعِد الملاحظات بصيغة JSON."}, {type:"image_url",image_url:{url:data.image,detail:"high"}} ]} ] }) });
    var j = await r.json();
    if(j.error) return _json(502,{error:(j.error.message||"خطأ من OpenAI")});
    var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    var parsed; try{ parsed=JSON.parse(txt); }catch(e){ parsed={notes:[],summary:""}; }
    var notes = Array.isArray(parsed.notes)?parsed.notes:[];

    // تحقق + توحيد + تصفية النوع على الخادم
    var clean = [];
    notes.forEach(function(n){
      var type = VALID_TYPES.indexOf(n.type)>=0 ? n.type : "جودة";
      // تصفية فعلية حسب نوع الفحص
      if(focusName!=="all" && type!==focusName) return;
      var sev = VALID_SEV.indexOf(n.severity)>=0 ? n.severity : "متوسطة";
      var conf = Math.max(0,Math.min(100, parseInt(n.confidence,10)||0));
      var needsReview = conf>0 && conf<55;
      var x = (typeof n.x==="number"&&n.x>=0&&n.x<=100)?n.x:null;
      var y = (typeof n.y==="number"&&n.y>=0&&n.y<=100)?n.y:null;
      clean.push({
        type:type, severity: needsReview?"تحتاج مراجعة":sev, sevBase:sev,
        confidence:conf, needsReview:needsReview,
        problem:(""+(n.problem||"")).trim(),
        evidence:(""+(n.evidence||"")).trim(),
        immediate:(""+(n.immediate||"")).trim(),
        fix:(""+(n.fix||"")).trim(),
        specialty:(""+(n.specialty||"")).trim(),
        x:x, y:y, status:"new"
      });
    });
    // ترتيب ثابت: خطورة ثم ثقة
    var rank={"عالية":0,"متوسطة":1,"منخفضة":2,"تحتاج مراجعة":3};
    clean.sort(function(a,b){ var ra=rank[a.severity]-rank[b.severity]; return ra!==0?ra:(b.confidence-a.confidence); });

    return _json(200, { notes: clean, summary:(""+(parsed.summary||"")).trim(), disclaimer: DISCLAIMER, focus: focusName });
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
