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

  var sys = "أنت مهندس فحص ومراقبة جودة وسلامة في مشاريع إنشائية. سأعطيك صورة من موقع مشروع. "+focusTxt+" حدّد كل ملاحظة/خطأ تراه بوضوح، وحدّد موقعه على الصورة بدقة. أعِد ردك بصيغة JSON فقط دون أي نص إضافي، على الشكل: {\"notes\":[{\"x\":63,\"y\":18,\"type\":\"سلامة|إنشائي|جودة\",\"severity\":\"عالية|متوسطة|منخفضة\",\"problem\":\"وصف دقيق للمشكلة\",\"fix\":\"طريقة المعالجة المقترحة\"}], \"summary\":\"ملخّص عام موجز\"}. القيمتان x و y هما إحداثيات مركز المشكلة كنسبة مئوية من أبعاد الصورة: x من 0 (أقصى اليسار) إلى 100 (أقصى اليمين)، و y من 0 (الأعلى) إلى 100 (الأسفل). كن دقيقًا قدر الإمكان في تحديد x و y على العنصر المقصود بالضبط. إن لم تجد مشاكل، أعِد notes فارغة. اكتب بالعربية.";

  try {
    var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o", temperature:0.1, max_tokens:1500, response_format:{type:"json_object"},
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
