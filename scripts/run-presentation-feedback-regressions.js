const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadModule(relativePath, sandbox){
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInNewContext(source, sandbox, {filename:relativePath});
}

function createSandbox(){
  const sandbox = {
    window:{},
    console
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.console = console;
  sandbox.window.ResolverCore = {
    resolveGlobalVerdict(){
      return {
        final_verdict:'watch',
        reason:'Fresh watch state',
        main_blocker:'Fresh blocker',
        entry_gate_pass:false,
        near_entry_gate_pass:false
      };
    },
    globalVerdictLabel(value){
      const safe = String(value || '').trim().toLowerCase();
      if(safe === 'avoid') return 'Avoid';
      if(safe === 'near_entry') return 'Near Entry';
      if(safe === 'entry') return 'Entry';
      return 'Watch';
    },
    normalizeGlobalVerdictKey(value){
      const safe = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
      return ['entry','near_entry','watch','avoid'].includes(safe) ? safe : 'watch';
    },
    normalizeVerdict(value){
      return String(value || '').trim().toLowerCase();
    },
    getBadge(){
      return {text:'Watch'};
    },
    getActions(){
      return {label:'Fresh Action'};
    }
  };
  sandbox.window.ResolverPresentation = {
    resolveVisualState(){
      return {
        canonicalVerdict:'watch',
        finalVerdict:'watch',
        visualBucket:'monitor',
        tone:'monitor',
        badge:{text:'Fresh Watch'},
        decision_summary:'Fresh Action',
        reason:'Fresh blocker'
      };
    }
  };
  sandbox.window.SimplifiedPlanState = {
    deriveCurrentPlanState(){
      return {status:'missing', planVisible:false};
    },
    validateCurrentPlan(){
      return {ok:true};
    }
  };

  loadModule('js/presentation/simplified-presentation-model.js', sandbox);
  loadModule('js/domain/simplified-trade-state.js', sandbox);
  loadModule('js/domain/canonical-resolver-input.js', sandbox);
  return sandbox.window;
}

function buildRecord(sharedPresentation){
  return {
    ticker:'NVDA',
    watchlist:{
      inWatchlist:true,
      presentation:{
        sharedPresentation
      }
    }
  };
}

function run(){
  const window = createSandbox();
  const pipeline = window.SimplifiedTradeState;
  assert.ok(pipeline && typeof pipeline.resolveRecordState === 'function', 'SimplifiedTradeState must load');

  const staleAvoid = pipeline.resolveRecordState(buildRecord({
    canonicalVerdict:'watch',
    visualBucket:'avoid',
    tone:'avoid',
    badgeLabel:'Avoid',
    actionLabel:'Rebuild setup',
    mainBlocker:'Structure is broken.'
  }), {surface:'scan', log:false});
  assert.strictEqual(staleAvoid.canonicalVerdict, 'watch', 'stale persisted avoid must not override fresh watch verdict');
  assert.strictEqual(staleAvoid.visualBucket, 'monitor', 'stale persisted avoid bucket must not override fresh watch bucket');
  assert.strictEqual(staleAvoid.tone, 'monitor', 'stale persisted avoid tone must not override fresh tone');
  assert.strictEqual(staleAvoid.badgeLabel, 'Fresh Watch', 'stale persisted avoid badge must not override fresh badge');
  assert.strictEqual(staleAvoid.actionLabel, 'Fresh Action', 'stale persisted action must not override fresh action');
  assert.strictEqual(staleAvoid.mainBlocker, 'Fresh blocker', 'stale persisted blocker copy must not override fresh blocker');

  const staleDiminishing = pipeline.resolveRecordState(buildRecord({
    canonicalVerdict:'watch',
    visualBucket:'diminishing',
    tone:'diminishing',
    badgeLabel:'Watch',
    actionLabel:'Hold back',
    mainBlocker:'Trend weakening'
  }), {surface:'scan', log:false});
  assert.strictEqual(staleDiminishing.visualBucket, 'monitor', 'stale diminishing bucket must not override fresh constructive watch');
  assert.strictEqual(staleDiminishing.tone, 'monitor', 'stale diminishing tone must not override fresh constructive watch');

  const debugOnly = pipeline.resolveRecordState(buildRecord({
    canonicalVerdict:'watch',
    visualBucket:'avoid',
    tone:'avoid',
    badgeLabel:'Avoid',
    actionLabel:'Rebuild setup',
    mainBlocker:'Structure is broken.'
  }), {surface:'scan', log:false});
  assert.strictEqual(debugOnly.debug.persistedPresentationAvailable, true, 'persisted presentation should remain available in debug');
  assert.strictEqual(debugOnly.debug.persistedPresentationOverlayApplied, true, 'overlay path should still run');
  assert.strictEqual(debugOnly.debug.persistedPresentationAuthorityDisabled, 'global_non_authoritative', 'persisted presentation should be marked globally non-authoritative');
  assert.ok(debugOnly.debug.persistedPresentationSnapshot, 'persisted snapshot should remain available in debug');
  assert.ok(debugOnly.debug.persistedPresentationFeedback, 'feedback diagnostics should be present');
  assert.strictEqual(debugOnly.debug.persistedPresentationFeedback.bucketConflict, true, 'feedback diagnostics should flag bucket conflict');
  assert.strictEqual(debugOnly.debug.persistedPresentationFeedback.toneConflict, true, 'feedback diagnostics should flag tone conflict');
  assert.strictEqual(debugOnly.debug.persistedPresentationFeedback.badgeConflict, true, 'feedback diagnostics should flag badge conflict');
  assert.strictEqual(debugOnly.debug.persistedPresentationFeedback.actionConflict, true, 'feedback diagnostics should flag action conflict');

  const originalBuilder = window.SimplifiedPresentationModel.buildPresentationModel;
  window.SimplifiedPresentationModel.buildPresentationModel = function blankFreshPresentation(){
    return {
      ticker:'NVDA',
      canonicalVerdict:'watch',
      visualBucket:'monitor',
      tone:'monitor',
      badgeLabel:'',
      actionLabel:'',
      planVisible:false,
      planStatus:'missing',
      mainBlocker:'',
      entryGatePass:false,
      nearEntryGatePass:false,
      debug:{}
    };
  };
  const blankConflict = pipeline.resolveRecordState(buildRecord({
    canonicalVerdict:'avoid',
    visualBucket:'avoid',
    tone:'avoid',
    badgeLabel:'Avoid',
    actionLabel:'Rebuild setup',
    mainBlocker:'Structure is broken.'
  }), {surface:'scan', log:false});
  window.SimplifiedPresentationModel.buildPresentationModel = originalBuilder;
  assert.strictEqual(blankConflict.badgeLabel, '', 'conflicting persisted badge must not backfill blank fresh badge');
  assert.strictEqual(blankConflict.actionLabel, '', 'conflicting persisted action must not backfill blank fresh action');
  assert.strictEqual(blankConflict.mainBlocker, '', 'conflicting persisted blocker must not backfill blank fresh blocker');
  assert.strictEqual(blankConflict.debug.persistedPresentationConflictSuppressed, true, 'overlay should record that conflicting persisted fallback fill was suppressed');

  console.log('run-presentation-feedback-regressions: ok');
}

run();
