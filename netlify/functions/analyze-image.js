// netlify/functions/analyze-image.js
// فحص صور المشاريع — فاحصون متخصصون (إنشائي وحديد / تشطيبات ودهانات / سلامة) يعملون بالتوازي
// على الصورة كاملة + أربع قصاصات مكبّرة، ثم تحقق بالقصاصات للملاحظات غير المؤكدة، ثم ملخّص تنفيذي.
// المفتاح: OPENAI_API_KEY (سري على الخادم) · النموذج: OPENAI_VISION_MODEL أو OPENAI_MODEL (الافتراضي gpt-4o)

const OPENAI = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
const DISCLAIMER = "نتائج الفحص مؤشرات أولية مساندة ولا تُعد اعتمادًا هندسيًا أو بديلًا عن المعاينة الميدانية ومراجعة المهندس المختص.";
const VALID_TYPES = ["سلامة","إنشائي","جودة"];
const VALID_SEV = ["عالية","متوسطة","منخفضة"];
const VALID_OWNER = ["المقاول","الاستشاري","المالك","المورد"];
const VALID_DEADLINE = ["فوري","خلال 24 ساعة","خلال أسبوع","قبل الاستلام"];
const VALID_RATING = ["جيد","مقبول","يحتاج تدخل","خطر"];
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function _s(x,max){ x=(""+(x==null?"":x)).replace(/\s+/g," ").trim(); return max?x.slice(0,max):x; }

