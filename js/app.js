// ============================================================
// Expense & Budget Visualizer — app.js
// Features: Add/Delete transactions, Local Storage, Chart.js
//           pie chart, dark/light mode, sort, spending limit
// ============================================================

// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY = 'expense_transactions';
const LIMIT_KEY   = 'expense_limit';
const THEME_KEY   = 'expense_theme';

// Category colors for the pie chart and list accents
const CATEGORY_COLORS = {
  Food:      '#f97316',
  Transport: '#3b82f6',
  Fun:       '#a855f7',
  Health:    '#22c55e',
  Shopping:  '#ec4899',
  Other:     '#6b7280',
};

// ── State ────────────────────────────────────────────────────
let transactions = loadFromStorage(STORAGE_KEY) || [];
let spendingLimit = parseFloat(loadFromStorage(LIMIT_KEY)) || 0;
let chart = null; // Chart.js instance

// ── DOM References ───────────────────────────────────────────
const form          = document.getElementById('transaction-form');
const nameInput     = document.getElementById('item-name');
const amountInput   = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const limitInput    = document.getElementById('spending-limit');
const totalEl       = document.getElementById('total-balance');
const limitWarning  = document.getElementById('limit-warning');
const listEl        = document.getElementById('transaction-list');
const emptyState    = document.getElementById('empty-state');
const chartCanvas   = document.getElementById('expense-chart');
const chartEmpty    = document.getElementById('chart-empty');
const sortSelect    = document.getElementById('sort-select');
const clearAllBtn   = document.getElementById('clear-all');
const themeToggle   = document.getElementById('theme-toggle');

// ── Init ─────────────────────────────────────────────────────
function init() {
  // Restore spending limit input
  if (spendingLimit > 0) limitInput.value = spendingLimit;

  // Restore theme
  const savedTheme = loadFromStorage(THEME_KEY) || 'light';
  setTheme(savedTheme);

  render();
}

// ── Render (single source of truth) ──────────────────────────
function render() {
  const sorted = getSorted(transactions, sortSelect.value);
  renderList(sorted);
  renderBalance();
  renderChart();
}

// ── Form Submit ───────────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const tx = {
    id:       Date.now(),
    name:     nameInput.value.trim(),
    amount:   parseFloat(amountInput.value),
    category: categoryInput.value,
    date:     new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };

  // Save spending limit if provided
  const limitVal = parseFloat(limitInput.value);
  if (limitVal > 0) {
    spendingLimit = limitVal;
    saveToStorage(LIMIT_KEY, spendingLimit);
  }

  transactions.unshift(tx); // newest first by default
  saveToStorage(STORAGE_KEY, transactions);
  form.reset();
  clearErrors();
  render();
});

// ── Validation ────────────────────────────────────────────────
function validateForm() {
  let valid = true;

  if (!nameInput.value.trim()) {
    showError('name-error', nameInput, 'Item name is required.');
    valid = false;
  } else {
    clearError('name-error', nameInput);
  }

  const amt = parseFloat(amountInput.value);
  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    showError('amount-error', amountInput, 'Enter a valid amount greater than 0.');
    valid = false;
  } else {
    clearError('amount-error', amountInput);
  }

  if (!categoryInput.value) {
    showError('category-error', categoryInput, 'Please select a category.');
    valid = false;
  } else {
    clearError('category-error', categoryInput);
  }

  return valid;
}

function showError(errorId, inputEl, msg) {
  document.getElementById(errorId).textContent = msg;
  inputEl.classList.add('invalid');
}

function clearError(errorId, inputEl) {
  document.getElementById(errorId).textContent = '';
  inputEl.classList.remove('invalid');
}

function clearErrors() {
  ['name-error', 'amount-error', 'category-error'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  [nameInput, amountInput, categoryInput].forEach(el => el.classList.remove('invalid'));
}

// ── Render List ───────────────────────────────────────────────
function renderList(sorted) {
  // Remove all items except the empty-state placeholder
  listEl.querySelectorAll('.transaction-item').forEach(el => el.remove());

  if (sorted.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  sorted.forEach(tx => {
    const li = document.createElement('li');
    li.className = `transaction-item cat-${tx.category}`;
    li.dataset.id = tx.id;

    // Highlight items if over limit
    if (spendingLimit > 0 && getTotal() > spendingLimit) {
      li.classList.add('over-limit');
    }

    li.innerHTML = `
      <div class="tx-info">
        <span class="tx-name">${escapeHtml(tx.name)}</span>
        <span class="tx-meta">${tx.category} · ${tx.date}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amount">-$${tx.amount.toFixed(2)}</span>
        <button class="btn-delete" aria-label="Delete ${escapeHtml(tx.name)}" data-id="${tx.id}">✕</button>
      </div>
    `;

    listEl.appendChild(li);
  });
}

// ── Delete ────────────────────────────────────────────────────
listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;

  const id = parseInt(btn.dataset.id, 10);
  transactions = transactions.filter(tx => tx.id !== id);
  saveToStorage(STORAGE_KEY, transactions);
  render();
});

// ── Clear All ─────────────────────────────────────────────────
clearAllBtn.addEventListener('click', () => {
  if (transactions.length === 0) return;
  if (!confirm('Clear all transactions?')) return;
  transactions = [];
  saveToStorage(STORAGE_KEY, transactions);
  render();
});

// ── Balance ───────────────────────────────────────────────────
function getTotal() {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

function renderBalance() {
  const total = getTotal();
  totalEl.textContent = `$${total.toFixed(2)}`;

  if (spendingLimit > 0 && total >= spendingLimit) {
    limitWarning.hidden = false;
    limitWarning.textContent = `⚠️ Limit of $${spendingLimit.toFixed(2)} reached!`;
  } else {
    limitWarning.hidden = true;
  }
}

// ── Chart ─────────────────────────────────────────────────────
function renderChart() {
  // Aggregate amounts by category
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels  = Object.keys(totals);
  const data    = Object.values(totals);
  const colors  = labels.map(l => CATEGORY_COLORS[l] || '#6b7280');

  if (labels.length === 0) {
    chartEmpty.hidden = false;
    chartCanvas.hidden = true;
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  chartEmpty.hidden = true;
  chartCanvas.hidden = false;

  if (chart) {
    // Update existing chart data
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
  } else {
    // Create new chart
    chart = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement)
            .getPropertyValue('--surface').trim() || '#fff',
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 14,
              font: { size: 12 },
              color: getComputedStyle(document.documentElement)
                .getPropertyValue('--text').trim() || '#1a1a2e',
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` $${ctx.parsed.toFixed(2)} (${ctx.label})`,
            },
          },
        },
      },
    });
  }
}

// ── Sort ──────────────────────────────────────────────────────
sortSelect.addEventListener('change', render);

function getSorted(list, mode) {
  const copy = [...list];
  switch (mode) {
    case 'oldest':  return copy.reverse();
    case 'highest': return copy.sort((a, b) => b.amount - a.amount);
    case 'lowest':  return copy.sort((a, b) => a.amount - b.amount);
    default:        return copy; // newest first (insertion order)
  }
}

// ── Dark / Light Mode ─────────────────────────────────────────
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  saveToStorage(THEME_KEY, next);
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';

  // Re-render chart so legend colors update
  if (chart) {
    chart.destroy();
    chart = null;
    renderChart();
  }
}

// ── Local Storage Helpers ─────────────────────────────────────
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('LocalStorage write failed:', e);
  }
}

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('LocalStorage read failed:', e);
    return null;
  }
}

// ── Security: prevent XSS in dynamic HTML ────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Start ─────────────────────────────────────────────────────
init();
