export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.FRONTEND_URL || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS"
    };
    if (request.method === "OPTIONS") return new Response(null,{headers:cors});
    try {
      if (url.pathname === "/auth/login") return login(request,env);
      if (url.pathname === "/auth/callback") return callback(request,env);
      if (url.pathname === "/auth/logout") return logout(env,cors);
      if (url.pathname === "/api/session") return session(request,env,cors);
      if (url.pathname === "/api/data") return data(request,env,cors);
      return new Response("Not found",{status:404,headers:cors});
    } catch (e) {
      return new Response(JSON.stringify({message:e.message}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
    }
  }
};

const gh=(path,token,init={})=>fetch("https://api.github.com"+path,{
  ...init,
  headers:{"Accept":"application/vnd.github+json","Authorization:"+"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28",...(init.headers||{})}
});

async function login(request,env){
  const state=crypto.randomUUID();
  const redirect=env.CALLBACK_URL;
  const u=new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id",env.GITHUB_CLIENT_ID);
  u.searchParams.set("redirect_uri",redirect);
  u.searchParams.set("scope","repo user");
  u.searchParams.set("state",state);
  return new Response(null,{status:302,headers:{
    Location:u.toString(),
    "Set-Cookie":cookie("oauth_state",state,300)
  }});
}

async function callback(request,env){
  const u=new URL(request.url), code=u.searchParams.get("code"), state=u.searchParams.get("state");
  const cookies=parseCookies(request.headers.get("Cookie")||"");
  if(!code||!state||state!==cookies.oauth_state)return new Response("OAuth state invalid",{status:400});
  const body=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:env.CALLBACK_URL});
  const r=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json"},body});
  const j=await r.json();
  if(!r.ok||!j.access_token)throw new Error(j.error_description||"GitHub OAuth failed");
  const encrypted=await seal(j.access_token,env.SESSION_SECRET);
  return new Response(null,{status:302,headers:{
    Location:env.FRONTEND_URL,
    "Set-Cookie":cookie("gh_session",encrypted,60*60*8)+"; "+cookie("oauth_state","",0)
  }});
}

async function session(request,env,cors){
  const token=await getToken(request,env);
  if(!token)return json({authenticated:false},200,cors);
  const r=await gh("/user",token);
  if(!r.ok)return json({authenticated:false},200,cors);
  const j=await r.json();
  return json({authenticated:true,login:j.login},200,cors);
}

async function data(request,env,cors){
  const token=await getToken(request,env);
  if(!token)return json({message:"Not authenticated"},401,cors);
  const path="/repos/"+env.GITHUB_OWNER+"/"+env.GITHUB_REPO+"/contents/"+env.DATA_PATH;
  if(request.method==="GET"){
    const r=await gh(path,token); const j=await r.json();
    if(!r.ok)return json({message:j.message||"GitHub read failed"},r.status,cors);
    const bytes=Uint8Array.from(atob(j.content.replace(/\n/g,"")),c=>c.charCodeAt(0));
    return new Response(new TextDecoder().decode(bytes),{headers:{...cors,"Content-Type":"application/json"}});
  }
  if(request.method==="PUT"){
    const payload=await request.json();
    const current=await gh(path,token); const cj=await current.json();
    if(!current.ok)return json({message:cj.message||"GitHub read failed"},current.status,cors);
    const raw=JSON.stringify(payload,null,2), bytes=new TextEncoder().encode(raw);
    let bin=""; for(const b of bytes)bin+=String.fromCharCode(b);
    const r=await gh(path,token,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      message:"Update finance data",content:btoa(bin),sha:cj.sha,branch:"main"
    })});
    const j=await r.json();
    if(!r.ok)return json({message:j.message||"GitHub write failed"},r.status,cors);
    return json({ok:true,sha:j.content?.sha||null},200,cors);
  }
  return json({message:"Method not allowed"},405,cors);
}

async function getToken(request,env){
  const c=parseCookies(request.headers.get("Cookie")||"");
  return c.gh_session?open(c.gh_session,env.SESSION_SECRET):null;
}
function parseCookies(s){return Object.fromEntries(s.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function cookie(name,value,maxAge){return name+"="+encodeURIComponent(value)+"; Path=/; Max-Age="+maxAge+"; HttpOnly; Secure; SameSite=None"}
function json(v,status,headers){return new Response(JSON.stringify(v),{status,headers:{...headers,"Content-Type":"application/json"}})}
async function key(secret){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));return crypto.subtle.importKey("raw",d,{name:"AES-GCM"},false,["encrypt","decrypt"])}
async function seal(text,secret){const k=await key(secret),iv=crypto.getRandomValues(new Uint8Array(12));const c=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode(text));const out=new Uint8Array(iv.length+c.byteLength);out.set(iv);out.set(new Uint8Array(c),iv.length);return btoa(String.fromCharCode(...out))}
async function open(text,secret){try{const b=Uint8Array.from(atob(text),c=>c.charCodeAt(0)),iv=b.slice(0,12),data=b.slice(12),k=await key(secret),p=await crypto.subtle.decrypt({name:"AES-GCM",iv},k,data);return new TextDecoder().decode(p)}catch{return null}}
async function logout(env,cors){return new Response(null,{status:204,headers:{...cors,"Set-Cookie":cookie("gh_session","",0)}})}
