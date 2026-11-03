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
  initPayloadManager();
});

// Apple Segmented Tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.apple-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      tabs.forEach(t => {
        if (t.dataset.tab === targetId) {
          t.classList.add('active-tab');
        } else {
          t.classList.remove('active-tab');
        }
      });

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const activeContent = document.getElementById(targetId);
      if (activeContent) {
        activeContent.classList.remove('hidden');
        if (targetId === 'tab-audit') loadAuditLogs();
        if (targetId === 'tab-payloads') loadPayloadConfiguration();
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
// ONBOARD NEW NBFC LENDING PARTNER
// ---------------------------------------------------------------------------
function openAddPartnerModal() {
  const modal = document.getElementById('modal-add-partner');
  if (!modal) return;

  document.getElementById('add-partner-form')?.reset();
  const nextPriority = (currentPartners.length || 0) + 1;
  const priorityInput = document.getElementById('add-partner-priority');
  if (priorityInput) priorityInput.value = nextPriority;

  // Render relation tags with default selections
  const defaultRelations = ["Mother", "Father", "Spouse", "Sibling", "Grandfather", "Any relative", "Blood relation"];
  const relContainer = document.getElementById('add-partner-relations-tags');
  if (relContainer) {
    relContainer.innerHTML = AVAILABLE_RELATIONS.map(rel => {
      const isSelected = defaultRelations.some(dr => dr.toLowerCase() === rel.toLowerCase());
      return `
        <span class="tag-pill ${isSelected ? 'active' : ''}" data-rel="${rel}" onclick="toggleTagPill(this, 'add-partner-relations')">
          ${rel}
        </span>
      `;
    }).join('');
    updateHiddenTagValue('add-partner-relations-tags', 'add-partner-relations', 'data-rel');
  }

  // Render occupation tags with default exclusions
  const defaultOccs = ["POLITICIAN", "FREELANCER"];
  const occContainer = document.getElementById('add-partner-occupations-tags');
  if (occContainer) {
    occContainer.innerHTML = AVAILABLE_OCCUPATIONS.map(occ => {
      const isSelected = defaultOccs.includes(occ.id);
      return `
        <span class="tag-pill tag-pill-danger ${isSelected ? 'active' : ''}" data-occ="${occ.id}" onclick="toggleTagPill(this, 'add-partner-occupations')">
          ${occ.label}
        </span>
      `;
    }).join('');
    updateHiddenTagValue('add-partner-occupations-tags', 'add-partner-occupations', 'data-occ');
  }

  modal.classList.remove('hidden');
}

function closeAddPartnerModal() {
  const modal = document.getElementById('modal-add-partner');
  if (modal) modal.classList.add('hidden');
}

document.getElementById('btn-open-add-partner-modal')?.addEventListener('click', openAddPartnerModal);
document.getElementById('btn-close-add-partner-modal')?.addEventListener('click', closeAddPartnerModal);
document.getElementById('btn-cancel-add-partner-modal')?.addEventListener('click', closeAddPartnerModal);

document.getElementById('add-partner-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('add-partner-name').value.trim();
  const code = document.getElementById('add-partner-code').value.trim();
  const priority = document.getElementById('add-partner-priority').value;
  const desc = document.getElementById('add-partner-desc').value.trim();

  const rawRelations = document.getElementById('add-partner-relations').value;
  const rawOccs = document.getElementById('add-partner-occupations').value;
  const rawRegions = document.getElementById('add-partner-regions').value;

  const partnerPayload = {
    name: name,
    code: code || undefined,
    priority: priority ? parseInt(priority, 10) : undefined,
    description: desc || undefined,
    criteria: {
      cibil_min: parseInt(document.getElementById('add-partner-cibil').value, 10),
      monthly_income_min: parseFloat(document.getElementById('add-partner-income').value),
      age_max: parseInt(document.getElementById('add-partner-age').value, 10),
      allowed_relations: rawRelations.split(',').map(s => s.trim()).filter(Boolean),
      rejected_occupations: rawOccs.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      pan_aadhaar_linked_mandatory: document.getElementById('add-partner-pan-linked').checked,
      pan_card_mandatory: document.getElementById('add-partner-pan-avail').checked,
      non_nationalised_bank_accepted: document.getElementById('add-partner-coop-bank').checked,
      dob_mismatch_allowed: document.getElementById('add-partner-dob-mismatch').checked,
      name_mismatch_allowed: document.getElementById('add-partner-name-mismatch').checked,
      door_number_mandatory: document.getElementById('add-partner-door-num').checked,
      rejected_regions: rawRegions.split(',').map(s => s.trim()).filter(Boolean)
    }
  };

  try {
    const res = await fetch('/api/v1/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partnerPayload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create partner');

    closeAddPartnerModal();
    showAppleToast(`NBFC Partner ${name} added successfully!`);
    loadPartners();
  } catch (err) {
    alert('Failed to add NBFC partner: ' + err.message);
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
    const data = await res.json();
    const logs = Array.isArray(data) ? data : (data.logs || []);
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

// ===========================================================================
// 5. BUSINESS-CONFIGURABLE PAYLOAD MANAGEMENT SYSTEM
// ===========================================================================

let selectedPayloadTeam = 'onboarding';
let selectedPayloadProgram = 'genies';
let currentUserPayloadRole = 'admin'; // 'admin' | 'editor' | 'viewer'
let currentPayloadConfig = null;
let hasUnsavedPayloadDraft = false;
let draggedPayloadFieldKey = null;

const TEAM_NAMES = {
  onboarding: 'Onboarding Team',
  retargeting: 'Retargeting Team',
  retention: 'Retention Team'
};

const PROGRAM_NAMES = {
  genies: 'Genies Program',
  smart: 'Smart Program',
  edge: 'Edge Program'
};

function initPayloadManager() {
  // 1. Team selection buttons
  const teamBtns = document.querySelectorAll('.payload-team-btn');
  teamBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.team === selectedPayloadTeam) return;
      if (hasUnsavedPayloadDraft) {
        if (!confirm('You have unsaved draft changes. Switching will discard unsaved draft changes. Proceed?')) {
          return;
        }
      }
      teamBtns.forEach(b => {
        b.classList.remove('active-segment');
        b.classList.add('border-slate-200', 'text-slate-600');
      });
      btn.classList.add('active-segment');
      btn.classList.remove('border-slate-200', 'text-slate-600');
      selectedPayloadTeam = btn.dataset.team;
      
      const teamIndicator = document.getElementById('team-badge-indicator');
      if (teamIndicator) teamIndicator.textContent = TEAM_NAMES[selectedPayloadTeam];
      
      loadPayloadConfiguration();
    });
  });

  // 2. Program selection buttons
  const programBtns = document.querySelectorAll('.payload-program-btn');
  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.program === selectedPayloadProgram) return;
      if (hasUnsavedPayloadDraft) {
        if (!confirm('You have unsaved draft changes. Switching will discard unsaved draft changes. Proceed?')) {
          return;
        }
      }
      programBtns.forEach(b => {
        b.classList.remove('active-segment');
        b.classList.add('border-slate-200', 'text-slate-600');
      });
      btn.classList.add('active-segment');
      btn.classList.remove('border-slate-200', 'text-slate-600');
      selectedPayloadProgram = btn.dataset.program;

      const programIndicator = document.getElementById('program-badge-indicator');
      if (programIndicator) programIndicator.textContent = PROGRAM_NAMES[selectedPayloadProgram];

      loadPayloadConfiguration();
    });
  });

  // 3. Role Selector
  const roleSelect = document.getElementById('payload-role-select');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      currentUserPayloadRole = e.target.value;
      applyPayloadRolePermissions();
    });
  }

  // 4. Search Filter
  const searchFilter = document.getElementById('payload-search-filter');
  if (searchFilter) {
    searchFilter.addEventListener('input', () => {
      if (currentPayloadConfig && currentPayloadConfig.fields) {
        renderPayloadFieldsList(currentPayloadConfig.fields);
      }
    });
  }

  // 5. Action Buttons
  const btnAddField = document.getElementById('btn-add-payload-field');
  if (btnAddField) {
    btnAddField.addEventListener('click', () => openPayloadFieldModal('add'));
  }

  const btnSaveDraft = document.getElementById('btn-save-payload-draft');
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener('click', savePayloadDraft);
  }

  const btnPublish = document.getElementById('btn-publish-payload');
  if (btnPublish) {
    btnPublish.addEventListener('click', openPayloadPublishModal);
  }

  const btnHistory = document.getElementById('btn-history-payload');
  if (btnHistory) {
    btnHistory.addEventListener('click', openPayloadHistoryModal);
  }

  // 6. Preview & Testing Buttons
  const btnCopySchema = document.getElementById('btn-copy-payload-schema');
  if (btnCopySchema) {
    btnCopySchema.addEventListener('click', copyPayloadSchemaToClipboard);
  }

  const btnLoadValid = document.getElementById('btn-load-valid-mock');
  if (btnLoadValid) {
    btnLoadValid.addEventListener('click', loadValidMockPayload);
  }

  const btnLoadInvalid = document.getElementById('btn-load-invalid-mock');
  if (btnLoadInvalid) {
    btnLoadInvalid.addEventListener('click', loadInvalidMockPayload);
  }

  const btnRunValidate = document.getElementById('btn-run-payload-validate');
  if (btnRunValidate) {
    btnRunValidate.addEventListener('click', runPayloadValidationTest);
  }

  // 7. Modals Wireup
  setupPayloadModals();
}

