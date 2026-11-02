// NBFC Partner Portal · Executive Business Client Application
// Apple-Style Clean Architecture with Non-Development UX Writing

const DEFAULT_SAMPLE_PAYLOAD = {
  "event_type": "KYC_SUBMISSION",
  "user_details": {
    "phone_number": "9705334008",
    "user_id": "e0a5860a-462b-41c9-9e24-7daff87f1367",
    "country_code": "+91"
  },
  "co_applicant_details": {
    "name": "Kuna Kavitha",
    "age": 43,
    "state": "Telangana",
    "city": "Hyderabad",
    "relation": "Mother",
    "phone_number": "9381461252"
  },
  "cibil_details": {
    "cibil_score": 735,
    "cibil_score_range": "700 - 900"
  },
  "employment_details": {
    "employment_type": "SELF_EMPLOYED",
    "monthly_income": 45000,
    "occupation": "SHOP_OWNER"
  },
  "bank_details": {
    "bank_name": "OTHER"
  },
  "parameter_questions": {
    "is_pan_aadhaar_linked": true,
    "has_e_pan_or_physical_pan": true,
    "has_dob_mismatch": false,
    "has_name_mismatch": false,
    "has_door_number": true
  },
  "selected_emi_tenure": 36
};

let currentPartners = [];
let lastEvaluationId = null;

// Available options for interactive visual tag selectors in modal
const AVAILABLE_RELATIONS = [
  "Mother", "Father", "Sibling", "Spouse", "Grandfather", "Legal Guardian", "Blood relation", "Any relative"
];

const AVAILABLE_OCCUPATIONS = [
  { id: "POLITICIAN", label: "Politicians" },
  { id: "LAWYER", label: "Lawyers & Legal" },
  { id: "FREELANCER", label: "Freelancers" },
  { id: "HOUSEWIFE", label: "Homemakers" },
  { id: "STUDENT", label: "Students" },
  { id: "CHIT_FUND", label: "Chit Funds / Lottery" },
  { id: "MEDIA", label: "Film / Media / Celebrities" }
];

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadPartners();
  loadSettings();
  loadAuditLogs();
  initSimulator();
});

// Apple Segmented Tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.apple-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active-tab'));
      tab.classList.add('active-tab');

      const targetId = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const activeContent = document.getElementById(targetId);
      if (activeContent) {
        activeContent.classList.remove('hidden');
        if (targetId === 'tab-audit') loadAuditLogs();
      }
    });
  });
}

function getMonogramConfig(partnerId) {
  const id = partnerId.toLowerCase();
  if (id.includes('fibe')) return { char: 'F', cls: 'mono-fibe' };
  if (id.includes('gyan')) return { char: 'G', cls: 'mono-gyandhan' };
  if (id.includes('north')) return { char: 'N', cls: 'mono-northern' };
  if (id.includes('auxilo')) return { char: 'A', cls: 'mono-auxilo' };
  if (id.includes('techfino')) return { char: 'T', cls: 'mono-techfino' };
  if (id.includes('bajaj')) return { char: 'B', cls: 'mono-bajaj' };
  return { char: partnerId[0].toUpperCase(), cls: 'mono-fibe' };
}

// ---------------------------------------------------------------------------
// 1. PARTNER RULES & PRIORITISATION
// ---------------------------------------------------------------------------
async function loadPartners() {
  try {
    const res = await fetch('/api/v1/partners');
    const data = await res.json();
    currentPartners = data.partners || [];

    const activeCount = currentPartners.filter(p => p.is_active !== false).length;
    document.getElementById('stat-active-partners').textContent = `${activeCount} Lenders`;

    renderPartners(currentPartners);
  } catch (err) {
    console.error('Failed to load partners:', err);
    document.getElementById('partners-container').innerHTML = `
      <div class="col-span-2 p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
        Unable to load lending guidelines. Please ensure the local service is running.
      </div>
    `;
  }
}

