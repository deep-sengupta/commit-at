const state = { files: [] };
const $ = id => document.getElementById(id);

function localDateTimeParts(minutesAhead=1) {
  const d = new Date(Date.now() + minutesAhead*60000);
  const pad = n => String(n).padStart(2,"0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
function setDefaultDateTime(force=false) {
  if (force || !$("date").value || !$("time").value) {
    const p = localDateTimeParts(1);
    $("date").value = p.date;
    $("time").value = p.time;
  }
  enforceFutureDateTime();
}
function enforceFutureDateTime() {
  const now = new Date();
  const min = new Date(now.getTime() + 60000);
  const pad=n=>String(n).padStart(2,"0");
  const minDate=`${min.getFullYear()}-${pad(min.getMonth()+1)}-${pad(min.getDate())}`;
  const minTime=`${pad(min.getHours())}:${pad(min.getMinutes())}`;
  $("date").min=minDate;
  if ($("date").value < minDate) $("date").value=minDate;
  if ($("date").value === minDate) $("time").min=minTime;
  else $("time").min="00:00";
  const selected = new Date(`${$("date").value}T${$("time").value}:00`);
  if (!isNaN(selected.getTime()) && selected <= now) {
    const p=localDateTimeParts(1);
    $("date").value=p.date; $("time").value=p.time;
  }
}
let statusClearTimer=null;
function setStatus(text,error=false) {
  const el=$("status");
  if(statusClearTimer) clearTimeout(statusClearTimer);
  el.textContent=text;
  el.className=error?"status error":"status";
  if(text) {
    statusClearTimer=setTimeout(()=>{
      el.textContent="";
      el.className="status";
      statusClearTimer=null;
    },5000);
  }
}
function setRepoStatus(text,error=false) {
  $("repoStatus").textContent=text; $("repoStatus").className=error?"status error":"status";
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function formatBytes(n){if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;}

async function getApiToken() {
  const {apiToken=""}=await chrome.storage.local.get("apiToken");
  const token=String(apiToken).trim();
  if(token) return token;
  throw new Error("Enter the server API token and click Save API token.");
}

async function api(path, options={}) {
  const token=await getApiToken();
  if(!token) throw new Error("Server API token is not configured. Paste it into the extension and click Save API token.");
  const res=await fetch(CONFIG.API_BASE_URL+path,{...options,headers:{"Content-Type":"application/json","X-Commit-At-Token":token,...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

async function persistDraft() {
  const draft={
    message:$("message").value, branch:$("branch").value,
    timezone:$("timezone").value, date:$("date").value, time:$("time").value,
    repo:$("repo").value, newRepo:$("newRepo").value,
    files:state.files.map(f=>({path:f.webkitRelativePath||f.name, content:null, size:f.size, type:f.type}))
  };
  await chrome.storage.local.set({draft});
}
async function restoreDraft() {
  const {draft}=await chrome.storage.local.get("draft");
  if(!draft)return;
  $("message").value=draft.message||"Scheduled update";
  $("branch").value=draft.branch||"main";
  $("timezone").value=draft.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  $("date").value=draft.date||"";
  $("time").value=draft.time||"";
  $("newRepo").value=draft.newRepo||"";
}
function readFiles(fileList) {
  const incoming = Array.from(fileList);
  const seen = new Set(state.files.map(f => `${f.webkitRelativePath || f.name}|${f.size}|${f.lastModified}`));
  for (const file of incoming) {
    const key = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
    if (!seen.has(key)) {
      state.files.push(file);
      seen.add(key);
    }
  }
  renderFiles();
  persistDraft();
}

function renderFiles() {
  $("fileList").innerHTML = state.files.length
    ? state.files.map((f,i)=>`<div class="file">
        <span class="file-name">${escapeHtml(f.webkitRelativePath||f.name)}</span>
        <span>${formatBytes(f.size)}</span>
        <button class="remove-file" title="Remove file" aria-label="Remove file" data-index="${i}">×</button>
      </div>`).join("")
    : `<span class="muted">No files selected.</span>`;
  $("fileList").querySelectorAll(".remove-file").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const i = Number(btn.dataset.index);
      state.files.splice(i,1);
      renderFiles();
      await persistDraft();
    };
  });
}
async function loadRepos(selectFullName) {
  const data=await api("/api/github/repos");
  const repoSelect=$("repo");
  const placeholder=`<option value="" selected disabled>Select repository</option>`;
  repoSelect.innerHTML = placeholder + (data.repositories.length
    ? data.repositories.map(r=>`<option value="${escapeHtml(r.full_name)}">${escapeHtml(r.full_name)}${r.private?" 🔒":""}</option>`).join("")
    : `<option value="" disabled>No repositories found</option>`);

  if(selectFullName && [...repoSelect.options].some(o=>o.value===selectFullName)) {
    repoSelect.value=selectFullName;
  } else {
    repoSelect.value="";
  }
  repoSelect.classList.toggle("placeholder", !repoSelect.value);
  await persistDraft();
}
async function loadApiToken() {
  try {
    const token=await getApiToken();
    $("apiToken").value="";
    $("apiToken").placeholder="Saved in this extension";
    $("tokenStatus").textContent="API token saved locally.";
    $("tokenStatus").className="status";
    return token;
  } catch(e) {
    $("apiToken").value="";
    $("apiToken").placeholder="Paste the server API token";
    $("tokenStatus").textContent=e.message;
    $("tokenStatus").className="status error";
    return "";
  }
}

$("saveToken").onclick=async()=>{
  const token=$("apiToken").value.trim();
  if(!token) {
    $("tokenStatus").textContent="Paste the server API token first.";
    $("tokenStatus").className="status error";
    return;
  }
  await chrome.storage.local.set({apiToken:token});
  $("apiToken").value="";
  $("apiToken").placeholder="Saved in this extension";
  $("tokenStatus").textContent="API token saved locally.";
  $("tokenStatus").className="status";
  await connect();
};

async function connect() {
  try {
    const data=await api("/api/github/me");
    $("connection").textContent=`✓ ${data.login}`;
    $("connection").style.background="#bde8c7";
    $("connection").style.color="#111111";
    $("connection").style.borderColor="#8fc59c";
    $("authCard").classList.add("hidden"); $("app").classList.remove("hidden");
    await loadRepos();
    setRepoStatus("GitHub connection is working.");
  } catch(e) {
    $("connection").textContent="Not connected";
    setRepoStatus(e.message,true);
  }
}
$("connectBtn").onclick=connect;
$("confirmNo").onclick=closeDeleteModal;
$("confirmYes").onclick=async()=>{
  if(!pendingDeleteId) return;
  const id=pendingDeleteId;
  closeDeleteModal();
  await deleteScheduledJob(id);
};
$("confirmModal").addEventListener("click",e=>{
  if(e.target.id==="confirmModal") closeDeleteModal();
});

$("createRepo").onclick=async()=>{
  const name=$("newRepo").value.trim();
  if(!/^[A-Za-z0-9._-]+$/.test(name)) return setRepoStatus("Enter a valid repository name.",true);
  try {
    setRepoStatus("Creating repository…");
    const data=await api("/api/github/repos",{method:"POST",body:JSON.stringify({name})});
    $("newRepo").value="";
    await loadRepos(data.repository.full_name);
    setRepoStatus(`Created ${data.repository.full_name}.`);
  } catch(e){setRepoStatus(e.message,true);}
};

$("drop").onclick=()=>$("files").click();
$("files").onchange=e=>{ readFiles(e.target.files); e.target.value=""; };
$("drop").ondragover=e=>e.preventDefault();
$("drop").ondrop=e=>{e.preventDefault();readFiles(e.dataTransfer.files);};

["message","branch","date","time"].forEach(id=>{
  $(id).addEventListener("input",persistDraft);
  $(id).addEventListener("change",persistDraft);
});

$("newRepo").addEventListener("input",async()=>{
  if($("newRepo").value.trim()) {
    $("repo").value="";
  }
  await persistDraft();
});
$("repo").addEventListener("change",async()=>{
  if($("repo").value) {
    $("newRepo").value="";
  }
  $("repo").classList.toggle("placeholder", !$("repo").value);
  await persistDraft();
});


async function resetAfterSchedule(){
  state.files=[];
  $("files").value="";
  $("repo").value="";
  $("repo").classList.add("placeholder");
  $("newRepo").value="";
  $("message").value="Scheduled update";
  $("branch").value="main";
  $("timezone").value=Intl.DateTimeFormat().resolvedOptions().timeZone;
  $("repoStatus").textContent="";
  $("repoStatus").className="status";
  setDefaultDateTime(true);
  renderFiles();
  await persistDraft();
}


$("schedule").onclick=async()=>{
  let repo=$("repo").value;
  let owner,repoName;
  const newRepoName=$("newRepo").value.trim();
  if(repo) {
    [owner,repoName]=repo.split("/");
  } else if(newRepoName) {
    if(!/^[A-Za-z0-9._-]+$/.test(newRepoName)) {
      return setStatus("Enter a valid repository name.",true);
    }
  } else {
    return setStatus("Select a repository or enter a new repo name.",true);
  }
  if(!state.files.length)return setStatus("Add at least one file.",true);
  enforceFutureDateTime();
  const target=new Date(`${$("date").value}T${$("time").value}:00`);
  if(isNaN(target.getTime())||target.getTime()<=Date.now())return setStatus("Choose a future time. The current time and past times are not allowed.",true);
  try{
    if(!repo && newRepoName) {
      setStatus("Creating repository…");
      const created=await api("/api/github/repos",{method:"POST",body:JSON.stringify({name:newRepoName})});
      repo=created.repository.full_name;
      [owner,repoName]=repo.split("/");
      $("newRepo").value="";
      await loadRepos(repo);
      setRepoStatus(`Created ${repo}.`);
    }
    setStatus("Reading files…");
    const files=[];
    for(const file of state.files) files.push({path:file.webkitRelativePath||file.name,content:await file.text()});
    let branch=$("branch").value.trim()||"main";
    if(branch!=="main"){
      await api(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches`,{
        method:"POST",body:JSON.stringify({branch})
      });
    }
    const result=await api("/api/jobs",{method:"POST",body:JSON.stringify({
      owner,repo:repoName,branch,
      message:$("message").value.trim()||"Scheduled update",
      timezone:$("timezone").value,scheduledAt:target.toISOString(),files
    })});
    await saveHistory(result.job);
    await renderHistory();
    await resetAfterSchedule();
    setStatus(`✓ Scheduled for ${new Date(result.job.scheduledAt).toLocaleString()}`);
  }catch(e){setStatus(e.message,true)}
};
async function saveHistory(item){
  const {history=[]}=await chrome.storage.local.get("history");
  await chrome.storage.local.set({history:[item,...history.filter(x=>x.id!==item.id)].slice(0,30)});
}
async function loadJobs(){
  try{ const data=await api("/api/jobs"); await chrome.storage.local.set({history:data.jobs}); }catch(e){}
}
let pendingDeleteId=null;
function hideDeleteModal(){
  const modal=$("confirmModal");
  if(modal) modal.classList.add("hidden");
}
hideDeleteModal();
function openDeleteModal(id){
  pendingDeleteId=id;
  $("confirmModal").classList.remove("hidden");
}
function closeDeleteModal(){
  pendingDeleteId=null;
  hideDeleteModal();
}
async function deleteScheduledJob(id){
  try{
    await api(`/api/jobs/${encodeURIComponent(id)}`,{method:"DELETE"});
    const {history=[]}=await chrome.storage.local.get("history");
    await chrome.storage.local.set({history:history.filter(x=>x.id!==id)});
    await renderHistory();
  }catch(e){setStatus(e.message,true);}
}
function closeHistoryDetail(){
  $("historyDetailModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function openHistoryDetail(job){
  const modal=$("historyDetailModal");
  const content=$("historyDetailContent");
  if(!modal||!content)return;
  const scheduled=new Date(job.scheduledAt);
  const files=Array.isArray(job.files)?job.files:[];
  const fileMarkup=files.length
    ? `<ul class="history-detail-files">${files.map(f=>`<li>${escapeHtml(f.path||f.name||"File")}</li>`).join("")}</ul>`
    : `<span class="muted">No files recorded.</span>`;
  $("historyDetailTitle").textContent="Commit details";
  content.innerHTML=`
    <div class="history-detail-row"><strong>Date</strong><span>${escapeHtml(scheduled.toLocaleDateString())}</span></div>
    <div class="history-detail-row"><strong>Time</strong><span>${escapeHtml(scheduled.toLocaleTimeString())}</span></div>
    <div class="history-detail-row"><strong>Status</strong><span>${escapeHtml(job.status||"scheduled")}</span></div>
    <div class="history-detail-row"><strong>Branch</strong><span>${escapeHtml(job.branch||"main")}</span></div>
    <div class="history-detail-row"><strong>Repository</strong><span>${escapeHtml(`${job.owner||""}/${job.repo||""}`.replace(/^\//,""))}</span></div>
    <div class="history-detail-row"><strong>Commit message</strong><span>${escapeHtml(job.message||"Commit")}</span></div>
    <div class="history-detail-row history-detail-row-files"><strong>Files</strong><span>${fileMarkup}</span></div>`;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

async function renderHistory(){
  const {history=[]}=await chrome.storage.local.get("history");
  const ordered=[...history].sort((a,b)=>{
    const activeA=(a.status==="scheduled"||a.status==="running")?0:1;
    const activeB=(b.status==="scheduled"||b.status==="running")?0:1;
    if(activeA!==activeB) return activeA-activeB;
    const aTime=Date.parse(a.createdAt||a.completedAt||a.scheduledAt||0)||0;
    const bTime=Date.parse(b.createdAt||b.completedAt||b.scheduledAt||0)||0;
    return bTime-aTime;
  });
  $("history").innerHTML=ordered.length?ordered.map(x=>`
    <div class="history-item history-expandable" data-expand-job="${escapeHtml(x.id)}">
      <div class="row">
        <div><strong>${escapeHtml(x.message||"Commit")}</strong></div>
        ${x.status==="scheduled"?`<button class="scheduled-delete" data-job="${escapeHtml(x.id)}" aria-label="Delete scheduled commit" title="Delete scheduled commit">
          <svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <g class="trash-lid"><path d="M8 5V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"/><path d="M5 6h14"/></g>
            <path class="trash-body" d="M7 7.5h10l-.7 12a1.5 1.5 0 0 1-1.5 1.4H9.2a1.5 1.5 0 0 1-1.5-1.4z"/>
            <path class="trash-line" d="M10 11v6M14 11v6"/>
          </svg>
        </button>`:""}
      </div>
      <span class="muted">${escapeHtml(x.owner||"")} / ${escapeHtml(x.repo||"")} · ${escapeHtml(x.status||"scheduled")} · ${escapeHtml(new Date(x.scheduledAt).toLocaleString())}</span>
    </div>`).join(""):`<span class="muted">No commits yet.</span>`;
  $("history").querySelectorAll("[data-job]").forEach(btn=>btn.onclick=e=>{e.stopPropagation();openDeleteModal(btn.dataset.job);});
  $("history").querySelectorAll("[data-expand-job]").forEach(item=>item.onclick=()=>{
    const job=ordered.find(x=>x.id===item.dataset.expandJob);
    if(job)openHistoryDetail(job);
  });
}

async function updateClearButtonState(jobsOverride=null){
  const button=$("clearHistory");
  if(!button) return;
  try{
    const jobs=jobsOverride||((await api("/api/jobs")).jobs||[]);
    const hasTerminal=jobs.some(job=>job.status==="completed"||job.status==="failed");
    const hasInProgress=jobs.some(job=>job.status==="scheduled"||job.status==="running");
    button.disabled=!hasTerminal;
    if(hasTerminal){
      button.title=hasInProgress
        ? "Clear completed commits; active scheduled commits will remain."
        : "Clear completed commit history";
    }else{
      button.title="Nothing to clear";
    }
  }catch(e){
    button.disabled=true;
    button.title="History is unavailable";
  }
}

$("historyDetailClose").onclick=closeHistoryDetail;
$("historyDetailModal").addEventListener("click",e=>{
  if(e.target===$("historyDetailModal"))closeHistoryDetail();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")closeHistoryDetail();
});

document.addEventListener("wheel",e=>{
  const modal=$("historyDetailModal");
  if(modal?.classList.contains("hidden"))return;
  if(!e.target.closest(".history-detail-files"))e.preventDefault();
},{passive:false});

document.addEventListener("touchmove",e=>{
  const modal=$("historyDetailModal");
  if(modal?.classList.contains("hidden"))return;
  if(!e.target.closest(".history-detail-files"))e.preventDefault();
},{passive:false});

$("clearHistory").onclick=async()=>{
  try{
    const data=await api("/api/jobs");
    const jobs=data.jobs||[];
    const hasTerminal=jobs.some(job=>job.status==="completed"||job.status==="failed");
    if(!hasTerminal){
      await updateClearButtonState(jobs);
      setStatus("No completed commits to clear.");
      return;
    }
    const result=await api("/api/jobs?mode=history",{method:"DELETE"});
    await chrome.storage.local.set({history:result.jobs||[]});
    await renderHistory();
    await updateClearButtonState(result.jobs||[]);
    setStatus("✓ Completed clear history.");
  }catch(e){
    setStatus(e.message,true);
  }
};

(async()=>{
  $("timezone").value=Intl.DateTimeFormat().resolvedOptions().timeZone;
  await restoreDraft();
  await loadApiToken();
  renderFiles();
  setDefaultDateTime(false);
  await loadJobs();
  await renderHistory();
  await updateClearButtonState();
  await connect();
  enforceFutureDateTime();
  setInterval(enforceFutureDateTime,1000);
  setInterval(persistDraft,2000);
  setInterval(async()=>{
    try{
      const data=await api("/api/jobs");
      await chrome.storage.local.set({history:data.jobs||[]});
      await renderHistory();
      await updateClearButtonState(data.jobs||[]);
    }catch(e){}
  },5000);
})();