// ===== التخصصات وما يُفحص في كل منها =====
const CATS = {
  "الخرسانة والعناصر الإنشائية": {type:"إنشائي", pass:"struct", list:"تعشيش وفراغات (honeycombing) وانفصال حبيبي، شروخ (حدّد نمطها: شعرية انكماش/لدنة، قطرية قص، أفقية/رأسية انحناء، حول الحديد تآكل، شبكية) وقدّر عرضها، فواصل صب باردة وغير معالجة، تقشّر وتكسّر الحواف والأركان، حديد ظاهر من الخرسانة، تسرب لباني من الشدات وبقع، تزهّر أملاح، عدم استقامة أو ميل أو انبعاج الأعمدة والجدران والكمرات، اختلاف الأبعاد أو عدم تطابق المحاور، سطح غير مستوٍ أو بقايا شدات وأسلاك ومسامير، علامات عدم المعالجة (curing) والتشقق السطحي، رطوبة أو تسرب، هبوط أو تشوه ظاهر"},
  "حديد التسليح": {type:"إنشائي", pass:"struct", list:"عدم انتظام أو اتساع التباعد بين الأسياخ والكانات، نقص الكانات أو عدم إغلاق خطافاتها 135°، نقص أو غياب البسكوت/الكراسي (spacers/chairs) وبالتالي غطاء خرساني غير كافٍ، أسياخ ملامسة للشدة أو للأرض، صدأ سطحي أو تقشري متقدم (قشور ونقص مقطع)، أطوال تراكب (وصلات) قصيرة أو غير متداخلة، أسياخ معوجة أو مثنية على الساخن أو مقطوعة، ربط ناقص بسلك الرباط، أشاير بارزة دون أغطية حماية (خطر سلامة أيضاً)، اتساخ الحديد بالطين أو الزيت أو المونة، تزاحم الحديد عند العُقد يعيق الصب، عدم تثبيت الحديد قبل الصب، حديد مخزّن على الأرض مكشوفاً"},
  "الشدات والدعامات": {type:"إنشائي", pass:"struct", list:"فواصل وفتحات بين ألواح الشدة تسبب تسرب اللباني، دعامات (قوائم) غير رأسية أو متباعدة أو بلا تكتيف أفقي/قطري، قواعد دعامات على تربة رخوة بلا ألواح توزيع، تقوّس أو ترخيم الشدة، ألواح تالفة أو غير نظيفة أو بلا زيت فك، فك مبكر للشدات"},
  "الأعمال المعدنية واللحام": {type:"إنشائي", pass:"struct", list:"لحامات غير مكتملة أو متقطعة أو بها مسامية وخبث، صدأ وغياب طبقة الأساس (primer) أو الجلفنة، مسامير ربط ناقصة أو غير مشدودة أو بلا وردات، ألواح قاعدة غير مثبتة أو بلا جراوت، تشوه أو اعوجاج العناصر، وصلات غير محكمة، عدم استقامة الأعمدة المعدنية"},
  "الحفر والأساسات": {type:"إنشائي", pass:"struct", list:"جوانب حفر بلا تدعيم أو ميول، مياه راكدة في الحفر، تربة رخوة أو ردم غير مدموك، غياب خرسانة النظافة أو العزل للأساسات، تلف عزل الأساسات قبل الردم"},
  "المباني والبلوك": {type:"جودة", pass:"finish", list:"عراميس (لحامات) رأسية أو أفقية غير ممتلئة أو غير منتظمة السماكة، عدم التخالف بين المداميك، عدم الرأسية أو الاستقامة، بلوك مكسور أو متشقق أو مختلط الأنواع، غياب الأعتاب فوق الفتحات، غياب الربط مع الأعمدة (شبك/أشاير)، فراغ أعلى الجدار تحت السقف دون حشو، فتحات تمديدات مكسّرة عشوائياً"},
  "اللياسة": {type:"جودة", pass:"finish", list:"شروخ شبكية أو شعرية أو عند التقاء الخرسانة بالبلوك (غياب الشبك المجلفن)، تطبيل أو انفصال، سطح غير مستوٍ أو تموجات، زوايا وأركان غير مستقيمة أو بلا زوايا معدنية، سماكة غير منتظمة، تزهّر أو رطوبة، ترقيع ظاهر"},
  "الدهانات": {type:"جودة", pass:"finish", list:"تقشر أو انتفاخ (فقاعات)، تشقق الطبقة، سيلان أو تجمعات، تغطية غير متجانسة أو بقع وظلال (patchiness) وظهور الطبقة السفلية، اختلاف اللون أو اللمعة، آثار فرشاة أو رولة واضحة، تبقّع رطوبة أو عفن، تطبشر (chalking)، تلوث الدهان على أعمال أخرى (بلاط/ألمنيوم/أفياش)، دهان فوق سطح غير معالج أو به شروخ أو صدأ"},
  "البلاط والأرضيات والتكسيات": {type:"جودة", pass:"finish", list:"عدم تساوي مناسيب البلاط بين القطع (lippage)، عراميس غير منتظمة العرض أو غير مستقيمة أو ناقصة الترويب، بلاط مكسور أو مشطوف أو متشقق، تطبيل محتمل، قصّ رديء عند الحواف والأركان، ميول غير صحيحة نحو الصرف أو تجمع مياه، وزرات غير مستقيمة، غياب فواصل التمدد، تكسيات حجر/رخام غير مثبتة أو مختلفة اللون"},
  "العزل المائي والحراري": {type:"جودة", pass:"finish", list:"تراكبات لفائف العزل غير كافية أو غير ملحومة، غياب الرفرف (upturn) على الجدران والدراوي، تمزق أو ثقوب أو انتفاخ في العزل، عزل مكشوف للشمس دون حماية، غياب طبقة الحماية، تسرب ظاهر، ألواح عزل حراري غير متلاصقة أو تالفة"},
  "الأعمال الكهروميكانيكية": {type:"جودة", pass:"finish", list:"مواسير وكابلات غير مثبتة أو عشوائية، علب كهرباء مفتوحة، أسلاك مكشوفة، تمديدات مكسّرة داخل الجدران بشكل جائر، مواسير سباكة غير مثبتة أو بلا ميول، فتحات غير محمية، معدات بلا قواعد أو تثبيت، غياب التأريض الظاهر"},
  "النجارة والألمنيوم والأبواب": {type:"جودة", pass:"finish", list:"حلوق غير رأسية أو بفراغات، عدم إحكام السيليكون حول الشبابيك، خدوش أو تلف، غياب الحماية أثناء التنفيذ"},
  "السلامة": {type:"سلامة", pass:"safety", list:"عمالة بلا خوذة أو حذاء أو سترة عاكسة أو حزام أمان عند العمل على ارتفاع، حواف وأسطح وفتحات بلا حواجز، سقالات ناقصة الألواح أو الحواجز أو القواعد أو التكتيف، سلالم غير آمنة، حفريات بلا حواجز، أشاير حديد بلا أغطية، كهرباء مؤقتة وكابلات مكشوفة على الأرض أو في المياه، معدات ورافعات بلا مناطق عزل، طفايات حريق غير موجودة، مواد قابلة للاشتعال، عمل بلا إشراف ظاهر"},
  "تنظيم الموقع والتخزين": {type:"سلامة", pass:"safety", list:"مخلفات ومخاطر تعثر، مواد مخزنة عشوائياً أو على الأرض مباشرة (أسمنت، حديد، بلوك)، مياه راكدة، ممرات مسدودة، غياب لوحات الإرشاد، غياب الحماية للأعمال المنجزة"}
};
const PASS_CATS = { struct:[], finish:[], safety:[] };
Object.keys(CATS).forEach(function(k){ PASS_CATS[CATS[k].pass].push(k); });
PASS_CATS.all = Object.keys(CATS);
const PASS_ROLE = {
  struct:"مهندس إنشائي أول ومفتش جودة خرسانة وحديد تسليح (QA/QC)",
  finish:"مهندس تشطيبات أول ومفتش جودة أعمال المباني واللياسة والدهانات والبلاط والعزل والتمديدات",
  safety:"مسؤول سلامة وصحة مهنية أول (HSE) معتمد",
  all:"مهندس فحص ميداني أول (إنشائي وتشطيبات وسلامة)"
};
function catTypeOf(c){ return CATS[c] ? CATS[c].type : null; }
function matchCat(c, pass){ c=_s(c,60); if(CATS[c]) return c; var keys=PASS_CATS[pass]||PASS_CATS.all;
  for(var i=0;i<keys.length;i++){ var w=keys[i].split(/\s+/)[0].replace(/^ال/,""); if(c.indexOf(w)>=0) return keys[i]; }
  if(/حديد|تسليح|كانات|أشاير/.test(c)) return "حديد التسليح"; if(/دهان|طلاء/.test(c)) return "الدهانات"; if(/لياس|محار/.test(c)) return "اللياسة"; if(/بلاط|سيراميك|رخام|أرضي/.test(c)) return "البلاط والأرضيات والتكسيات";
  if(/خرسان|عمود|أعمدة|سقف|كمر|بلاط(ة)? خرسان/.test(c)) return "الخرسانة والعناصر الإنشائية"; if(/سلامة|وقاية/.test(c)) return "السلامة";
  return keys[0]; }