function renderPartners(partners) {
  const container = document.getElementById('partners-container');
  if (!container) return;

  container.innerHTML = partners.map((p, index) => {
    const c = p.criteria || {};
    const isActive = p.is_active !== false;
    const mono = getMonogramConfig(p.id);

    return `
      <div class="apple-card p-6 flex flex-col justify-between space-y-4 fade-in ${!isActive ? 'opacity-60 bg-slate-50' : ''}" 
           id="partner-card-${p.id}" 
           draggable="true" 
           data-partner-id="${p.id}" 
           data-index="${index}">
        
        <!-- Header: Priority, Grip Handle, Title & Active Switch -->
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-3.5">
            <div class="drag-handle p-1 text-slate-300 hover:text-slate-600 rounded transition-colors" title="Drag to reorder priority rank">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"/>
              </svg>
            </div>
            
            <div class="lender-monogram ${mono.cls}">
              ${mono.char}
            </div>

            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-base font-bold text-slate-900 tracking-tight">${p.name}</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${index === 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600'}">
                  Priority #${p.priority || (index + 1)}
                </span>
                ${!isActive ? '<span class="apple-chip chip-neutral text-[10px]">Paused</span>' : ''}
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${p.description || 'Lending guidelines and eligibility configuration.'}</p>
            </div>
          </div>

          <!-- Priority Arrow Controls & Toggle Switch -->
          <div class="flex items-center space-x-2.5">
            <div class="flex flex-col space-y-0.5">
              <button onclick="changePriority('${p.id}', -1)" ${index === 0 ? 'disabled class="opacity-20"' : 'class="hover:text-blue-600 text-slate-400 text-xs font-bold"'} title="Move higher in routing order">▲</button>
              <button onclick="changePriority('${p.id}', 1)" ${index === partners.length - 1 ? 'disabled class="opacity-20"' : 'class="hover:text-blue-600 text-slate-400 text-xs font-bold"'} title="Move lower in routing order">▼</button>
            </div>
            
            <label class="apple-switch" title="Toggle active status">
              <input type="checkbox" ${isActive ? 'checked' : ''} onchange="togglePartnerStatus('${p.id}', this.checked)">
              <span class="apple-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- 3 Core Metrics Banner -->
        <div class="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
          <div>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Min Credit Score</span>
            <span class="font-extrabold text-slate-800 text-sm tabular-numbers">> ${c.cibil_min - 1}</span>
          </div>

          <div>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Min Monthly Income</span>
            <span class="font-extrabold text-slate-800 text-sm tabular-numbers">₹${(c.monthly_income_min || 0).toLocaleString('en-IN')}</span>
          </div>

          <div>
            <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Maximum Age</span>
            <span class="font-extrabold text-slate-800 text-sm tabular-numbers">≤ ${c.age_max} yrs</span>
          </div>
        </div>

        <!-- Plain English Policy Summary -->
        <div class="space-y-2 text-xs">
          <div class="flex items-start justify-between">
            <span class="text-slate-400 font-medium">Eligible Co-Applicants:</span>
            <span class="text-slate-800 font-semibold text-right max-w-[220px] truncate">${(c.allowed_relations || []).join(', ')}</span>
          </div>

          <div class="flex items-start justify-between">
            <span class="text-slate-400 font-medium">Excluded Careers:</span>
            <span class="text-slate-600 text-right max-w-[220px] truncate">${(c.rejected_occupations && c.rejected_occupations.length > 0) ? c.rejected_occupations.map(formatOccupation).join(', ') : 'None (All careers eligible)'}</span>
          </div>
        </div>

        <!-- Clean Verification Badges -->
        <div class="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          <span class="apple-chip ${c.non_nationalised_bank_accepted ? 'chip-blue' : 'chip-amber'}">
            ${c.non_nationalised_bank_accepted ? '✓ Accepts Co-op & Rural Banks' : '⚠ Nationalised Banks Only'}
          </span>
          <span class="apple-chip ${c.pan_aadhaar_linked_mandatory ? 'chip-neutral' : 'chip-blue'}">
            PAN-Aadhaar Link: ${c.pan_aadhaar_linked_mandatory ? 'Mandatory' : 'Optional'}
          </span>
          <span class="apple-chip ${!c.name_mismatch_allowed ? 'chip-neutral' : 'chip-success'}">
            Name Match: ${c.name_mismatch_allowed ? 'Flexible' : 'Strict Match'}
          </span>
          ${c.door_number_mandatory ? '<span class="apple-chip chip-amber">Door # Mandatory</span>' : ''}
        </div>

        <!-- Edit Guidelines Action -->
        <div class="pt-2 flex items-center justify-between border-t border-slate-100">
          <span class="text-[11px] text-slate-400">Drag card to change student priority</span>
          <button onclick="openEditModal('${p.id}')" class="apple-btn-secondary text-xs">
            Edit Guidelines
          </button>
        </div>

      </div>
    `;
  }).join('');

  attachDragAndDropListeners();
}

