const fs = require('fs');
const path = require('path');

const ISSUE_ID_PATTERN = /^BUG-\d{14}-[A-Z0-9._-]+$/;
const STATUS_FLAGS = {
  '--mark-under-investigation':{status:'under_investigation'},
  '--mark-analysis-complete':{status:'analysis_complete'},
  '--mark-fixed':{status:'fixed'}
};

function usage(){
  console.error('Usage: node scripts/fetch-tester-bundle.js BUG-YYYYMMDDHHMMSS-TICKER [--mark-under-investigation|--mark-analysis-complete|--mark-fixed --fixed-in-build vX.Y.Z] [--override] [--reason "text"]');
  process.exit(1);
}

function normalizeBaseUrl(value){
  return String(value || '').trim().replace(/\/+$/g, '');
}

function adminBundleUrl(){
  const direct = normalizeBaseUrl(process.env.TESTER_BUNDLE_ADMIN_URL || '');
  if(direct) return direct;
  const site = normalizeBaseUrl(process.env.NETLIFY_SITE_URL || '');
  return site ? `${site}/.netlify/functions/tester-bundle-admin` : '';
}

function statusEndpointUrl(){
  const direct = normalizeBaseUrl(process.env.TESTER_BUNDLE_STATUS_URL || '');
  if(direct) return direct;
  const site = normalizeBaseUrl(process.env.NETLIFY_SITE_URL || '');
  return site ? `${site}/.netlify/functions/tester-bundle-status` : '';
}

function parseArgs(argv){
  const issueId = String(argv[2] || '').trim().toUpperCase();
  if(!ISSUE_ID_PATTERN.test(issueId)) usage();

  const args = argv.slice(3);
  let mark = null;
  let fixedInBuild = '';
  let override = false;
  let reason = '';
  for(let index = 0; index < args.length; index += 1){
    const token = String(args[index] || '').trim();
    if(STATUS_FLAGS[token]){
      if(mark) throw new Error('Specify only one mark flag per invocation.');
      mark = STATUS_FLAGS[token];
      continue;
    }
    if(token === '--override'){
      override = true;
      continue;
    }
    if(token === '--reason'){
      reason = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if(token === '--fixed-in-build'){
      fixedInBuild = String(args[index + 1] || '').trim();
      index += 1;
      continue;
    }
    usage();
  }
  if(mark && mark.status === 'fixed' && !fixedInBuild){
    throw new Error('Missing --fixed-in-build for --mark-fixed.');
  }
  return {
    issueId,
    markStatus:mark ? mark.status : '',
    fixedInBuild,
    override,
    reason
  };
}

async function fetchJson(url, options){
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if(!response.ok){
    throw new Error(String(body && body.error || `Request failed with status ${response.status}.`));
  }
  return body;
}

async function updateStatus({issueId, status, fixedInBuild, override, reason, token}){
  const url = statusEndpointUrl();
  if(!url) throw new Error('Missing TESTER_BUNDLE_STATUS_URL or NETLIFY_SITE_URL.');
  await fetchJson(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Admin-Token':token
    },
    body:JSON.stringify({
      issueId,
      status,
      ...(fixedInBuild ? {fixedInBuild} : {}),
      ...(override ? {override:true} : {}),
      ...(reason ? {note:reason} : {})
    })
  });
}

async function downloadBundle({issueId, token}){
  const url = adminBundleUrl();
  if(!url) throw new Error('Missing TESTER_BUNDLE_ADMIN_URL or NETLIFY_SITE_URL.');
  return await fetchJson(`${url}?issueId=${encodeURIComponent(issueId)}`, {
    method:'GET',
    headers:{
      'X-Admin-Token':token
    }
  });
}

async function main(){
  const { issueId, markStatus, fixedInBuild, override, reason } = parseArgs(process.argv);
  const token = String(process.env.TESTER_REPORT_ADMIN_TOKEN || '').trim();
  if(!token) throw new Error('Missing TESTER_REPORT_ADMIN_TOKEN.');

  if(markStatus){
    await updateStatus({issueId, status:markStatus, fixedInBuild, override, reason, token});
  }

  const body = await downloadBundle({issueId, token});
  const outputDir = path.join(process.cwd(), 'debug-bundles');
  fs.mkdirSync(outputDir, {recursive:true});
  const outputPath = path.join(outputDir, `${issueId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(outputPath);
}

main().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
