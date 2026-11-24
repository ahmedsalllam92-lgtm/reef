/* ===================== محرك التوصيات الهندسية لفحص صور المواقع =====================
   المكتبات: REM_BASE (مدمجة ومصدرها نشرات المصنّعين الرسمية) + تعديلات المستخدم (محفوظة محلياً بإصدارات).
   المبدأ: لا قيمة فنية تُعرض إلا من مكتبة المواد ومرجعها؛ ما لا يتوفر يُعرض «غير متوفرة». */
var REM_NA="غير متوفرة";
var REM_MKT={ksa:"موثق للسوق السعودي",regional:"موثق إقليمياً — يحتاج تحققاً محلياً",unverified:"التوافر المحلي غير متحقق"};
var REM_KEY="reef_remlib_v1";
function _remUser(){ try{ return JSON.parse(localStorage.getItem(REM_KEY)||"null")||{products:{},methods:{},defects:{},refs:{},log:[]}; }catch(e){ return {products:{},methods:{},defects:{},refs:{},log:[]}; } }
function _remSaveUser(U){ try{ localStorage.setItem(REM_KEY,JSON.stringify(U)); }catch(e){ alert("تعذّر الحفظ في المتصفح"); } }
/* المكتبة الفعّالة = الأساس + تعديلات المستخدم (التعديل يحفظ السابق في السجل) */
function remLib(){ var U=_remUser(), B=REM_BASE, L={products:{},methods:{},defects:{},refs:{}};
  ["products","methods","defects","refs"].forEach(function(k){ Object.keys(B[k]||{}).forEach(function(id){ L[k][id]=B[k][id]; }); Object.keys(U[k]||{}).forEach(function(id){ var u=U[k][id]; if(u&&u._deleted){ delete L[k][id]; return; } L[k][id]=Object.assign({},L[k][id]||{},u); }); });
  return L; }
function remProd(id){ return remLib().products[id]||null; }
function _remV(v){ return (v==null||v===""||v===REM_NA)?REM_NA:v; }
function _remHas(v){ return v!=null&&v!==""&&v!==REM_NA&&!(Array.isArray(v)&&!v.length); }
/* التوافق الموثق: سجل منسّق من نصوص النشرات (اقتباس + صفحة)، لا يُستنتج من الانتماء لنفس الشركة */
function remCompatible(a,b){ var C=(REM_BASE.compat||[]).concat((_remUser().compat)||[]);
  for(var i=0;i<C.length;i++){ var c=C[i]; if((c.a===a&&c.b===b)||(c.a===b&&c.b===a)) return {ok:true,quote:c.quote,ref:c.ref,cond:c.cond||"",role:c.role||""}; }
  return {ok:false}; }
/* ---------- تصنيف العيب من نص الملاحظة ---------- */
var REM_DEF_RX=[
 ["rebar",/حديد\s*(مكشوف|ظاهر|التسليح\s*(مكشوف|ظاهر))|انكشاف\s*(حديد|التسليح)|صدأ|تآكل\s*(الحديد|التسليح)|تسليح\s*(مكشوف|ظاهر)/],
 ["honeycomb",/تعشيش|فراغات?\s*(في|ب)?\s*الخرسانة|تعري\s*الركام|خرسانة\s*مفرغة|فراغات\s*سطحية|عيوب\s*صب/],
 ["spalling",/انفصال\s*(الغطاء|الطبقة)|تقشر\s*(الخرسانة|السطح\s*الخرساني)|تساقط\s*(أجزاء|الخرسانة)|تكسر\s*حواف/],
 ["coldjoint",/فاصل\s*(صب|بارد)|فواصل\s*صب|cold\s*joint/i],
 ["leak",/تسرب|تسريب|نشع|رشح|ترشيح/],
 ["damp",/رطوبة|أملاح|تزهر|تملح|إفلورسنس/],
 ["paint",/دهان|طلاء|تقشر\s*الدهان|انتفاخ\s*الدهان/],
 ["tile_hollow",/تطبيل\s*(ال)?بلاط|بلاط\s*مطبّ?ل|صوت\s*أجوف|ضعف\s*(التصاق|لصق)\s*البلاط(?!ة)|انفصال\s*البلاط(?!ة)/],
 ["tile_level",/تفاوت\s*(في\s*)?(ال)?مناسيب\s*(ال)?بلاط|فواصل\s*البلاط(?!ة)|عدم\s*استواء\s*البلاط(?!ة)/],
 ["tile_broken",/(كسر|مكسور|تشقق|شرخ)\s*(في\s*)?(البلاط(?!ة)|السيراميك|الرخام|البورسلان)|بلاط(?!ة)\s*(مكسور|متشقق)/],
 ["plaster",/لياسة|محارة|بياض/],
 ["crack",/شرخ|شروخ|تشقق|تشققات|شقوق/]
];
function remClassify(n){ var t=[n&&n.problem,n&&n.cat,n&&n.evidence,n&&n.where].join(" "); var hits=[];
  REM_DEF_RX.forEach(function(r){ if(r[1].test(t)) hits.push(r[0]); });
  /* شرخ في لياسة أو دهان ≠ شرخ في الخرسانة */
  if(hits.indexOf("crack")>=0&&(hits.indexOf("plaster")>=0||hits.indexOf("paint")>=0)&&!/خرسان|عمود|كمرة|بلاطة\s*خرسانية|جسر/.test(t)) return "crack_finish";
  if(hits.indexOf("crack")>=0&&hits.indexOf("leak")>=0) return "crack";
  return hits[0]||"unknown"; }