let draggedCardElement = null;

function attachDragAndDropListeners() {
  const cards = document.querySelectorAll('.apple-card[draggable="true"]');
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  draggedCardElement = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.partnerId);
  setTimeout(() => {
    this.classList.add('is-dragging');
  }, 0);
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter() {
  if (this !== draggedCardElement) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();

  this.classList.remove('drag-over');

  if (draggedCardElement !== this) {
    const fromIndex = parseInt(draggedCardElement.dataset.index, 10);
    const toIndex = parseInt(this.dataset.index, 10);

    const movedPartner = currentPartners.splice(fromIndex, 1)[0];
    currentPartners.splice(toIndex, 0, movedPartner);

    const newOrder = currentPartners.map(p => p.id);

    try {
      const res = await fetch('/api/v1/partners/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder })
      });
      if (res.ok) {
        showAppleToast('Priority updated successfully');
        loadPartners();
      }
    } catch (err) {
      alert('Unable to save new sequence: ' + err.message);
    }
  }

  return false;
}

function handleDragEnd() {
  this.classList.remove('is-dragging');
  document.querySelectorAll('.apple-card').forEach(c => c.classList.remove('drag-over'));
}

function showAppleToast(message) {
  let toast = document.getElementById('apple-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'apple-toast';
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-xl border border-black/10 flex items-center space-x-2 fade-in';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>✓</span><span>${message}</span>`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2400);
}

function formatOccupation(occ) {
  return occ.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function togglePartnerStatus(partnerId, newStatus) {
  try {
    const res = await fetch(`/api/v1/partners/${partnerId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newStatus })
    });
    if (res.ok) {
      showAppleToast(`Partner status ${newStatus ? 'activated' : 'paused'}`);
      loadPartners();
    }
  } catch (err) {
    alert('Unable to change partner status: ' + err.message);
  }
}

async function changePriority(partnerId, delta) {
  const currentIndex = currentPartners.findIndex(p => p.id === partnerId);
  if (currentIndex === -1) return;
  const targetIndex = currentIndex + delta;
  if (targetIndex < 0 || targetIndex >= currentPartners.length) return;

  const temp = currentPartners[currentIndex];
  currentPartners[currentIndex] = currentPartners[targetIndex];
  currentPartners[targetIndex] = temp;

  const newOrder = currentPartners.map(p => p.id);

  try {
    const res = await fetch('/api/v1/partners/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrder })
    });
    if (res.ok) {
      showAppleToast('Priority order adjusted');
      loadPartners();
    }
  } catch (err) {
    alert('Unable to update priority: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// 2. EDIT MODAL WITH INTERACTIVE TAG PILLS
// ---------------------------------------------------------------------------
function openEditModal(partnerId) {
  const partner = currentPartners.find(p => p.id === partnerId);
  if (!partner) return;

  const c = partner.criteria || {};
  document.getElementById('edit-partner-id').value = partner.id;
  document.getElementById('modal-partner-name').textContent = `Edit Guidelines: ${partner.name}`;

  document.getElementById('edit-cibil').value = c.cibil_min || 650;
  document.getElementById('edit-income').value = c.monthly_income_min || 15000;
  document.getElementById('edit-age').value = c.age_max || 58;

  // Render interactive relation tags
  const selectedRelations = (c.allowed_relations || []).map(r => r.toLowerCase());
  const relContainer = document.getElementById('edit-relations-tags');
  relContainer.innerHTML = AVAILABLE_RELATIONS.map(rel => {
    const isSelected = selectedRelations.some(sr => sr.includes(rel.toLowerCase()));
    return `
      <span class="tag-pill ${isSelected ? 'active' : ''}" data-rel="${rel}" onclick="toggleTagPill(this, 'edit-relations')">
        ${rel}
      </span>
    `;
  }).join('');
  updateHiddenTagValue('edit-relations-tags', 'edit-relations', 'data-rel');

  // Render interactive occupation tags
  const selectedOccs = (c.rejected_occupations || []).map(o => o.toUpperCase());
  const occContainer = document.getElementById('edit-occupations-tags');
  occContainer.innerHTML = AVAILABLE_OCCUPATIONS.map(occ => {
    const isSelected = selectedOccs.includes(occ.id);
    return `
      <span class="tag-pill tag-pill-danger ${isSelected ? 'active' : ''}" data-occ="${occ.id}" onclick="toggleTagPill(this, 'edit-occupations')">
        ${occ.label}
      </span>
    `;
  }).join('');
  updateHiddenTagValue('edit-occupations-tags', 'edit-occupations', 'data-occ');

  document.getElementById('edit-pan-linked').checked = Boolean(c.pan_aadhaar_linked_mandatory);
  document.getElementById('edit-pan-avail').checked = Boolean(c.pan_card_mandatory);
  document.getElementById('edit-coop-bank').checked = Boolean(c.non_nationalised_bank_accepted);
  document.getElementById('edit-dob-mismatch').checked = Boolean(c.dob_mismatch_allowed);
  document.getElementById('edit-name-mismatch').checked = Boolean(c.name_mismatch_allowed);
  document.getElementById('edit-door-num').checked = Boolean(c.door_number_mandatory);
  document.getElementById('edit-regions').value = (c.rejected_regions || []).join(', ');

  document.getElementById('edit-modal').classList.remove('hidden');
}

function toggleTagPill(el, hiddenInputId) {
  el.classList.toggle('active');
  const parentId = el.parentElement.id;
  const attr = el.hasAttribute('data-rel') ? 'data-rel' : 'data-occ';
  updateHiddenTagValue(parentId, hiddenInputId, attr);
}

function updateHiddenTagValue(containerId, hiddenInputId, attr) {
  const container = document.getElementById(containerId);
  const activeTags = Array.from(container.querySelectorAll('.tag-pill.active')).map(t => t.getAttribute(attr));
  document.getElementById(hiddenInputId).value = activeTags.join(', ');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

document.getElementById('btn-close-modal')?.addEventListener('click', closeEditModal);
document.getElementById('btn-cancel-modal')?.addEventListener('click', closeEditModal);

document.getElementById('edit-partner-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const partnerId = document.getElementById('edit-partner-id').value;

  const rawRelations = document.getElementById('edit-relations').value;
  const rawOccs = document.getElementById('edit-occupations').value;
  const rawRegions = document.getElementById('edit-regions').value;

  const updatedCriteria = {
    cibil_min: parseInt(document.getElementById('edit-cibil').value, 10),
    monthly_income_min: parseFloat(document.getElementById('edit-income').value),
    age_max: parseInt(document.getElementById('edit-age').value, 10),
    allowed_relations: rawRelations.split(',').map(s => s.trim()).filter(Boolean),
    rejected_occupations: rawOccs.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
    pan_aadhaar_linked_mandatory: document.getElementById('edit-pan-linked').checked,
    pan_card_mandatory: document.getElementById('edit-pan-avail').checked,
    non_nationalised_bank_accepted: document.getElementById('edit-coop-bank').checked,
    dob_mismatch_allowed: document.getElementById('edit-dob-mismatch').checked,
    name_mismatch_allowed: document.getElementById('edit-name-mismatch').checked,
    door_number_mandatory: document.getElementById('edit-door-num').checked,
    rejected_regions: rawRegions.split(',').map(s => s.trim()).filter(Boolean)
  };

  try {
    const res = await fetch(`/api/v1/partners/${partnerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: updatedCriteria })
    });
    if (res.ok) {
      closeEditModal();
      showAppleToast('Lending guidelines saved');
      loadPartners();
    }
  } catch (err) {
    alert('Failed to save guidelines: ' + err.message);
  }
});

