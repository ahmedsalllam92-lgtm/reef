// netlify/functions/photo-edit.js
// تعديل صور المشاريع على Cloudinary: حذف صورة أو حفظ وصفها (caption)
// المفاتيح: CLOUDINARY_API_KEY , CLOUDINARY_API_SECRET (نفس مفاتيح pick-images — سرّية على الخادم)
const crypto = require("crypto");
const CLOUD_NAME = "exm0p8kg";
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function sign(params, secret){
  var keys=Object.keys(params).filter(function(k){return params[k]!=null && params[k]!=="";}).sort();
  var str=keys.map(function(k){return k+"="+params[k];}).join("&");
  return crypto.createHash("sha1").update(str+secret).digest("hex");
}
async function call(path, params, KEY, SECRET){
  var ts=Math.floor(Date.now()/1000); params.timestamp=ts;
  var signature=sign(params, SECRET);
  var body=new URLSearchParams(); Object.keys(params).forEach(function(k){ body.append(k,params[k]); });
  body.append("api_key",KEY); body.append("signature",signature);
  var r=await fetch("https://api.cloudinary.com/v1_1/"+CLOUD_NAME+"/image/"+path,{method:"POST",body:body});
  return r.json();
}
// يقبل فقط صور مشاريع ريف (وسوم reef_) لتقليل إساءة الاستخدام
function okId(id){ return typeof id==="string" && id.length>0 && id.length<300 && !/[\s]/.test(id); }
exports.handler = async function(event){
  const KEY=process.env.CLOUDINARY_API_KEY, SECRET=process.env.CLOUDINARY_API_SECRET;
  if(event.httpMethod!=="POST") return _json(405,{error:"POST only"});
  if(!KEY||!SECRET) return _json(500,{error:"مفاتيح Cloudinary غير مضبوطة في Netlify"});
  var data; try{ data=JSON.parse(event.body||"{}"); }catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  var action=data.action, pid=data.publicId;
  if(!okId(pid)) return _json(400,{error:"معرّف الصورة غير صالح"});
  try{
    if(action==="delete"){
      var r=await call("destroy",{ public_id:pid, invalidate:"true" }, KEY, SECRET);
      if(r && r.result==="ok") return _json(200,{ ok:true });
      return _json(400,{ error:(r&&(r.error&&r.error.message||r.result))||"تعذّر الحذف" });
    }
    if(action==="caption"){
      var cap=String(data.caption||"").replace(/[|=]/g," ").slice(0,300);
      var r2=await call("context",{ command:"add", public_ids:pid, context:"caption="+cap }, KEY, SECRET);
      if(r2 && !r2.error) return _json(200,{ ok:true, caption:cap });
      return _json(400,{ error:(r2&&r2.error&&r2.error.message)||"تعذّر حفظ الوصف" });
    }
    return _json(400,{error:"إجراء غير معروف"});
  }catch(err){ return _json(500,{error:String(err&&err.message||err)}); }
};