/* ---------- المدخلات الميدانية ---------- */
var REM_FIELDS=[
 {k:"element",l:"نوع العنصر",opts:["عمود","كمرة","بلاطة/سقف","جدار خرساني","جدار بلوك/لياسة","أرضية","أخرى"],for:"*"},
 {k:"orient",l:"اتجاه السطح",opts:["رأسي","سقفي (Overhead)","أفقي"],for:"honeycomb,spalling,rebar,coldjoint"},
 {k:"depth",l:"العمق المقاس (مم)",num:1,for:"honeycomb,spalling,rebar,coldjoint",crit:1},
 {k:"len",l:"الطول (سم)",num:1,for:"honeycomb,spalling,rebar,coldjoint,plaster,tile_broken,tile_hollow"},
 {k:"wid",l:"العرض (سم)",num:1,for:"honeycomb,spalling,rebar,coldjoint,plaster,tile_broken,tile_hollow"},
 {k:"rebar",l:"ظهور التسليح",opts:["لا","نعم","غير معروف"],for:"honeycomb,spalling,rebar,coldjoint",crit:1},
 {k:"loss",l:"فقد مقطع الحديد",opts:["لا يوجد","أقل من 10%","10% فأكثر","غير مقاس"],for:"rebar,spalling,honeycomb",crit:1},
 {k:"sound",l:"حالة الخرسانة المحيطة (طرق/فحص)",opts:["سليمة","متهالكة/مطبّلة","غير مفحوصة"],for:"honeycomb,spalling,rebar,coldjoint"},
 {k:"cw",l:"عرض الشرخ (مم)",num:1,for:"crack,crack_finish",crit:1},
 {k:"active",l:"حالة الشرخ",opts:["مستقر (لم يتغير بالمراقبة)","نشط/متحرك","غير معروف"],for:"crack,crack_finish",crit:1},
 {k:"depthc",l:"امتداد الشرخ",opts:["في اللياسة/الدهان فقط","في الخرسانة","نافذ","غير معروف"],for:"crack,crack_finish",crit:1},
 {k:"moist",l:"الرطوبة/المياه",opts:["جاف","رطب","تسرب نشط/مياه جارية","غير معروف"],for:"*",crit:1},
 {k:"source",l:"مصدر المياه",opts:["محدد ومعالج","محدد وغير معالج","غير محدد"],for:"leak,damp,paint",crit:1},
 {k:"expo",l:"التعرض",opts:["داخلي","خارجي","ملامس للتربة/المياه","بيئة مالحة/كيميائية"],for:"*"},
 {k:"hot",l:"ظروف التنفيذ",opts:["عادية","حرارة مرتفعة/تعرض للشمس"],for:"honeycomb,spalling,rebar,coldjoint,crack,plaster,paint"},
 {k:"tile",l:"نوع البلاط والركيزة",opts:["سيراميك على خرسانة","بورسلان على خرسانة","رخام/حجر","غير معروف"],for:"tile_broken,tile_hollow,tile_level"}
];
function remFieldsFor(d){ return REM_FIELDS.filter(function(f){ return f.for==="*"||f.for.split(",").indexOf(d)>=0; }); }
function _remIn(n){ return (n.fin=n.fin||{}); }
function _remKnown(v){ return v!=null&&v!==""&&!/غير\s*(معروف|مقاس|محدد|مفحوصة)/.test(String(v)); }

/* ---------- اختيار المواد ---------- */
function _remCat(c){ var L=remLib().products; return Object.keys(L).map(function(k){ return L[k]; }).filter(function(p){ return p.category===c; }); }
function _remPick(cat,why,cond){ var L=_remCat(cat); return L.map(function(p){ return {p:p,why:why,cond:cond||""}; }); }
function _remMktRank(p){ var r={ksa:0,regional:1,unverified:2}[p&&p.market]; return r==null?3:r; }
/* مادة في جدول: نسخة ثابتة من بياناتها ومصدرها وقت الإصدار */
function _remSnap(p){ var c=JSON.parse(JSON.stringify(p)); c._snapAt=new Date().toISOString(); return c; }
function _remM(stage,role,p,why,limits){ return {stage:stage,role:role,id:p?p.id:null,snap:p?_remSnap(p):null,why:why||"",limits:limits||[]}; }
function _remGap(stage,role,need){ return {stage:stage,role:role,id:null,snap:null,gap:need}; }

/* ---------- بناء التوصية ---------- */
function remBuild(n){ var d=n.fin&&n.fin._def?n.fin._def:remClassify(n), I=_remIn(n), L=remLib(), R={defect:d,defName:(L.defects[d]||{}).ar||"عيب غير مصنّف",at:new Date().toISOString(),
  verify:[],missing:[],assume:[],immediate:"",priority:"",method:"",methodWhy:"",cond:[],steps:[],mats:[],alts:[],hold:[],accept:[],resp:"",qty:null,status:"أولية مشروطة",log:(n.rec&&n.rec.log)||[]};
  var crit=remFieldsFor(d).filter(function(f){ return f.crit; }); crit.forEach(function(f){ if(!_remKnown(I[f.k])) R.missing.push(f.l); });
  var DEF=L.defects[d]; if(DEF){ R.verify=(DEF.verify||[]).slice(); }
  var fn=REM_RULES[d]||REM_RULES.unknown; fn(R,I,n,L);
  ["verify","assume","alts","hold","accept","missing"].forEach(function(k){ var seen={}; R[k]=(R[k]||[]).filter(function(x){ var key=String(x); if(seen[key]) return false; seen[key]=1; return true; }); });
  if(!R.missing.length&&R.status!=="معتمدة من المختص") R.status="مكتملة البيانات";
  if(n.rec&&n.rec.approved){ R.status="معتمدة من المختص"; R.approved=n.rec.approved; }
  /* الكميات: فقط من أبعاد مُدخلة ومعدل موثق */
  var lc=+I.len, wc=+I.wid, dm=+I.depth;
  if(lc>0&&wc>0&&dm>0){ var vol=lc/100*wc/100*dm/1000; R.qty={formula:"الحجم = الطول × العرض × العمق = "+lc+" سم × "+wc+" سم × "+dm+" مم = "+vol.toFixed(4)+" م³ ("+(vol*1000).toFixed(1)+" لتر)",vol:vol,notes:[]};
    R.mats.forEach(function(m){ if(!m.snap) return; var y=_remYield(m.snap); if(y&&(m.role.indexOf("مونة")>=0||m.role.indexOf("انسياب")>=0||m.role.indexOf("جراوت")>=0)){ var units=vol*1000/y.lPerUnit; R.qty.notes.push(m.snap.name_en+": "+(vol*1000).toFixed(1)+" لتر ÷ "+y.lPerUnit+" لتر/"+y.unit+" ≈ "+Math.ceil(units*1.1)+" "+y.unit+" (شاملة 10% هدر افتراضي) — المعدل من النشرة: «"+y.src+"»"); } });
    if(!R.qty.notes.length) R.qty.notes.push("لا يتوفر في المكتبة معدل عائد رقمي قابل للحساب للمواد المختارة — احسب الكمية من نشرة المادة.");
    R.assume.push("الكمية تقديرية لمساحة مستطيلة بعمق ثابت؛ تُعدّل بعد الإزالة الفعلية.");
  } else if(/honeycomb|spalling|rebar|coldjoint/.test(d)) R.assume.push("لم تُحسب الكميات: يلزم إدخال الطول والعرض والعمق المقاس ميدانياً (لا تُستخرج من صورة بلا مقياس).");
  return R; }
