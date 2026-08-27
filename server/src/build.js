import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const envPath=path.join(__dirname,"../.env");

function ask(question){
  return new Promise(resolve=>{
    const rl=readline.createInterface({input:process.stdin,output:process.stdout});
    rl._writeToOutput=()=>process.stdout.write("*");
    rl.question(question,value=>{rl.close();process.stdout.write("\n");resolve(value.trim())});
  });
}

const githubToken=await ask("GITHUB_DEV_TOKEN: ");
if(!githubToken){
  console.error("GITHUB_DEV_TOKEN is required.");
  process.exitCode=1;
} else {
  const apiToken=crypto.randomBytes(32).toString("hex");
  const env=`GITHUB_DEV_TOKEN=${githubToken.replace(/[\r\n]/g,"")}\nCOMMIT_AT_API_TOKEN=${apiToken}\n`;
  fs.writeFileSync(envPath,env,{mode:0o600});
  console.log("server/.env created successfully.");
  console.log(`COMMIT_AT_API_TOKEN=${apiToken}`);
  console.log("Paste this token into the commit-at extension.");
  console.log("Starting server...");
  await import("./index.js");
}
