(function(global){
  function createDiaryService(deps = {}){
    const {
      allTickerRecords,
      upsertTickerRecord,
      mergeDiaryRecordIntoRecord,
      commitTickerState,
      normalizeTicker,
      normalizeImportedStatus,
      todayIsoDate,
      isClosedOutcome
    } = deps;

    if(typeof allTickerRecords !== 'function') throw new Error('DiaryService requires allTickerRecords.');
    if(typeof upsertTickerRecord !== 'function') throw new Error('DiaryService requires upsertTickerRecord.');
    if(typeof mergeDiaryRecordIntoRecord !== 'function') throw new Error('DiaryService requires mergeDiaryRecordIntoRecord.');
    if(typeof commitTickerState !== 'function') throw new Error('DiaryService requires commitTickerState.');
    if(typeof normalizeTicker !== 'function') throw new Error('DiaryService requires normalizeTicker.');
    if(typeof normalizeImportedStatus !== 'function') throw new Error('DiaryService requires normalizeImportedStatus.');
    if(typeof todayIsoDate !== 'function') throw new Error('DiaryService requires todayIsoDate.');
    if(typeof isClosedOutcome !== 'function') throw new Error('DiaryService requires isClosedOutcome.');

    function schemaBindings(){
      const bindings = global.__ppDiarySchema && typeof global.__ppDiarySchema === 'object'
        ? global.__ppDiarySchema
        : null;
      if(!bindings || typeof bindings.normalizeTradeRecord !== 'function' || typeof bindings.parseTagList !== 'function'){
        throw new Error('DiaryService requires __ppDiarySchema.normalizeTradeRecord and parseTagList.');
      }
      return bindings;
    }

    function listTradeRecords(){
      const {normalizeTradeRecord} = schemaBindings();
      return allTickerRecords()
        .flatMap(record => (record.diary && Array.isArray(record.diary.records) ? record.diary.records.map(item => ({record, trade:normalizeTradeRecord(item)})) : []))
        .sort((a, b) => String(b.trade.date || '').localeCompare(String(a.trade.date || '')) || String(b.trade.id).localeCompare(String(a.trade.id)));
    }

    function listTrades(){
      return listTradeRecords().map(item => item.trade);
    }

    function saveTradeRecordForTicker(ticker, tradeRecord){
      const {normalizeTradeRecord} = schemaBindings();
      const symbol = normalizeTicker(ticker);
      if(!symbol) return null;
      const normalized = normalizeTradeRecord(tradeRecord);
      mergeDiaryRecordIntoRecord(upsertTickerRecord(symbol), normalized);
      commitTickerState();
      return normalized;
    }

    function updateTradeField(recordId, field, value){
      const {normalizeTradeRecord, parseTagList} = schemaBindings();
      const found = listTradeRecords().find(item => item.trade.id === recordId);
      if(!found) return null;
      const tradeRecord = normalizeTradeRecord(found.trade);
      const currentRecord = upsertTickerRecord(found.record.ticker);
      currentRecord.diary.records = currentRecord.diary.records.filter(item => item.id !== recordId);
      if(field === 'ticker') tradeRecord.ticker = normalizeTicker(value);
      else if(field === 'verdict') tradeRecord.verdict = normalizeImportedStatus(value);
      else if(['mistakeTags','lessonTags','setupTags'].includes(field)) tradeRecord[field] = parseTagList(value);
      else tradeRecord[field] = value;
      if(field === 'outcome' && isClosedOutcome(value) && !tradeRecord.closedAt) tradeRecord.closedAt = todayIsoDate();
      if((field === 'outcome' && String(value) === 'Open') || (['actualEntry','actualExit','actualStop','actualQuantity'].includes(field) && String(value || '').trim())){
        if(!tradeRecord.openedAt) tradeRecord.openedAt = todayIsoDate();
      }
      if(['mistakeTags','lessonTags','setupTags','lesson','notes','outcomeReason','executionQuality','setupQuality','beforeImage','afterImage','outcome'].includes(field)){
        tradeRecord.reviewedAt = todayIsoDate();
      }
      mergeDiaryRecordIntoRecord(upsertTickerRecord(tradeRecord.ticker), tradeRecord);
      commitTickerState();
      return normalizeTradeRecord(tradeRecord);
    }

    function deleteTradeRecordById(recordId){
      allTickerRecords().forEach(record => {
        record.diary.records = record.diary.records.filter(item => item.id !== recordId);
        record.diary.diaryIds = record.diary.records.map(item => item.id);
        record.diary.hasDiary = !!record.diary.records.length;
      });
      commitTickerState();
      return true;
    }

    function cancelPaperTradeRecordById(recordId){
      const {normalizeTradeRecord} = schemaBindings();
      const found = listTradeRecords().find(item => item.trade.id === recordId);
      if(!found) return null;
      const tradeRecord = normalizeTradeRecord(found.trade);
      if(String(tradeRecord.sourceType || '').trim().toLowerCase() !== 'paper_trade') return null;
      const currentStatus = String(
        tradeRecord.status
        || (tradeRecord.executionMeta && tradeRecord.executionMeta.status)
        || ''
      ).trim().toLowerCase();
      if(currentStatus !== 'submitted') return normalizeTradeRecord(tradeRecord);
      tradeRecord.status = 'cancelled';
      tradeRecord.outcome = 'Cancelled';
      tradeRecord.closedAt = todayIsoDate();
      tradeRecord.reviewedAt = todayIsoDate();
      tradeRecord.updatedAt = new Date().toISOString();
      tradeRecord.executionMeta = {
        ...(tradeRecord.executionMeta && typeof tradeRecord.executionMeta === 'object' ? tradeRecord.executionMeta : {}),
        status:'cancelled',
        cancelledAt:new Date().toISOString()
      };
      const currentRecord = upsertTickerRecord(found.record.ticker);
      currentRecord.diary.records = currentRecord.diary.records.filter(item => item.id !== recordId);
      mergeDiaryRecordIntoRecord(currentRecord, tradeRecord);
      commitTickerState();
      return normalizeTradeRecord(tradeRecord);
    }

    return {
      listTradeRecords,
      listTrades,
      saveTradeRecordForTicker,
      updateTradeField,
      deleteTradeRecordById,
      cancelPaperTradeRecordById
    };
  }

  global.DiaryService = Object.assign({}, global.DiaryService, {
    createDiaryService
  });
})(window);