/* استخراج عائد حجمي صريح من نص الاستهلاك/العائد: «~13.5 litres of mortar per 25 kg» */
function _remYield(p){ var N=p.num||{}; if(N.yield_l) return {lPerUnit:N.yield_l,unit:N.bag||"عبوة",src:_remV(p.consumption)}; return null; }

/* ---------- قواعد كل عيب ---------- */
function _remStepsConcrete(R,I,L,opt){ var deep=+I.depth;
  R.steps.push({t:"تحديد حدود العيب بالطرق والمعاينة، وتقييم الحاجة إلى حماية أو تدعيم مؤقت بمعرفة المهندس الإنشائي قبل أي إزالة قد تؤثر على العنصر.",hold:true});
  R.steps.push({t:"قياس العمق الفعلي وامتداد الخرسانة الضعيفة وحالة التسليح (بالتكسير التجريبي/الفحص)، وتسجيلها في المدخلات الميدانية.",a:_remKnown(I.depth)?"":"العمق غير مقاس حالياً"});
  R.steps.push({t:"إزالة الخرسانة غير المتماسكة حتى الوصول إلى خرسانة سليمة بطريقة معتمدة تناسب العنصر (تكسير يدوي/ميكانيكي خفيف)، مع تجنب إتلاف التسليح، وقص حواف الإصلاح بشكل منتظم وفق متطلبات النشرة."});
  if(opt.rebar) R.steps.push({t:"كشف التسليح المتأثر حوله بالكامل حسب متطلبات النظام، وتنظيفه ميكانيكياً من الصدأ والقشور، ثم فحصه وتسجيل نسبة فقد المقطع.",hold:true});
  R.steps.push({t:"تنظيف السطح من الغبار والأجزاء السائبة، وتجهيز رطوبة السطح كما تشترط نشرة مونة الإصلاح المختارة (مثل حالة مشبع جاف السطح عند اشتراطها)."}); }
REM_RULES={
 honeycomb:function(R,I,n,L){ _remConcrete(R,I,n,L,"honeycomb"); },
 spalling:function(R,I,n,L){ _remConcrete(R,I,n,L,"spalling"); },
 coldjoint:function(R,I,n,L){ R.verify.unshift("هل هو فاصل صب مخطط أم فاصل بارد غير مخطط؟ وهل يصاحبه تسرب أو انفصال؟"); _remConcrete(R,I,n,L,"coldjoint"); },
 rebar:function(R,I,n,L){ I.rebar=I.rebar||"نعم"; _remConcrete(R,I,n,L,"rebar"); },
 crack:function(R,I,n,L){ _remCrack(R,I,n,L,false); },
 crack_finish:function(R,I,n,L){ _remCrack(R,I,n,L,true); },
 leak:function(R,I,n,L){ _remLeak(R,I,n,L); },
 damp:function(R,I,n,L){ _remPaint(R,I,n,L,true); },
 paint:function(R,I,n,L){ _remPaint(R,I,n,L,false); },
 plaster:function(R,I,n,L){ _remPlaster(R,I,n,L); },
 tile_broken:function(R,I,n,L){ _remTile(R,I,n,L,"broken"); },
 tile_hollow:function(R,I,n,L){ _remTile(R,I,n,L,"hollow"); },
 tile_level:function(R,I,n,L){ _remTile(R,I,n,L,"level"); },
 unknown:function(R,I,n,L){ R.method="مسار عام مشروط — العيب غير مصنّف تلقائياً"; R.methodWhy="لم يتطابق وصف الملاحظة مع مكتبة العيوب؛ اختر نوع العيب يدوياً لإظهار مسار المعالجة المناسب.";
   R.missing.unshift("نوع العيب (اختيار يدوي)"); R.steps.push({t:"تصنيف العيب ميدانياً (خرسانة/تسليح/شروخ/تسرب/تشطيبات/بلاط) ثم إعادة توليد التوصية.",hold:true}); R.resp="المهندس المشرف"; }
};
function _remSysList(){ return (REM_BASE.systems||[]).concat((_remUser().systems)||[]); }
function _remOriKey(o){ return /سقف/.test(o||"")?"o":(/أفقي/.test(o||"")?"h":(/رأسي/.test(o||"")?"v":"")); }
function _remSysFit(S,ori,dep){ var m=remProd(S.mortar); if(!m) return null; var N=m.num||{}, k=_remOriKey(ori), why=[], ok=true;
  if(k&&N.ori&&N.ori.length&&N.ori.indexOf(k)<0){ ok=false; why.push("اتجاه التطبيق غير مذكور في النشرة"); }
  if(k&&(!N.ori||!N.ori.length)) why.push("اتجاه التطبيق غير مذكور في النشرة — يلزم تأكيد المصنّع");
  var tmax=(k&&N["tmax_"+k])||N.tmax; if(dep&&tmax&&dep>tmax) why.push("العمق "+dep+" مم يتجاوز سماكة الطبقة الواحدة ("+tmax+" مم) — يلزم تطبيق على طبقات وفق النشرة");
  if(dep&&N.tmin&&dep<N.tmin){ ok=false; why.push("العمق أقل من الحد الأدنى للسماكة ("+N.tmin+" مم)"); }
  var score=(ok?0:100)+(_remMktRank(m)*2)+(S.missing||[]).length*3; return {S:S,m:m,ok:ok,why:why,score:score,tmax:tmax}; }
