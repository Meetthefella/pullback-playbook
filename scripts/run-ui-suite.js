const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');

const suites = {
  all:[
    {label:'smoke', paths:['tests/ui/smoke']},
    {label:'contracts', paths:['tests/ui/contracts']},
    {label:'regressions', paths:['tests/ui/regressions']},
    {label:'rendering', paths:['tests/ui/rendering']},
    {label:'journeys-local', paths:[
      'tests/ui/journeys/specified-ticker-journey.spec.js',
      'tests/ui/journeys/ticker-visual-journey-parity.spec.js'
    ]},
    {label:'journeys-live', paths:['tests/ui/journeys/deployed-authority-journey.spec.js']}
  ],
  ci:[
    {label:'smoke', paths:['tests/ui/smoke']},
    {label:'contracts', paths:['tests/ui/contracts']},
    {label:'regressions', paths:[
      'tests/ui/regressions/amzn-scan-regression.spec.js',
      'tests/ui/regressions/watchlist-lifecycle-regression.spec.js',
      'tests/ui/regressions/replay-authority-regression.spec.js'
    ]},
    {label:'rendering', paths:['tests/ui/rendering']}
  ]
};

function requestedMode(){
  const explicit = process.argv.slice(2).find(arg => arg.startsWith('--mode='));
  if(explicit) return explicit.slice('--mode='.length).trim().toLowerCase() || 'ci';
  const positional = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  return String(positional || 'ci').trim().toLowerCase() || 'ci';
}

function runPlaywrightGroup(group){
  console.log(`\n[ui] Running ${group.label}`);
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...group.paths], {
    cwd:root,
    stdio:'inherit'
  });
  if(result.error) throw result.error;
  return Number(result.status || 0);
}

function main(){
  const mode = requestedMode();
  const groups = suites[mode];
  if(!groups){
    console.error(`[ui] Unknown mode "${mode}". Available modes: all, ci.`);
    process.exit(1);
  }

  for(const group of groups){
    const status = runPlaywrightGroup(group);
    if(status !== 0){
      console.error(`\n[ui] Failed group: ${group.label}`);
      process.exit(status);
    }
  }

  console.log(`\n[ui] Mode "${mode}" passed.`);
}

main();
