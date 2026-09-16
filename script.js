/* ============================================================
   INTRADOS DESIGNS — Round 3: Tool Test (Freshers)
   script.js
   ============================================================ */

'use strict';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxteJu1b_okEFYv4jbSF4Ne55bOfBsyIiIx3tnAVHq833I1f7c7aGcn7VVck--VI_a8tg/exec";
const GENERAL_SHEET_ID       = '1Ep0ESBJb-QxzBfN2oxIAH0RFJOPvCsNb4NpvmyWOfDA';
const GENERAL_SHEET_TAB      = "General Assessment";
const PROFESSIONAL_SHEET_TAB = "Professional Assessment";
const TOOL_TEST_SHEET_TAB    = "Tool Test";

const PORTAL_TRACK     = "Fresher"; // 'Experienced' in the sibling portal
const NOT_ELIGIBLE_MSG = "You are not eligible for this test.";

// ⚠️ REQUIRED SETUP: replace with the real Drive folder link for
// Freshers' input files and question paper.
const DRIVE_FOLDER_URL = "PASTE_FRESHERS_TOOL_TEST_DRIVE_LINK_HERE";

const TEST_DURATION_SECONDS = 2 * 60 * 60; // 2 hours

const DOM = {
  regSection:  document.getElementById('registration-section'),
  assSection:  document.getElementById('assessment-section'),
  confSection: document.getElementById('confirmation-section'),

  rulesModal:         document.getElementById('rules-modal'),
  btnRulesUnderstood: document.getElementById('btn-rules-understood'),

  formRefId:   document.getElementById('field-refid'),
  errRefId:    document.getElementById('err-refid'),
  btnVerify:   document.getElementById('btn-verify'),
  candSummary: document.getElementById('candidate-summary'),
  summaryName: document.getElementById('summary-name'),
  btnStart:    document.getElementById('btn-start'),

  neModal:      document.getElementById('not-eligible-modal'),
  neModalDesc:  document.getElementById('not-eligible-desc'),
  btnNeModalOk: document.getElementById('btn-not-eligible-ok'),

  candidateCorner:     document.getElementById('candidate-corner'),
  candidateCornerName: document.getElementById('candidate-corner-name'),
  candidateCornerRef:  document.getElementById('candidate-corner-ref'),

  bigStopwatch:   document.getElementById('big-stopwatch'),
  driveLink:      document.getElementById('drive-link'),
  btnSubmitEarly: document.getElementById('btn-submit-early'),
  confirmMessage: document.getElementById('confirm-message')
};

const state = {
  candidate: {},
  timerRef: null,
  submitted: false
};

// ── Rules Modal ───────────────────────────────────────────────────
DOM.btnRulesUnderstood.addEventListener('click', function() {
  DOM.rulesModal.classList.remove('open');
});

// ── Not Eligible Modal ──────────────────────────────────────────
function showNotEligibleModal(msg) {
  DOM.neModalDesc.textContent = msg;
  DOM.neModal.classList.add('open');
}
DOM.btnNeModalOk.addEventListener('click', function() {
  DOM.neModal.classList.remove('open');
});
DOM.neModal.addEventListener('click', function(e) {
  if (e.target === DOM.neModal) DOM.neModal.classList.remove('open');
});

function setRefIdError(msg) {
  DOM.formRefId.classList.toggle('error', !!msg);
  DOM.formRefId.classList.remove('success');
  DOM.errRefId.textContent = msg || '';
  DOM.errRefId.classList.toggle('show', !!msg);
}

function clearVerifiedCandidate() {
  state.candidate = {};
  DOM.candSummary.style.display = 'none';
  DOM.btnStart.disabled = true;
  DOM.formRefId.classList.remove('success');
}

DOM.formRefId.addEventListener('input', function() {
  clearVerifiedCandidate();
  DOM.neModal.classList.remove('open');
});