function _remConcrete(R,I,n,L,kind){ var dep=+I.depth, known=_remKnown(I.depth)&&dep>0, rebar=I.rebar==="نعم"||kind==="rebar", loss=I.loss||"", ori=I.orient||"", area=(+I.len||0)*(+I.wid||0), wet=/رطب|تسرب/.test(I.moist||"");
  R.immediate=(I.sound==="متهالكة/مطبّلة"||/10%/.test(loss))?"تقييم إنشائي عاجل قبل أي إزالة، مع حماية المنطقة ومنع الأحمال الإضافية عند الشك":"حماية المنطقة وتوثيقها، وعدم إخفاء العيب بأي تشطيب قبل المعالجة";
  R.priority=(/10%/.test(loss)||I.sound==="متهالكة/مطبّلة")?"عالية — قبل استمرار الأعمال المرتبطة بالعنصر":(rebar?"عالية":"متوسطة");
  R.resp="المقاول (التنفيذ) · المهندس الإنشائي/الاستشاري (التقييم والاعتماد)";
  var fair=remProd("monotop620"), fN=fair?(fair.num||{}):{}, path;
  if(!known){ path="cond"; R.method="مسار مشروط بحسب العمق المقاس: (أ) تسوية سطحية · (ب) ترميم بمونة إصلاح يدوية · (ج) صب مادة انسيابية داخل شدة";
    R.methodWhy="لا يمكن تحديد عمق "+(kind==="honeycomb"?"التعشيش":"العيب")+" أو سلامة الخرسانة الداخلية أو التسليح من الصورة؛ الطريقة تُحسم بعد الإزالة والقياس.";
    R.cond.push("(أ) سطحي: مسام دون تسليح ظاهر وعمق ضمن حدود مادة التسوية"+(fN.tmax?" ("+fair.name_en+": "+fN.tmin+"–"+fN.tmax+" مم حسب نشرتها)":"")+".");
    R.cond.push("(ب) موضعي: بعد الإزالة حتى خرسانة سليمة، وضمن حدود طبقات مونة الإصلاح واتجاه تطبيقها الموثق، مع إمكانية الدمك اليدوي.");
    R.cond.push("(ج) عميق/واسع أو تسليح كثيف: صب مادة انسيابية داخل شدة — "+"لا يوجد بالمكتبة منتج انسيابي موثق لإصلاح الخرسانة حالياً.");
    R.assume.push("الافتراض المبدئي: (ب) ترميم يدوي إلى أن يُقاس العمق — الخطوات المعلّمة تعتمد عليه.");
  } else if(!rebar&&fN.tmax&&dep<=fN.tmax){ path="a"; R.method="(أ) تسوية سطحية وسد مسام"; R.methodWhy="العمق المقاس "+dep+" مم ضمن حدود "+fair.name_en+" ("+fN.tmin+"–"+fN.tmax+" مم) ولا يوجد تسليح ظاهر.";
  } else if(dep>100||(area>25000)){ path="c"; R.method="(ج) صب مادة انسيابية داخل شدة"; R.methodWhy="العمق/المساحة كبيرة"+(area>25000?" (أكبر من 2.5 م² — تذكر نشرة Renderoc HS Xtra الانتقال إلى الصب/الرش في هذه الحالة)":"")+"؛ الصب يقلل الطبقات ويضمن الملء خلف التسليح.";
  } else { path="b"; R.method="(ب) ترميم بمونة إصلاح خرسانة يدوية"; R.methodWhy="العمق "+dep+" مم بعد الإزالة يناسب الترميم اليدوي ضمن حدود الطبقات الموثقة."; }
  _remStepsConcrete(R,I,L,{rebar:rebar});
  if(rebar) R.steps.push({t:"تقييم فقد مقطع الحديد: تنظيف الصدأ لا يعوّض نقص مساحة التسليح. عند فقد ملحوظ يقرر المهندس الإنشائي تعويض/إضافة التسليح قبل الإصلاح.",hold:true,a:_remKnown(I.loss)?"":"فقد المقطع غير مقاس"});
  if(path==="a"){ R.mats.push(_remM("التسوية","مونة تسوية/سد مسام",fair,"العمق ضمن حدودها الموثقة ("+fN.tmin+"–"+fN.tmax+" مم)",fair.limits));
    R.steps.push({t:"تطبيق "+fair.name_en+" بالسماكة المسموحة في النشرة ("+fN.tmin+"–"+fN.tmax+" مم) ونسبة الخلط: "+_remV(fair.mix)+"."});
    R.steps.push({t:"المعالجة وفق النشرة: "+_remV(fair.curing)});
    var gc=remProd("sikagard550"), cc=remCompatible("monotop620","sikagard550"); if(gc&&cc.ok&&(I.expo==="خارجي"||I.expo==="بيئة مالحة/كيميائية")) R.alts.push("طلاء حماية مرن "+gc.name_en+" فوق التسوية للأسطح المعرضة — موثق مع "+fair.name_en+" ("+cc.ref+").");
  } else if(path==="c"){ R.mats.push(_remGap("الصب","مادة انسيابية (ميكروكونكريت) لإصلاح الخرسانة","لا يوجد بالمكتبة منتج انسيابي موثق لإصلاح الخرسانة. المذكور في نشرة Renderoc HS Xtra: Renderoc LAXtra micro-concrete (غير مُدخل) — أدخله من نشرته الرسمية قبل الاعتماد. (Conbextra GP جراوت قواعد وليس مادة إصلاح.)"));
    R.steps.push({t:"تركيب شدة محكمة نظيفة ومثبتة مع فتحات صب وتهوية، ثم صب المادة الانسيابية المعتمدة بنسبة الخلط والسماكات المحددة في نشرتها.",a:"المادة غير محددة بعد"});
    R.alts.push("إذا تعذر عمل شدة: ترميم يدوي على طبقات ضمن حدود مونة موثقة (انظر نظام Renderoc HS Xtra).");
  }
  if(path==="b"||path==="cond"||(path==="c"&&false)){
    var F=_remSysList().map(function(S){ return _remSysFit(S,ori,known?dep:0); }).filter(Boolean).sort(function(a,b){ return a.score-b.score; }), best=F[0];
    if(best){ var S=best.S, m=best.m, N=m.num||{};
      R.method+=" — النظام المقترح: "+S.name; best.why.forEach(function(w){ R.assume.push(w); });
      if(rebar){ var rp=S.rebar?remProd(S.rebar):null, rc=rp?remCompatible(rp.id,m.id):null;
        if(rp&&rc.ok){ R.mats.push(_remM("حماية التسليح","برايمر حماية حديد التسليح",rp,"دليل التوافق: «"+rc.quote+"» — "+rc.ref,rp.limits)); R.steps.push({t:"تطبيق "+rp.name_en+" على الحديد المنظف: "+_remV(rp.thickness)+"؛ زمن الانتظار قبل المونة: "+_remV(rp.overcoat)+"."}); }
        else R.mats.push(_remGap("حماية التسليح","حماية حديد التسليح ضمن نظام "+m.name_en,"المذكور في نشرة "+m.name_en+": "+((S.bond&&S.bond.named)||[]).join("، ")+" — غير مُدخل في المكتبة؛ أدخله من نشرته قبل الاعتماد.")); }
      if(S.bond){ var bp=S.bond.id?remProd(S.bond.id):null, bc=bp?remCompatible(bp.id,m.id):null;
        if(bp&&bc&&bc.ok){ R.mats.push(_remM("الربط",S.bond.required?"مادة ربط ضمن النظام":"مادة ربط إيبوكسية — مشروطة",bp,(S.bond.required?"تشترطها نشرة المونة":"تُستخدم فقط: "+S.bond.cond)+" — «"+bc.quote+"» ("+bc.ref+")",bp.limits));
          R.steps.push({t:(S.bond.required?"":"[مشروطة] ")+"تطبيق "+bp.name_en+" ثم المونة ضمن نافذة الربط في نشرتها: "+_remV(bp.overcoat)+".",a:S.bond.required?"":(wet?"الركيزة رطبة — الشرط متحقق مبدئياً":"تُحذف الخطوة إن لم تتحقق شروطها")}); }
        else if(S.bond.required){ R.mats.push(_remGap("الربط","مادة ربط ضمن نظام "+m.name_en,"تشترط النشرة تطبيق المونة والمادة الرابطة ما زالت رطبة ("+S.bond.ref+"). المذكور: "+(S.bond.named||[]).join("، ")+" — غير مُدخل في المكتبة.")); }
        else if(S.bond.required==null) R.assume.push("حاجة "+m.name_en+" لمادة ربط غير محددة نصاً في البيانات المستخرجة — راجع النشرة ("+S.bond.ref+")."); }
      R.mats.push(_remM("الترميم","مونة إصلاح خرسانة",m,(path==="cond"?"الخيار (ب) الافتراضي حتى قياس العمق؛ ":"")+"حدود الطبقة: "+_remV(m.thickness)+" — الاتجاه: "+_remV(m.orientation),m.limits));
      R.steps.push({t:"تطبيق "+m.name_en+" بالضغط والدمك اليدوي على طبقات (حد الطبقة: "+(best.tmax||"انظر النشرة")+" مم)، بنسبة خلط: "+_remV(m.mix)+"؛ زمن التشغيل: "+_remV(m.pot_life)+".",a:path==="cond"?"يفترض الخيار (ب) لحين قياس العمق":""});
      R.steps.push({t:"إعادة تشكيل القطاع والغطاء الخرساني حتى المنسوب الأصلي، وتسوية السطح للتشطيب اللاحق."});
      R.steps.push({t:"المعالجة (Curing) وحماية الإصلاح من الجفاف والحرارة: "+_remV(m.curing)+(I.hot==="حرارة مرتفعة/تعرض للشمس"?" — حرارة مرتفعة: الالتزام بحدود حرارة التطبيق ("+_remV(m.temp_app)+").":"")});
      if(S.note) R.assume.push(S.note+(S.note_ref?" ("+S.note_ref+")":""));
      F.slice(1).forEach(function(f){ R.alts.push("بديل: "+f.S.name+" — يستبدل النظام كاملاً بمكوناته الموثقة"+((f.S.missing||[]).length?"؛ مكونات ناقصة بالمكتبة: "+f.S.missing.join("، "):"")+(f.why.length?"؛ ملاحظات: "+f.why.join("؛ "):"")+" — "+(REM_MKT[f.m.market]||"")+"."); });
      var rr=remProd("reebaklens"); if(rebar&&rr) R.alts.push("مزيل صدأ كيميائي "+rr.name_en+": فقط عند تعذر التنظيف الميكانيكي الكامل، مع الالتزام بقيود نشرته وإزالة بقاياه ("+_remV(rr.overcoat)+"). لا يوجد في نشرتي المونة/البرايمر ما يوثق توافقه مع النظام — يلزم تأكيد المصنّع. التوافر: "+REM_MKT[rr.market]+".");
      var fg=remProd("ferrogard903"); if(rebar&&fg) R.alts.push("مثبط تآكل سطحي "+fg.name_en+" كإجراء إضافي للمناطق المجاورة بقرار المهندس — ليس بديلاً عن الإصلاح.");
    } else R.mats.push(_remGap("الترميم","مونة إصلاح","لا يوجد نظام موثق يطابق الاتجاه/العمق."));
  }
  R.hold.push("نقطة توقف: معاينة بعد الإزالة وقبل أي مادة — تأكيد الوصول لخرسانة سليمة وتسجيل العمق الفعلي.");
  if(rebar) R.hold.push("نقطة توقف: فحص الحديد بعد التنظيف وقبل الحماية — تسجيل فقد المقطع وقرار المهندس.");
  R.hold.push("نقطة توقف: قبل التطبيق — تحضير السطح ورطوبته وحرارة الجو حسب النشرة.");
  R.accept.push("فحص الطرق (Hammer sounding) بعد التصلب للتأكد من عدم وجود تطبيل أو انفصال.","فحص بصري لشروخ الانكماش واستواء السطح والغطاء.","اختبار التصاق (Pull-off) عند طلب الاستشاري — القيم المرجعية من نشرة المادة ومواصفات المشروع.","إغلاق الملاحظة: صور قبل/أثناء/بعد + سجل المعالجة + توقيع المشرف.");
  if(rebar) R.verify.push("نسبة فقد مقطع الحديد وطول المنطقة المتأثرة","هل الصدأ موضعي أم ممتد داخل العنصر؟");
  R.assume.push("ترميم الغطاء الخرساني لا يعني استعادة القدرة الإنشائية للعنصر؛ أي شك إنشائي يُحال للمهندس الإنشائي — لا يُقترح إزالة العنصر وإعادة صبه تلقائياً.");
}
function _remPU(I,w,wk){ var run=/جارية|تسرب نشط/.test(I.moist||""), alts=[];
  var L=_remCat("injection_pu").filter(function(p){ var N=p.num||{}; if(run&&N.no_running_water){ alts.push(p.name_en+" لا يُستخدم مع مياه جارية حسب نشرته"+(N.running_alt?" — تذكر النشرة "+N.running_alt+" (غير مُدخل في المكتبة)":"")); return false; } return !(wk&&N.cwmin!=null&&(w<N.cwmin||w>N.cwmax)); }).sort(function(a,b){ return _remMktRank(a)-_remMktRank(b); });
  return {p:L[0],alts:alts}; }
