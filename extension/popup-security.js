const commitAtFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
  if(String(input)===CONFIG.API_BASE_URL+"/api/config"){
    const token=document.getElementById("apiToken").value.trim();
    return new Response(JSON.stringify({apiToken:token}),{status:token?200:401,headers:{"Content-Type":"application/json"}});
  }
  return commitAtFetch(input,options);
};
File.prototype.text=async function(){
  const bytes=new Uint8Array(await this.arrayBuffer());
  let binary="";
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
};
document.getElementById("saveToken").addEventListener("click",async()=>{
  const token=document.getElementById("apiToken").value.trim();
  if(!token){
    document.getElementById("tokenStatus").textContent="Enter the server API token.";
    document.getElementById("tokenStatus").className="status error";
    return;
  }
  await chrome.storage.local.set({apiToken:token});
  document.getElementById("apiToken").value="";
  document.getElementById("apiToken").placeholder="Configured automatically";
  document.getElementById("tokenStatus").textContent="API token saved.";
  document.getElementById("tokenStatus").className="status";
});
