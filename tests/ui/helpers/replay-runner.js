const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

function extractLeadingJson(text){
  const source = String(text || '');
  const start = source.indexOf('{');
  if(start < 0) throw new Error('Replay output did not contain JSON.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for(let index = start; index < source.length; index += 1){
    const char = source[index];
    if(inString){
      if(escaped) escaped = false;
      else if(char === '\\') escaped = true;
      else if(char === '"') inString = false;
      continue;
    }
    if(char === '"'){
      inString = true;
      continue;
    }
    if(char === '{') depth += 1;
    else if(char === '}'){
      depth -= 1;
      if(depth === 0){
        return {
          jsonText:source.slice(start, index + 1),
          trailingText:source.slice(index + 1).trim()
        };
      }
    }
  }
  throw new Error('Replay output JSON was incomplete.');
}

function runReplayForSnapshot(snapshot){
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-replay-parity-'));
  const snapshotPath = path.join(tempDir, `${snapshot.ticker || 'ticker'}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'replay-resolver-snapshot.js');
  const run = spawnSync(process.execPath, [scriptPath, '--snapshot', snapshotPath], {
    cwd:path.resolve(__dirname, '..', '..', '..'),
    encoding:'utf8'
  });
  if(run.status !== 0){
    throw new Error(`Replay script failed: ${run.stderr || run.stdout}`.trim());
  }
  const parsed = extractLeadingJson(run.stdout);
  const payload = JSON.parse(parsed.jsonText);
  if(!payload || payload.ok !== true || !Array.isArray(payload.results) || !payload.results.length){
    throw new Error(`Replay output missing results for ${snapshot.ticker || 'ticker'}.`);
  }
  return {
    json:payload,
    result:payload.results[0],
    reportText:parsed.trailingText
  };
}

module.exports = {
  runReplayForSnapshot
};