function ctxText(ctx){
  if(!ctx || typeof ctx!=="object") return "";
  var p=[]; if(ctx.name) p.push("المشروع: "+_s(ctx.name,160)); if(ctx.sector) p.push("القطاع: "+_s(ctx.sector,40)); if(ctx.ptype) p.push("نوع المشروع: "+_s(ctx.ptype,40));
  if(ctx.region) p.push("المنطقة: "+_s(ctx.region,40)); if(ctx.status) p.push("حالة المشروع: "+_s(ctx.status,40)); if(ctx.progress!=null && ctx.progress!=="") p.push("نسبة الإنجاز المسجلة: "+_s(ctx.progress,10));
  if(ctx.note) p.push("ملاحظة الفاحص: "+_s(ctx.note,300));
  return p.length?("\n\nسياق المشروع (لفهم ما يُفترض أن يكون في الصورة فقط، ولا تُبلّغ عن شيء غير ظاهر): "+p.join(" · ")+"."):"";
}

// ===== المرحلة 1: الاكتشاف بواسطة فاحص متخصص =====
function detectPrompt(pass, ctx, nTiles){
  var cats = PASS_CATS[pass] || PASS_CATS.all;
  var check = cats.map(function(c,i){ return (i+1)+") "+c+": "+CATS[c].list+"."; }).join("\n");
  var imgs = nTiles ? ("ستصلك "+(nTiles+1)+" صور: الصورة 0 هي اللقطة كاملة، والصور 1–"+nTiles+" قصاصات مكبّرة من أجزائها (1 أعلى يمين، 2 أعلى يسار، 3 أسفل يمين، 4 أسفل يسار تقريباً مع تداخل). استخدم القصاصات لرؤية التفاصيل الدقيقة (الشروخ الشعرية، تباعد الحديد، الصدأ، العراميس، عيوب الدهان). لكل ملاحظة حدّد img (رقم الصورة التي رأيتها فيها بأوضح شكل) وbbox نسبةً إلى تلك الصورة نفسها.\n") : "لكل ملاحظة img=0 وbbox نسبةً إلى الصورة.\n";
  return "أنت "+(PASS_ROLE[pass]||PASS_ROLE.all)+"، خبرة 20 عاماً في مشاريع البناء والبنية التحتية والمشاريع الزراعية في المملكة، ومطّلع على كود البناء السعودي SBC ومواصفات ACI وBS ولوائح السلامة. تكتب تقرير فحص يعتمد عليه الاستشاري، فالدقة والشمول كلاهما مطلوب."+ctxText(ctx)+"\n\n"
  +imgs
  +"قائمة الفحص الإلزامية — مرّ على كل بند واحداً واحداً وابحث عنه فعلياً في كل الصور:\n"+check+"\n\n"
  +"المنهجية:\n"
  +"أ) حدّد المشهد ومرحلة التنفيذ والعناصر الظاهرة.\n"
  +"ب) امسح كل صورة منطقةً منطقة (شبكة 3×3) والمقدمة قبل الخلفية، ثم طابق ما تراه مع كل بند في القائمة.\n"
  +"ج) سجّل كل عيب ظاهر مهما كان صغيراً (العيوب الصغيرة تُسجَّل بخطورة منخفضة ولا تُهمل). لا تكتفِ بالعيوب الواضحة: ابحث عن الشروخ الشعرية، عدم انتظام التباعد، نقص البسكوت، الصدأ، عدم الاستقامة، عيوب العراميس والدهان.\n"
  +"د) العيب المتكرر في عدة مواضع من نفس النوع يُجمع في ملاحظة واحدة مع ذكر المواضع، أما العيوب المختلفة فكل منها ملاحظة مستقلة.\n\n"
  +"قواعد الدقة:\n"
  +"- لا تُبلّغ إلا عمّا له دليل مرئي، وصِف الدليل بدقة (ماذا ترى بالضبط). ما يرجّح ولا يُجزم به: verificationStatus «مشتبه» أو «يحتاج فحص ميداني» مع ثقة أقل، لا تحذفه.\n"
  +"- ممنوع العبارات العامة («يجب الالتزام بالمعايير»). كل ملاحظة مرتبطة بعنصر محدد وموضع محدد.\n"
  +"- measure: قياس أو تقدير بصري إن أمكن (عرض الشرخ التقريبي بالمم، التباعد التقريبي، المساحة المتأثرة م²، عدد العناصر) وإلا فارغ.\n"
  +"- impact: الأثر الفني (على المتانة، التحمل، الديمومة، المظهر، السلامة). fix: خطوات معالجة فنية محددة (المواد والطريقة)، وللعيوب الإنشائية الجسيمة: إجراء فوري + تقييم مهندس إنشائي.\n"
  +"- الخطورة: عالية = يمس السلامة الإنشائية أو حياة الأفراد أو يستوجب إيقاف العمل/إعادة التنفيذ؛ متوسطة = يؤثر على الديمومة أو يستلزم إصلاحاً قبل المرحلة التالية؛ منخفضة = عيب تشطيب أو تنظيم.\n"
  +"- ref: مرجع فقط إن كنت متأكداً (مثل SBC 304 / ACI 318 / ACI 117 للتفاوتات)، وإلا فارغ.\n"
  +"- الصياغة مختصرة ومركزة: كل حقل جملة أو جملتان.\n"
  +"- حتى 14 ملاحظة مرتبة من الأخطر. لا تختلق ملاحظات لملء العدد.\n"
  +"- coverage: لكل بند من القائمة أعلاه حالته: «ملاحظات» (وُجدت عيوب) أو «سليم» (العنصر ظاهر بلا عيوب) أو «غير ظاهر» (لا يظهر في الصورة).\n\n"
  +"أعِد JSON فقط بالشكل:\n"
  +"{\"scene\":\"وصف موجز للمشهد\",\"overall\":{\"stage\":\"مرحلة التنفيذ\",\"rating\":\"جيد|مقبول|يحتاج تدخل|خطر\",\"summary\":\"تقييم في جملتين\"},"
  +"\"coverage\":[{\"cat\":\"اسم البند\",\"state\":\"ملاحظات|سليم|غير ظاهر\"}],\"positives\":[\"ممارسة جيدة ظاهرة\"],\"limits\":[\"ما لا يمكن الحكم عليه\"],"
  +"\"notes\":[{\"img\":0,\"bbox\":{\"x\":0.5,\"y\":0.3,\"w\":0.2,\"h\":0.15},\"cat\":\""+cats[0]+"\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":80,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\","
  +"\"problem\":\"عنوان فني دقيق\",\"where\":\"العنصر وموضعه\",\"evidence\":\"الدليل المرئي\",\"measure\":\"قياس/تقدير\",\"impact\":\"الأثر\",\"immediate\":\"إجراء فوري\",\"fix\":\"المعالجة\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"ref\":\"\",\"specialty\":\"التخصص\"}]}\n"
  +"bbox: x,y للركن العلوي الأيسر وw,h، كلها نسب بين 0 و1. اكتب بالعربية الفصحى المهنية.";
}