// ---------------------------------------------------------------------------
// 3. APPLICANT ELIGIBILITY CHECKER (SIMULATOR)
// ---------------------------------------------------------------------------
function initSimulator() {
  document.getElementById('btn-reset-sample')?.addEventListener('click', resetToSampleApplicant);
  document.getElementById('btn-run-simulation')?.addEventListener('click', runSimulation);
  document.getElementById('btn-submit-selection')?.addEventListener('click', submitSimulatedSelection);
}

function resetToSampleApplicant() {
  document.getElementById('sim-input-name').value = 'Kuna Kavitha';
  document.getElementById('sim-input-relation').value = 'Mother';
  document.getElementById('sim-input-age').value = 43;
  document.getElementById('sim-input-cibil').value = 735;
  document.getElementById('sim-input-income').value = 45000;
  document.getElementById('sim-input-occupation').value = 'SHOP_OWNER';
  document.getElementById('sim-input-state').value = 'Telangana';
  document.getElementById('sim-input-bank-type').value = 'OTHER';

  document.getElementById('sim-q-pan-aadhaar').checked = true;
  document.getElementById('sim-q-pan-avail').checked = true;
  document.getElementById('sim-q-dob-match').checked = true;
  document.getElementById('sim-q-name-match').checked = true;
  document.getElementById('sim-q-door-num').checked = true;
  showAppleToast('Loaded sample profile (Kavitha)');
}

