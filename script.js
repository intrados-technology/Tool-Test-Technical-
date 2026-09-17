/* ============================================================
   INTRADOS DESIGNS — Round 3: Tool Test (Unified — Freshers & Experienced)
   script.js
   ============================================================ */

'use strict';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxteJu1b_okEFYv4jbSF4Ne55bOfBsyIiIx3tnAVHq833I1f7c7aGcn7VVck--VI_a8tg/exec";
const GENERAL_SHEET_ID       = '1Ep0ESBJb-QxzBfN2oxIAH0RFJOPvCsNb4NpvmyWOfDA';
const GENERAL_SHEET_TAB      = "General Assessment";
const PROFESSIONAL_SHEET_TAB = "Professional Assessment";
const TOOL_TEST_SHEET_TAB    = "Tool Test";

// This portal serves BOTH Fresher and Experienced Technical candidates
// (no separate track-specific page) — Experience Level is shown for
// information only, not used to gate access.
const NOT_ELIGIBLE_MSG = "You are not eligible for this test.";

// Discipline-specific Drive folders — same for both Fresher and
// Experienced tracks. Candidate picks their Discipline on the
// verification screen, which determines which link they get.
const DRIVE_FOLDER_URLS = {
  ACS: "https://drive.google.com/drive/folders/1Zi11oBeYR_kXE8ss86t2QzqIHw9a91qk?usp=drive_link",
  MEP: "https://drive.google.com/drive/folders/1VwK1A47UYlAbmqcyvX-vVsPwoBrvWUep?usp=drive_link"
};

const TEST_DURATION_SECONDS = 2 * 60 * 60 + 15 * 60; // 2 hours 15 minutes

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
  summaryName:       document.getElementById('summary-name'),
  summaryPosition:   document.getElementById('summary-position'),
  summaryDomain:     document.getElementById('summary-domain'),
  summaryExperience: document.getElementById('summary-experience'),
  disciplineGroup:   document.getElementById('discipline-group'),
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
  DOM.disciplineGroup.style.display = 'none';
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
      "select B,C,F,K,M,N where B = '" + safeRefId + "'",
      function(gaRows) {
        if (gaRows.length === 0) { finish(NOT_ELIGIBLE_MSG); return; }
        const cells = gaRows[0].c;
        const name           = cells[1] && cells[1].v ? String(cells[1].v).trim() : '';
        const position        = cells[2] && cells[2].v ? String(cells[2].v).trim() : '';
        const recommendation = cells[3] && cells[3].v ? String(cells[3].v).trim().toLowerCase() : '';
        const track           = cells[4] && cells[4].v ? String(cells[4].v).trim() : '';
        const domain          = cells[5] && cells[5].v ? String(cells[5].v).trim() : '';

        const eligible = ["borderline","hire","strong hire","exceptional","rejection overridden"];
        if (!name || eligible.indexOf(recommendation) === -1 || domain.toLowerCase() !== 'technical') {
          finish(NOT_ELIGIBLE_MSG);
          return;
        }

        state.candidate.name     = name;
        state.candidate.position = position;
        state.candidate.domain   = domain;
        state.candidate.track    = track;
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
        DOM.summaryName.textContent       = state.candidate.name;
        DOM.summaryPosition.textContent   = state.candidate.position || '—';
        DOM.summaryDomain.textContent     = state.candidate.domain || '—';
        DOM.summaryExperience.textContent = state.candidate.track || '—';
        DOM.candSummary.style.display = 'block';
        DOM.disciplineGroup.style.display = 'block';
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
const DOM_discipline = document.getElementById('field-discipline');
const DOM_disciplineErr = document.getElementById('err-discipline');

DOM.btnStart.addEventListener('click', function() {
  if (!state.candidate || !state.candidate.name) return;

  const discipline = DOM_discipline.value;
  if (!discipline) {
    DOM_disciplineErr.textContent = 'Please select your Discipline.';
    DOM_disciplineErr.classList.add('show');
    DOM_discipline.classList.add('error');
    return;
  }
  DOM_disciplineErr.classList.remove('show');
  DOM_discipline.classList.remove('error');

  DOM.driveLink.href = DRIVE_FOLDER_URLS[discipline];
  localStorage.setItem('ids_tooltest_discipline', discipline);
  localStorage.setItem('ids_tooltest_refid', state.candidate.refId);

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
      finaliseSubmission('Auto-Submitted after 2h 15m');
    }
  }

  tick();
  state.timerRef = setInterval(tick, 1000);
}

// If a session was already in progress (page refreshed mid-test),
// resume it automatically — but ONLY if it belongs to the SAME
// candidate currently being verified. A stray localStorage flag left
// over from an earlier/different candidate's session on this same
// browser must never hijack a new candidate's verification.
(function resumeIfInProgress() {
  const savedStart = localStorage.getItem('ids_tooltest_start');
  const savedDiscipline = localStorage.getItem('ids_tooltest_discipline');
  const savedRefId = localStorage.getItem('ids_tooltest_refid');
  if (!savedStart) return;

  let attempts = 0;
  const checkReady = setInterval(function() {
    attempts++;
    if (state.submitted || attempts > 200) { clearInterval(checkReady); return; } // ~60s cap
    if (state.candidate && state.candidate.name && state.candidate.refId) {
      clearInterval(checkReady);

      if (state.candidate.refId !== savedRefId) {
        // Stale session belonging to a different candidate — discard
        // it rather than resuming into someone else's test.
        localStorage.removeItem('ids_tooltest_start');
        localStorage.removeItem('ids_tooltest_discipline');
        localStorage.removeItem('ids_tooltest_refid');
        return;
      }

      DOM.driveLink.href = DRIVE_FOLDER_URLS[savedDiscipline] || DRIVE_FOLDER_URLS.ACS;
      DOM.regSection.style.display = 'none';
      DOM.assSection.style.display = 'block';
      startCountdown();
    }
  }, 300);
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
  localStorage.removeItem('ids_tooltest_discipline');
  localStorage.removeItem('ids_tooltest_refid');

  fetch(SCRIPT_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sheetName:  'Tool Test',
      referenceId: state.candidate.refId,
      name:        state.candidate.name,
      track:       state.candidate.track,
      startTime:   startTimeStr,
      endTime:     endTime,
      status:      status
    })
  }).catch(function(err) { console.warn('[IDS] Tool Test submission error:', err); });

  const subjectLine = 'Technical_' + state.candidate.track + '_Tool Test_' + state.candidate.name;
  document.getElementById('confirm-subject').textContent = subjectLine;

  DOM.assSection.style.display  = 'none';
  DOM.confSection.style.display = 'block';
}

// ── Copy-to-clipboard buttons on the confirmation screen ─────────
function wireCopyButton(btnId, sourceId) {
  const btn = document.getElementById(btnId);
  const source = document.getElementById(sourceId);
  btn.addEventListener('click', function() {
    navigator.clipboard.writeText(source.textContent).then(function() {
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1800);
    }).catch(function() {
      // Clipboard API unavailable/blocked — fall back to manual select
      const range = document.createRange();
      range.selectNodeContents(source);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  });
}
wireCopyButton('btn-copy-email', 'confirm-email');
wireCopyButton('btn-copy-subject', 'confirm-subject');