// ===== المرحلة 2: التحقق بالقصاصة =====
function verifyPrompt(ctx){
  return "أنت مهندس فحص ميداني أول. سأعطيك الصورة الأصلية ثم قصاصة مكبّرة لمنطقة بها ملاحظة مقترحة."+ctxText(ctx)+"\n"
  +"مهمتك: راجع الملاحظة على القصاصة. ارفضها (match:false) فقط إن كانت خاطئة بوضوح: لا شيء من هذا القبيل في القصاصة، أو قراءة خاطئة لظل/انعكاس/مادة سليمة/عنصر مؤقت مقصود. إن كان الدليل ضعيفاً لكن محتملاً فاقبلها مع verificationStatus «مشتبه» وثقة أقل. إن قبلتها فحسّن الصياغة لتكون أدق، وأضف القياس التقديري إن ظهر في القصاصة، وصحّح الخطورة والموضع والمعالجة إن لزم.\n"
  +"أعِد JSON فقط: {\"match\":true|false,\"reason\":\"سبب مختصر\",\"severity\":\"عالية|متوسطة|منخفضة\",\"confidence\":0-100,\"verificationStatus\":\"مؤكد|مشتبه|يحتاج فحص ميداني\",\"problem\":\"عنوان مصحّح\",\"where\":\"الموضع\",\"evidence\":\"الدليل\",\"measure\":\"قياس تقديري\",\"impact\":\"الأثر\",\"immediate\":\"إجراء فوري\",\"fix\":\"معالجة\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"ref\":\"مرجع إن كان مؤكداً\",\"specialty\":\"التخصص\"}. اكتب بالعربية.";
}