function _remCrack(R,I,n,L,finish){ var w=+I.cw, wk=_remKnown(I.cw)&&w>0, act=I.active||"", wet=/تسرب|رطب/.test(I.moist||""), ext=I.depthc||(finish?"في اللياسة/الدهان فقط":"");
  R.resp="المقاول (التنفيذ) · الاستشاري/المهندس الإنشائي (تحديد السبب والاعتماد)";
  R.verify=["سبب الشرخ (انكماش/حراري/هبوط/تحميل/تسليح)","هل الشرخ نشط؟ (مراقبة بمؤشرات شرخ لفترة يحددها المختص)","عرض الشرخ بمسطرة/عدسة قياس الشروخ وعمقه وامتداده","هل يصاحبه تسرب أو رطوبة؟"];
  R.immediate=wet?"تحديد مصدر المياه ومنع التسرب أولاً":(act==="نشط/متحرك"?"تركيب مؤشرات مراقبة وإحالة للمهندس الإنشائي":"توثيق الشرخ وقياسه ووضع علامات مراقبة");
  R.priority=act==="نشط/متحرك"||wet?"عالية":"متوسطة";
  R.steps.push({t:"قياس عرض الشرخ وطوله وتسجيل موضعه بالصور، وتركيب مؤشرات مراقبة (Tell-tales) لتحديد نشاطه.",a:wk?"":"العرض غير مقاس"});
  if(ext==="في اللياسة/الدهان فقط"||finish){
    R.method="معالجة شرخ تشطيبات (لياسة/دهان) — وليس إصلاح خرسانة"; R.methodWhy="الشرخ في طبقة التشطيب؛ لا تُستخدم مونة خرسانية. إن كان الشرخ يمتد للخرسانة أو البلوك يُعاد التصنيف.";
    var gc=_remCat("coating").filter(function(p){ return /crack|bridg|جسر|تجسير/i.test(p.name_en+" "+p.function_ar+" "+(p.uses||[]).join(" ")); }), pr=_remCat("primer");
    R.steps.push({t:"فتح الشرخ وتنظيفه من الأجزاء السائبة، وإصلاح اللياسة المنفصلة إن وجدت (انظر معالجة اللياسة)."});
    if(act==="نشط/متحرك"){ var sl=_remCat("sealant")[0]; if(sl){ R.mats.push(_remM("السد","سيلانت مرن للشرخ المتحرك",sl,"الشرخ متحرك؛ المادة المرنة تستوعب الحركة بحدود نشرتها",sl.limits)); R.steps.push({t:"تجهيز مجرى للشرخ بالأبعاد التي تحددها نشرة "+sl.name_en+" وتعبئته بعد البرايمر إن اشترطته النشرة."}); } }
    if(gc.length){ var g=gc[0], pp=pr.filter(function(p){ var c=remCompatible(p.id,g.id); return c&&c.ok; })[0];
      if(pp) R.mats.push(_remM("التحضير","برايمر نظام الطلاء",pp,"مذكور ضمن نظام "+g.name_en,pp.limits));
      R.mats.push(_remM("التشطيب","طلاء مرن مجسّر للشروخ",g,"يجسّر الشروخ الشعرية ضمن حدود نشرته بدل إخفائها بدهان عادي",g.limits));
      R.steps.push({t:"تطبيق "+(pp?pp.name_en+" ثم ":"")+g.name_en+" بعدد الطبقات والسماكة المحددة في النشرة؛ زمن إعادة الطلاء: "+_remV(g.overcoat)+"."}); }
    else R.mats.push(_remGap("التشطيب","طلاء/معجون مرن","أدخل منتج تشطيب موثق من المورد المحلي (معجون مرن + طلاء مجسّر)."));
    R.accept.push("عدم ظهور الشرخ بعد دورة مراقبة يحددها المشرف","التصاق الطلاء وعدم التقشر","توحيد اللون والملمس مع المحيط");
    R.hold.push("نقطة توقف: تأكيد أن الشرخ لا يمتد للعنصر الإنشائي قبل التشطيب.");
    return; }
  /* شرخ في الخرسانة */
  if(wet){ var _pu=_remPU(I,w,wk), pu=_pu.p; _pu.alts.forEach(function(x){ R.alts.push(x); });
    R.method="حقن لإيقاف المياه (بولي يوريثان) ثم معالجة الشرخ حسب حالته"; R.methodWhy="وجود مياه/رطوبة في الشرخ؛ الحقن الإيبوكسي الهيكلي لا يُختار في شرخ تجري فيه المياه إلا إذا نصّت نشرته على ذلك.";
    if(pu){ R.mats.push(_remM("الحقن","حقن بولي يوريثان لإيقاف المياه",pu,"وظيفته في النشرة: إيقاف تسرب المياه عبر الشروخ",pu.limits)); R.steps.push({t:"حفر فتحات الحقن وتركيب الحلمات (Packers) حسب المسافات في نشرة "+pu.name_en+"، ثم الحقن من الأسفل للأعلى حتى خروج المادة من الحلمة التالية."}); }
    var pl=remProd("renderocplug"); if(pl&&/جار|running|flow/i.test(String(I.moist)+" "+(pl.function_ar||""))) R.alts.push("عند تدفق مياه نشط من نقطة: سد مؤقت بـ "+pl.name_en+" ضمن حدود نشرته قبل الحقن.");
  } else if(act==="نشط/متحرك"){ var sl2=_remCat("sealant")[0];
    R.method="معاملة الشرخ النشط كفاصل حركة — سد مرن بعد تحديد السبب"; R.methodWhy="الحقن الإيبوكسي الصلب في شرخ متحرك يؤدي لظهور شرخ مجاور؛ يلزم إزالة سبب الحركة أو استيعابها.";
    if(sl2){ R.mats.push(_remM("السد","سيلانت مرن",sl2,"يستوعب الحركة ضمن حدود نشرته",sl2.limits)); R.steps.push({t:"قص مجرى بأبعاد نشرة "+sl2.name_en+"، وتركيب حشوة خلفية عند الحاجة، ثم البرايمر (إن اشترطته النشرة) والسيلانت."}); }
    R.hold.push("نقطة توقف: لا حقن صلب قبل تأكيد المهندس الإنشائي استقرار الشرخ ومعالجة سببه.");
  } else if(act==="مستقر (لم يتغير بالمراقبة)"){ var ep=_remCat("injection_epoxy").filter(function(p){ var N=p.num||{}; return !(wk&&N.cwmin!=null&&(w<N.cwmin||w>N.cwmax)); }).sort(function(a,b){ return _remMktRank(a)-_remMktRank(b); });
    R.method="حقن إيبوكسي لشرخ مستقر جاف (عند الحاجة لاستعادة الاستمرارية)"; R.methodWhy="الشرخ مستقر وجاف؛ الحقن يعيد الاستمرارية ويمنع النفاذ بشرط أن يقع عرضه ضمن حدود نشرة المادة.";
    if(ep.length){ var e=ep[0], eN=e.num||{}; R.mats.push(_remM("الحقن","راتنج حقن إيبوكسي منخفض اللزوجة",e,"شرخ مستقر جاف"+(eN.cwmin!=null?"؛ عرض الشروخ الموثق: "+eN.cwmin+"–"+eN.cwmax+" مم"+(wk?" (المقاس "+w+" مم)":" — العرض غير مقاس"):"؛ حدود العرض غير متوفرة في البيانات"),e.limits)); R.steps.push({t:"سد سطح الشرخ وتثبيت الحلمات، ثم حقن "+e.name_en+" بالخلط ("+_remV(e.mix)+") ضمن مدة التشغيل ("+_remV(e.pot_life)+")، والحقن تتابعياً حتى الامتلاء."}); ep.slice(1).forEach(function(p){ R.alts.push("بديل: "+p.name_en+" ("+p.maker+") — "+(REM_MKT[p.market]||"")); }); }
    if(wk&&w<0.2) R.alts.push("شرخ شعري جداً غير إنشائي: قد يكفي طلاء/سد سطحي مجسّر بدل الحقن — بقرار المشرف.");
  } else { R.method="مسار مشروط: يحدده نشاط الشرخ ورطوبته"; R.methodWhy="لا يمكن من الصورة الحكم بأن الشرخ إنشائي أو نشط أو مستقر.";
    R.cond.push("مستقر وجاف → حقن إيبوكسي ضمن حدود عرض الشرخ في النشرة.","نشط/متحرك → معاملة كفاصل حركة بسيلانت مرن بعد معالجة السبب؛ لا حقن صلب.","مصحوب بمياه → حقن بولي يوريثان لإيقاف المياه أولاً.");
    R.steps.push({t:"مراقبة الشرخ وتحديد حالته قبل اختيار المادة.",hold:true}); }
  R.accept.push("عدم تسرب المياه بعد الحقن (اختبار بالرش/الغمر عند الاقتضاء)","امتلاء الشرخ (خروج المادة من الحلمات المتتالية)","عدم ظهور شرخ جديد بعد المراقبة","إزالة الحلمات وتشطيب السطح");
  R.hold.push("نقطة توقف: تحديد السبب وحالة الشرخ من المهندس قبل اختيار المادة النهائية."); }
