const {spawnSync} = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function usage(){
  console.log('Usage:');
  console.log('  node scripts/audit-live-candidates.js EMR ANET MOD');
  console.log('  node scripts/audit-live-candidates.js EMR ANET MOD --provider=fmp --top=3');
  console.log('  node scripts/audit-live-candidates.js --snapshot snapshots/phase1-live.json');
  console.log('  node scripts/audit-live-candidates.js EMR ANET MOD --save-replay-snapshot snapshots/phase1-live.json');
}

function normalizeTicker(value){
  return String(value || '').trim().toUpperCase();
}

function runNodeScript(scriptName, args){
  const scriptPath = path.join(root, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath].concat(args), {
    cwd:root,
    env:process.env,
    encoding:'utf8'
  });
  return {
    status:result.status,
    stdout:String(result.stdout || ''),
    stderr:String(result.stderr || '')
  };
}

function parseJsonPrefix(output){
  const trimmed = String(output || '').trim();
  if(!trimmed) return null;

  let start = -1;
  for(let index = 0; index < trimmed.length; index += 1){
    if(trimmed[index] === '{'){
      start = index;
      break;
    }
  }
  if(start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for(let index = start; index < trimmed.length; index += 1){
    const char = trimmed[index];
    if(inString){
      if(escaped){
        escaped = false;
        continue;
      }
      if(char === '\\'){
        escaped = true;
        continue;
      }
      if(char === '"'){
        inString = false;
      }
      continue;
    }
    if(char === '"'){
      inString = true;
      continue;
    }
    if(char === '{'){
      depth += 1;
      continue;
    }
    if(char === '}'){
      depth -= 1;
      if(depth === 0){
        end = index;
        break;
      }
    }
  }
  if(end < 0) return null;

  try{
    return JSON.parse(trimmed.slice(start, end + 1));
  }catch(_error){
    return null;
  }
}

function main(){
  const args = process.argv.slice(2);
  const snapshotFlagIndex = args.findIndex(arg => arg === '--snapshot');
  const snapshotPath = snapshotFlagIndex >= 0 ? args[snapshotFlagIndex + 1] : '';
  const saveSnapshotFlagIndex = args.findIndex(arg => arg === '--save-replay-snapshot');
  const saveSnapshotPath = saveSnapshotFlagIndex >= 0 ? args[saveSnapshotFlagIndex + 1] : '';
  const providerArg = args.find(arg => arg.startsWith('--provider='));
  const topArg = args.find(arg => arg.startsWith('--top='));
  const requestedTop = Math.max(1, Number.parseInt((topArg && topArg.split('=')[1]) || '', 10) || 5);
  const tickers = args
    .filter((arg, index) => {
      if(arg.startsWith('--')) return false;
      if(snapshotFlagIndex >= 0 && index === snapshotFlagIndex + 1) return false;
      if(saveSnapshotFlagIndex >= 0 && index === saveSnapshotFlagIndex + 1) return false;
      return true;
    })
    .map(normalizeTicker)
    .filter(Boolean);

  if(!snapshotPath && !tickers.length){
    usage();
    process.exitCode = 1;
    return;
  }

  if(snapshotPath){
    const replayArgs = ['--snapshot', snapshotPath];
    const replayRun = runNodeScript('replay-resolver-snapshot.js', replayArgs);
    if(replayRun.status !== 0){
      process.stderr.write(replayRun.stderr || replayRun.stdout || 'Resolver replay failed.\n');
      process.exitCode = replayRun.status || 1;
      return;
    }
    console.log('Frozen snapshot replay');
    console.log('----------------------');
    console.log(replayRun.stdout.trim());
    return;
  }

  const shortlistArgs = tickers.slice();
  if(providerArg) shortlistArgs.push(providerArg);
  shortlistArgs.push(`--top=${requestedTop}`);

  const shortlistRun = runNodeScript('debug-near-entry-shortlist.js', shortlistArgs);
  if(shortlistRun.status !== 0){
    process.stderr.write(shortlistRun.stderr || shortlistRun.stdout || 'Shortlist audit failed.\n');
    process.exitCode = shortlistRun.status || 1;
    return;
  }

  const shortlistPayload = parseJsonPrefix(shortlistRun.stdout);
  if(!shortlistPayload || !Array.isArray(shortlistPayload.selectedTickers)){
    process.stderr.write('Unable to derive selected shortlist tickers from shortlist output.\n');
    process.exitCode = 1;
    return;
  }

  if(!shortlistPayload.selectedTickers.length){
    console.log('Shortlist selected: none');
    console.log(shortlistRun.stdout.trim());
    console.log('');
    console.log('Full resolver replay');
    console.log('--------------------');
    console.log('No shortlist names qualified for replay.');
    return;
  }

  const replayArgs = shortlistPayload.selectedTickers.slice();
  if(providerArg) replayArgs.push(providerArg);
  if(saveSnapshotPath) replayArgs.push('--save-snapshot', saveSnapshotPath);
  const replayRun = runNodeScript('replay-resolver-snapshot.js', replayArgs);
  if(replayRun.status !== 0){
    process.stderr.write(replayRun.stderr || replayRun.stdout || 'Resolver replay failed.\n');
    process.exitCode = replayRun.status || 1;
    return;
  }

  console.log(`Shortlist selected: ${shortlistPayload.selectedTickers.join(', ')}`);
  if(saveSnapshotPath){
    console.log('Saved replay snapshot only for selected replay tickers.');
  }
  console.log(shortlistRun.stdout.trim());
  console.log('');
  console.log('Full resolver replay');
  console.log('--------------------');
  console.log(replayRun.stdout.trim());
}

main();