function applyPayloadRolePermissions() {
  const btnAddField = document.getElementById('btn-add-payload-field');
  const btnSaveDraft = document.getElementById('btn-save-payload-draft');
  const btnPublish = document.getElementById('btn-publish-payload');
  const btnHistory = document.getElementById('btn-history-payload');

  if (currentUserPayloadRole === 'viewer') {
    if (btnAddField) btnAddField.classList.add('hidden');
    if (btnSaveDraft) btnSaveDraft.classList.add('hidden');
    if (btnPublish) btnPublish.classList.add('hidden');
    if (btnHistory) btnHistory.classList.add('hidden');
  } else if (currentUserPayloadRole === 'editor') {
    if (btnAddField) btnAddField.classList.remove('hidden');
    if (btnSaveDraft) btnSaveDraft.classList.remove('hidden');
    if (btnPublish) btnPublish.classList.add('hidden');
    if (btnHistory) btnHistory.classList.remove('hidden');
  } else {
    // Admin
    if (btnAddField) btnAddField.classList.remove('hidden');
    if (btnSaveDraft) btnSaveDraft.classList.remove('hidden');
    if (btnPublish) btnPublish.classList.remove('hidden');
    if (btnHistory) btnHistory.classList.remove('hidden');
  }

  if (currentPayloadConfig && currentPayloadConfig.fields) {
    renderPayloadFieldsList(currentPayloadConfig.fields);
  }
}