async function runSimulation() {
  const payload = {
    event_type: "KYC_SUBMISSION",
    co_applicant_details: {
      name: document.getElementById('sim-input-name').value,
      relation: document.getElementById('sim-input-relation').value,
      age: parseInt(document.getElementById('sim-input-age').value, 10),
      state: document.getElementById('sim-input-state').value
    },
    cibil_details: {
      cibil_score: parseInt(document.getElementById('sim-input-cibil').value, 10),
      cibil_score_range: "700 - 900"
    },
    employment_details: {
      monthly_income: parseFloat(document.getElementById('sim-input-income').value),
      occupation: document.getElementById('sim-input-occupation').value
    },
    bank_details: {
      bank_name: document.getElementById('sim-input-bank-type').value
    },
    parameter_questions: {
      is_pan_aadhaar_linked: document.getElementById('sim-q-pan-aadhaar').checked,
      has_e_pan_or_physical_pan: document.getElementById('sim-q-pan-avail').checked,
      has_dob_mismatch: !document.getElementById('sim-q-dob-match').checked,
      has_name_mismatch: !document.getElementById('sim-q-name-match').checked,
      has_door_number: document.getElementById('sim-q-door-num').checked
    }
  };

  try {
    const res = await fetch('/api/v1/eligibility/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    renderSimulationResult(result);
  } catch (err) {
    alert('Evaluation failed: ' + err.message);
  }
}

function renderSimulationResult(result) {
  lastEvaluationId = result.evaluation_id || result.user_applicant_id;
  const applicantName = document.getElementById('sim-input-name').value || 'Applicant';
  document.getElementById('sim-eval-id').textContent = `Assessment for ${applicantName} · Complete`;

  const eligibleCount = result.overall_summary ? result.overall_summary.preliminarily_eligible_count : (result.eligible_nbfcs ? result.eligible_nbfcs.length : 0);
  const conditionalCount = result.overall_summary ? result.overall_summary.conditional_count : (result.conditional_nbfcs ? result.conditional_nbfcs.length : 0);
  const ineligibleCount = result.overall_summary ? result.overall_summary.ineligible_count : (result.ineligible_nbfcs ? result.ineligible_nbfcs.length : 0);

  const badges = document.getElementById('sim-badges');
  badges.innerHTML = `
    <span class="apple-chip chip-success text-xs">
      ${eligibleCount} Approved
    </span>
    ${conditionalCount > 0 ? `
      <span class="apple-chip chip-amber text-xs">
        ${conditionalCount} Needs Review
      </span>
    ` : ''}
    <span class="apple-chip chip-neutral text-xs">
      ${ineligibleCount} Ineligible
    </span>
  `;

  const container = document.getElementById('sim-results-container');
  let html = '';

  const rec = result.recommendation;
  const eligibleLenders = result.eligible_nbfcs || [];
  const conditionalLenders = result.conditional_nbfcs || [];
  const ineligibleLenders = result.ineligible_nbfcs || [];
  const nextAct = result.next_action;

  // =========================================================================
  // 1. TOP SPOTLIGHT RECOMMENDATION CARD
  // =========================================================================
  if (rec && rec.recommended_nbfc) {
    html += `
      <div class="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-slate-50 border border-blue-200/90 shadow-xs space-y-3 fade-in">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-600 text-white shadow-xs flex items-center space-x-1">
              <span>★</span>
              <span>Best Match Recommended</span>
            </span>
            ${rec.match_score ? `
              <span class="text-xs font-bold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-md">
                ${rec.match_score}% Match Score
              </span>
            ` : ''}
          </div>
          <span class="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Pre-Approved
          </span>
        </div>

        <div>
          <h3 class="text-lg font-extrabold text-slate-900 tracking-tight">${rec.recommended_nbfc}</h3>
          <p class="text-xs text-slate-600 mt-1 leading-relaxed font-normal">${rec.reason}</p>
        </div>

        <div class="pt-2 border-t border-blue-100 flex items-center justify-between text-xs">
          <span class="text-slate-500 font-medium">Fast-track digital sanction available</span>
          <button onclick="selectRecommendedPartner('${rec.recommended_nbfc.toLowerCase()}')" class="apple-btn-primary py-1.5 px-4 text-xs font-semibold">
            Choose ${rec.recommended_nbfc}
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. ELIGIBLE LENDING PARTNERS
  // =========================================================================
  if (eligibleLenders.length > 0) {
    html += `
      <div class="space-y-3 pt-2">
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
          <span class="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
          Approved Lending Partners (${eligibleLenders.length})
        </h4>
        <div class="space-y-2.5">
    `;

    eligibleLenders.forEach((n, idx) => {
      const isTop = rec && (rec.recommended_nbfc === n.nbfc_code || rec.recommended_nbfc === n.partner_name);
      html += `
        <div class="p-4 rounded-xl ${isTop ? 'bg-blue-50/30 border-blue-200' : 'bg-white border-slate-200'} border flex flex-col space-y-2.5 fade-in stagger-${Math.min(idx + 1, 4)}">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-slate-100 border border-slate-200 text-slate-700 tabular-numbers">
                #${n.rank || idx + 1}
              </span>
              <span class="text-sm font-bold text-slate-900">${n.partner_name || n.nbfc_code}</span>
              ${isTop ? '<span class="apple-chip chip-blue text-[10px]">Top Pick</span>' : ''}
            </div>
            <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              ${n.match_score}% Match
            </span>
          </div>

          <div class="text-[11px] text-slate-600 flex flex-wrap gap-1.5">
            <span class="px-2 py-0.5 rounded-md bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-[10px] font-medium">✓ Credit Score Buffer</span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-[10px] font-medium">✓ Income Verified</span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-[10px] font-medium">✓ Approved Relationship</span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-[10px] font-medium">✓ Identity Match</span>
          </div>

          ${n.suggestion ? `
            <div class="text-[11px] text-slate-500 italic">
              💡 ${n.suggestion}
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `</div></div>`;
  }

  // =========================================================================
  // 3. CONDITIONAL NBFCs (ADDITIONAL DOCS OR EXACT SCORE REQUIRED)
  // =========================================================================
  if (conditionalLenders.length > 0) {
    html += `
      <div class="space-y-3 pt-2">
        <h4 class="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center">
          <span class="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
          Conditional Approvals (${conditionalLenders.length})
        </h4>
        <div class="space-y-2">
    `;

    conditionalLenders.forEach((n) => {
      html += `
        <div class="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-900">${n.partner_name || n.nbfc_code}</span>
            <span class="apple-chip chip-amber text-[10px]">Action Required</span>
          </div>

          ${n.missing_requirements && n.missing_requirements.length > 0 ? `
            <div class="text-[11px] text-slate-700">
              <span class="font-semibold text-amber-900">Required:</span> ${n.missing_requirements.join(', ')}
            </div>
          ` : ''}

          ${n.suggestion ? `
            <div class="text-[11px] text-amber-800 font-medium">
              👉 ${n.suggestion}
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `</div></div>`;
  }

  // =========================================================================
  // 4. INELIGIBLE NBFCs
  // =========================================================================
  if (ineligibleLenders.length > 0) {
    html += `
      <div class="space-y-3 pt-3 border-t border-slate-100">
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
          <span class="w-2 h-2 rounded-full bg-slate-300 mr-2"></span>
          Outside Guidelines (${ineligibleLenders.length})
        </h4>
        <div class="space-y-2">
    `;

    ineligibleLenders.forEach(n => {
      html += `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-800">${n.partner_name || n.nbfc_code}</span>
            <span class="text-[10px] text-slate-500 font-semibold">Declined by Policy</span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">
            ${translateFailureReason(n.reason_detail || (n.failures && n.failures[0]) || 'Applicant does not satisfy lender cutoffs.')}
          </p>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Setup Student Choice Dropdown
  const selectionBox = document.getElementById('sim-selection-box');
  const dropdown = document.getElementById('sim-dropdown-nbfc');
  if (eligibleLenders.length > 0) {
    selectionBox.classList.remove('hidden');
    dropdown.innerHTML = eligibleLenders.map((n, idx) => `
      <option value="${n.partner_id || n.nbfc_code.toLowerCase()}">${n.partner_name || n.nbfc_code} (Rank #${idx + 1})</option>
    `).join('');
  } else {
    selectionBox.classList.add('hidden');
  }
}

function selectRecommendedPartner(partnerId) {
  const dropdown = document.getElementById('sim-dropdown-nbfc');
  if (dropdown) {
    dropdown.value = partnerId;
    submitSimulatedSelection();
  }
}

async function submitSimulatedSelection() {
  const dropdown = document.getElementById('sim-dropdown-nbfc');
  const selectedPartnerId = dropdown.value;
  const resultDiv = document.getElementById('sim-selection-result');

  resultDiv.innerHTML = '<span class="text-slate-500">Submitting selection...</span>';

  try {
    const res = await fetch('/api/v1/eligibility/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evaluation_id: lastEvaluationId,
        selected_partner_id: selectedPartnerId,
        user_id: 'e0a5860a-462b-41c9-9e24-7daff87f1367'
      })
    });

    const data = await res.json();
    if (res.ok) {
      resultDiv.innerHTML = `
        <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium mt-2">
          ✓ ${data.message}
        </div>
      `;
      showAppleToast('Assigned to student application');
    } else {
      resultDiv.innerHTML = `<span class="text-rose-600">${data.error}</span>`;
    }
  } catch (err) {
    resultDiv.innerHTML = `<span class="text-rose-600">Failed to sync: ${err.message}</span>`;
  }
}

// Converts raw technical failure messages into friendly business English
function translateFailureReason(reason) {
  if (reason.includes("Non-nationalised") || reason.includes("co-operative") || reason.includes("OTHER")) {
    return "Requires a nationalised bank account (SBI, HDFC, ICICI, etc.) for auto-debit. Co-operative or small banks are not accepted by this lender.";
  }
  if (reason.includes("CIBIL score") || reason.includes("CIBIL_BELOW")) {
    return "Credit score is below this partner's required minimum cutoff.";
  }
  if (reason.includes("Monthly Income") || reason.includes("MINIMUM_INCOME")) {
    return "Monthly family income is below this partner's minimum requirement.";
  }
  if (reason.includes("Age") || reason.includes("AGE_EXCEEDS")) {
    return "Co-applicant age exceeds the maximum age limit permitted by this lender.";
  }
  if (reason.includes("DOB mismatch")) {
    return "Date of birth discrepancy detected between PAN and Aadhaar documents.";
  }
  if (reason.includes("Name mismatch")) {
    return "Name spelling discrepancy detected between PAN and Aadhaar documents.";
  }
  if (reason.includes("PAN and Aadhaar linking")) {
    return "PAN and Aadhaar must be officially linked on the government portal.";
  }
  if (reason.includes("Door Number") || reason.includes("Door number")) {
    return "Physical street or door number is mandatory on the address document.";
  }
  if (reason.includes("Occupation")) {
    return "Applicant's profession is on this lender's negative list.";
  }
  if (reason.includes("State")) {
    return "Lender does not currently disburse in this state or territory.";
  }
  return reason;
}

// ---------------------------------------------------------------------------
// 4. SYSTEM PREFERENCES & AUDIT TRAIL
// ---------------------------------------------------------------------------
async function loadSettings() {
  try {
    const res = await fetch('/api/v1/settings');
    const data = await res.json();
    if (data.cibil_bracket_policy) {
      document.getElementById('set-cibil-policy').value = data.cibil_bracket_policy;
    }
    if (data.default_tenure_months) {
      document.getElementById('set-tenure').value = data.default_tenure_months;
    }
    if (data.salesforce_webhook_endpoint) {
      document.getElementById('set-webhook').value = data.salesforce_webhook_endpoint;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const policy = document.getElementById('set-cibil-policy').value;
  const tenure = parseInt(document.getElementById('set-tenure').value, 10);
  const webhook = document.getElementById('set-webhook').value;

  try {
    const res = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cibil_bracket_policy: policy,
        default_tenure_months: tenure,
        salesforce_webhook_endpoint: webhook
      })
    });
    if (res.ok) {
      const statusEl = document.getElementById('settings-save-status');
      statusEl.textContent = '✓ Preferences saved successfully';
      showAppleToast('Preferences updated');
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  } catch (err) {
    alert('Failed to save preferences: ' + err.message);
  }
});

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/v1/audit');
    const logs = await res.json();
    const tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">No recent activity recorded</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.slice(0, 15).map(log => {
      const dateStr = new Date(log.timestamp).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      return `
        <tr class="hover:bg-slate-50/60 transition-colors">
          <td class="py-3 px-5 text-slate-600 tabular-numbers">${dateStr}</td>
          <td class="py-3 px-5 font-semibold text-slate-900">${log.user || 'Team Member'}</td>
          <td class="py-3 px-5">
            <span class="apple-chip chip-neutral text-[10px] uppercase font-bold">${log.action}</span>
          </td>
          <td class="py-3 px-5 text-slate-600">${log.description || '-'}</td>
          <td class="py-3 px-5 font-mono text-[11px] text-slate-500">${log.version || 'v1.1.0'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}