// ── Generic gviz select-query helper ────────────────────────────
function gvizFetch(sheetId, sheetTab, query, onSuccess, onFail) {
  const callbackName = 'idsGvizCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  let settled = false;

  const cleanup = function() {
    delete window[callbackName];
    const tag = document.getElementById(callbackName);
    if (tag) tag.remove();
    clearTimeout(timeoutRef);
  };

  const timeoutRef = setTimeout(function() {
    if (settled) return;
    settled = true;
    cleanup();
    onFail('Could not reach the verification service. Check your connection and try again.');
  }, 12000);

  window[callbackName] = function(response) {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      onSuccess(response.table.rows || []);
    } catch (err) {
      onFail('Something went wrong while verifying. Please try again.');
    }
  };

  const url =
    'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq' +
    '?sheet=' + encodeURIComponent(sheetTab) +
    '&tq=' + encodeURIComponent(query) +
    '&tqx=responseHandler:' + callbackName;

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = url;
  script.onerror = function() {
    if (settled) return;
    settled = true;
    cleanup();
    onFail('Could not verify right now. Please try again in a moment.');
  };
  document.body.appendChild(script);
}

// ── Verification Chain ──────────────────────────────────────────
// 1. Already-attempted? (Tool Test sheet, this RefID)
// 2. Passed General Assessment? (Recommendation Borderline+, Domain
//    Technical, Track matches this portal)
// 3. Passed Technical Assessment / Test 2? (Professional Assessment
//    sheet, Recommendation Borderline+, Domain Technical)
function verifyReferenceId() {
  const refId = DOM.formRefId.value.trim();
  setRefIdError('');
  clearVerifiedCandidate();

  if (!refId) {
    setRefIdError('Please enter your Reference ID.');
    return;
  }

  DOM.btnVerify.disabled = true;
  DOM.btnVerify.textContent = 'Verifying…';

  const finish = function(errMsg) {
    DOM.btnVerify.disabled = false;
    DOM.btnVerify.textContent = 'Verify';
    if (errMsg) {
      setRefIdError(errMsg);
      showNotEligibleModal(errMsg);
      if (autoVerifyFrozen) {
        DOM.formRefId.readOnly = false;
        DOM.btnVerify.style.display = '';
        autoVerifyFrozen = false;
      }
    }
  };

  const safeRefId = refId.replace(/'/g, "\\'");

  gvizFetch(
    GENERAL_SHEET_ID, TOOL_TEST_SHEET_TAB,
    "select B where B = '" + safeRefId + "'",
    function(ttRows) {
      if (ttRows.length > 0) {
        finish("You have already completed this assessment. Multiple attempts are not allowed.");
        return;
      }
      checkGeneralAssessment();
    },
    function(errMsg) { finish(errMsg); }
  );

  function checkGeneralAssessment() {
    gvizFetch(
      GENERAL_SHEET_ID, GENERAL_SHEET_TAB,
      "select B,C,K,M,N where B = '" + safeRefId + "'",
      function(gaRows) {
        if (gaRows.length === 0) { finish(NOT_ELIGIBLE_MSG); return; }
        const cells = gaRows[0].c;
        const name           = cells[1] && cells[1].v ? String(cells[1].v).trim() : '';
        const recommendation = cells[2] && cells[2].v ? String(cells[2].v).trim().toLowerCase() : '';
        const track           = cells[3] && cells[3].v ? String(cells[3].v).trim().toLowerCase() : '';
        const domain          = cells[4] && cells[4].v ? String(cells[4].v).trim().toLowerCase() : '';

        const eligible = ["borderline","hire","strong hire","exceptional","rejection overridden"];
        if (!name || eligible.indexOf(recommendation) === -1 || domain !== 'technical' || track !== PORTAL_TRACK.toLowerCase()) {
          finish(NOT_ELIGIBLE_MSG);
          return;
        }

        state.candidate.name = name;
        checkProfessionalAssessment();
      },
      function(errMsg) { finish(errMsg); }
    );
  }

  function checkProfessionalAssessment() {
    gvizFetch(
      GENERAL_SHEET_ID, PROFESSIONAL_SHEET_TAB,
      "select B,G,I where B = '" + safeRefId + "'",
      function(paRows) {
        if (paRows.length === 0) { finish(NOT_ELIGIBLE_MSG); return; }
        const cells = paRows[0].c;
        const domain = cells[1] && cells[1].v ? String(cells[1].v).trim().toLowerCase() : '';
        const rating = cells[2] && cells[2].v ? String(cells[2].v).trim().toLowerCase() : '';

        const passing = ["borderline","hire","strong hire","exceptional"];
        if (domain !== 'technical' || passing.indexOf(rating) === -1) {
          finish(NOT_ELIGIBLE_MSG);
          return;
        }

        state.candidate.refId = refId;
        DOM.summaryName.textContent   = state.candidate.name;
        DOM.candSummary.style.display = 'block';
        DOM.formRefId.classList.add('success');
        DOM.btnStart.disabled = false;
        finish(null);
      },
      function(errMsg) { finish(errMsg); }
    );
  }
}

DOM.btnVerify.addEventListener('click', verifyReferenceId);
DOM.formRefId.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); verifyReferenceId(); }
});