async function loadPayloadConfiguration(team = selectedPayloadTeam, program = selectedPayloadProgram) {
  const fieldsContainer = document.getElementById('payload-fields-list');
  const previewContainer = document.getElementById('payload-schema-preview');
  
  if (fieldsContainer) {
    fieldsContainer.innerHTML = `
      <div class="p-8 text-center text-slate-400 flex items-center justify-center space-x-2">
        <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading ${TEAM_NAMES[team]} (${PROGRAM_NAMES[program]}) configuration...</span>
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/v1/payload-configs/${team}/${program}?mode=draft`);
    const data = await res.json();
    currentPayloadConfig = data;
    hasUnsavedPayloadDraft = false;

    // Update Canvas Header
    const canvasTitle = document.getElementById('payload-canvas-title');
    if (canvasTitle) canvasTitle.textContent = `${TEAM_NAMES[team]} → ${PROGRAM_NAMES[program]}`;

    const canvasDesc = document.getElementById('payload-canvas-description');
    if (canvasDesc) canvasDesc.textContent = data.description || `Configuration for ${TEAM_NAMES[team]} (${PROGRAM_NAMES[program]}).`;

    const versionChip = document.getElementById('payload-version-chip');
    if (versionChip) versionChip.textContent = `v${data.version || '1.0.0'}`;

    const statusChip = document.getElementById('payload-status-chip');
    if (statusChip) statusChip.textContent = (data.status || 'ACTIVE').toUpperCase();

    const draftChip = document.getElementById('payload-draft-chip');
    if (draftChip) draftChip.classList.add('hidden');

    // Render Fields
    renderPayloadFieldsList(data.fields || []);

    // Load Mock Preview Sample
    loadSamplePayloadPreview();

    // Reset Validator output
    const valResults = document.getElementById('payload-validation-results');
    if (valResults) valResults.classList.add('hidden');

  } catch (err) {
    console.error('Failed to load payload configuration:', err);
    if (fieldsContainer) {
      fieldsContainer.innerHTML = `
        <div class="p-6 text-center text-red-500 bg-red-50 rounded-2xl border border-red-200 text-xs">
          Failed to load payload configuration from server. Please verify backend connection.
        </div>
      `;
    }
  }
}

