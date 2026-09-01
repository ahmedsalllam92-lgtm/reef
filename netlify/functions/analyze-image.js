// netlify/functions/analyze-image.js
// فحص صورة موقع مشروع عبر GPT-4o Vision — يرجّع ملاحظات (مكان + نوع + خطورة + مشكلة + معالجة)
// المفتاح: OPENAI_API_KEY

const OPENAI = "https://api.openai.com/v1/chat/completions";
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }

exports.handler = async function (event) {
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  if (!data.image) return _json(400,{error:"لا توجد صورة"});

  var focus = data.focus || "all";
  var focusTxt = ({safety:"ركّز على مشاكل السلامة (SHE): معدّات الوقاية، السقالات، الحواجز، الحفريات، الكهرباء المكشوفة، تجمّع المياه، النظافة.",
    structural:"ركّز على المشاكل الإنشائية: التشققات، حديد التسليح المكشوف، تعشيش الخرسانة، الرطوبة، الهبوط، رداءة الصبّ.",
    quality:"ركّز على جودة التنفيذ والتشطيبات: المحاذاة، المونة، الدهانات، العزل، نظافة العمل.",
    all:"افحص كل الجوانب: السلامة، والإنشائية، وجودة التنفيذ."})[focus];

  var sys = "أنت خبير أول في فحص ومراقبة جودة وسلامة مشاريع البناء والتشييد بخبرة تزيد عن 20 عامًا، ومطّلع على كود البناء السعودي ومتطلبات السلامة المهنية. سأعطيك صورة من موقع مشروع إنشائي. "+focusTxt+"\n\nافحص الصورة فحصًا دقيقًا وشاملًا وحدّد كل المخالفات والمشاكل والمخاطر المرئية (حتى الدقيقة منها)، ولا تكتفِ بالواضح. لكل ملاحظة: صف المشكلة بدقة فنية، وحدّد خطورتها بمنطق هندسي (عالية إذا تشكّل خطرًا على الأرواح أو سلامة المنشأ، متوسطة إذا تؤثر على الجودة أو قد تتطور، منخفضة إذا شكلية)، واكتب طريقة معالجة مفصّلة وعملية خطوة بخطوة — وكلما كانت المشكلة أكبر أو أخطر اجعل شرح المعالجة أطول وأوضح (يشمل الإجراء الفوري، ثم الحل الجذري، والمرجع للكود أو المواصفة إن أمكن). أعِد ردك بصيغة JSON فقط دون أي نص إضافي، على الشكل: {\"notes\":[{\"x\":63,\"y\":18,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"problem\":\"وصف فني دقيق للمشكلة\",\"fix\":\"معالجة مفصّلة عملية؛ للمشاكل الكبيرة اشرح الإجراء الفوري ثم الحل الجذري\"}], \"summary\":\"ملخّص هندسي موجز لأبرز المخاطر والأولويات\"}. القيمتان x و y إحداثيات مركز المشكلة كنسبة مئوية من أبعاد الصورة: x من 0 (أقصى اليسار) إلى 100 (أقصى اليمين)، و y من 0 (الأعلى) إلى 100 (الأسفل). دقّق جيدًا في تحديد x و y فوق العنصر المقصود بالضبط (انظر أين يقع فعليًا في الصورة). رتّب الملاحظات من الأعلى خطورة إلى الأقل.\n\nمهم جدًا: لا تُبلّغ عن مشكلة إلا إذا كانت مرئية فعلًا وواضحة في الصورة. لا تفترض وجود نشاط أو عمل غير ظاهر (مثال: لا تطلب سقالات لواجهة لا يوجد عليها عمل حاليًا، ولا تذكر مخاطر لعمل غير جارٍ في الصورة). اربط كل ملاحظة بما تراه بالضبط. الصياغة يجب أن تكون مهنية دقيقة ومباشرة. إن كانت الصورة سليمة أو النشاط الظاهر لا يحمل مخالفات، فأعِد notes فارغة ولا تفتعل ملاحظات لملء الفراغ. إن لم تجد مشاكل، أعِد notes فارغة. اكتب بالعربية الفصحى الواضحة.";

  try {
    var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o", temperature:0.1, max_tokens:2500, response_format:{type:"json_object"},
        messages:[ {role:"system",content:sys}, {role:"user",content:[ {type:"text",text:"افحص هذه الصورة وأعِد الملاحظات بصيغة JSON."}, {type:"image_url",image_url:{url:data.image,detail:"high"}} ]} ] }) });
    var j = await r.json();
    if(j.error) return _json(502,{error:(j.error.message||"خطأ من OpenAI")});
    var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    var parsed; try{ parsed=JSON.parse(txt); }catch(e){ parsed={notes:[],summary:txt}; }
    return _json(200, parsed);
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