// ===== الملخّص التنفيذي لكل الصور =====
function summaryPrompt(ctx){
  return "أنت مدير فحص فني تكتب ملخّصاً تنفيذياً لتقرير زيارة موقع."+ctxText(ctx)+"\nستصلك ملاحظات معتمدة من عدة صور (لكل ملاحظة رقم صورة ورقم ملاحظة وتخصصها). "
  +"اكتب: حكماً عاماً على حالة الموقع، ومستوى المخاطر، وأهم الإجراءات مرتبة بالأولوية مع ربط كل إجراء بأرقام الملاحظات التي يعالجها، وتجميع الملاحظات المتشابهة في إجراء واحد، وتقييماً مختصراً لكل تخصص ظهرت فيه ملاحظات. لا تضف مشاكل غير موجودة في الملاحظات.\n"
  +"أعِد JSON فقط: {\"risk\":\"مرتفع|متوسط|منخفض\",\"verdict\":\"فقرة من 2-3 جمل\",\"actions\":[{\"action\":\"إجراء محدد\",\"owner\":\"المقاول|الاستشاري|المالك|المورد\",\"deadline\":\"فوري|خلال 24 ساعة|خلال أسبوع|قبل الاستلام\",\"refs\":[\"ص1-م2\"]}],\"themes\":[\"نمط متكرر\"],\"disciplines\":[{\"cat\":\"التخصص\",\"state\":\"جيد|مقبول|يحتاج تدخل|خطر\",\"note\":\"جملة\"}]}. بحد أقصى 8 إجراءات و4 أنماط. اكتب بالعربية.";
}

