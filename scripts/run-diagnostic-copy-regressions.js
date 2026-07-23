const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunctionSource(name){
  const marker = `function ${name}`;
  const asyncMarker = `async function ${name}`;
  const start = appSource.indexOf(asyncMarker) >= 0 ? appSource.indexOf(asyncMarker) : appSource.indexOf(marker);
  if(start < 0) throw new Error(`Unable to find ${name}`);
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for(let index = bodyStart; index < appSource.length; index += 1){
    if(appSource[index] === '{') depth += 1;
    if(appSource[index] === '}'){
      depth -= 1;
      if(depth === 0) return appSource.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

function createDocument(){
  const body = {
    appendChild(node){ node.isConnected = true; },
    removeChild(node){ node.isConnected = false; }
  };
  return {
    activeElement:null,
    body,
    contains(node){ return !!(node && node.isConnected !== false); },
    createElement(){
      const node = {
        style:{},
        isConnected:false,
        value:'',
        setAttribute(){},
        focus(){ documentRef.activeElement = node; node.focused = true; },
        select(){ node.selected = true; },
        remove(){ node.isConnected = false; }
      };
      return node;
    },
    execCommand(command){ return command === 'copy'; }
  };
}

const documentRef = createDocument();
const sandbox = {document:documentRef, console};
vm.runInNewContext(`${extractFunctionSource('copyTextToClipboard')}\n${extractFunctionSource('showManualSnapshotCopyText')}`, sandbox, {filename:'app.js'});

(async () => {
  const button = {isConnected:true, focus(){ documentRef.activeElement = button; button.focusCalls = (button.focusCalls || 0) + 1; }};
  documentRef.activeElement = button;
  sandbox.navigator = {clipboard:{writeText:async () => {}}};
  assert.strictEqual(await sandbox.copyTextToClipboard('native copy'), true, 'Native clipboard copy should succeed.');
  assert.strictEqual(documentRef.activeElement, button, 'Native clipboard copy must not steal focus from the copy button.');

  delete sandbox.navigator;
  documentRef.activeElement = button;
  assert.strictEqual(await sandbox.copyTextToClipboard('fallback copy'), true, 'Fallback clipboard copy should succeed.');
  assert.strictEqual(documentRef.activeElement, button, 'Fallback clipboard copy must restore the element that was focused before copying.');
  assert(button.focusCalls >= 1, 'Fallback clipboard copy should restore focus after removing its temporary textarea.');

  const wrap = {hidden:true};
  const field = {value:'', focusCalls:0, selectCalls:0, focus(){ this.focusCalls += 1; }, select(){ this.selectCalls += 1; }};
  sandbox.$ = id => id === 'testerSnapshotManualCopyWrap' ? wrap : (id === 'testerSnapshotManualCopyText' ? field : null);
  assert.strictEqual(sandbox.showManualSnapshotCopyText('{"manual":true}'), true, 'Manual fallback should remain available when clipboard access fails.');
  assert.strictEqual(wrap.hidden, false, 'Manual fallback should be visible.');
  assert.strictEqual(field.value, '{"manual":true}', 'Manual fallback should receive the snapshot text.');
  assert.strictEqual(field.focusCalls, 0, 'Manual fallback must not steal focus automatically.');
  assert.strictEqual(field.selectCalls, 0, 'Manual fallback must not select a large bundle automatically.');
  console.log('run-diagnostic-copy-regressions: ok');
})().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
