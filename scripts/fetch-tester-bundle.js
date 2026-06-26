const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ISSUE_ID_PATTERN = /^BUG-\d{14}-[A-Z0-9._-]+$/;
const STATUS_FLAGS = {
  '--mark-under-investigation':{status:'under_investigation'},
  '--mark-analysis-complete':{status:'analysis_complete'},
  '--mark-fixed':{status:'fixed'}
};
const STATUS_ORDER = ['submitted', 'under_investigation', 'analysis_complete', 'fixed'];

function usage(){
  console.error('Usage: node scripts/fetch-tester-bundle.js BUG-YYYYMMDDHHMMSS-TICKER [--mark-under-investigation|--mark-analysis-complete|--mark-fixed --fixed-in-build vX.Y.Z|--auto-progress] [--override] [--reason "text"]');
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
  let autoProgress = false;
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
    if(token === '--auto-progress'){
      autoProgress = true;
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
  if(mark && autoProgress){
    throw new Error('Use either an explicit mark flag or --auto-progress, not both.');
  }
  return {
    issueId,
    markStatus:mark ? mark.status : '',
    fixedInBuild,
    override,
    reason,
    autoProgress
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

function workflowRank(status){
  const normalized = String(status || '').trim().toLowerCase();
  return STATUS_ORDER.indexOf(normalized);
}

function currentWorkflowStatus(bundle){
  return String(bundle && bundle.workflow && bundle.workflow.status || 'submitted').trim().toLowerCase() || 'submitted';
}

function isIgnorableGitStatusLine(line){
  const trimmed = String(line || '').trim();
  if(!trimmed) return true;
  return /(^|\s)debug-bundles([\\/]|$)/.test(trimmed);
}

function hasCleanWorkingTreeForAutoFix(){
  try{
    const output = execFileSync('git', ['status', '--short'], {encoding:'utf8'});
    const relevantLines = String(output || '')
      .split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(line => line.trim())
      .filter(line => !isIgnorableGitStatusLine(line));
    return relevantLines.length === 0;
  }catch(error){
    return false;
  }
}

function determineAutoProgressAction(bundle, options = {}){
  const status = currentWorkflowStatus(bundle);
  const gitClean = options.gitClean === true
    ? true
    : (options.gitClean === false ? false : hasCleanWorkingTreeForAutoFix());
  if(status === 'submitted'){
    return {
      status:'under_investigation',
      note:options.reason || 'Auto-progressed when bundle was fetched for investigation.'
    };
  }
  if(status === 'under_investigation'){
    if(!String(options.reason || '').trim()){
      return null;
    }
    return {
      status:'analysis_complete',
      note:String(options.reason || '').trim()
    };
  }
  if(status === 'analysis_complete'){
    if(!String(options.reason || '').trim()) return null;
    if(!String(options.fixedInBuild || '').trim()) return null;
    if(!gitClean) return null;
    return {
      status:'fixed',
      fixedInBuild:String(options.fixedInBuild || '').trim(),
      note:String(options.reason || '').trim()
    };
  }
  return null;
}

async function main(){
  const { issueId, markStatus, fixedInBuild, override, reason, autoProgress } = parseArgs(process.argv);
  const token = String(process.env.TESTER_REPORT_ADMIN_TOKEN || '').trim();
  if(!token) throw new Error('Missing TESTER_REPORT_ADMIN_TOKEN.');

  let body;
  if(markStatus){
    await updateStatus({issueId, status:markStatus, fixedInBuild, override, reason, token});
    body = await downloadBundle({issueId, token});
  }else{
    body = await downloadBundle({issueId, token});
    if(autoProgress){
      const autoAction = determineAutoProgressAction(body, {fixedInBuild, reason});
      if(autoAction){
        await updateStatus({
          issueId,
          status:autoAction.status,
          fixedInBuild:autoAction.fixedInBuild || '',
          override,
          reason:autoAction.note || '',
          token
        });
        body = await downloadBundle({issueId, token});
      }
    }
  }
  const outputDir = path.join(process.cwd(), 'debug-bundles');
  fs.mkdirSync(outputDir, {recursive:true});
  const outputPath = path.join(outputDir, `${issueId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(outputPath);
}

if(require.main === module){
  main().catch(error => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  STATUS_ORDER,
  parseArgs,
  workflowRank,
  currentWorkflowStatus,
  isIgnorableGitStatusLine,
  hasCleanWorkingTreeForAutoFix,
  determineAutoProgressAction
};
