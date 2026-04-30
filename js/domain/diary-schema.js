(function(global){
  function createDiarySchema(deps = {}){
    const {
      normalizeTicker,
      normalizeImportedStatus,
      normalizeScanType,
      numericOrNull,
      todayIsoDate,
      countTradingDaysBetween,
      isClosedOutcome
    } = deps;

    if(typeof normalizeTicker !== 'function') throw new Error('DiarySchema requires normalizeTicker.');
    if(typeof normalizeImportedStatus !== 'function') throw new Error('DiarySchema requires normalizeImportedStatus.');
    if(typeof normalizeScanType !== 'function') throw new Error('DiarySchema requires normalizeScanType.');
    if(typeof numericOrNull !== 'function') throw new Error('DiarySchema requires numericOrNull.');
    if(typeof todayIsoDate !== 'function') throw new Error('DiarySchema requires todayIsoDate.');
    if(typeof countTradingDaysBetween !== 'function') throw new Error('DiarySchema requires countTradingDaysBetween.');
    if(typeof isClosedOutcome !== 'function') throw new Error('DiarySchema requires isClosedOutcome.');

    function createTradeRecord(values){
      return {
        id:`trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ticker:'',
        date:new Date().toISOString().slice(0, 10),
        sourceType:'manual',
        sourceContext:'',
        sourceRef:'',
        verdict:'Watch',
        chartVerdict:'Watch',
        qualityScore:'',
        setupScore:'',
        setupState:'',
        structureState:'',
        bounceState:'',
        marketStatus:'',
        entry:'',
        stop:'',
        firstTarget:'',
        maxLoss:'',
        riskPerShare:'',
        rewardPerShare:'',
        rrRatio:'',
        rrState:'',
        firstTargetTooClose:false,
        positionSize:'',
        riskStatus:'',
        accountSize:'',
        scanType:'',
        notes:'',
        outcome:'',
        lesson:'',
        plannedEntry:'',
        plannedStop:'',
        plannedFirstTarget:'',
        plannedRiskPerShare:'',
        plannedRewardPerShare:'',
        plannedRR:'',
        plannedPositionSize:'',
        plannedMaxLoss:'',
        plannedAt:'',
        actualEntry:'',
        actualExit:'',
        actualStop:'',
        actualQuantity:'',
        grossPnL:'',
        netPnL:'',
        resultR:'',
        outcomeReason:'',
        heldDays:'',
        executionQuality:'',
        setupQuality:'',
        mistakeTags:[],
        lessonTags:[],
        setupTags:[],
        beforeImage:'',
        afterImage:'',
        openedAt:'',
        closedAt:'',
        reviewedAt:'',
        createdAt:new Date().toISOString(),
        updatedAt:new Date().toISOString(),
        ...values
      };
    }

    function baseTradeOutcome(){
      return {
        hasTrade:false,
        entryPlanned:null,
        stopPlanned:null,
        targetPlanned:null,
        entryActual:null,
        exitActual:null,
        stopActual:null,
        quantity:null,
        grossPnL:null,
        netPnL:null,
        resultR:null,
        outcome:null,
        outcomeReason:null,
        heldDays:null,
        executionQuality:null,
        setupQuality:null,
        mistakes:[],
        lessons:[],
        tags:[],
        beforeImage:null,
        afterImage:null,
        openedAt:null,
        closedAt:null,
        reviewedAt:null
      };
    }

    function normalizeTradeOutcomeValue(value){
      const text = String(value || '').trim().toLowerCase();
      if(text === 'open') return 'Open';
      if(text === 'win') return 'Win';
      if(text === 'loss') return 'Loss';
      if(text === 'scratch') return 'Scratch';
      if(text === 'cancelled' || text === 'canceled') return 'Cancelled';
      return '';
    }

    function parseTagList(value){
      if(Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
      return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
    }

    function formatTagList(value){
      return parseTagList(value).join(', ');
    }

    function computeTradeOutcomeMetrics(record){
      const actualEntry = numericOrNull(record.actualEntry);
      const actualExit = numericOrNull(record.actualExit);
      const actualQuantity = numericOrNull(record.actualQuantity);
      const plannedRiskPerShare = numericOrNull(record.plannedRiskPerShare || record.riskPerShare);
      const grossPnL = Number.isFinite(actualEntry) && Number.isFinite(actualExit) && Number.isFinite(actualQuantity)
        ? (actualExit - actualEntry) * actualQuantity
        : null;
      const netPnL = Number.isFinite(numericOrNull(record.netPnL)) ? numericOrNull(record.netPnL) : grossPnL;
      const resultR = Number.isFinite(plannedRiskPerShare) && plannedRiskPerShare > 0 && Number.isFinite(actualQuantity) && actualQuantity > 0 && Number.isFinite(netPnL)
        ? netPnL / (plannedRiskPerShare * actualQuantity)
        : null;
      let heldDays = null;
      if(/^\d{4}-\d{2}-\d{2}$/.test(String(record.openedAt || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(record.closedAt || ''))){
        heldDays = countTradingDaysBetween(String(record.openedAt), String(record.closedAt));
      }
      return {grossPnL, netPnL, resultR, heldDays};
    }

    function tradeRecordHasExecutedTrade(record){
      const actualEntry = numericOrNull(record && record.actualEntry);
      const actualExit = numericOrNull(record && record.actualExit);
      const actualStop = numericOrNull(record && record.actualStop);
      const actualQuantity = numericOrNull(record && record.actualQuantity);
      return Number.isFinite(actualEntry)
        || Number.isFinite(actualExit)
        || Number.isFinite(actualStop)
        || (Number.isFinite(actualQuantity) && actualQuantity > 0);
    }

    function normalizeTradeRecord(record){
      const normalized = createTradeRecord(record || {});
      normalized.ticker = normalizeTicker(normalized.ticker);
      normalized.date = String(normalized.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
      normalized.sourceType = String(normalized.sourceType || 'manual').trim().toLowerCase() || 'manual';
      normalized.sourceContext = String(normalized.sourceContext || '').trim();
      normalized.sourceRef = String(normalized.sourceRef || '').trim();
      normalized.verdict = normalizeImportedStatus(normalized.verdict);
      normalized.chartVerdict = normalizeImportedStatus(normalized.chartVerdict || normalized.verdict);
      normalized.qualityScore = String(normalized.qualityScore || '');
      normalized.setupScore = String(normalized.setupScore || '');
      normalized.setupState = String(normalized.setupState || '');
      normalized.structureState = String(normalized.structureState || '');
      normalized.bounceState = String(normalized.bounceState || '');
      normalized.entry = String(normalized.entry || '');
      normalized.stop = String(normalized.stop || '');
      normalized.firstTarget = String(normalized.firstTarget || '');
      normalized.maxLoss = String(normalized.maxLoss || '');
      normalized.riskPerShare = String(normalized.riskPerShare || '');
      normalized.rewardPerShare = String(normalized.rewardPerShare || '');
      normalized.rrRatio = String(normalized.rrRatio || '');
      normalized.rrState = String(normalized.rrState || '');
      normalized.firstTargetTooClose = !!normalized.firstTargetTooClose;
      normalized.positionSize = String(normalized.positionSize || '');
      normalized.riskStatus = String(normalized.riskStatus || '');
      normalized.accountSize = String(normalized.accountSize || '');
      normalized.marketStatus = String(normalized.marketStatus || '');
      normalized.scanType = normalizeScanType(normalized.scanType);
      normalized.notes = String(normalized.notes || '');
      normalized.outcome = normalizeTradeOutcomeValue(normalized.outcome);
      normalized.lesson = String(normalized.lesson || '');
      normalized.plannedEntry = String(normalized.plannedEntry || normalized.entry || '');
      normalized.plannedStop = String(normalized.plannedStop || normalized.stop || '');
      normalized.plannedFirstTarget = String(normalized.plannedFirstTarget || normalized.firstTarget || '');
      normalized.plannedRiskPerShare = String(normalized.plannedRiskPerShare || normalized.riskPerShare || '');
      normalized.plannedRewardPerShare = String(normalized.plannedRewardPerShare || normalized.rewardPerShare || '');
      normalized.plannedRR = String(normalized.plannedRR || normalized.rrRatio || '');
      normalized.plannedPositionSize = String(normalized.plannedPositionSize || normalized.positionSize || '');
      normalized.plannedMaxLoss = String(normalized.plannedMaxLoss || normalized.maxLoss || '');
      normalized.plannedAt = String(normalized.plannedAt || normalized.date || '');
      normalized.actualEntry = String(normalized.actualEntry || '');
      normalized.actualExit = String(normalized.actualExit || '');
      normalized.actualStop = String(normalized.actualStop || '');
      normalized.actualQuantity = String(normalized.actualQuantity || normalized.quantity || '');
      normalized.outcomeReason = String(normalized.outcomeReason || '');
      normalized.executionQuality = String(normalized.executionQuality || '');
      normalized.setupQuality = String(normalized.setupQuality || '');
      normalized.beforeImage = String(normalized.beforeImage || '');
      normalized.afterImage = String(normalized.afterImage || '');
      normalized.openedAt = String(normalized.openedAt || '').slice(0, 10);
      normalized.closedAt = String(normalized.closedAt || '').slice(0, 10);
      normalized.reviewedAt = String(normalized.reviewedAt || '').slice(0, 10);
      normalized.createdAt = String(normalized.createdAt || normalized.date || `${todayIsoDate()}T00:00:00.000Z`);
      normalized.updatedAt = String(normalized.updatedAt || normalized.createdAt || normalized.date || `${todayIsoDate()}T00:00:00.000Z`);
      if(!normalized.openedAt && (normalized.outcome === 'Open' || tradeRecordHasExecutedTrade(normalized))){
        normalized.openedAt = String(normalized.date || todayIsoDate()).slice(0, 10);
      }
      normalized.mistakeTags = parseTagList(normalized.mistakeTags);
      normalized.lessonTags = parseTagList(normalized.lessonTags);
      normalized.setupTags = parseTagList(normalized.setupTags);
      const metrics = computeTradeOutcomeMetrics(normalized);
      normalized.grossPnL = Number.isFinite(metrics.grossPnL) ? String(Number(metrics.grossPnL.toFixed(2))) : '';
      normalized.netPnL = Number.isFinite(metrics.netPnL) ? String(Number(metrics.netPnL.toFixed(2))) : '';
      normalized.resultR = Number.isFinite(metrics.resultR) ? String(Number(metrics.resultR.toFixed(2))) : '';
      normalized.heldDays = Number.isFinite(metrics.heldDays) ? String(metrics.heldDays) : '';
      return normalized;
    }

    function buildTradeOutcomeSnapshot(record){
      const normalized = normalizeTradeRecord(record);
      const executed = tradeRecordHasExecutedTrade(normalized);
      const outcome = normalizeTradeOutcomeValue(normalized.outcome);
      const base = baseTradeOutcome();
      return {
        ...base,
        hasTrade:executed,
        entryPlanned:numericOrNull(normalized.plannedEntry),
        stopPlanned:numericOrNull(normalized.plannedStop),
        targetPlanned:numericOrNull(normalized.plannedFirstTarget),
        entryActual:numericOrNull(normalized.actualEntry),
        exitActual:numericOrNull(normalized.actualExit),
        stopActual:numericOrNull(normalized.actualStop),
        quantity:numericOrNull(normalized.actualQuantity),
        grossPnL:numericOrNull(normalized.grossPnL),
        netPnL:numericOrNull(normalized.netPnL),
        resultR:numericOrNull(normalized.resultR),
        outcome:outcome || null,
        outcomeReason:String(normalized.outcomeReason || '').trim() || null,
        heldDays:numericOrNull(normalized.heldDays),
        executionQuality:String(normalized.executionQuality || '').trim() || null,
        setupQuality:String(normalized.setupQuality || '').trim() || null,
        mistakes:parseTagList(normalized.mistakeTags),
        lessons:parseTagList(normalized.lessonTags),
        tags:parseTagList(normalized.setupTags),
        beforeImage:String(normalized.beforeImage || '').trim() || null,
        afterImage:String(normalized.afterImage || '').trim() || null,
        openedAt:String(normalized.openedAt || '').trim() || null,
        closedAt:String(normalized.closedAt || '').trim() || null,
        reviewedAt:String(normalized.reviewedAt || '').trim() || null
      };
    }

    function normalizeStoredTradeOutcome(outcome){
      const base = baseTradeOutcome();
      if(!outcome || typeof outcome !== 'object') return base;
      return {
        ...base,
        ...outcome,
        hasTrade:!!outcome.hasTrade,
        entryPlanned:numericOrNull(outcome.entryPlanned),
        stopPlanned:numericOrNull(outcome.stopPlanned),
        targetPlanned:numericOrNull(outcome.targetPlanned),
        entryActual:numericOrNull(outcome.entryActual),
        exitActual:numericOrNull(outcome.exitActual),
        stopActual:numericOrNull(outcome.stopActual),
        quantity:numericOrNull(outcome.quantity),
        grossPnL:numericOrNull(outcome.grossPnL),
        netPnL:numericOrNull(outcome.netPnL),
        resultR:numericOrNull(outcome.resultR),
        outcome:normalizeTradeOutcomeValue(outcome.outcome) || null,
        outcomeReason:String(outcome.outcomeReason || '').trim() || null,
        heldDays:numericOrNull(outcome.heldDays),
        executionQuality:String(outcome.executionQuality || '').trim() || null,
        setupQuality:String(outcome.setupQuality || '').trim() || null,
        mistakes:parseTagList(outcome.mistakes),
        lessons:parseTagList(outcome.lessons),
        tags:parseTagList(outcome.tags),
        beforeImage:String(outcome.beforeImage || '').trim() || null,
        afterImage:String(outcome.afterImage || '').trim() || null,
        openedAt:String(outcome.openedAt || '').trim() || null,
        closedAt:String(outcome.closedAt || '').trim() || null,
        reviewedAt:String(outcome.reviewedAt || '').trim() || null
      };
    }

    function deriveDiaryLifecycleState(record){
      const normalized = normalizeTradeRecord(record);
      const outcome = normalizeTradeOutcomeValue(normalized.outcome);
      const executed = tradeRecordHasExecutedTrade(normalized);
      if(outcome === 'Cancelled' && !executed){
        return {
          stage:'cancelled',
          status:'closed',
          changedAt:`${(normalized.closedAt || normalized.reviewedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
          reason:'Planned trade was cancelled before entry.',
          source:'diary'
        };
      }
      if(isClosedOutcome(outcome)){
        return {
          stage:'exited',
          status:'closed',
          changedAt:`${(normalized.closedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
          reason:`Trade outcome set to ${outcome}.`,
          source:'diary'
        };
      }
      if(executed || outcome === 'Open'){
        return {
          stage:'entered',
          status:'active',
          changedAt:`${(normalized.openedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
          reason:'Trade has actual execution details recorded.',
          source:'diary'
        };
      }
      return {
        stage:'planned',
        status:'active',
        changedAt:`${(normalized.plannedAt || normalized.date || todayIsoDate())}T12:00:00.000Z`,
        reason:'Planned trade snapshot saved for later review.',
        source:'diary'
      };
    }

    function createDiaryEntryFromManualInput(input = {}){
      return normalizeTradeRecord({
        sourceType:'manual',
        ...input
      });
    }

    function createDiaryEntryFromReviewContext(context = {}){
      return normalizeTradeRecord({
        sourceType:'review',
        sourceContext:'review_workspace',
        ...context
      });
    }

    function createDiaryEntryFromPaperTradePayload(payload = {}){
      return normalizeTradeRecord({
        sourceType:'paper_trade',
        sourceContext:'paper_trade_stub',
        ...payload
      });
    }

    return {
      createTradeRecord,
      baseTradeOutcome,
      normalizeTradeOutcomeValue,
      parseTagList,
      formatTagList,
      computeTradeOutcomeMetrics,
      tradeRecordHasExecutedTrade,
      buildTradeOutcomeSnapshot,
      normalizeStoredTradeOutcome,
      deriveDiaryLifecycleState,
      normalizeTradeRecord,
      createDiaryEntryFromManualInput,
      createDiaryEntryFromReviewContext,
      createDiaryEntryFromPaperTradePayload
    };
  }

  global.DiarySchema = Object.assign({}, global.DiarySchema, {
    createDiarySchema
  });
})(window);