function _remLeak(R,I,n,L){ R.resp="المقاول · مهندس العزل/الاستشاري"; R.verify=["مصدر المياه (تمديدات/أمطار/مياه جوفية/خزان)","هل التسرب مستمر أم موسمي؟","مسار المياه وأماكن خروجها"];
  R.immediate="تحديد مصدر المياه وإيقافه/تحويله قبل أي إصلاح أو تشطيب"; R.priority="عالية";
  R.method="معالجة مصدر التسرب أولاً، ثم سد مسار المياه، ثم الإصلاح والتشطيب"; R.methodWhy="أي تشطيب أو دهان فوق تسرب مستمر سيفشل ويخفي المشكلة.";
  R.steps.push({t:"تتبع مصدر المياه (فحص التمديدات/العزل/الفواصل) وإصلاحه — بدون ذلك لا تُنفذ الخطوات التالية.",hold:true});
  var pl=remProd("renderocplug"); if(pl) { R.mats.push(_remM("السد العاجل","مونة سد تسرب سريعة",pl,"لإيقاف تدفق مياه نشط من نقطة/شرخ وفق نشرتها",pl.limits)); }
  var _pu=_remPU(I,0,false), pu=_pu.p; _pu.alts.forEach(function(x){ R.alts.push(x); }); if(pu) R.mats.push(_remM("الحقن","حقن بولي يوريثان",pu,"لإيقاف المياه عبر الشروخ/الفواصل وفق نشرته",pu.limits));
  R.steps.push({t:"سد مسار المياه بالمادة المناسبة لحالة التدفق (سد سريع للتدفق النشط، حقن للشروخ والفواصل) وفق النشرات."});
  R.steps.push({t:"بعد التوقف الكامل والجفاف: إصلاح الأجزاء المتضررة ثم التشطيب (انظر الرطوبة/الدهانات)."});
  R.hold.push("نقطة توقف: إثبات توقف التسرب قبل الإصلاح والتشطيب."); R.accept.push("اختبار مائي/مراقبة بعد فترة يحددها المشرف دون ظهور رطوبة","جفاف السطح قبل التشطيب"); }
