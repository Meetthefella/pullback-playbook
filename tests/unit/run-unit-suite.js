const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..', '..');

const cases = [
  {
    id:'resolver-gates',
    label:'Resolver gate assertions',
    script:'scripts/run-resolver-gate-assertions.js',
    groups:['all', 'resolver', 'pure']
  },
  {
    id:'canonical-resolver-input',
    label:'Canonical resolver input assertions',
    script:'scripts/run-canonical-resolver-input-assertions.js',
    groups:['all', 'resolver', 'pure']
  },
  {
    id:'canonical-decision-baseline',
    label:'Canonical decision baseline assertions',
    script:'scripts/run-canonical-decision-baseline-assertions.js',
    groups:['all', 'resolver', 'pure']
  },
  {
    id:'canonical-norm',
    label:'Canonical Norm assertions',
    script:'scripts/run-canonical-norm-assertions.js',
    groups:['all', 'resolver', 'pure']
  },
  {
    id:'simplified-publication-adapter',
    label:'Simplified publication adapter assertions',
    script:'scripts/run-simplified-publication-adapter-assertions.js',
    groups:['all', 'resolver', 'contracts']
  },
  {
    id:'resolver-presentation-publication',
    label:'ResolverPresentation publication assertions',
    script:'scripts/run-resolver-presentation-publication-assertions.js',
    groups:['all', 'resolver', 'contracts']
  },
  {
    id:'normalization-read-write',
    label:'Normalization read/write assertions',
    script:'scripts/run-normalization-read-write-assertions.js',
    groups:['all', 'resolver', 'pure', 'persistence']
  },
  {
    id:'plan-verdict-contract',
    label:'Plan verdict contract assertions',
    script:'scripts/run-plan-verdict-contract-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'pullback-authority',
    label:'Pullback authority assertions',
    script:'scripts/run-pullback-authority-assertions.js',
    groups:['all', 'contracts', 'pullback-authority']
  },
  {
    id:'review-draft-authority',
    label:'Review draft authority assertions',
    script:'scripts/run-review-draft-authority-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'trade-plan-authority',
    label:'Trade plan authority assertions',
    script:'scripts/run-trade-plan-authority-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'chart-guru-event-first',
    label:'Chart Guru event-first assertions',
    script:'scripts/run-chart-guru-event-first-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'buyer-state-alignment',
    label:'Buyer-state alignment assertions',
    script:'scripts/run-buyer-state-alignment-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'chart-guru-ai-contracts',
    label:'Chart Guru AI contract assertions',
    script:'scripts/run-chart-guru-ai-contract-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'chart-guru-narration-contracts',
    label:'Chart Guru narration contract assertions',
    script:'scripts/run-chart-guru-narration-contract-assertions.js',
    groups:['all', 'contracts']
  },
  {
    id:'storage-persistence',
    label:'Storage persistence assertions',
    script:'scripts/run-storage-persistence-assertions.js',
    groups:['all', 'persistence']
  },
  {
    id:'lifecycle-hygiene',
    label:'Lifecycle hygiene assertions',
    script:'scripts/run-lifecycle-hygiene-assertions.js',
    groups:['all', 'contracts', 'persistence']
  },
  {
    id:'trade-execution',
    label:'Trade execution handler tests',
    script:'scripts/run-trade-execution-handler-tests.js',
    groups:['all', 'execution']
  }
];

function parseRequestedGroup(argv){
  const explicit = argv.find(arg => arg.startsWith('--group='));
  if(explicit) return explicit.slice('--group='.length).trim().toLowerCase() || 'all';
  const positional = argv.find(arg => !arg.startsWith('--'));
  return String(positional || 'all').trim().toLowerCase() || 'all';
}

function runCase(testCase){
  const relativeScript = String(testCase.script || '');
  const scriptPath = path.resolve(root, relativeScript);
  console.log(`\n[unit] ${testCase.label}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd:root,
    stdio:'inherit'
  });
  if(result.error) throw result.error;
  return Number(result.status || 0);
}

function main(){
  const requestedGroup = parseRequestedGroup(process.argv.slice(2));
  const selectedCases = cases.filter(testCase => testCase.groups.includes(requestedGroup));

  if(!selectedCases.length){
    console.error(`[unit] Unknown group "${requestedGroup}". Available groups: all, resolver, pure, contracts, pullback-authority, persistence, execution.`);
    process.exit(1);
  }

  console.log(`[unit] Running group "${requestedGroup}" with ${selectedCases.length} case(s).`);

  for(const testCase of selectedCases){
    const status = runCase(testCase);
    if(status !== 0){
      console.error(`\n[unit] Failed: ${testCase.id}`);
      process.exit(status);
    }
  }

  console.log(`\n[unit] Group "${requestedGroup}" passed.`);
}

main();