function renderPayloadFieldsList(fields) {
  const container = document.getElementById('payload-fields-list');
  const counter = document.getElementById('payload-fields-counter');
  const searchFilter = document.getElementById('payload-search-filter');
  const query = (searchFilter ? searchFilter.value.trim().toLowerCase() : '');

  if (!container) return;

  const filteredFields = fields.filter(f => {
    if (!query) return true;
    return (
      (f.label && f.label.toLowerCase().includes(query)) ||
      (f.key && f.key.toLowerCase().includes(query)) ||
      (f.type && f.type.toLowerCase().includes(query)) ||
      (f.priority && f.priority.toLowerCase().includes(query))
    );
  });

  if (counter) {
    counter.textContent = `${filteredFields.length} of ${fields.length} field${fields.length === 1 ? '' : 's'}`;
  }

  if (filteredFields.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200/60 text-xs">
        ${query ? 'No payload fields match your search query.' : 'No payload fields configured yet.'}
      </div>
    `;
    return;
  }

  container.innerHTML = filteredFields.map((field, idx) => {
    const isBase = field.inherited_from === 'base';
    const isOverridden = field.is_overridden === true;
    const isProgram = field.inherited_from === 'program' || !field.inherited_from;
    
    let inheritBadge = '';
    if (isOverridden) {
      inheritBadge = `<span class="apple-chip chip-amber text-[9px] font-semibold" title="Overridden for this program">Program Override</span>`;
    } else if (isBase) {
      inheritBadge = `<span class="apple-chip chip-neutral text-[9px] font-semibold" title="Inherited from Team base rules">Team Base</span>`;
    } else {
      inheritBadge = `<span class="apple-chip chip-blue text-[9px] font-semibold" title="Configured specifically for this program">Program Specific</span>`;
    }

    const priorityClass = `chip-priority-${(field.priority || 'medium').toLowerCase()}`;
    const priorityLabel = (field.priority || 'MEDIUM').toUpperCase();

    const isEnabled = field.enabled !== false;
    const isRequired = field.required === true;
    const isReadOnlyRole = currentUserPayloadRole === 'viewer';

    return `
      <div class="payload-field-card ${isEnabled ? '' : 'disabled-field'} p-3.5 bg-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs" 
           data-key="${field.key}" 
           draggable="${isReadOnlyRole ? 'false' : 'true'}">
        
        <!-- Left: Drag handle + Key & Label -->
        <div class="flex items-center space-x-3 min-w-0">
          ${isReadOnlyRole ? '' : `
            <div class="flex items-center space-x-1">
              <span class="drag-handle text-slate-300 hover:text-slate-600 cursor-grab p-1" title="Drag to reorder">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/></svg>
              </span>
              <div class="flex flex-col space-y-0.5">
                <button type="button" class="btn-move-field-up text-slate-400 hover:text-slate-800 p-0.5 leading-none text-[9px]" data-key="${field.key}" title="Move Up">▲</button>
                <button type="button" class="btn-move-field-down text-slate-400 hover:text-slate-800 p-0.5 leading-none text-[9px]" data-key="${field.key}" title="Move Down">▼</button>
              </div>
            </div>
          `}

          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <span class="font-bold text-slate-900 truncate">${field.label || field.key}</span>
              <code class="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono truncate">${field.key}</code>
              ${inheritBadge}
            </div>
            <div class="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-2">
              <span>Type: <strong class="text-slate-700 capitalize">${field.type}</strong></span>
              ${field.default_value !== undefined && field.default_value !== '' ? `<span>• Default: <code class="text-slate-600">${field.default_value}</code></span>` : ''}
              ${field.validation && field.validation.min !== undefined ? `<span>• Min: ${field.validation.min}</span>` : ''}
              ${field.validation && field.validation.max !== undefined ? `<span>• Max: ${field.validation.max}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Right: Badges, Mandatory Toggle, Enabled Toggle, Actions -->
        <div class="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
          
          <!-- Priority Chip -->
          <span class="apple-chip ${priorityClass} text-[10px] font-bold uppercase tracking-wider">
            ${priorityLabel}
          </span>

          <!-- Mandatory Toggle Pill -->
          <button type="button" 
                  class="btn-toggle-field-required apple-chip text-[10px] font-bold cursor-pointer transition-colors ${isRequired ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" 
                  data-key="${field.key}" 
                  ${isReadOnlyRole ? 'disabled' : ''} 
                  title="Click to toggle mandatory status">
            ${isRequired ? 'Mandatory' : 'Optional'}
          </button>

          <!-- Enabled Toggle Pill -->
          <button type="button" 
                  class="btn-toggle-field-enabled apple-chip text-[10px] font-bold cursor-pointer transition-colors ${isEnabled ? 'chip-success' : 'chip-neutral'}" 
                  data-key="${field.key}" 
                  ${isReadOnlyRole ? 'disabled' : ''} 
                  title="Click to toggle active status">
            ${isEnabled ? 'Active' : 'Disabled'}
          </button>

          <!-- Edit & Delete Buttons -->
          ${isReadOnlyRole ? '' : `
            <div class="flex items-center space-x-1 pl-1 border-l border-slate-100">
              <button type="button" class="btn-edit-field text-slate-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors" data-key="${field.key}" title="Edit Field">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button type="button" class="btn-delete-field text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors" data-key="${field.key}" title="Remove Field">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          `}

        </div>

      </div>
    `;
  }).join('');

  // Wire up interactive events on fields
  attachPayloadFieldCardEvents();
}

function attachPayloadFieldCardEvents() {
  if (currentUserPayloadRole === 'viewer') return;

  // Move Up
  document.querySelectorAll('.btn-move-field-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      movePayloadFieldPosition(btn.dataset.key, -1);
    });
  });

  // Move Down
  document.querySelectorAll('.btn-move-field-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      movePayloadFieldPosition(btn.dataset.key, 1);
    });
  });

  // Toggle Required
  document.querySelectorAll('.btn-toggle-field-required').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePayloadFieldRequired(btn.dataset.key);
    });
  });

  // Toggle Enabled
  document.querySelectorAll('.btn-toggle-field-enabled').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePayloadFieldEnabled(btn.dataset.key);
    });
  });

  // Edit Field
  document.querySelectorAll('.btn-edit-field').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPayloadFieldModal('edit', btn.dataset.key);
    });
  });

  // Delete Field
  document.querySelectorAll('.btn-delete-field').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePayloadField(btn.dataset.key);
    });
  });

  // Drag and drop
  const cards = document.querySelectorAll('.payload-field-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedPayloadFieldKey = card.dataset.key;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetKey = card.dataset.key;
      if (draggedPayloadFieldKey && draggedPayloadFieldKey !== targetKey) {
        reorderPayloadFields(draggedPayloadFieldKey, targetKey);
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      document.querySelectorAll('.payload-field-card').forEach(c => c.classList.remove('drag-over'));
      draggedPayloadFieldKey = null;
    });
  });
}

function markPayloadDraftPending() {
  hasUnsavedPayloadDraft = true;
  const draftChip = document.getElementById('payload-draft-chip');
  if (draftChip) draftChip.classList.remove('hidden');
  loadSamplePayloadPreview();
}