function _remPaint(R,I,n,L,damp){ R.resp="المقاول (التشطيبات) · المشرف"; var srcOk=I.source==="محدد ومعالج", dry=I.moist==="جاف";
  R.verify=["مصدر الرطوبة (تسرب/رطوبة صاعدة/تكاثف)","نسبة رطوبة الركيزة قبل الدهان","التصاق الطبقات القديمة"];
  R.immediate=damp||!dry?"تحديد مصدر الرطوبة ومعالجته قبل إعادة التشطيب":"إزالة الدهان المتقشر وتقييم الركيزة"; R.priority=damp?"متوسطة — بعد معالجة المصدر":"منخفضة إلى متوسطة";
  R.method=damp?"معالجة مصدر الرطوبة والأملاح ثم إعادة التشطيب بنظام متوافق":"إزالة الدهان المتقشر وإعادة الدهان بنظام برايمر وطلاء متوافق";
  R.methodWhy="تقشر الدهان عرض لسبب (رطوبة/أملاح/سوء تحضير)؛ الدهان فوق رطوبة مستمرة يفشل مجدداً.";
  if(!srcOk) R.steps.push({t:"تحديد مصدر الرطوبة ومعالجته (انظر التسرب) — شرط سابق لأي تشطيب.",hold:true,a:"مصدر المياه غير مؤكد المعالجة"});
  R.steps.push({t:"إزالة الدهان المتقشر والأملاح بالتنظيف الجاف/الفرشاة، وإصلاح اللياسة المنفصلة."});
  R.steps.push({t:"ترك السطح ليجف والتحقق من رطوبة الركيزة بجهاز قياس قبل البرايمر، وفق حدود نشرة البرايمر.",hold:true});
  var co=_remCat("coating"), pr=_remCat("primer");
  if(co.length){ var g=co[0], pp=pr.filter(function(p){ var c=remCompatible(p.id,g.id); return c&&c.ok; })[0];
    if(pp) R.mats.push(_remM("البرايمر","برايمر",pp,"ضمن نظام "+g.name_en+" حسب نشرته",pp.limits));
    R.mats.push(_remM("الطلاء","طلاء حماية/تشطيب",g,"طلاء ضمن نظام موثق؛ يُتحقق من ملاءمته للركيزة والتعرض",g.limits));
    R.steps.push({t:"تطبيق "+(pp?pp.name_en+" ثم ":"")+g.name_en+" وفق النشرة؛ زمن إعادة الطلاء: "+_remV(g.overcoat)+"."}); }
  R.mats.push(_remGap("المعجون","معجون/سد مسام متوافق","أدخل معجوناً موثق التوافق مع نظام الطلاء من المورد المحلي — لا يُفترض تكافؤ المنتجات."));
  R.accept.push("رطوبة الركيزة ضمن حد النشرة قبل الدهان","اختبار التصاق (Cross-cut) عند طلب المشرف","عدم عودة التقشر/التزهر بعد مدة مراقبة"); }