async function callOpenAI(OKEY, messages, maxTok){
  var r = await fetch(OPENAI, { method:"POST", headers:{ "authorization":"Bearer "+OKEY, "content-type":"application/json" },
    body: JSON.stringify({ model:MODEL, temperature:0.1, max_tokens:maxTok||3200, response_format:{type:"json_object"}, messages:messages }) });
  var j = await r.json();
  if(j.error) throw new Error(j.error.message||"خطأ من OpenAI");
  var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "{}";
  try{ return JSON.parse(txt); }catch(e){ var m=txt.match(/\{[\s\S]*\}/); try{ return m?JSON.parse(m[0]):{}; }catch(e2){ return {}; } }
}
function pick(v,list,d){ return list.indexOf(v)>=0?v:d; }
function clamp01(v){ v=+v; if(!isFinite(v)) return 0; if(v>1.5) v=v/100; return Math.max(0,Math.min(1,v)); }
function cleanNote(n, pass, rects){
  if(!n || typeof n!=="object") return null;
  var problem=_s(n.problem,300); if(!problem) return null;
  var cat = matchCat(n.cat||n.type||"", pass);
  var type = catTypeOf(cat) || pick(n.type,VALID_TYPES,"جودة");
  var sev = pick(n.severity,VALID_SEV,"متوسطة");
  var conf = (n.confidence==null||n.confidence==="")?60:Math.max(0,Math.min(100, parseInt(n.confidence,10)||0));
  var vs = ["مؤكد","مشتبه","يحتاج فحص ميداني"].indexOf(n.verificationStatus)>=0 ? n.verificationStatus : (conf<55?"مشتبه":"مؤكد");
  var bb = n.bbox, bbox=null;
  if(bb && typeof bb==="object" && bb.x!=null){ bbox={x:clamp01(bb.x),y:clamp01(bb.y),w:clamp01(bb.w),h:clamp01(bb.h)}; if(bbox.w<=0||bbox.h<=0) bbox=null; }
  // تحويل إحداثيات القصاصة إلى إحداثيات الصورة الكاملة
  var im = parseInt(n.img,10)||0;
  if(bbox && im>0 && rects && rects[im-1]){ var R=rects[im-1]; bbox={x:R.x+bbox.x*R.w, y:R.y+bbox.y*R.h, w:bbox.w*R.w, h:bbox.h*R.h}; }
  if(bbox){ bbox.w=Math.min(bbox.w,1-bbox.x); bbox.h=Math.min(bbox.h,1-bbox.y); }
  var cx = bbox?(bbox.x+bbox.w/2)*100:null, cy = bbox?(bbox.y+bbox.h/2)*100:null;
  return { type:type, cat:cat, severity: sev, confidence:conf, needsReview:(conf>0 && conf<55), verificationStatus:vs,
    problem:problem, where:_s(n.where,220), evidence:_s(n.evidence,320), measure:_s(n.measure,140), impact:_s(n.impact,260), immediate:_s(n.immediate,260),
    fix:_s(n.fix,420), owner:pick(n.owner,VALID_OWNER,""), deadline:pick(n.deadline,VALID_DEADLINE,""), ref:_s(n.ref,120), specialty:_s(n.specialty,60),
    bbox:bbox, x:cx, y:cy, status:"new", pass:pass };
}
function strList(a,max,len){ return (Array.isArray(a)?a:[]).map(function(x){ return _s(x,len||160); }).filter(Boolean).slice(0,max); }
function cleanRects(a){ return (Array.isArray(a)?a:[]).slice(0,4).map(function(r){ return r&&typeof r==="object"?{x:clamp01(r.x),y:clamp01(r.y),w:clamp01(r.w),h:clamp01(r.h)}:null; }); }