function movePayloadFieldPosition(key, direction) {
  if (!currentPayloadConfig || !currentPayloadConfig.fields) return;
  const fields = currentPayloadConfig.fields;
  const idx = fields.findIndex(f => f.key === key);
  if (idx < 0) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= fields.length) return;

  // Swap
  const temp = fields[idx];
  fields[idx] = fields[targetIdx];
  fields[targetIdx] = temp;

  markPayloadDraftPending();
  renderPayloadFieldsList(fields);
}

function reorderPayloadFields(sourceKey, targetKey) {
  if (!currentPayloadConfig || !currentPayloadConfig.fields) return;
  const fields = currentPayloadConfig.fields;
  const sourceIdx = fields.findIndex(f => f.key === sourceKey);
  const targetIdx = fields.findIndex(f => f.key === targetKey);
  if (sourceIdx < 0 || targetIdx < 0) return;

  const [moved] = fields.splice(sourceIdx, 1);
  fields.splice(targetIdx, 0, moved);

  markPayloadDraftPending();
  renderPayloadFieldsList(fields);
}

function togglePayloadFieldRequired(key) {
  if (!currentPayloadConfig || !currentPayloadConfig.fields) return;
  const field = currentPayloadConfig.fields.find(f => f.key === key);
  if (!field) return;

  field.required = !field.required;
  markPayloadDraftPending();
  renderPayloadFieldsList(currentPayloadConfig.fields);
}

function togglePayloadFieldEnabled(key) {
  if (!currentPayloadConfig || !currentPayloadConfig.fields) return;
  const field = currentPayloadConfig.fields.find(f => f.key === key);
  if (!field) return;

  field.enabled = field.enabled === false ? true : false;
  markPayloadDraftPending();
  renderPayloadFieldsList(currentPayloadConfig.fields);
}

function deletePayloadField(key) {
  if (!currentPayloadConfig || !currentPayloadConfig.fields) return;
  const field = currentPayloadConfig.fields.find(f => f.key === key);
  if (!field) return;

  const isBase = field.inherited_from === 'base';
  const confirmMsg = isBase 
    ? `"${field.label || key}" is inherited from team base rules. Removing it will exclude it from this program. Continue?`
    : `Are you sure you want to remove field "${field.label || key}"?`;

  if (!confirm(confirmMsg)) return;

  currentPayloadConfig.fields = currentPayloadConfig.fields.filter(f => f.key !== key);
  markPayloadDraftPending();
  renderPayloadFieldsList(currentPayloadConfig.fields);
}

// ---------------------------------------------------------------------------
// Modals & Field Editing
// ---------------------------------------------------------------------------

function setupPayloadModals() {
  // Field modal
  const fieldTypeSelect = document.getElementById('field-type-select');
  if (fieldTypeSelect) {
    fieldTypeSelect.addEventListener('change', (e) => {
      const optionsContainer = document.getElementById('field-dropdown-options-container');
      if (optionsContainer) {
        if (e.target.value === 'dropdown') {
          optionsContainer.classList.remove('hidden');
        } else {
          optionsContainer.classList.add('hidden');
        }
      }
    });
  }

  const btnCloseFieldModal = document.getElementById('btn-close-field-modal');
  const btnCancelFieldModal = document.getElementById('btn-cancel-field-modal');
  if (btnCloseFieldModal) btnCloseFieldModal.addEventListener('click', closePayloadFieldModal);
  if (btnCancelFieldModal) btnCancelFieldModal.addEventListener('click', closePayloadFieldModal);

  const fieldForm = document.getElementById('payload-field-form');
  if (fieldForm) {
    fieldForm.addEventListener('submit', (e) => {
      e.preventDefault();
      savePayloadFieldFromForm();
    });
  }

  // Publish modal
  const btnClosePublishModal = document.getElementById('btn-close-publish-modal');
  const btnCancelPublishModal = document.getElementById('btn-cancel-publish-modal');
  const btnConfirmPublishLive = document.getElementById('btn-confirm-publish-live');
  if (btnClosePublishModal) btnClosePublishModal.addEventListener('click', closePayloadPublishModal);
  if (btnCancelPublishModal) btnCancelPublishModal.addEventListener('click', closePayloadPublishModal);
  if (btnConfirmPublishLive) btnConfirmPublishLive.addEventListener('click', executePayloadPublishLive);

  // History modal
  const btnCloseHistoryModal = document.getElementById('btn-close-history-modal');
  const btnCloseHistoryFooter = document.getElementById('btn-close-history-footer');
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closePayloadHistoryModal);
  if (btnCloseHistoryFooter) btnCloseHistoryFooter.addEventListener('click', closePayloadHistoryModal);
}

