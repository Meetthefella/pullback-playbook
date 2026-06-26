const path = require('path');

const scriptPath = path.join(__dirname, 'fetch-tester-bundle.js');
const fetchTesterBundle = require(scriptPath);

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function run(){
  const parsed = fetchTesterBundle.parseArgs([
    'node',
    scriptPath,
    'BUG-20260626102014-AAPL',
    '--auto-progress',
    '--reason',
    'Done',
    '--fixed-in-build',
    'v4.4.20'
  ]);
  assert(parsed.issueId === 'BUG-20260626102014-AAPL', 'parseArgs should keep the issue id.');
  assert(parsed.autoProgress === true, 'parseArgs should enable auto progress.');
  assert(parsed.reason === 'Done', 'parseArgs should read the reason.');
  assert(parsed.fixedInBuild === 'v4.4.20', 'parseArgs should read fixedInBuild.');

  let threw = false;
  try{
    fetchTesterBundle.parseArgs([
      'node',
      scriptPath,
      'BUG-20260626102014-AAPL',
      '--auto-progress',
      '--mark-under-investigation'
    ]);
  }catch(error){
    threw = /either an explicit mark flag or --auto-progress/i.test(String(error && error.message || error));
  }
  assert(threw, 'parseArgs should reject mixing explicit mark flags with auto progress.');

  const underInvestigation = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'submitted'}
  }, {});
  assert(underInvestigation && underInvestigation.status === 'under_investigation', 'submitted should auto-progress to under_investigation.');

  const missingAnalysisReason = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'under_investigation'}
  }, {});
  assert(missingAnalysisReason == null, 'under_investigation should not auto-progress without a reason.');

  const analysisComplete = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'under_investigation'}
  }, {reason:'Triage complete'});
  assert(analysisComplete && analysisComplete.status === 'analysis_complete', 'under_investigation should auto-progress with a reason.');

  const missingFixedBuild = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'analysis_complete'}
  }, {reason:'Implemented'});
  assert(missingFixedBuild == null, 'analysis_complete should not auto-progress to fixed without fixedInBuild.');

  const dirtyTreeFixed = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'analysis_complete'}
  }, {reason:'Implemented', fixedInBuild:'v4.4.20', gitClean:false});
  assert(dirtyTreeFixed == null, 'analysis_complete should not auto-progress to fixed without a clean tree.');

  const fixed = fetchTesterBundle.determineAutoProgressAction({
    workflow:{status:'analysis_complete'}
  }, {reason:'Implemented', fixedInBuild:'v4.4.20', gitClean:true});
  assert(fixed && fixed.status === 'fixed', 'analysis_complete should auto-progress to fixed with evidence gates met.');
  assert(fixed.fixedInBuild === 'v4.4.20', 'fixed auto progress should carry fixedInBuild.');

  assert(fetchTesterBundle.isIgnorableGitStatusLine('?? debug-bundles/') === true, 'debug-bundles should be ignored for clean-tree checks.');
  assert(fetchTesterBundle.isIgnorableGitStatusLine(' M app.js') === false, 'real source changes should not be ignored.');

  console.log('fetch-tester-bundle tests passed');
}

run();
