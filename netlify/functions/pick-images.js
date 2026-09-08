// netlify/functions/pick-images.js
// تحديد صور التقارير: يضيف/يزيل وسم "pick" للصور عبر Cloudinary Admin API
// المفاتيح: CLOUDINARY_API_KEY , CLOUDINARY_API_SECRET (سرّية على الخادم)
const crypto = require("crypto");
const CLOUD_NAME = "exm0p8kg";
const PICK_TAG = "reef_pick";
function _json(code,obj){ return { statusCode:code, headers:{"content-type":"application/json"}, body:JSON.stringify(obj) }; }
function sign(params, secret){
  var keys=Object.keys(params).filter(function(k){return params[k]!=null && params[k]!=="";}).sort();
  var str=keys.map(function(k){return k+"="+params[k];}).join("&");
  return crypto.createHash("sha1").update(str+secret).digest("hex");
}
async function tagCall(action, publicIds, tag, KEY, SECRET){
  // action: "add" or "remove"
  var ts=Math.floor(Date.now()/1000);
  var params={ public_ids:publicIds.join(","), tag:tag, timestamp:ts, command:action };
  var signature=sign({command:action, public_ids:publicIds.join(","), tag:tag, timestamp:ts}, SECRET);
  var body=new URLSearchParams(); body.append("public_ids",publicIds.join(",")); body.append("tag",tag); body.append("command",action); body.append("timestamp",ts); body.append("api_key",KEY); body.append("signature",signature);
  var r=await fetch("https://api.cloudinary.com/v1_1/"+CLOUD_NAME+"/image/tags",{method:"POST",body:body});
  return r.json();
}
exports.handler = async function(event){
  const KEY=process.env.CLOUDINARY_API_KEY, SECRET=process.env.CLOUDINARY_API_SECRET;
  if(event.httpMethod!=="POST") return _json(405,{error:"POST only"});
  if(!KEY||!SECRET) return _json(500,{error:"مفاتيح Cloudinary غير مضبوطة في Netlify"});
  var data; try{ data=JSON.parse(event.body||"{}"); }catch(e){ return _json(400,{error:"طلب غير صالح"}); }
  var projTag=data.projTag; // وسم المشروع reef_xxx
  var picked=Array.isArray(data.picked)?data.picked:[];      // public_ids المختارة
  var all=Array.isArray(data.all)?data.all:[];                // كل public_ids للمشروع
  if(!projTag) return _json(400,{error:"وسم المشروع مفقود"});
  var pickTag=projTag+"_pick";
  try{
    // أزل وسم الاختيار عن الكل أولًا (تنظيف)، ثم أضفه للمختارة
    if(all.length){ await tagCall("remove", all, pickTag, KEY, SECRET); }
    if(picked.length){ await tagCall("add", picked, pickTag, KEY, SECRET); }
    return _json(200,{ ok:true, picked:picked.length });
  }catch(err){ return _json(500,{error:String(err&&err.message||err)}); }
};