function openPayloadFieldModal(mode, fieldKey = null) {
  const modal = document.getElementById('modal-payload-field');
  const title = document.getElementById('modal-field-title');
  const modeInput = document.getElementById('field-edit-mode');
  const origKeyInput = document.getElementById('field-original-key');

  const keyInput = document.getElementById('field-key-input');
  const labelInput = document.getElementById('field-label-input');
  const typeSelect = document.getElementById('field-type-select');
  const prioritySelect = document.getElementById('field-priority-select');
  const requiredCheck = document.getElementById('field-required-checkbox');
  const enabledCheck = document.getElementById('field-enabled-checkbox');
  const defaultInput = document.getElementById('field-default-input');
  const placeholderInput = document.getElementById('field-placeholder-input');
  const helpInput = document.getElementById('field-help-input');
  const optionsInput = document.getElementById('field-options-input');
  const optionsContainer = document.getElementById('field-dropdown-options-container');
  const minInput = document.getElementById('field-min-input');
  const maxInput = document.getElementById('field-max-input');
  const patternInput = document.getElementById('field-pattern-input');

  if (!modal) return;

  modeInput.value = mode;
  origKeyInput.value = fieldKey || '';

  if (mode === 'edit' && fieldKey) {
    const field = currentPayloadConfig.fields.find(f => f.key === fieldKey);
    if (!field) return;

    title.textContent = `Edit Field: ${field.label || field.key}`;
    keyInput.value = field.key;
    keyInput.disabled = true; // Key locked in edit
    labelInput.value = field.label || '';
    typeSelect.value = field.type || 'text';
    prioritySelect.value = (field.priority || 'medium').toLowerCase();
    requiredCheck.checked = field.required === true;
    enabledCheck.checked = field.enabled !== false;
    defaultInput.value = field.default_value !== undefined ? field.default_value : '';
    placeholderInput.value = field.placeholder || '';
    helpInput.value = field.help_text || '';

    if (field.type === 'dropdown') {
      optionsContainer.classList.remove('hidden');
      optionsInput.value = (field.options || []).join(', ');
    } else {
      optionsContainer.classList.add('hidden');
      optionsInput.value = '';
    }

    minInput.value = field.validation && field.validation.min !== undefined ? field.validation.min : '';
    maxInput.value = field.validation && field.validation.max !== undefined ? field.validation.max : '';
    patternInput.value = field.validation && field.validation.pattern ? field.validation.pattern : '';

  } else {
    // Add mode
    title.textContent = 'Add New Payload Field';
    keyInput.value = '';
    keyInput.disabled = false;
    labelInput.value = '';
    typeSelect.value = 'text';
    prioritySelect.value = 'medium';
    requiredCheck.checked = false;
    enabledCheck.checked = true;
    defaultInput.value = '';
    placeholderInput.value = '';
    helpInput.value = '';
    optionsContainer.classList.add('hidden');
    optionsInput.value = '';
    minInput.value = '';
    maxInput.value = '';
    patternInput.value = '';
  }

  modal.classList.remove('hidden');
}

function closePayloadFieldModal() {
  const modal = document.getElementById('modal-payload-field');
  if (modal) modal.classList.add('hidden');
}

function savePayloadFieldFromForm() {
  const mode = document.getElementById('field-edit-mode').value;
  const origKey = document.getElementById('field-original-key').value;

  const keyInput = document.getElementById('field-key-input');
  const labelInput = document.getElementById('field-label-input');
  const typeSelect = document.getElementById('field-type-select');
  const prioritySelect = document.getElementById('field-priority-select');
  const requiredCheck = document.getElementById('field-required-checkbox');
  const enabledCheck = document.getElementById('field-enabled-checkbox');
  const defaultInput = document.getElementById('field-default-input');
  const placeholderInput = document.getElementById('field-placeholder-input');
  const helpInput = document.getElementById('field-help-input');
  const optionsInput = document.getElementById('field-options-input');
  const minInput = document.getElementById('field-min-input');
  const maxInput = document.getElementById('field-max-input');
  const patternInput = document.getElementById('field-pattern-input');

  const key = keyInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = labelInput.value.trim();

  if (!key || !label) {
    alert('Please enter both a Field Key and a Field Label.');
    return;
  }

  const newField = {
    key: key,
    label: label,
    type: typeSelect.value,
    priority: prioritySelect.value,
    required: requiredCheck.checked,
    enabled: enabledCheck.checked,
    inherited_from: 'program'
  };

  if (defaultInput.value.trim() !== '') {
    newField.default_value = defaultInput.value.trim();
  }
  if (placeholderInput.value.trim() !== '') {
    newField.placeholder = placeholderInput.value.trim();
  }
  if (helpInput.value.trim() !== '') {
    newField.help_text = helpInput.value.trim();
  }

  if (newField.type === 'dropdown') {
    newField.options = optionsInput.value
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0);
  }

  const validation = {};
  if (minInput.value !== '') validation.min = Number(minInput.value);
  if (maxInput.value !== '') validation.max = Number(maxInput.value);
  if (patternInput.value.trim() !== '') validation.pattern = patternInput.value.trim();
  if (Object.keys(validation).length > 0) {
    newField.validation = validation;
  }

  if (mode === 'add') {
    // Check duplicate key
    const exists = currentPayloadConfig.fields.some(f => f.key === key);
    if (exists) {
      alert(`A field with key "${key}" already exists in this configuration.`);
      return;
    }
    currentPayloadConfig.fields.push(newField);
  } else {
    // Edit mode
    const idx = currentPayloadConfig.fields.findIndex(f => f.key === origKey);
    if (idx >= 0) {
      const existing = currentPayloadConfig.fields[idx];
      newField.inherited_from = existing.inherited_from;
      if (existing.inherited_from === 'base') {
        newField.is_overridden = true;
      }
      currentPayloadConfig.fields[idx] = newField;
    }
  }

  closePayloadFieldModal();
  markPayloadDraftPending();
  renderPayloadFieldsList(currentPayloadConfig.fields);
}

