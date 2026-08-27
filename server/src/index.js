import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const app=express();
const API_TOKEN=String(process.env.COMMIT_AT_API_TOKEN||"").trim();
if(!API_TOKEN) {
  throw new Error("COMMIT_AT_API_TOKEN is required. Set it in server/.env before starting the server.");
}
app.get("/api/health",(_,res)=>res.json({ok:true}));
app.use((req,res,next)=>{
  const provided=String(req.get("X-Commit-At-Token")||"");
  const expected=Buffer.from(API_TOKEN,"utf8");
  const actual=Buffer.from(provided,"utf8");
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected)) {
    return res.status(401).json({error:"Unauthorized."});
  }
  next();
});
app.use(express.json({limit:"25mb"}));
const PORT=process.env.PORT||8787;
const HOST="127.0.0.1";
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const DATA_DIR=path.join(__dirname,"../data");
const JOBS_FILE=path.join(DATA_DIR,"jobs.json");
fs.mkdirSync(DATA_DIR,{recursive:true});

function loadJobs(){
  try{
    const raw=fs.readFileSync(JOBS_FILE,"utf8");
    const items=JSON.parse(raw);
    if(Array.isArray(items)) return new Map(items.map(job=>[job.id,job]));
  }catch(e){
    if(e.code!=="ENOENT") console.error("Failed to load persisted jobs:",e.message);
  }
  return new Map();
}
function persistJobs(){
  const tmp=`${JOBS_FILE}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify([...jobs.values()],null,2));
  fs.renameSync(tmp,JOBS_FILE);
}
const jobs=loadJobs();

function token(){return process.env.GITHUB_DEV_TOKEN||""}
function ghHeaders(t){return {"Accept":"application/vnd.github+json","Authorization":`Bearer ${t}`,"X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json"}}
async function github(path, options={}){
  const t=token();
  if(!t) throw new Error("GitHub token is not configured. Put GITHUB_DEV_TOKEN in server/.env and restart the server.");
  const r=await fetch("https://api.github.com"+path,{...options,headers:{...ghHeaders(t),...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    let msg=data.message||`GitHub API ${r.status}`;
    if(r.status===401) msg="GitHub token is invalid or expired.";
    if(r.status===403) msg="GitHub denied this action. Check the token's repository/account permissions. For a fine-grained PAT, enable Contents: Read and write for the target repository. Creating a new repository may require broader account authorization.";
    if(r.status===404) msg="Repository not found or this token cannot access it.";
    throw new Error(msg);
  }
  return data;
}

app.get("/api/github/me",async(_,res)=>{try{const u=await github("/user");res.json({login:u.login,id:u.id,html_url:u.html_url});}catch(e){res.status(401).json({error:e.message})}});
app.get("/api/github/repos",async(_,res)=>{
  try{
    const data=await github("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");
    res.json({repositories:data.map(r=>({id:r.id,full_name:r.full_name,private:r.private,default_branch:r.default_branch}))});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/github/repos",async(req,res)=>{
  try{
    const name=String(req.body.name||"").trim();
    if(!name) return res.status(400).json({error:"Repository name is required."});
    const data=await github("/user/repos",{method:"POST",body:JSON.stringify({name,description:"Created by commit-at",private:false,auto_init:true})});
    res.json({repository:{full_name:data.full_name,html_url:data.html_url,default_branch:data.default_branch}});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/github/repos/:owner/:repo/branches",async(req,res)=>{
  try{
    const {owner,repo}=req.params, branch=String(req.body.branch||"").trim();
    if(!branch || branch==="main") return res.json({branch,created:false});
    try{
      await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);
      return res.json({branch,created:false});
    }catch(e){
      if(!String(e.message).toLowerCase().includes("not found")) throw e;
    }
    const mainRef=await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/main`);
    const created=await github(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,{
      method:"POST",body:JSON.stringify({ref:`refs/heads/${branch}`,sha:mainRef.object.sha})
    });
    res.json({branch,created:true,ref:created.ref});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/jobs",(req,res)=>{
  const {owner,repo,branch,message,scheduledAt,timezone,files}=req.body;
  if(!owner||!repo||!branch||!message||!scheduledAt||!Array.isArray(files)||!files.length)return res.status(400).json({error:"Missing required job fields."});
  if(Date.parse(scheduledAt)<=Date.now())return res.status(400).json({error:"Scheduled time must be in the future."});
  const job={id:crypto.randomUUID(),owner,repo,branch,message,scheduledAt,timezone,files,status:"scheduled",createdAt:new Date().toISOString()};
  jobs.set(job.id,job);persistJobs();res.json({job});
});
app.get("/api/jobs",(_,res)=>res.json({jobs:[...jobs.values()]}));
app.delete("/api/jobs",(req,res)=>{
  const removed=[];
  for(const [id,job] of jobs.entries()) {
    if(job.status==="completed"||job.status==="failed") {
      jobs.delete(id);
      removed.push(job);
    }
  }
  persistJobs();
  res.json({ok:true,removed, jobs:[...jobs.values()]});
});
app.delete("/api/jobs/:id",(req,res)=>{
  const job=jobs.get(req.params.id);
  if(!job) return res.status(404).json({error:"Scheduled commit not found."});
  if(job.status!=="scheduled") return res.status(400).json({error:"Only scheduled commits can be deleted."});
  jobs.delete(req.params.id); persistJobs(); res.json({ok:true});
});


async function executeCommit(job){
  const full=`${job.owner}/${job.repo}`;
  const ref=await github(`/repos/${full}/git/ref/heads/${encodeURIComponent(job.branch)}`);
  const parentSha=ref.object.sha;
  const parentCommit=await github(`/repos/${full}/git/commits/${parentSha}`);
  const tree=[];
  for(const file of job.files){
    if(typeof file.path!=="string"||!file.path||file.path.includes("\\")||file.path.startsWith("/")||file.path.split("/").some(part=>!part||part==="."||part==="..")) throw new Error("Invalid file path.");
    const blob=await github(`/repos/${full}/git/blobs`,{method:"POST",body:JSON.stringify({content:Buffer.from(file.content,"utf8").toString("base64"),encoding:"base64"})});
    tree.push({path:file.path,mode:"100644",type:"blob",sha:blob.sha});
  }
  const newTree=await github(`/repos/${full}/git/trees`,{method:"POST",body:JSON.stringify({base_tree:parentCommit.tree.sha,tree})});
  const commit=await github(`/repos/${full}/git/commits`,{method:"POST",body:JSON.stringify({message:job.message,tree:newTree.sha,parents:[parentSha]})});
  await github(`/repos/${full}/git/refs/heads/${encodeURIComponent(job.branch)}`,{method:"PATCH",body:JSON.stringify({sha:commit.sha,force:false})});
  return {sha:commit.sha,url:`https://github.com/${full}/commit/${commit.sha}`};
}
async function runDueJobs(){
  for(const job of jobs.values()){
    if(job.status!=="scheduled"||Date.parse(job.scheduledAt)>Date.now())continue;
    try{
      job.status="running";persistJobs();job.result=await executeCommit(job);job.status="completed";job.completedAt=new Date().toISOString();persistJobs();
      console.log("✓ Completed",job.id,job.result.url);
    }catch(e){job.status="failed";job.error=e.message;persistJobs();console.error("✗ Failed",job.id,e.message)}
  }
}
setInterval(runDueJobs,5000);
app.listen(PORT,HOST,()=>console.log(`commit-at API running at http://${HOST}:${PORT}`));