(function(global){
  function createDiaryFeature(deps = {}){
    const {
      $,
      escapeHtml,
      statusClass,
      normalizeTicker,
      todayIsoDate,
      setStatus,
      downloadJsonFile,
      getCanonicalTradeSnapshot,
      getTickerRecord,
      renderPatternAnalytics,
      diaryService,
      setActiveWorkspaceTab
    } = deps;

    if(typeof $ !== 'function') throw new Error('DiaryFeature requires DOM lookup helper.');
    if(typeof escapeHtml !== 'function') throw new Error('DiaryFeature requires escapeHtml.');
    if(typeof statusClass !== 'function') throw new Error('DiaryFeature requires statusClass.');
    if(typeof normalizeTicker !== 'function') throw new Error('DiaryFeature requires normalizeTicker.');
    if(typeof todayIsoDate !== 'function') throw new Error('DiaryFeature requires todayIsoDate.');
    if(typeof setStatus !== 'function') throw new Error('DiaryFeature requires setStatus.');
    if(typeof downloadJsonFile !== 'function') throw new Error('DiaryFeature requires downloadJsonFile.');
    if(typeof getCanonicalTradeSnapshot !== 'function') throw new Error('DiaryFeature requires getCanonicalTradeSnapshot.');
    if(typeof getTickerRecord !== 'function') throw new Error('DiaryFeature requires getTickerRecord.');
    if(typeof renderPatternAnalytics !== 'function') throw new Error('DiaryFeature requires renderPatternAnalytics.');
    if(!diaryService || typeof diaryService.listTradeRecords !== 'function') throw new Error('DiaryFeature requires diaryService.');

    function schemaBindings(){
      const bindings = global.__ppDiarySchema && typeof global.__ppDiarySchema === 'object'
        ? global.__ppDiarySchema
        : null;
      if(!bindings || typeof bindings.normalizeTradeRecord !== 'function' || typeof bindings.createTradeRecord !== 'function' || typeof bindings.formatTagList !== 'function'){
        throw new Error('DiaryFeature requires __ppDiarySchema.normalizeTradeRecord/createTradeRecord/formatTagList.');
      }
      return bindings;
    }

    function diarySummaryValue(value, fallback = 'n/a'){
      const text = String(value || '').trim();
      return text || fallback;
    }

    function updateTradeRecord(recordId, field, value){
      diaryService.updateTradeField(recordId, field, value);
      renderTradeDiary();
    }

    function deleteTradeRecord(recordId){
      diaryService.deleteTradeRecordById(recordId);
      renderTradeDiary();
      renderPatternAnalytics();
    }

    function cancelPaperTradeRecord(recordId){
      if(!diaryService || typeof diaryService.cancelPaperTradeRecordById !== 'function') return;
      const result = diaryService.cancelPaperTradeRecordById(recordId);
      if(!result) return;
      renderTradeDiary();
      renderPatternAnalytics();
      setStatus('inputStatus', '<span class="ok">Paper trade cancelled in the diary.</span>');
    }

    function renderTradeDiary(){
      const {formatTagList} = schemaBindings();
      const box = $('tradeDiary');
      if(!box) return;
      const diaryItems = diaryService.listTradeRecords();
      if(!diaryItems.length){
        box.innerHTML = '<div class="summary">No trade records yet. Save an analysed setup from the review workspace.</div>';
        return;
      }
      box.innerHTML = '';
      diaryItems.forEach(({record: tickerRecord, trade: record}) => {
        const outcomeLabel = record.outcome || 'Not set';
        const paperTradeStatus = String(record.status || (record.executionMeta && record.executionMeta.status) || '').trim().toLowerCase();
        const outcomeKey = String(record.outcome || '').trim().toLowerCase();
        const isClosedOutcome = ['win','loss','scratch','cancelled','canceled'].includes(outcomeKey);
        const canCancelPaperTrade = String(record.sourceType || '').trim().toLowerCase() === 'paper_trade'
          && paperTradeStatus === 'submitted'
          && !isClosedOutcome;
        const resultRText = record.resultR ? `${record.resultR}R` : 'R n/a';
        const plannedSummary = `${diarySummaryValue(record.plannedEntry)} / ${diarySummaryValue(record.plannedStop)} / ${diarySummaryValue(record.plannedFirstTarget)}`;
        const actualSummary = `${diarySummaryValue(record.actualEntry)} / ${diarySummaryValue(record.actualExit)} / ${diarySummaryValue(record.actualQuantity)}`;
        const tagSummary = [formatTagList(record.setupTags), formatTagList(record.mistakeTags), formatTagList(record.lessonTags)].filter(Boolean).join(' | ') || 'No tags yet';
        const div = document.createElement('details');
        div.className = 'diarycard';
        div.innerHTML = `<summary class="diaryhead"><div class="diarymeta"><span class="badge ${statusClass(record.chartVerdict || record.verdict)}">${escapeHtml(record.chartVerdict || record.verdict)}</span><strong>${escapeHtml(record.ticker || 'Ticker')}</strong><span class="tiny">${escapeHtml(record.date || '')}</span><span class="tiny">${escapeHtml(tickerRecord.lifecycle.stage || '')}</span></div><div class="tiny">Outcome ${escapeHtml(outcomeLabel)} | ${escapeHtml(resultRText)}</div></summary><div class="tiny">Gross ${escapeHtml(record.grossPnL || 'n/a')} | Net ${escapeHtml(record.netPnL || 'n/a')} | Held ${escapeHtml(record.heldDays || 'n/a')} day(s)</div><div class="tiny">Planned ${escapeHtml(plannedSummary)} | Actual ${escapeHtml(actualSummary)}</div><div class="tiny">Tags: ${escapeHtml(tagSummary)}</div>${paperTradeStatus ? `<div class="tiny">Paper Trade Status: ${escapeHtml(paperTradeStatus === 'submitted' ? 'Submitted' : (paperTradeStatus === 'cancelled' ? 'Cancelled' : paperTradeStatus))}</div>` : ''}<div class="actions">${canCancelPaperTrade ? '<button class="secondary compactbutton" data-act="cancel-paper-trade" type="button">Cancel Paper Trade</button>' : ''}<button class="danger compactbutton" data-act="delete-trade" type="button">Delete</button></div><div class="diarygrid"><div><label>Opened</label><input data-field="openedAt" type="date" value="${escapeHtml(record.openedAt)}" /></div><div><label>Closed</label><input data-field="closedAt" type="date" value="${escapeHtml(record.closedAt)}" /></div><div><label>Verdict</label><select data-field="verdict"><option ${record.verdict === 'Watch' ? 'selected' : ''}>Watch</option><option ${record.verdict === 'Near Entry' ? 'selected' : ''}>Near Entry</option><option ${record.verdict === 'Entry' ? 'selected' : ''}>Entry</option><option ${record.verdict === 'Avoid' ? 'selected' : ''}>Avoid</option></select></div><div><label>Outcome</label><select data-field="outcome"><option value="" ${record.outcome === '' ? 'selected' : ''}>Not set</option><option ${record.outcome === 'Open' ? 'selected' : ''}>Open</option><option ${record.outcome === 'Win' ? 'selected' : ''}>Win</option><option ${record.outcome === 'Loss' ? 'selected' : ''}>Loss</option><option ${record.outcome === 'Scratch' ? 'selected' : ''}>Scratch</option><option ${record.outcome === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select></div></div><div class="diarygrid"><div><label>Planned Entry</label><input data-field="plannedEntry" value="${escapeHtml(record.plannedEntry)}" placeholder="123.45" /></div><div><label>Planned Stop</label><input data-field="plannedStop" value="${escapeHtml(record.plannedStop)}" placeholder="119.80" /></div><div><label>Planned Target</label><input data-field="plannedFirstTarget" value="${escapeHtml(record.plannedFirstTarget)}" placeholder="130.00" /></div><div><label>Planned Risk/Share</label><input data-field="plannedRiskPerShare" value="${escapeHtml(record.plannedRiskPerShare)}" placeholder="3.65" /></div></div><div class="diarygrid"><div><label>Actual Entry</label><input data-field="actualEntry" value="${escapeHtml(record.actualEntry)}" placeholder="123.60" /></div><div><label>Actual Exit</label><input data-field="actualExit" value="${escapeHtml(record.actualExit)}" placeholder="129.90" /></div><div><label>Actual Stop</label><input data-field="actualStop" value="${escapeHtml(record.actualStop)}" placeholder="119.80" /></div><div><label>Quantity</label><input data-field="actualQuantity" value="${escapeHtml(record.actualQuantity)}" placeholder="10" /></div></div><div class="diarygrid"><div><label>Outcome Reason</label><select data-field="outcomeReason"><option value="" ${record.outcomeReason === '' ? 'selected' : ''}>Not set</option><option ${record.outcomeReason === 'target hit' ? 'selected' : ''}>target hit</option><option ${record.outcomeReason === 'stop hit' ? 'selected' : ''}>stop hit</option><option ${record.outcomeReason === 'manual exit' ? 'selected' : ''}>manual exit</option><option ${record.outcomeReason === 'invalidation' ? 'selected' : ''}>invalidation</option><option ${record.outcomeReason === 'expired' ? 'selected' : ''}>expired</option></select></div><div><label>Execution Quality</label><select data-field="executionQuality"><option value="" ${record.executionQuality === '' ? 'selected' : ''}>Not set</option><option ${record.executionQuality === 'followed_plan' ? 'selected' : ''}>followed_plan</option><option ${record.executionQuality === 'early_entry' ? 'selected' : ''}>early_entry</option><option ${record.executionQuality === 'late_entry' ? 'selected' : ''}>late_entry</option><option ${record.executionQuality === 'early_exit' ? 'selected' : ''}>early_exit</option><option ${record.executionQuality === 'late_exit' ? 'selected' : ''}>late_exit</option><option ${record.executionQuality === 'partial' ? 'selected' : ''}>partial</option></select></div><div><label>Setup Quality</label><select data-field="setupQuality"><option value="" ${record.setupQuality === '' ? 'selected' : ''}>Not set</option><option ${record.setupQuality === 'A' ? 'selected' : ''}>A</option><option ${record.setupQuality === 'B' ? 'selected' : ''}>B</option><option ${record.setupQuality === 'C' ? 'selected' : ''}>C</option></select></div><div><label>Reviewed</label><input data-field="reviewedAt" type="date" value="${escapeHtml(record.reviewedAt)}" /></div></div><div class="diarygrid"><div><label>Setup Tags</label><input data-field="setupTags" value="${escapeHtml(formatTagList(record.setupTags))}" placeholder="20MA bounce, first pullback" /></div><div><label>Mistake Tags</label><input data-field="mistakeTags" value="${escapeHtml(formatTagList(record.mistakeTags))}" placeholder="early entry, stop moved" /></div><div><label>Lesson Tags</label><input data-field="lessonTags" value="${escapeHtml(formatTagList(record.lessonTags))}" placeholder="wait for bounce confirmation" /></div><div><label>Lesson Learned</label><input data-field="lesson" value="${escapeHtml(record.lesson)}" placeholder="Wait for cleaner bounce" /></div></div><div class="diarygrid"><div><label>Before Image Ref</label><input data-field="beforeImage" value="${escapeHtml(record.beforeImage)}" placeholder="stored chart / ref" /></div><div><label>After Image Ref</label><input data-field="afterImage" value="${escapeHtml(record.afterImage)}" placeholder="exit screenshot / ref" /></div><div><label>Gross PnL</label><input value="${escapeHtml(record.grossPnL || '')}" readonly /></div><div><label>Result in R</label><input value="${escapeHtml(record.resultR || '')}" readonly /></div></div><div><label>Notes</label><textarea data-field="notes" placeholder="Why this setup was worth tracking.">${escapeHtml(record.notes)}</textarea></div>`;
        const cancelButton = div.querySelector('[data-act="cancel-paper-trade"]');
        if(cancelButton) cancelButton.onclick = () => cancelPaperTradeRecord(record.id);
        div.querySelector('[data-act="delete-trade"]').onclick = () => deleteTradeRecord(record.id);
        div.querySelectorAll('[data-field]').forEach(field => {
          field.addEventListener('change', event => updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value));
          field.addEventListener('input', event => {
            if(event.target.tagName === 'TEXTAREA' || ['lesson','setupTags','mistakeTags','lessonTags','notes','beforeImage','afterImage'].includes(event.target.getAttribute('data-field'))){
              updateTradeRecord(record.id, event.target.getAttribute('data-field'), event.target.value);
            }
          });
        });
        box.appendChild(div);
      });
    }

    function saveTradeFromCard(ticker){
      const {normalizeTradeRecord, createTradeRecord} = schemaBindings();
      const symbol = normalizeTicker(ticker);
      const tickerRecord = getTickerRecord(symbol);
      if(!tickerRecord) return;
      const snapshot = getCanonicalTradeSnapshot(symbol);
      const tradeRecord = normalizeTradeRecord(createTradeRecord({
        ...snapshot,
        sourceType:'review',
        sourceContext:'review_workspace',
        reviewedAt:todayIsoDate(),
        updatedAt:new Date().toISOString()
      }));
      diaryService.saveTradeRecordForTicker(symbol, tradeRecord);
      renderTradeDiary();
      renderPatternAnalytics();
      if(typeof setActiveWorkspaceTab === 'function') setActiveWorkspaceTab('diary', {focusTop:false});
      const diarySection = $('diarySection');
      if(diarySection) diarySection.scrollIntoView({behavior:'smooth', block:'start'});
    }

    function exportTradeDiary(){
      const ok = downloadJsonFile(`pullback-playbook-trade-diary-${todayIsoDate()}.json`, diaryService.listTrades());
      setStatus('inputStatus', ok
        ? '<span class="ok">Trade diary exported as JSON.</span>'
        : '<span class="warntext">Direct file access is browser-limited here. Use your browser download prompt to save the diary export.</span>');
    }

    return {
      renderTradeDiary,
      saveTradeFromCard,
      updateTradeRecord,
      deleteTradeRecord,
      exportTradeDiary,
      diarySummaryValue
    };
  }

  global.DiaryFeature = Object.assign({}, global.DiaryFeature, {
    createDiaryFeature
  });
})(window);