async function savePayloadDraft() {
  if (!currentPayloadConfig) return;

  const btn = document.getElementById('btn-save-payload-draft');
  const origText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = `<span>Saving...</span>`;

  try {
    const payload = {
      description: currentPayloadConfig.description,
      fields: currentPayloadConfig.fields
    };

    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to save draft');

    hasUnsavedPayloadDraft = false;
    const draftChip = document.getElementById('payload-draft-chip');
    if (draftChip) draftChip.classList.add('hidden');

    alert(`Draft saved successfully for ${TEAM_NAMES[selectedPayloadTeam]} (${PROGRAM_NAMES[selectedPayloadProgram]}).`);

  } catch (err) {
    console.error('Save draft error:', err);
    alert(`Failed to save draft: ${err.message}`);
  } finally {
    if (btn) btn.innerHTML = origText;
  }
}

// ---------------------------------------------------------------------------
// Publishing & History
// ---------------------------------------------------------------------------

function openPayloadPublishModal() {
  if (!currentPayloadConfig) return;
  const modal = document.getElementById('modal-payload-publish');
  const targetLabel = document.getElementById('publish-target-label');
  const curVer = document.getElementById('publish-current-version');
  const nextVer = document.getElementById('publish-next-version');
  const summaryInput = document.getElementById('publish-summary-input');

  if (targetLabel) targetLabel.textContent = `${TEAM_NAMES[selectedPayloadTeam]} → ${PROGRAM_NAMES[selectedPayloadProgram]}`;
  
  const currentVersionStr = currentPayloadConfig.version || '1.0.0';
  if (curVer) curVer.textContent = `v${currentVersionStr}`;

  // Next version bump
  const parts = currentVersionStr.split('.').map(Number);
  const nextVersionStr = parts.length === 3 ? `${parts[0]}.${parts[1] + 1}.0` : '1.1.0';
  if (nextVer) nextVer.textContent = `v${nextVersionStr}`;

  if (summaryInput) summaryInput.value = '';

  if (modal) modal.classList.remove('hidden');
}

function closePayloadPublishModal() {
  const modal = document.getElementById('modal-payload-publish');
  if (modal) modal.classList.add('hidden');
}

async function executePayloadPublishLive() {
  const summaryInput = document.getElementById('publish-summary-input');
  const summary = summaryInput ? summaryInput.value.trim() : '';
  if (!summary) {
    alert('Please provide a brief change summary for the audit log before publishing.');
    return;
  }

  const btn = document.getElementById('btn-confirm-publish-live');
  const origText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = `<span>Publishing...</span>`;

  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        change_summary: summary,
        published_by: 'Business Lead (' + currentUserPayloadRole.toUpperCase() + ')'
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to publish live');

    closePayloadPublishModal();
    alert(`Published live successfully! New version is v${result.version}. Schema synced across Salesforce, KYC Portal, and NBFC Engine.`);
    loadPayloadConfiguration();

  } catch (err) {
    console.error('Publish error:', err);
    alert(`Failed to publish: ${err.message}`);
  } finally {
    if (btn) btn.innerHTML = origText;
  }
}

async function openPayloadHistoryModal() {
  const modal = document.getElementById('modal-payload-history');
  const contextLabel = document.getElementById('history-modal-context');
  const container = document.getElementById('payload-history-container');

  if (contextLabel) contextLabel.textContent = `Audit trail and rollback for ${TEAM_NAMES[selectedPayloadTeam]} → ${PROGRAM_NAMES[selectedPayloadProgram]}`;
  if (modal) modal.classList.remove('hidden');

  if (container) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 text-xs">
        Loading version history from server...
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/history`);
    const history = await res.json();

    if (!container) return;

    if (!history || history.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-400 text-xs">
          No previous version snapshots recorded.
        </div>
      `;
      return;
    }

    container.innerHTML = history.map((entry, idx) => {
      const isCurrent = entry.version === currentPayloadConfig.version;
      const dateStr = new Date(entry.published_at || entry.timestamp || Date.now()).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      return `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-mono font-bold text-slate-900">v${entry.version}</span>
              ${isCurrent ? `<span class="apple-chip chip-success text-[9px] font-bold">CURRENT LIVE</span>` : ''}
              <span class="text-slate-400">•</span>
              <span class="text-slate-500">${dateStr}</span>
            </div>
            <p class="text-slate-700 font-medium mt-1">${entry.change_summary || 'Standard version publish'}</p>
            <div class="text-[11px] text-slate-500 mt-0.5">
              <span>Published by: <strong>${entry.published_by || 'System Administrator'}</strong></span>
              ${entry.fields_count ? `<span> • ${entry.fields_count} fields</span>` : ''}
            </div>
          </div>

          <div>
            ${isCurrent || currentUserPayloadRole !== 'admin' ? '' : `
              <button type="button" class="btn-rollback-payload apple-btn-secondary text-xs px-3 py-1 font-semibold text-blue-600 hover:text-blue-700" data-version="${entry.version}">
                Rollback
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Wire up rollback buttons
    document.querySelectorAll('.btn-rollback-payload').forEach(btn => {
      btn.addEventListener('click', () => {
        executePayloadRollback(btn.dataset.version);
      });
    });

  } catch (err) {
    console.error('Failed to load history:', err);
    if (container) {
      container.innerHTML = `<div class="p-6 text-center text-red-500 text-xs">Failed to load history.</div>`;
    }
  }
}