exports.handler = async function (event) {
  const OKEY = process.env.OPENAI_API_KEY;
  if (event.httpMethod !== "POST") return _json(405,{error:"POST only"});
  if (!OKEY) return _json(500,{error:"مفتاح OpenAI غير مضبوط في إعدادات Netlify"});
  let data; try { data = JSON.parse(event.body || "{}"); } catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  var focus = data.focus || "all";
  var pass = data.pass || ({structural:"struct", quality:"finish", finishes:"finish", safety:"safety", all:"all"}[focus]) || "all";
  if(!PASS_CATS[pass]) pass="all";
  var ctx = (data.ctx && typeof data.ctx==="object") ? data.ctx : null;

  try {
    // ===== الملخّص التنفيذي =====
    if (data.mode==="summary") {
      var list = Array.isArray(data.notes)?data.notes.slice(0,120):[];
      if(!list.length) return _json(200,{risk:"منخفض",verdict:"لا توجد ملاحظات مدرجة.",actions:[],themes:[],disciplines:[]});
      var txt = list.map(function(n){ return "["+_s(n.ref,12)+"] ("+_s(n.cat||n.type,40)+"/"+_s(n.severity,10)+") "+_s(n.problem,200)+(n.where?" — الموضع: "+_s(n.where,120):"")+(n.fix?" — المعالجة: "+_s(n.fix,180):""); }).join("\n");
      var s = await callOpenAI(OKEY, [ {role:"system",content:summaryPrompt(ctx)}, {role:"user",content:"الملاحظات:\n"+txt} ], 2000);
      return _json(200, { risk:pick(s.risk,["مرتفع","متوسط","منخفض"],"متوسط"), verdict:_s(s.verdict,800),
        actions:(Array.isArray(s.actions)?s.actions:[]).slice(0,8).map(function(a){ return {action:_s(a&&a.action,260),owner:pick(a&&a.owner,VALID_OWNER,""),deadline:pick(a&&a.deadline,VALID_DEADLINE,""),refs:strList(a&&a.refs,14,12)}; }).filter(function(a){ return a.action; }),
        themes:strList(s.themes,4,200),
        disciplines:(Array.isArray(s.disciplines)?s.disciplines:[]).slice(0,14).map(function(d){ return {cat:_s(d&&d.cat,60),state:pick(d&&d.state,VALID_RATING,""),note:_s(d&&d.note,200)}; }).filter(function(d){ return d.cat; }) });
    }

    // ===== وضع التحقق =====
    if (data.mode==="verify") {
      if(!data.image || !data.crop) return _json(400,{error:"ناقص الصورة أو القصاصة"});
      var vres = await callOpenAI(OKEY, [
        {role:"system",content:verifyPrompt(ctx)},
        {role:"user",content:[
          {type:"text",text:"التخصص: "+_s(data.cat||data.type,60)+"\nالعنوان المقترح: "+_s(data.title,300)+(data.where?"\nالموضع المقترح: "+_s(data.where,200):"")+(data.evidence?"\nالدليل المقترح: "+_s(data.evidence,300):"")+"\n\nالصورة الأصلية ثم القصاصة المكبّرة:"},
          {type:"image_url",image_url:{url:data.image,detail:"low"}},
          {type:"image_url",image_url:{url:data.crop,detail:"high"}}
        ]}
      ], 1100);
      if(vres && vres.match===false) return _json(200,{match:false, reason:_s(vres.reason,200)});
      var out={match:true, reason:_s(vres&&vres.reason,200)};
      if(vres){ if(VALID_SEV.indexOf(vres.severity)>=0) out.severity=vres.severity; if(vres.confidence!=null&&vres.confidence!=="") out.confidence=Math.max(0,Math.min(100,parseInt(vres.confidence,10)||0));
        if(["مؤكد","مشتبه","يحتاج فحص ميداني"].indexOf(vres.verificationStatus)>=0) out.verificationStatus=vres.verificationStatus;
        ["problem","where","evidence","measure","impact","immediate","fix","ref","specialty"].forEach(function(k){ var v=_s(vres[k],420); if(v) out[k]=v; });
        if(VALID_OWNER.indexOf(vres.owner)>=0) out.owner=vres.owner; if(VALID_DEADLINE.indexOf(vres.deadline)>=0) out.deadline=vres.deadline; }
      return _json(200,out);
    }

    // ===== وضع الاكتشاف (افتراضي) =====
    if (!data.image) return _json(400,{error:"لا توجد صورة"});
    var tiles = (Array.isArray(data.tiles)?data.tiles:[]).filter(function(x){ return typeof x==="string" && x.indexOf("data:image")===0; }).slice(0,4);
    var rects = cleanRects(data.tileRects);
    if(rects.length!==tiles.length) { tiles=[]; rects=[]; }
    var size = (data.image.length||0) + tiles.reduce(function(s,x){ return s+x.length; },0);
    if (size > 9000000) return _json(413,{error:"حجم الصور كبير جدًا — يرجى ضغطها قبل الرفع"});
    var content=[ {type:"text",text:"افحص الصور التالية وفق قائمة الفحص وأعِد النتيجة بصيغة JSON. الصورة 0 (كاملة):"}, {type:"image_url",image_url:{url:data.image,detail:"high"}} ];
    tiles.forEach(function(u,i){ content.push({type:"text",text:"الصورة "+(i+1)+" (قصاصة مكبّرة):"}); content.push({type:"image_url",image_url:{url:u,detail:"high"}}); });
    var det = await callOpenAI(OKEY, [ {role:"system",content:detectPrompt(pass,ctx,tiles.length)}, {role:"user",content:content} ], 4096);
    var raw = Array.isArray(det.notes)?det.notes:[];
    var clean=[]; raw.forEach(function(n){ var c=cleanNote(n,pass,rects); if(c) clean.push(c); });
    var rank={"عالية":0,"متوسطة":1,"منخفضة":2};
    clean.sort(function(a,b){ var ra=(rank[a.severity]||1)-(rank[b.severity]||1); return ra!==0?ra:(b.confidence-a.confidence); });
    clean=clean.slice(0,16);
    var ov=det.overall&&typeof det.overall==="object"?det.overall:{};
    var allowed=PASS_CATS[pass];
    var coverage=(Array.isArray(det.coverage)?det.coverage:[]).map(function(c){ var k=matchCat(c&&c.cat||"",pass); return {cat:k,state:pick(c&&c.state,["ملاحظات","سليم","غير ظاهر"],"غير ظاهر")}; })
      .filter(function(c,i,A){ return allowed.indexOf(c.cat)>=0 && A.findIndex(function(z){ return z.cat===c.cat; })===i; });
    clean.forEach(function(n){ var c=coverage.find(function(z){ return z.cat===n.cat; }); if(c) c.state="ملاحظات"; else coverage.push({cat:n.cat,state:"ملاحظات"}); });
    return _json(200, { scene:_s(det.scene,400), overall:{stage:_s(ov.stage,120),rating:pick(ov.rating,VALID_RATING,""),summary:_s(ov.summary,500)},
      coverage:coverage, positives:strList(det.positives,4), limits:strList(det.limits,4), notes: clean, disclaimer: DISCLAIMER, pass: pass, model: MODEL });
  } catch (err) {
    return _json(500,{error:String(err && err.message || err)});
  }
};