function _remPlaster(R,I,n,L){ R.resp="المقاول (التشطيبات) · المشرف"; R.verify=["سماكة اللياسة ومدى انفصالها (فحص بالطرق)","سبب التلف (رطوبة/انكماش/ضعف الخلطة)","هل يمتد الشرخ للبلوك/الخرسانة؟"];
  R.immediate="تحديد حدود اللياسة المنفصلة بالطرق"; R.priority="متوسطة";
  R.method="إزالة اللياسة المنفصلة وإعادة تنفيذها بمواصفات اللياسة المعتمدة للمشروع"; R.methodWhy="اللياسة ليست عنصراً إنشائياً؛ لا تُستخدم مونة إصلاح خرسانية لمجرد وجود شرخ أو تلف بها.";
  R.steps.push({t:"تحديد المساحات المطبّلة والمنفصلة بالطرق وإزالتها حتى الركيزة السليمة."});
  R.steps.push({t:"معالجة سبب التلف (رطوبة/حركة) قبل إعادة التنفيذ.",hold:true});
  R.steps.push({t:"ترطيب الركيزة وتنفيذ طبقة الطرطشة ثم اللياسة بالسماكة المعتمدة وتسوية الحواف مع القديم، والمعالجة بالرش حسب المواصفات."});
  R.steps.push({t:"بعد الجفاف الكامل: التشطيب بنظام البرايمر والدهان المعتمد."});
  R.mats.push(_remGap("اللياسة","مونة لياسة/إضافات تحسين الالتصاق","أدخل منتج لياسة أو إضافة موثقة من المورد المحلي مع نشرتها — لا توجد في المكتبة حالياً."));
  R.accept.push("عدم التطبيل بالطرق","استواء السطح بالقدة","عدم ظهور شروخ انكماش بعد المعالجة"); }
function _remTile(R,I,n,L,kind){ R.resp="المقاول (التشطيبات) · المشرف"; R.priority=kind==="hollow"?"متوسطة — خطر كسر/انفصال":"منخفضة إلى متوسطة";
  R.verify=kind==="hollow"?["مساحة التطبيل بالطرق","سبب ضعف الالتصاق (تغطية لاصق/حركة/رطوبة)","وجود فواصل تمدد كافية"]:(kind==="level"?["فرق المنسوب المقاس بالقدة","سبب التفاوت (ركيزة/تنفيذ)"]:["سبب الكسر (حمل/فراغ تحت البلاط/حركة الركيزة)","وجود تطبيل حول البلاطة"]);
  R.immediate=kind==="hollow"?"تحديد البلاطات المطبّلة وحمايتها من الأحمال":"تحديد البلاطات المتضررة";
  R.method=kind==="broken"?"استبدال البلاطات المكسورة بعد معالجة سبب الكسر":(kind==="hollow"?"إزالة البلاطات المطبّلة وإعادة تركيبها بلاصق مناسب ونسبة تغطية كاملة":"إعادة تركيب البلاطات المتفاوتة بعد تصحيح الركيزة");
  R.methodWhy="نوع العيب يحدد المعالجة: الكسر يُستبدل، والتطبيل يُعاد تركيبه، والتفاوت يُصحح من الركيزة.";
  R.steps.push({t:"فحص المنطقة بالطرق لتحديد كل البلاطات المتأثرة وليس المكسورة فقط.",hold:true});
  R.steps.push({t:"إزالة البلاطات المتأثرة دون إتلاف المجاورة، وإزالة اللاصق القديم وتنظيف الركيزة."});
  if(kind!=="broken") R.steps.push({t:"تصحيح منسوب الركيزة/الفراغات قبل إعادة التركيب."});
  R.steps.push({t:"التركيب بلاصق يناسب نوع البلاط والركيزة وظروف الاستخدام، مع تغطية كاملة لظهر البلاطة وفواصل تمدد حسب المواصفات."});
  R.steps.push({t:"الترويب (الجراوت) بعد زمن الانتظار المحدد في نشرة اللاصق."});
  R.mats.push(_remGap("التركيب","لاصق بلاط حسب نوع البلاط ("+(I.tile||"غير محدد")+")","أدخل لاصقاً موثقاً (فئة مناسبة للبلاط والركيزة) من المورد المحلي مع نشرته."));
  R.mats.push(_remGap("الترويب","جراوت فواصل","أدخل جراوت موثقاً متوافقاً مع اللاصق."));
  R.accept.push("عدم وجود تطبيل بالطرق بعد التركيب","استواء المنسوب ضمن حدود المواصفات","انتظام الفواصل واكتمال الترويب"); }