function closePayloadHistoryModal() {
  const modal = document.getElementById('modal-payload-history');
  if (modal) modal.classList.add('hidden');
}

async function executePayloadRollback(version) {
  if (!confirm(`Are you sure you want to rollback to version v${version}? This will become the active live configuration.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: version,
        rolled_back_by: 'Business Lead (' + currentUserPayloadRole.toUpperCase() + ')'
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to rollback');

    closePayloadHistoryModal();
    alert(`Rollback complete! Configuration reverted to v${version}.`);
    loadPayloadConfiguration();

  } catch (err) {
    console.error('Rollback error:', err);
    alert(`Rollback failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Preview & Interactive Validator
// ---------------------------------------------------------------------------

async function loadSamplePayloadPreview() {
  const preview = document.getElementById('payload-schema-preview');
  if (!preview) return;

  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/sample`);
    const data = await res.json();
    preview.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error('Failed to load sample preview:', err);
  }
}

function copyPayloadSchemaToClipboard() {
  const preview = document.getElementById('payload-schema-preview');
  const btn = document.getElementById('btn-copy-payload-schema');
  if (!preview || !btn) return;

  navigator.clipboard.writeText(preview.textContent).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
  });
}

async function loadValidMockPayload() {
  const textarea = document.getElementById('payload-test-input');
  if (!textarea) return;

  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/sample`);
    const sample = await res.json();
    textarea.value = JSON.stringify(sample.payload || sample, null, 2);
  } catch (err) {
    console.error('Failed to load mock sample:', err);
  }
}

function loadInvalidMockPayload() {
  const textarea = document.getElementById('payload-test-input');
  if (!textarea) return;

  const brokenPayload = {
    "applicant_name": "Test Incomplete Lead",
    "cibil_score": "not_a_number",
    "monthly_income": 4000,
    "has_laptop": "unknown_string",
    "phone_number": "12345"
  };

  textarea.value = JSON.stringify(brokenPayload, null, 2);
}

async function runPayloadValidationTest() {
  const textarea = document.getElementById('payload-test-input');
  const resultsContainer = document.getElementById('payload-validation-results');
  if (!textarea || !resultsContainer) return;

  const rawJson = textarea.value.trim();
  if (!rawJson) {
    alert('Please enter or paste JSON payload to validate.');
    return;
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(rawJson);
  } catch (err) {
    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = `
      <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-1">
        <div class="font-bold flex items-center space-x-1.5">
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Malformed JSON Payload</span>
        </div>
        <p class="text-[11px] text-red-700">${err.message}</p>
      </div>
    `;
    return;
  }

  const startTime = performance.now();
  try {
    const res = await fetch(`/api/v1/payload-configs/${selectedPayloadTeam}/${selectedPayloadProgram}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedPayload)
    });

    const result = await res.json();
    const duration = Math.round(performance.now() - startTime);

    resultsContainer.classList.remove('hidden');

    if (result.valid) {
      resultsContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-2">
          <div class="flex items-center justify-between">
            <div class="font-bold flex items-center space-x-1.5">
              <svg class="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
              <span>Payload Verification Passed</span>
            </div>
            <span class="text-[10px] font-mono text-emerald-700">${duration}ms • Strict Mode</span>
          </div>
          <p class="text-[11px] text-emerald-800">
            All mandatory fields are present and satisfied all data type constraints, ranges, and format requirements for ${TEAM_NAMES[selectedPayloadTeam]} (${PROGRAM_NAMES[selectedPayloadProgram]}).
          </p>
        </div>
      `;
    } else {
      const errorItems = (result.errors || []).map(err => {
        return `
          <li class="flex items-start space-x-2 py-1 border-b border-red-100 last:border-b-0">
            <span class="text-red-500 font-bold shrink-0">•</span>
            <div>
              <strong class="font-mono text-red-950">${err.field}</strong>: 
              <span class="text-red-800">${err.message}</span>
            </div>
          </li>
        `;
      }).join('');

      resultsContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-950 text-xs space-y-3">
          <div class="flex items-center justify-between">
            <div class="font-bold flex items-center space-x-1.5">
              <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <span>Validation Failed (${result.errors ? result.errors.length : 0} Issues Detected)</span>
            </div>
            <span class="text-[10px] font-mono text-red-700">${duration}ms</span>
          </div>
          
          <ul class="text-[11px] space-y-0.5 max-h-48 overflow-y-auto pr-1">
            ${errorItems}
          </ul>
        </div>
      `;
    }

  } catch (err) {
    console.error('Validation request error:', err);
    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = `
      <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs">
        Server validation request failed: ${err.message}
      </div>
    `;
  }
}