// ── Candidate Identity Corner (auto-verify from Assessment-list) ──
let autoVerifyFrozen = false;

(function initCandidateCorner() {
  const params = new URLSearchParams(window.location.search);
  const urlRefId = (params.get('ref')  || '').trim();
  const urlName  = (params.get('name') || '').trim();

  if (urlRefId && urlName) {
    DOM.candidateCornerName.textContent = urlName;
    DOM.candidateCornerRef.textContent  = urlRefId;
    DOM.candidateCorner.style.display = 'flex';
  }

  if (urlRefId && DOM.formRefId) {
    DOM.formRefId.value = urlRefId;
    DOM.formRefId.readOnly = true;
    DOM.btnVerify.style.display = 'none';
    autoVerifyFrozen = true;
    window.addEventListener('DOMContentLoaded', function() { verifyReferenceId(); });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      verifyReferenceId();
    }
  }
})();

// ── Begin Tool Test ───────────────────────────────────────────────
DOM.btnStart.addEventListener('click', function() {
  if (!state.candidate || !state.candidate.name) return;

  DOM.driveLink.href = DRIVE_FOLDER_URL;
  DOM.regSection.style.display = 'none';
  DOM.assSection.style.display = 'block';

  const startTime = Date.now();
  localStorage.setItem('ids_tooltest_start', String(startTime));
  state.startTime = startTime;

  startCountdown();
});

// ── Countdown (resumable from localStorage if the page is refreshed) ──
function startCountdown() {
  const savedStart = parseInt(localStorage.getItem('ids_tooltest_start'), 10);
  const startTime = savedStart || state.startTime || Date.now();
  state.startTime = startTime;

  function tick() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, TEST_DURATION_SECONDS - elapsed);

    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    DOM.bigStopwatch.textContent = h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

    DOM.bigStopwatch.classList.toggle('warning', remaining <= 600 && remaining > 120);
    DOM.bigStopwatch.classList.toggle('danger', remaining <= 120);

    if (remaining <= 0) {
      clearInterval(state.timerRef);
      finaliseSubmission('Auto-Submitted after 2 hours');
    }
  }

  tick();
  state.timerRef = setInterval(tick, 1000);
}

// If a session was already in progress (page refreshed mid-test),
// resume it automatically rather than losing progress.
(function resumeIfInProgress() {
  const savedStart = localStorage.getItem('ids_tooltest_start');
  if (savedStart && !state.submitted) {
    // Wait for verification to complete before resuming, since we
    // still need state.candidate populated for submission later.
    const checkReady = setInterval(function() {
      if (state.candidate && state.candidate.name) {
        clearInterval(checkReady);
        DOM.driveLink.href = DRIVE_FOLDER_URL;
        DOM.regSection.style.display = 'none';
        DOM.assSection.style.display = 'block';
        startCountdown();
      }
    }, 300);
  }
})();

DOM.btnSubmitEarly.addEventListener('click', function() {
  if (state.timerRef) clearInterval(state.timerRef);
  finaliseSubmission('Manually Submitted');
});

// ── Final Submission ─────────────────────────────────────────────
function finaliseSubmission(status) {
  if (state.submitted) return;
  state.submitted = true;
  if (state.timerRef) clearInterval(state.timerRef);

  const endTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const startTimeStr = state.startTime
    ? new Date(state.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : '';

  localStorage.removeItem('ids_tooltest_start');

  fetch(SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sheetName:  'Tool Test',
      referenceId: state.candidate.refId,
      name:        state.candidate.name,
      track:       PORTAL_TRACK,
      startTime:   startTimeStr,
      endTime:     endTime,
      status:      status
    })
  }).catch(function(err) { console.warn('[IDS] Tool Test submission error:', err); });

  DOM.assSection.style.display  = 'none';
  DOM.confSection.style.display = 'block';
}
