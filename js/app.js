/**
 * Aplicação PWA "Nossa Casa — Controle Financeiro"
 * 100% offline, dados locais no dispositivo.
 */
(function () {
  'use strict';

  const F = window.Finance;
  const S = window.Store;

  const CARD_COLORS = [
    '#820ad1', '#ea580c', '#1d4ed8', '#334155',
    '#059669', '#db2777', '#b91c1c', '#0f766e', '#ca8a04'
  ];

  const ui = {
    state: S.loadState(),
    monthKey: F.getCurrentMonthKey(),
    scope: 'house', // 'house' | 'p1' | 'p2'
    tab: 'home',    // 'home' | 'expenses' | 'cards' | 'fixed' | 'settings'
    expenseFilter: {
      search: '',
      kind: 'all',     // 'all' | 'variable' | 'fixed'
      categoryId: 'all',
      payment: 'all'   // 'all' | 'cash' | cardId
    },
    expandedCards: {},
    deferredInstallPrompt: null,
    toastTimer: null
  };

  // Helpers DOM & segurança
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseAmount(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    const cleaned = String(raw || '')
      .trim()
      .replace(/[^\d.,-]/g, '');
    if (!cleaned) return 0;
    // Se tiver vírgula e ponto (ex: 1.250,50), remove pontos de milhar e troca vírgula por ponto
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (cleaned.includes(',')) {
      return Number(cleaned.replace(',', '.')) || 0;
    }
    return Number(cleaned) || 0;
  }

  function formatInputAmount(num) {
    const n = Number(num) || 0;
    return n > 0 ? n.toFixed(2).replace('.', ',') : '';
  }

  function formatDateBR(iso) {
    if (!iso || iso.length < 10) return '';
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
  }

  function getCategory(catId) {
    return ui.state.categories.find((c) => c.id === catId) || {
      id: 'outros',
      name: 'Outros',
      icon: '📦',
      color: '#94a3b8',
      type: 'variable'
    };
  }

  function getCard(cardId) {
    return ui.state.cards.find((c) => c.id === cardId) || null;
  }

  function getOwnerLabel(owner) {
    if (owner === 'p1') return ui.state.settings.people.p1.name;
    if (owner === 'p2') return ui.state.settings.people.p2.name;
    return 'Conjunta';
  }

  function persist(message) {
    S.saveState(ui.state);
    render();
    if (message) showToast(message);
  }

  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => {
      el.classList.add('hidden');
    }, 2400);
  }

  function applyTheme() {
    const theme = ui.state.settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = $('#metaThemeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f1f5f9');
  }

  // =========================================================================
  // Renderização Principal
  // =========================================================================
  function renderTopbar() {
    $('#btnCurrentMonth').textContent = F.formatMonthLabel(ui.monthKey, true);
    $('#scopeBtnP1').textContent = ui.state.settings.people.p1.name;
    $('#scopeBtnP2').textContent = ui.state.settings.people.p2.name;

    $$('.scope-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === ui.scope);
    });

    $$('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === ui.tab);
    });
  }

  function render() {
    applyTheme();
    renderTopbar();

    const summary = F.getMonthSummary(ui.state, ui.monthKey, ui.scope);
    const main = $('#mainContent');

    if (ui.tab === 'home') {
      main.innerHTML = renderHomeTab(summary);
    } else if (ui.tab === 'expenses') {
      main.innerHTML = renderExpensesTab(summary);
    } else if (ui.tab === 'cards') {
      main.innerHTML = renderCardsTab(summary);
    } else if (ui.tab === 'fixed') {
      main.innerHTML = renderFixedTab(summary);
    } else if (ui.tab === 'settings') {
      main.innerHTML = renderSettingsTab();
    }

    bindTabEvents(summary);
  }

  // -------------------------------------------------------------------------
  // ABA 1: INÍCIO (Dashboard + Saldo Previsto)
  // -------------------------------------------------------------------------
  function renderHomeTab(s) {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const hasNoIncome = s.incomes.houseTotal === 0;

    let heroClass = '';
    let statusBadge = '<span class="status-badge ok">No azul</span>';
    let barColor = 'linear-gradient(90deg, #10b981, #34d399)';

    if (s.forecastBalance < 0) {
      heroClass = 'status-danger';
      statusBadge = '<span class="status-badge danger">Atenção: negativo</span>';
      barColor = 'linear-gradient(90deg, #f43f5e, #fb7185)';
    } else if (s.commitmentPct >= 85 && s.expensesTotal > 0) {
      heroClass = 'status-warn';
      statusBadge = '<span class="status-badge warn">Orçamento apertado</span>';
      barColor = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    }

    const scopeTitle = ui.scope === 'house'
      ? 'Saldo previsto da casa'
      : `Saldo previsto — ${ui.scope === 'p1' ? p1.name : p2.name}`;

    const pctWidth = Math.min(100, Math.max(0, s.commitmentPct));
    const fixedPct = s.expensesTotal > 0 ? Math.round((s.fixedTotal / s.expensesTotal) * 100) : 0;
    const varPct = s.expensesTotal > 0 ? 100 - fixedPct : 0;

    const projection = F.getFutureProjection(ui.state, ui.monthKey, 4, ui.scope);

    const onboardingHtml = hasNoIncome ? `
      <div class="banner">
        <h3>Bem-vindos ao Nossa Casa 👋</h3>
        <p>Comece cadastrando o salário de cada um e suas contas fixas para ver o saldo previsto do mês em tempo real.</p>
        <div class="banner-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="open-salaries">Definir salários</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="load-demo">Testar com exemplo</button>
        </div>
      </div>
    ` : '';

    const coupleCardHtml = ui.scope === 'house' ? `
      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Visão Individual</h2>
            <div class="section-sub">
              Conjuntas: ${ui.state.settings.splitMode === 'proportional'
                ? `Proporcional (${Math.round(s.incomes.ratioP1 * 100)}% / ${Math.round(s.incomes.ratioP2 * 100)}%)`
                : '50% / 50%'}
            </div>
          </div>
          <button type="button" class="link-btn" data-action="toggle-split-mode">Trocar divisão</button>
        </div>

        <div class="couple-grid">
          ${renderPersonSummaryBox(p1, s.peopleTotals.p1, s.incomes.ratioP1)}
          ${renderPersonSummaryBox(p2, s.peopleTotals.p2, s.incomes.ratioP2)}
        </div>
      </section>
    ` : '';

    const categoriesHtml = s.categoriesBreakdown.length ? `
      <div class="cat-list">
        ${s.categoriesBreakdown.map((item) => {
          const cat = getCategory(item.categoryId);
          return `
            <div class="cat-row" data-action="filter-category" data-cat-id="${esc(item.categoryId)}">
              <div class="cat-row-top">
                <div class="cat-left">
                  <span class="cat-icon" style="background: ${cat.color}22">${cat.icon}</span>
                  <div>
                    <div class="cat-name">${esc(cat.name)}</div>
                    <div class="cat-count">${item.count} ${item.count === 1 ? 'lançamento' : 'lançamentos'}</div>
                  </div>
                </div>
                <div class="cat-right">
                  <span class="cat-val">${F.formatBRL(item.total)}</span>
                  <span class="cat-pct">${item.pct}%</span>
                </div>
              </div>
              <div class="progress-track subtle">
                <div class="progress-fill" style="width:${item.pct}%; background:${cat.color}"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <span class="empty-emoji">✨</span>
        Nenhuma despesa lançada em ${F.formatMonthLabel(ui.monthKey)}.<br/>
        Toque no botão <strong>+</strong> para registrar uma compra ou conta fixa.
      </div>
    `;

    return `
      ${onboardingHtml}

      <section class="card hero-card ${heroClass}">
        <div class="hero-top">
          <span class="hero-label">${esc(scopeTitle)}</span>
          ${statusBadge}
        </div>
        <div class="hero-balance">${F.formatBRL(s.forecastBalance)}</div>
        <div class="hero-hint">
          Após receber ${F.formatBRL(s.incomeTotal)} e quitar todas as despesas de ${F.formatMonthLabel(ui.monthKey)}
        </div>

        <div class="hero-progress-wrap">
          <div class="hero-progress-labels">
            <span>Comprometimento da renda</span>
            <strong>${s.commitmentPct}%</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pctWidth}%; background:${barColor}"></div>
          </div>
        </div>

        <div class="hero-grid">
          <div class="hero-stat">
            <span class="hero-stat-label">Renda mês</span>
            <strong class="hero-stat-value text-pos">${F.formatBRL(s.incomeTotal)}</strong>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">Desembolso</span>
            <strong class="hero-stat-value">${F.formatBRL(s.expensesTotal)}</strong>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-label">Falta pagar</span>
            <strong class="hero-stat-value ${s.unpaidTotal > 0 ? 'text-warn' : 'text-pos'}">${F.formatBRL(s.unpaidTotal)}</strong>
          </div>
        </div>
      </section>

      ${coupleCardHtml}

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Quanto precisa desembolsar</h2>
            <div class="section-sub">Fixos vs Variáveis • Pago: ${F.formatBRL(s.paidTotal)}</div>
          </div>
        </div>

        <div class="split-bar">
          <div class="split-seg" style="width:${fixedPct}%; background:#38bdf8" title="Fixos"></div>
          <div class="split-seg" style="width:${varPct}%; background:#a855f7" title="Variáveis"></div>
        </div>

        <div class="dual-metrics">
          <div class="metric-box" data-action="go-tab" data-tab="fixed" style="cursor:pointer">
            <div class="metric-title"><span class="person-dot" style="background:#38bdf8"></span> Contas Fixas</div>
            <div class="metric-val">${F.formatBRL(s.fixedTotal)}</div>
            <div class="metric-sub">${fixedPct}% do total</div>
          </div>
          <div class="metric-box" data-action="go-tab" data-tab="expenses" style="cursor:pointer">
            <div class="metric-title"><span class="person-dot" style="background:#a855f7"></span> Variáveis</div>
            <div class="metric-val">${F.formatBRL(s.variableTotal)}</div>
            <div class="metric-sub">${varPct}% do total</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="dual-metrics">
          <div class="metric-box">
            <div class="metric-title">⚡ Pix / Débito / Boleto</div>
            <div class="metric-val">${F.formatBRL(s.cashTotal)}</div>
            <div class="metric-sub">Saída direta da conta</div>
          </div>
          <div class="metric-box" data-action="go-tab" data-tab="cards" style="cursor:pointer">
            <div class="metric-title">💳 Faturas (${ui.state.cards.length} cartões)</div>
            <div class="metric-val">${F.formatBRL(s.cardsTotal)}</div>
            <div class="metric-sub">Toque para ver cartões ›</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Gastos por Categoria</h2>
            <div class="section-sub">Toque em uma categoria para ver os itens</div>
          </div>
        </div>
        ${categoriesHtml}
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Projeção dos Próximos Meses</h2>
            <div class="section-sub">Inclui custos fixos + parcelas futuras dos cartões</div>
          </div>
        </div>
        <div class="projection-grid">
          ${projection.map((p, idx) => `
            <div class="proj-card ${idx === 0 ? 'current' : ''}" data-action="jump-month" data-month="${p.monthKey}">
              <div class="proj-month">${esc(p.label)}</div>
              <div class="proj-bal ${p.forecastBalance >= 0 ? 'text-pos' : 'text-neg'}">${F.formatBRL(p.forecastBalance)}</div>
              <div class="proj-exp">Gastos: ${F.formatBRL(p.expensesTotal)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderPersonSummaryBox(person, totals, ratio) {
    const cls = totals.forecast >= 0 ? 'text-pos' : 'text-neg';
    return `
      <div class="person-card">
        <div class="person-head">
          <div class="person-name">
            <span class="person-dot" style="background:${person.color}"></span>
            <span>${esc(person.name)}</span>
          </div>
          <span class="person-pct">${Math.round(ratio * 100)}%</span>
        </div>
        <div class="person-row">
          <span>Renda</span>
          <strong>${F.formatBRL(totals.income)}</strong>
        </div>
        <div class="person-row">
          <span>Individuais</span>
          <strong>${F.formatBRL(totals.individual)}</strong>
        </div>
        <div class="person-row">
          <span>Parte conjunta</span>
          <strong>${F.formatBRL(totals.shared)}</strong>
        </div>
        <div class="person-forecast">
          <span>Previsto</span>
          <strong class="${cls}">${F.formatBRL(totals.forecast)}</strong>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // ABA 2: GASTOS (Variáveis & Todos os Lançamentos)
  // -------------------------------------------------------------------------
  function renderExpensesTab(s) {
    const f = ui.expenseFilter;
    const filtered = s.items
      .filter((it) => {
        if (f.kind !== 'all' && it.kind !== f.kind) return false;
        if (f.categoryId !== 'all' && it.categoryId !== f.categoryId) return false;
        if (f.payment === 'cash' && it.paymentMethod !== 'cash') return false;
        if (f.payment !== 'all' && f.payment !== 'cash' && it.cardId !== f.payment) return false;
        if (f.search) {
          const q = f.search.toLowerCase();
          const cat = getCategory(it.categoryId);
          const matchTitle = it.title.toLowerCase().includes(q);
          const matchCat = cat.name.toLowerCase().includes(q);
          if (!matchTitle && !matchCat) return false;
        }
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const filteredTotal = F.round2(filtered.reduce((acc, it) => acc + it.scopedAmount, 0));

    const usedCatIds = Array.from(new Set(s.items.map((i) => i.categoryId)));

    return `
      <section class="card card-compact">
        <input
          type="search"
          class="search-input"
          id="expenseSearchInput"
          placeholder="Buscar compra, mercado, remédio..."
          value="${esc(f.search)}"
        />

        <div class="chips-scroll" style="margin-top:10px">
          <button type="button" class="chip ${f.kind === 'all' ? 'active' : ''}" data-filter-kind="all">Todos</button>
          <button type="button" class="chip ${f.kind === 'variable' ? 'active' : ''}" data-filter-kind="variable">Variáveis</button>
          <button type="button" class="chip ${f.kind === 'fixed' ? 'active' : ''}" data-filter-kind="fixed">Fixos</button>
          <button type="button" class="chip ${f.payment === 'cash' ? 'active' : ''}" data-filter-payment="cash">⚡ Pix/Débito</button>
          ${ui.state.cards.map((c) => `
            <button type="button" class="chip ${f.payment === c.id ? 'active' : ''}" data-filter-payment="${esc(c.id)}">💳 ${esc(c.name)}</button>
          `).join('')}
        </div>

        ${usedCatIds.length ? `
          <div class="chips-scroll" style="margin-top:6px">
            <button type="button" class="chip ${f.categoryId === 'all' ? 'active' : ''}" data-filter-cat="all">Todas categorias</button>
            ${usedCatIds.map((cid) => {
              const cat = getCategory(cid);
              return `<button type="button" class="chip ${f.categoryId === cid ? 'active' : ''}" data-filter-cat="${esc(cid)}">${cat.icon} ${esc(cat.name)}</button>`;
            }).join('')}
          </div>
        ` : ''}
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Lançamentos (${filtered.length})</h2>
            <div class="section-sub">Total filtrado: <strong>${F.formatBRL(filteredTotal)}</strong></div>
          </div>
          <button type="button" class="link-btn" data-action="open-add-variable">+ Compra</button>
        </div>

        ${filtered.length ? `
          <div class="item-list">
            ${filtered.map((it) => renderExpenseRow(it)).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <span class="empty-emoji">🧾</span>
            Nenhum lançamento encontrado com esses filtros.
          </div>
        `}
      </section>
    `;
  }

  function renderExpenseRow(it) {
    const cat = getCategory(it.categoryId);
    const card = it.cardId ? getCard(it.cardId) : null;
    const ownerTag = getOwnerLabel(it.owner);
    const instBadge = it.installments > 1 ? `<span class="tag">${it.installmentNumber}/${it.installments}</span>` : '';
    const payBadge = card
      ? `<span class="tag tag-card" style="background:${card.color}">💳 ${esc(card.name)}</span>`
      : `<span class="tag">⚡ Pix/Débito</span>`;
    const kindBadge = it.kind === 'fixed' ? '<span class="tag">📌 Fixo</span>' : '';

    const canTogglePaid = it.paymentMethod === 'cash';

    return `
      <div class="item-row ${it.paid ? 'is-paid' : ''}">
        ${canTogglePaid ? `
          <button type="button" class="check-circle ${it.paid ? 'checked' : ''}"
            data-action="toggle-item-paid"
            data-kind="${it.kind}"
            data-id="${esc(it.sourceId)}"
            aria-label="Alternar pago">
            ${it.paid ? '✓' : ''}
          </button>
        ` : `
          <span class="cat-icon" style="background:${cat.color}22">${cat.icon}</span>
        `}
        <div class="item-body" data-action="edit-item" data-kind="${it.kind}" data-id="${esc(it.sourceId)}" style="cursor:pointer">
          <div class="item-title">${esc(it.title)}</div>
          <div class="item-meta">
            <span>${cat.icon} ${esc(cat.name)}</span>
            <span>• ${formatDateBR(it.date)}</span>
            <span class="tag">${esc(ownerTag)}</span>
            ${kindBadge}
            ${payBadge}
            ${instBadge}
          </div>
        </div>
        <div class="item-right" data-action="edit-item" data-kind="${it.kind}" data-id="${esc(it.sourceId)}" style="cursor:pointer">
          <span class="item-amount">${F.formatBRL(it.scopedAmount)}</span>
          ${ui.scope !== 'house' && it.owner === 'shared'
            ? `<span class="item-sub">de ${F.formatBRL(it.amount)}</span>`
            : `<span class="item-sub">${it.paid ? 'Pago' : 'Em aberto'}</span>`
          }
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // ABA 3: CARTÕES (4 cartões, faturas e parcelas futuras)
  // -------------------------------------------------------------------------
  function renderCardsTab(s) {
    const totalBills = F.round2(s.cards.reduce((acc, c) => acc + (ui.scope === 'house' ? c.billTotal : c.scopeBillTotal), 0));
    const unpaidBills = F.round2(s.cards.filter((c) => !c.paid).reduce((acc, c) => acc + (ui.scope === 'house' ? c.billTotal : c.scopeBillTotal), 0));

    const futureMonths = [0, 1, 2, 3].map((offset) => F.addMonths(ui.monthKey, offset));
    const futureSummaries = futureMonths.map((mk) => F.getMonthSummary(ui.state, mk, ui.scope));

    return `
      <section class="card card-compact">
        <div class="section-head" style="margin-bottom:4px">
          <div>
            <h2 class="section-title">Faturas de ${F.formatMonthLabel(ui.monthKey)}</h2>
            <div class="section-sub">Total: <strong>${F.formatBRL(totalBills)}</strong> • Falta pagar: <strong class="${unpaidBills > 0 ? 'text-warn' : 'text-pos'}">${F.formatBRL(unpaidBills)}</strong></div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="add-card">+ Cartão</button>
        </div>
      </section>

      ${s.cards.map((entry) => {
        const c = entry.card;
        const shownBill = ui.scope === 'house' ? entry.billTotal : entry.scopeBillTotal;
        const limitPct = c.limit > 0 ? Math.min(100, Math.round((entry.committedLimit / c.limit) * 100)) : 0;
        const avail = Math.max(0, F.round2((Number(c.limit) || 0) - entry.committedLimit));
        const isExpanded = Boolean(ui.expandedCards[c.id]);

        return `
          <section class="card" style="padding:12px">
            <div class="credit-card-visual" style="background: linear-gradient(135deg, ${c.color}, #0f172a)">
              <div class="cc-top">
                <div>
                  <div class="cc-name">${esc(c.name)}</div>
                  <div class="cc-owner">Titular: ${esc(getOwnerLabel(c.owner))}</div>
                </div>
                <button type="button" class="cc-btn" style="flex:0; padding:6px 10px" data-action="edit-card" data-card-id="${esc(c.id)}">✎</button>
              </div>

              <div class="cc-bill-label">Fatura ${F.formatMonthLabel(ui.monthKey, true)} ${ui.scope !== 'house' ? '(sua parte)' : ''}</div>
              <div class="cc-bill-value">${F.formatBRL(shownBill)}</div>

              <div class="cc-dates">
                <span>Fecha dia ${c.closingDay}</span>
                <span>Vence dia ${c.dueDay}</span>
              </div>

              ${c.limit > 0 ? `
                <div class="cc-limit-bar">
                  <div class="cc-limit-fill" style="width:${limitPct}%"></div>
                </div>
                <div class="cc-dates" style="margin-top:5px; font-size:11px; opacity:0.85">
                  <span>Comprometido: ${F.formatBRL(entry.committedLimit)} (${limitPct}%)</span>
                  <span>Disp.: ${F.formatBRL(avail)}</span>
                </div>
              ` : ''}

              <div class="cc-actions">
                <button type="button" class="cc-btn ${entry.paid ? 'paid' : ''}" data-action="toggle-card-paid" data-card-id="${esc(c.id)}">
                  ${entry.paid ? '✓ Fatura Paga' : 'Marcar Paga'}
                </button>
                <button type="button" class="cc-btn" data-action="add-card-expense" data-card-id="${esc(c.id)}">
                  + Compra
                </button>
                <button type="button" class="cc-btn" data-action="toggle-card-items" data-card-id="${esc(c.id)}">
                  ${isExpanded ? 'Ocultar' : `Itens (${entry.items.length})`}
                </button>
              </div>
            </div>

            ${isExpanded ? `
              <div style="margin-top:12px">
                ${entry.items.length ? `
                  <div class="item-list">
                    ${entry.items.map((it) => {
                      const cat = getCategory(it.categoryId);
                      return `
                        <div class="item-row" data-action="edit-item" data-kind="${it.kind}" data-id="${esc(it.sourceId)}" style="cursor:pointer">
                          <span class="cat-icon" style="background:${cat.color}22">${cat.icon}</span>
                          <div class="item-body">
                            <div class="item-title">${esc(it.title)}</div>
                            <div class="item-meta">
                              <span>${esc(cat.name)}</span>
                              <span class="tag">${esc(getOwnerLabel(it.owner))}</span>
                              ${it.installments > 1 ? `<span class="tag">${it.installmentNumber}/${it.installments}</span>` : ''}
                              ${it.kind === 'fixed' ? '<span class="tag">📌 Fixo</span>' : ''}
                            </div>
                          </div>
                          <div class="item-right">
                            <span class="item-amount">${F.formatBRL(it.scopedAmount)}</span>
                            <span class="item-sub">${formatDateBR(it.date)}</span>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : '<div class="empty-state" style="padding:14px">Sem lançamentos nesta fatura.</div>'}
              </div>
            ` : ''}
          </section>
        `;
      }).join('')}

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Faturas Futuras (Parcelas + Fixos)</h2>
            <div class="section-sub">Total comprometido nos cartões por mês</div>
          </div>
        </div>
        <div class="projection-grid">
          ${futureSummaries.map((fs, idx) => `
            <div class="proj-card ${idx === 0 ? 'current' : ''}" data-action="jump-month" data-month="${fs.monthKey}">
              <div class="proj-month">${esc(F.formatMonthLabel(fs.monthKey, true))}</div>
              <div class="proj-bal">${F.formatBRL(fs.cardsTotal)}</div>
              <div class="proj-exp">Cartões</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // -------------------------------------------------------------------------
  // ABA 4: FIXOS & SALÁRIOS
  // -------------------------------------------------------------------------
  function renderFixedTab(s) {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const fixedItems = s.items.filter((i) => i.kind === 'fixed').sort((a, b) => a.dueDay - b.dueDay);
    const fixedPaid = F.round2(fixedItems.filter((i) => i.paid).reduce((acc, i) => acc + i.scopedAmount, 0));
    const fixedUnpaid = F.round2(fixedItems.filter((i) => !i.paid).reduce((acc, i) => acc + i.scopedAmount, 0));

    return `
      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Salários & Rendas (${F.formatMonthLabel(ui.monthKey, true)})</h2>
            <div class="section-sub">Total do mês: <strong class="text-pos">${F.formatBRL(s.incomes.houseTotal)}</strong></div>
          </div>
          <button type="button" class="link-btn" data-action="open-add-income">+ Extra</button>
        </div>

        <div class="item-list">
          <div class="item-row" data-action="edit-salary" data-person="p1" style="cursor:pointer">
            <span class="cat-icon" style="background:${p1.color}22">💼</span>
            <div class="item-body">
              <div class="item-title">Salário — ${esc(p1.name)}</div>
              <div class="item-meta">
                <span>${ui.state.incomeOverrides[ui.monthKey]?.p1 != null ? 'Valor ajustado neste mês' : 'Salário mensal fixo'}</span>
              </div>
            </div>
            <div class="item-right">
              <span class="item-amount text-pos">${F.formatBRL(s.incomes.p1Salary)}</span>
              <span class="item-sub">Editar ›</span>
            </div>
          </div>

          <div class="item-row" data-action="edit-salary" data-person="p2" style="cursor:pointer">
            <span class="cat-icon" style="background:${p2.color}22">💼</span>
            <div class="item-body">
              <div class="item-title">Salário — ${esc(p2.name)}</div>
              <div class="item-meta">
                <span>${ui.state.incomeOverrides[ui.monthKey]?.p2 != null ? 'Valor ajustado neste mês' : 'Salário mensal fixo'}</span>
              </div>
            </div>
            <div class="item-right">
              <span class="item-amount text-pos">${F.formatBRL(s.incomes.p2Salary)}</span>
              <span class="item-sub">Editar ›</span>
            </div>
          </div>

          ${s.incomes.extras.map((ex) => `
            <div class="item-row" data-action="edit-extra-income" data-id="${esc(ex.id)}" style="cursor:pointer">
              <span class="cat-icon" style="background:#10b98122">✨</span>
              <div class="item-body">
                <div class="item-title">${esc(ex.title)}</div>
                <div class="item-meta">
                  <span class="tag">Renda extra</span>
                  <span class="tag">${esc(getOwnerLabel(ex.owner))}</span>
                </div>
              </div>
              <div class="item-right">
                <span class="item-amount text-pos">+ ${F.formatBRL(ex.amount)}</span>
                <span class="item-sub">Editar</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Custos Fixos Mensais (${fixedItems.length})</h2>
            <div class="section-sub">
              Pago: <strong class="text-pos">${F.formatBRL(fixedPaid)}</strong> •
              Falta: <strong class="${fixedUnpaid > 0 ? 'text-warn' : 'text-pos'}">${F.formatBRL(fixedUnpaid)}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-add-fixed">+ Fixo</button>
        </div>

        ${fixedItems.length ? `
          <div class="item-list">
            ${fixedItems.map((it) => {
              const cat = getCategory(it.categoryId);
              const card = it.cardId ? getCard(it.cardId) : null;
              return `
                <div class="item-row ${it.paid ? 'is-paid' : ''}">
                  ${it.paymentMethod === 'cash' ? `
                    <button type="button" class="check-circle ${it.paid ? 'checked' : ''}"
                      data-action="toggle-item-paid"
                      data-kind="fixed"
                      data-id="${esc(it.sourceId)}"
                      aria-label="Marcar custo fixo como pago">
                      ${it.paid ? '✓' : ''}
                    </button>
                  ` : `
                    <span class="cat-icon" style="background:${cat.color}22">${cat.icon}</span>
                  `}
                  <div class="item-body" data-action="edit-item" data-kind="fixed" data-id="${esc(it.sourceId)}" style="cursor:pointer">
                    <div class="item-title">${esc(it.title)}</div>
                    <div class="item-meta">
                      <span>Dia ${it.dueDay}</span>
                      <span class="tag">${esc(getOwnerLabel(it.owner))}</span>
                      ${card ? `<span class="tag tag-card" style="background:${card.color}">💳 ${esc(card.name)}</span>` : '<span class="tag">⚡ Direto</span>'}
                      ${it.isOverridden ? '<span class="tag">Ajustado no mês</span>' : ''}
                    </div>
                  </div>
                  <div class="item-right">
                    <span class="item-amount">${F.formatBRL(it.scopedAmount)}</span>
                    <button type="button" class="link-btn" style="padding:2px 0; font-size:11px"
                      data-action="override-fixed-month" data-id="${esc(it.sourceId)}">
                      Ajustar mês
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <span class="empty-emoji">📌</span>
            Nenhum custo fixo cadastrado ainda.<br/>
            Cadastre aluguel, energia, internet, streaming e outros gastos mensais.
          </div>
        `}
      </section>
    `;
  }

  // -------------------------------------------------------------------------
  // ABA 5: AJUSTES & BACKUP
  // -------------------------------------------------------------------------
  function renderSettingsTab() {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const splitMode = ui.state.settings.splitMode;
    const theme = ui.state.settings.theme;

    return `
      ${ui.deferredInstallPrompt ? `
        <section class="banner">
          <h3>📲 Instalar na Tela Inicial</h3>
          <p>Instale o Nossa Casa como aplicativo nativo no seu celular para abrir em tela cheia e 100% offline.</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="install-pwa">Instalar App Agora</button>
        </section>
      ` : ''}

      <section class="card">
        <div class="section-head">
          <h2 class="section-title">Casal & Divisão de Contas</h2>
        </div>

        <form id="settingsCoupleForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Nome 1</label>
              <input type="text" class="input" name="p1Name" value="${esc(p1.name)}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Salário padrão (R$)</label>
              <input type="text" inputmode="decimal" class="input" name="p1Salary" value="${formatInputAmount(p1.salary)}" placeholder="0,00" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Nome 2</label>
              <input type="text" class="input" name="p2Name" value="${esc(p2.name)}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Salário padrão (R$)</label>
              <input type="text" inputmode="decimal" class="input" name="p2Salary" value="${formatInputAmount(p2.salary)}" placeholder="0,00" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Regra de divisão das contas conjuntas</label>
            <div class="seg-control two">
              <button type="button" class="seg-opt ${splitMode === 'proportional' ? 'active' : ''}" data-set-split="proportional">
                Proporcional à renda
              </button>
              <button type="button" class="seg-opt ${splitMode === 'equal' ? 'active' : ''}" data-set-split="equal">
                Sempre 50% / 50%
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block">Salvar Perfis</button>
        </form>
      </section>

      <section class="card">
        <div class="section-head">
          <h2 class="section-title">Aparência</h2>
        </div>
        <div class="seg-control two">
          <button type="button" class="seg-opt ${theme === 'dark' ? 'active' : ''}" data-set-theme="dark">🌙 Modo Escuro</button>
          <button type="button" class="seg-opt ${theme === 'light' ? 'active' : ''}" data-set-theme="light">☀️ Modo Claro</button>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Categorias (${ui.state.categories.length})</h2>
            <div class="section-sub">Personalize para mercado, remédio, lazer, etc.</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-action="add-category">+ Nova</button>
        </div>
        <div class="pay-chips">
          ${ui.state.categories.map((c) => `
            <span class="tag" style="padding:6px 10px; font-size:12px">${c.icon} ${esc(c.name)}</span>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Memória do Celular & Backup</h2>
            <div class="section-sub">100% salvo no seu aparelho. Exporte para backup ou para compartilhar com sua namorada.</div>
          </div>
        </div>

        <div class="form-row" style="margin-bottom:10px">
          <button type="button" class="btn btn-secondary" data-action="export-backup">⬇️ Exportar Backup</button>
          <button type="button" class="btn btn-secondary" data-action="import-backup">⬆️ Importar Backup</button>
        </div>

        <div class="divider"></div>

        <div class="form-row">
          <button type="button" class="btn btn-secondary btn-sm" data-action="load-demo">Carregar exemplo</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="reset-all">Apagar tudo</button>
        </div>
      </section>
    `;
  }

  // =========================================================================
  // Bind de Eventos das Abas
  // =========================================================================
  function bindTabEvents() {
    const main = $('#mainContent');

    main.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = el.dataset.action;

        if (act === 'open-salaries') openSalaryModal('p1');
        else if (act === 'edit-salary') openSalaryModal(el.dataset.person);
        else if (act === 'load-demo') {
          if (confirm('Carregar dados de exemplo para testar o app? (Isso substitui os dados atuais)')) {
            ui.state = S.createDemoState(ui.monthKey);
            persist('Dados de exemplo carregados!');
          }
        }
        else if (act === 'toggle-split-mode') {
          ui.state.settings.splitMode = ui.state.settings.splitMode === 'proportional' ? 'equal' : 'proportional';
          persist(`Divisão alterada para ${ui.state.settings.splitMode === 'proportional' ? 'Proporcional' : '50% / 50%'}`);
        }
        else if (act === 'go-tab') {
          ui.tab = el.dataset.tab;
          render();
        }
        else if (act === 'filter-category') {
          ui.expenseFilter.categoryId = el.dataset.catId;
          ui.expenseFilter.kind = 'all';
          ui.expenseFilter.payment = 'all';
          ui.tab = 'expenses';
          render();
        }
        else if (act === 'jump-month') {
          ui.monthKey = el.dataset.month;
          render();
        }
        else if (act === 'open-add-variable') openQuickModal('variable');
        else if (act === 'open-add-fixed') openQuickModal('fixed');
        else if (act === 'open-add-income') openQuickModal('income');
        else if (act === 'add-card-expense') openQuickModal('variable', { defaultCardId: el.dataset.cardId });
        else if (act === 'toggle-item-paid') toggleItemPaid(el.dataset.kind, el.dataset.id);
        else if (act === 'edit-item') {
          if (el.dataset.kind === 'fixed') openEditFixedModal(el.dataset.id);
          else openEditExpenseModal(el.dataset.id);
        }
        else if (act === 'edit-extra-income') openEditIncomeModal(el.dataset.id);
        else if (act === 'override-fixed-month') openOverrideFixedModal(el.dataset.id);
        else if (act === 'toggle-card-paid') toggleCardBillPaid(el.dataset.cardId);
        else if (act === 'toggle-card-items') {
          const cid = el.dataset.cardId;
          ui.expandedCards[cid] = !ui.expandedCards[cid];
          render();
        }
        else if (act === 'add-card') openCardModal(null);
        else if (act === 'edit-card') openCardModal(el.dataset.cardId);
        else if (act === 'add-category') openCategoryModal();
        else if (act === 'export-backup') exportBackupFile();
        else if (act === 'import-backup') $('#fileImportInput').click();
        else if (act === 'reset-all') {
          if (confirm('Tem certeza que deseja apagar TODOS os dados salvos neste celular?')) {
            ui.state = S.createEmptyState();
            persist('Todos os dados foram limpos.');
          }
        }
        else if (act === 'install-pwa' && ui.deferredInstallPrompt) {
          ui.deferredInstallPrompt.prompt();
          ui.deferredInstallPrompt.userChoice.then(() => {
            ui.deferredInstallPrompt = null;
            render();
          });
        }
      });
    });

    // Filtros da aba Gastos
    const searchEl = $('#expenseSearchInput');
    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        ui.expenseFilter.search = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const nextInput = $('#expenseSearchInput');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(pos, pos);
        }
      });
    }

    main.querySelectorAll('[data-filter-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.expenseFilter.kind = btn.dataset.filterKind;
        render();
      });
    });

    main.querySelectorAll('[data-filter-payment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.filterPayment;
        ui.expenseFilter.payment = ui.expenseFilter.payment === val ? 'all' : val;
        render();
      });
    });

    main.querySelectorAll('[data-filter-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.expenseFilter.categoryId = btn.dataset.filterCat;
        render();
      });
    });

    // Ajustes
    main.querySelectorAll('[data-set-split]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.state.settings.splitMode = btn.dataset.setSplit;
        persist('Regra de divisão atualizada!');
      });
    });

    main.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.state.settings.theme = btn.dataset.setTheme;
        persist();
      });
    });

    const coupleForm = $('#settingsCoupleForm');
    if (coupleForm) {
      coupleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(coupleForm);
        ui.state.settings.people.p1.name = String(fd.get('p1Name') || 'Eu').trim();
        ui.state.settings.people.p2.name = String(fd.get('p2Name') || 'Namorada').trim();
        ui.state.settings.people.p1.salary = F.round2(parseAmount(fd.get('p1Salary')));
        ui.state.settings.people.p2.salary = F.round2(parseAmount(fd.get('p2Salary')));
        persist('Perfis e salários salvos!');
      });
    }
  }

  // =========================================================================
  // Ações de Estado
  // =========================================================================
  function toggleItemPaid(kind, id) {
    if (kind === 'fixed') {
      if (!ui.state.fixedMonthlyState[ui.monthKey]) ui.state.fixedMonthlyState[ui.monthKey] = {};
      const curr = ui.state.fixedMonthlyState[ui.monthKey][id] || {};
      ui.state.fixedMonthlyState[ui.monthKey][id] = { ...curr, paid: !curr.paid };
      persist(curr.paid ? 'Marcado como em aberto' : 'Conta marcada como paga ✓');
    } else {
      const exp = ui.state.expenses.find((x) => x.id === id);
      if (!exp) return;
      exp.paid = exp.paid === false ? true : false;
      persist(exp.paid ? 'Marcado como pago ✓' : 'Marcado como em aberto');
    }
  }

  function toggleCardBillPaid(cardId) {
    if (!ui.state.cardBillStatus[ui.monthKey]) ui.state.cardBillStatus[ui.monthKey] = {};
    const curr = ui.state.cardBillStatus[ui.monthKey][cardId] || { paid: false };
    ui.state.cardBillStatus[ui.monthKey][cardId] = { paid: !curr.paid };
    persist(!curr.paid ? 'Fatura marcada como paga ✓' : 'Fatura reaberta');
  }

  function exportBackupFile() {
    const content = S.exportJSON(ui.state);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nossa-casa-backup-${F.getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup exportado com sucesso!');
  }

  // =========================================================================
  // Modais (Bottom Sheets)
  // =========================================================================
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
    $('#modalBody').innerHTML = '';
  }

  // 1. Modal de Lançamento Rápido (Compra Variável | Custo Fixo | Renda Extra)
  function openQuickModal(initialMode, opts) {
    const mode = initialMode || 'variable';
    const options = opts || {};

    const tabsHtml = `
      <div class="seg-control" style="margin-bottom:14px" id="quickModeTabs">
        <button type="button" class="seg-opt ${mode === 'variable' ? 'active' : ''}" data-qmode="variable">🛍️ Compra</button>
        <button type="button" class="seg-opt ${mode === 'fixed' ? 'active' : ''}" data-qmode="fixed">📌 Fixo</button>
        <button type="button" class="seg-opt ${mode === 'income' ? 'active' : ''}" data-qmode="income">💰 Renda</button>
      </div>
      <div id="quickFormContainer"></div>
    `;

    openModal('Novo Lançamento', tabsHtml);

    function mountMode(m) {
      $$('#quickModeTabs .seg-opt').forEach((b) => b.classList.toggle('active', b.dataset.qmode === m));
      const box = $('#quickFormContainer');
      if (m === 'variable') renderVariableForm(box, null, options);
      else if (m === 'fixed') renderFixedForm(box, null);
      else renderIncomeForm(box, null);
    }

    $$('#quickModeTabs .seg-opt').forEach((btn) => {
      btn.addEventListener('click', () => mountMode(btn.dataset.qmode));
    });

    mountMode(mode);
  }

  function openEditExpenseModal(id) {
    const exp = ui.state.expenses.find((e) => e.id === id);
    if (!exp) return;
    openModal('Editar Compra', '<div id="quickFormContainer"></div>');
    renderVariableForm($('#quickFormContainer'), exp, {});
  }

  function openEditFixedModal(id) {
    const fx = ui.state.fixedExpenses.find((f) => f.id === id);
    if (!fx) return;
    openModal('Editar Custo Fixo', '<div id="quickFormContainer"></div>');
    renderFixedForm($('#quickFormContainer'), fx);
  }

  function openEditIncomeModal(id) {
    const inc = ui.state.extraIncomes.find((i) => i.id === id);
    if (!inc) return;
    openModal('Editar Renda Extra', '<div id="quickFormContainer"></div>');
    renderIncomeForm($('#quickFormContainer'), inc);
  }

  // Formulário de Compra Variável (com parcelamento inteligente por cartão)
  function renderVariableForm(container, existing, opts) {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const isEdit = Boolean(existing);

    const defaultCardId = (opts && opts.defaultCardId) || null;
    let owner = existing ? existing.owner : (ui.scope === 'house' ? 'shared' : ui.scope);
    let paymentMethod = existing ? existing.paymentMethod : (defaultCardId ? 'card' : 'cash');
    let cardId = existing ? existing.cardId : defaultCardId;
    let categoryId = existing ? existing.categoryId : 'mercado';
    let installments = existing ? existing.installments : 1;
    let amountMode = 'total'; // 'total' | 'installment'
    let dateVal = existing ? existing.date : (ui.monthKey === F.getCurrentMonthKey() ? F.getTodayISO() : `${ui.monthKey}-05`);
    let firstBillMonth = existing
      ? existing.firstBillMonth
      : (paymentMethod === 'card' && cardId
          ? F.suggestCardBillMonth(dateVal, (getCard(cardId) || {}).closingDay)
          : ui.monthKey);

    const varCats = ui.state.categories.filter((c) => c.type !== 'fixed');

    container.innerHTML = `
      <form id="varExpenseForm">
        <div class="form-group">
          <label class="form-label">Valor</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="varAmountInput" placeholder="0,00" value="${existing ? formatInputAmount(existing.totalAmount) : ''}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descrição</label>
          <input type="text" class="input" id="varTitleInput" placeholder="Ex: Mercado, Farmácia, Jantar..." value="${existing ? esc(existing.title) : ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label">De quem é essa despesa?</label>
          <div class="seg-control" id="varOwnerSeg">
            <button type="button" class="seg-opt ${owner === 'shared' ? 'active' : ''}" data-owner="shared">🏠 Conjunta</button>
            <button type="button" class="seg-opt ${owner === 'p1' ? 'active' : ''}" data-owner="p1">${esc(p1.name)}</button>
            <button type="button" class="seg-opt ${owner === 'p2' ? 'active' : ''}" data-owner="p2">${esc(p2.name)}</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Forma de pagamento</label>
          <div class="pay-chips" id="varPayChips">
            <button type="button" class="pay-chip ${paymentMethod === 'cash' ? 'active' : ''}" data-pay="cash">⚡ Pix / Débito</button>
            ${ui.state.cards.map((c) => `
              <button type="button" class="pay-chip ${paymentMethod === 'card' && cardId === c.id ? 'active' : ''}" data-pay="${esc(c.id)}">
                💳 ${esc(c.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <div id="varCardExtras" class="${paymentMethod === 'card' ? '' : 'hidden'}">
          <div class="form-group">
            <label class="form-label">Parcelas</label>
            <div class="chips-scroll" id="instQuickChips">
              ${[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => `
                <button type="button" class="chip ${installments === n ? 'active' : ''}" data-inst="${n}">${n}x</button>
              `).join('')}
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Qtd. parcelas</label>
              <input type="number" min="1" max="48" class="input" id="varInstInput" value="${installments}" />
            </div>
            <div class="form-group">
              <label class="form-label">1ª Fatura</label>
              <input type="month" class="input" id="varFirstMonthInput" value="${firstBillMonth}" />
            </div>
          </div>

          <div class="form-group ${installments > 1 ? '' : 'hidden'}" id="varAmountModeGroup">
            <div class="seg-control two" id="varAmountModeSeg">
              <button type="button" class="seg-opt active" data-amode="total">Informei valor TOTAL</button>
              <button type="button" class="seg-opt" data-amode="installment">Informei valor da PARCELA</button>
            </div>
          </div>

          <div class="preview-box" id="varInstPreview"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Data da compra</label>
          <input type="date" class="input" id="varDateInput" value="${dateVal}" required />
        </div>

        <div class="form-group">
          <label class="form-label">Categoria</label>
          <div class="cat-grid" id="varCatGrid">
            ${varCats.map((c) => `
              <button type="button" class="cat-pick ${categoryId === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">
                <span>${c.icon}</span>
                <span>${esc(c.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Salvar alterações' : 'Adicionar Compra'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger btn-block" id="btnDeleteVar" style="margin-top:8px">Excluir lançamento</button>` : ''}
      </form>
    `;

    function updatePreview() {
      const cardExtras = $('#varCardExtras');
      if (paymentMethod !== 'card') {
        cardExtras.classList.add('hidden');
        return;
      }
      cardExtras.classList.remove('hidden');

      const rawVal = parseAmount($('#varAmountInput').value);
      const count = Math.max(1, Math.min(48, parseInt($('#varInstInput').value, 10) || 1));
      installments = count;
      $('#varAmountModeGroup').classList.toggle('hidden', count <= 1);

      const totalVal = amountMode === 'installment' ? F.round2(rawVal * count) : F.round2(rawVal);
      const instVal = F.getInstallmentAmount(totalVal, count, 1);
      const fm = $('#varFirstMonthInput').value || ui.monthKey;
      const lastM = F.addMonths(fm, count - 1);

      $('#varInstPreview').innerHTML = count > 1
        ? `<strong>${count}x de ${F.formatBRL(instVal)}</strong> (Total: ${F.formatBRL(totalVal)})<br/>Faturas: ${F.formatMonthLabel(fm, true)} até ${F.formatMonthLabel(lastM, true)}`
        : `À vista na fatura de <strong>${F.formatMonthLabel(fm, true)}</strong> (${F.formatBRL(totalVal)})`;
    }

    $$('#varOwnerSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        owner = b.dataset.owner;
        $$('#varOwnerSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $$('#varPayChips .pay-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const pay = b.dataset.pay;
        if (pay === 'cash') {
          paymentMethod = 'cash';
          cardId = null;
        } else {
          paymentMethod = 'card';
          cardId = pay;
          const card = getCard(cardId);
          if (card && !isEdit) {
            const suggested = F.suggestCardBillMonth($('#varDateInput').value, card.closingDay);
            $('#varFirstMonthInput').value = suggested;
          }
        }
        $$('#varPayChips .pay-chip').forEach((x) => x.classList.toggle('active', x === b));
        updatePreview();
      });
    });

    $$('#instQuickChips .chip').forEach((b) => {
      b.addEventListener('click', () => {
        installments = parseInt(b.dataset.inst, 10);
        $('#varInstInput').value = installments;
        $$('#instQuickChips .chip').forEach((x) => x.classList.toggle('active', x === b));
        updatePreview();
      });
    });

    $$('#varAmountModeSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        amountMode = b.dataset.amode;
        $$('#varAmountModeSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
        updatePreview();
      });
    });

    $$('#varCatGrid .cat-pick').forEach((b) => {
      b.addEventListener('click', () => {
        categoryId = b.dataset.cat;
        $$('#varCatGrid .cat-pick').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $('#varAmountInput').addEventListener('input', updatePreview);
    $('#varInstInput').addEventListener('input', updatePreview);
    $('#varFirstMonthInput').addEventListener('change', updatePreview);
    $('#varDateInput').addEventListener('change', () => {
      if (paymentMethod === 'card' && cardId && !isEdit) {
        const card = getCard(cardId);
        if (card) {
          $('#varFirstMonthInput').value = F.suggestCardBillMonth($('#varDateInput').value, card.closingDay);
        }
      }
      updatePreview();
    });

    updatePreview();

    $('#varExpenseForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const rawVal = parseAmount($('#varAmountInput').value);
      const title = $('#varTitleInput').value.trim();
      const dateISO = $('#varDateInput').value || F.getTodayISO();
      if (rawVal <= 0 || !title) {
        showToast('Informe um valor maior que zero e a descrição.');
        return;
      }

      const instCount = paymentMethod === 'card'
        ? Math.max(1, Math.min(48, parseInt($('#varInstInput').value, 10) || 1))
        : 1;
      const totalAmount = paymentMethod === 'card' && amountMode === 'installment'
        ? F.round2(rawVal * instCount)
        : F.round2(rawVal);

      const billMonth = paymentMethod === 'card'
        ? ($('#varFirstMonthInput').value || dateISO.slice(0, 7))
        : dateISO.slice(0, 7);

      if (isEdit) {
        Object.assign(existing, {
          title,
          totalAmount,
          installments: instCount,
          categoryId,
          owner,
          paymentMethod,
          cardId: paymentMethod === 'card' ? cardId : null,
          date: dateISO,
          firstBillMonth: billMonth
        });
        closeModal();
        persist('Compra atualizada!');
      } else {
        ui.state.expenses.push({
          id: S.uid('exp'),
          title,
          totalAmount,
          installments: instCount,
          categoryId,
          owner,
          paymentMethod,
          cardId: paymentMethod === 'card' ? cardId : null,
          date: dateISO,
          firstBillMonth: billMonth,
          paid: paymentMethod === 'cash'
        });
        closeModal();
        persist(instCount > 1 ? `Compra em ${instCount}x registrada!` : 'Compra adicionada!');
      }
    });

    const btnDel = $('#btnDeleteVar');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        if (confirm('Excluir esta compra (e todas as suas parcelas)?')) {
          ui.state.expenses = ui.state.expenses.filter((x) => x.id !== existing.id);
          closeModal();
          persist('Compra excluída.');
        }
      });
    }
  }

  // Formulário de Custo Fixo
  function renderFixedForm(container, existing) {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const isEdit = Boolean(existing);

    let owner = existing ? existing.owner : (ui.scope === 'house' ? 'shared' : ui.scope);
    let paymentMethod = existing ? existing.paymentMethod : 'cash';
    let cardId = existing ? existing.cardId : null;
    let categoryId = existing ? existing.categoryId : 'moradia';

    const fixedCats = [
      ...ui.state.categories.filter((c) => c.type === 'fixed'),
      ...ui.state.categories.filter((c) => c.type !== 'fixed').slice(0, 3)
    ];

    container.innerHTML = `
      <form id="fixedExpenseForm">
        <div class="form-group">
          <label class="form-label">Valor mensal padrão</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="fxAmountInput" placeholder="0,00" value="${existing ? formatInputAmount(existing.amount) : ''}" required />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nome da conta fixa</label>
            <input type="text" class="input" id="fxTitleInput" placeholder="Ex: Aluguel, Luz..." value="${existing ? esc(existing.title) : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Dia vencimento</label>
            <input type="number" min="1" max="31" class="input" id="fxDueDayInput" value="${existing ? existing.dueDay : 10}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Responsável</label>
          <div class="seg-control" id="fxOwnerSeg">
            <button type="button" class="seg-opt ${owner === 'shared' ? 'active' : ''}" data-owner="shared">🏠 Conjunta</button>
            <button type="button" class="seg-opt ${owner === 'p1' ? 'active' : ''}" data-owner="p1">${esc(p1.name)}</button>
            <button type="button" class="seg-opt ${owner === 'p2' ? 'active' : ''}" data-owner="p2">${esc(p2.name)}</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Como é pago?</label>
          <div class="pay-chips" id="fxPayChips">
            <button type="button" class="pay-chip ${paymentMethod === 'cash' ? 'active' : ''}" data-pay="cash">⚡ Pix / Boleto / Débito</button>
            ${ui.state.cards.map((c) => `
              <button type="button" class="pay-chip ${paymentMethod === 'card' && cardId === c.id ? 'active' : ''}" data-pay="${esc(c.id)}">
                💳 ${esc(c.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Categoria</label>
          <div class="cat-grid" id="fxCatGrid">
            ${fixedCats.map((c) => `
              <button type="button" class="cat-pick ${categoryId === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">
                <span>${c.icon}</span>
                <span>${esc(c.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Salvar Custo Fixo' : 'Adicionar Custo Fixo'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger btn-block" id="btnDeleteFx" style="margin-top:8px">Excluir custo fixo</button>` : ''}
      </form>
    `;

    $$('#fxOwnerSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        owner = b.dataset.owner;
        $$('#fxOwnerSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $$('#fxPayChips .pay-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const pay = b.dataset.pay;
        paymentMethod = pay === 'cash' ? 'cash' : 'card';
        cardId = pay === 'cash' ? null : pay;
        $$('#fxPayChips .pay-chip').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $$('#fxCatGrid .cat-pick').forEach((b) => {
      b.addEventListener('click', () => {
        categoryId = b.dataset.cat;
        $$('#fxCatGrid .cat-pick').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $('#fixedExpenseForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = F.round2(parseAmount($('#fxAmountInput').value));
      const title = $('#fxTitleInput').value.trim();
      const dueDay = Math.max(1, Math.min(31, parseInt($('#fxDueDayInput').value, 10) || 10));
      if (amount <= 0 || !title) {
        showToast('Preencha o nome e um valor maior que zero.');
        return;
      }

      if (isEdit) {
        Object.assign(existing, {
          title,
          amount,
          dueDay,
          owner,
          categoryId,
          paymentMethod,
          cardId: paymentMethod === 'card' ? cardId : null
        });
        closeModal();
        persist('Custo fixo atualizado!');
      } else {
        ui.state.fixedExpenses.push({
          id: S.uid('fx'),
          title,
          amount,
          dueDay,
          owner,
          categoryId,
          paymentMethod,
          cardId: paymentMethod === 'card' ? cardId : null,
          startMonth: ui.monthKey,
          endMonth: null,
          active: true
        });
        closeModal();
        persist('Custo fixo adicionado! Repetirá todo mês.');
      }
    });

    const btnDel = $('#btnDeleteFx');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        if (confirm('Remover este custo fixo permanentemente?')) {
          ui.state.fixedExpenses = ui.state.fixedExpenses.filter((x) => x.id !== existing.id);
          closeModal();
          persist('Custo fixo removido.');
        }
      });
    }
  }

  // Formulário de Renda Extra
  function renderIncomeForm(container, existing) {
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const isEdit = Boolean(existing);
    let owner = existing ? existing.owner : (ui.scope === 'house' ? 'p1' : ui.scope);

    container.innerHTML = `
      <form id="extraIncomeForm">
        <div class="form-group">
          <label class="form-label">Valor da renda extra (${F.formatMonthLabel(ui.monthKey, true)})</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="incAmountInput" placeholder="0,00" value="${existing ? formatInputAmount(existing.amount) : ''}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Descrição</label>
          <input type="text" class="input" id="incTitleInput" placeholder="Ex: 13º, Freelance, Bônus, VR..." value="${existing ? esc(existing.title) : ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label">Quem recebeu?</label>
          <div class="seg-control" id="incOwnerSeg">
            <button type="button" class="seg-opt ${owner === 'p1' ? 'active' : ''}" data-owner="p1">${esc(p1.name)}</button>
            <button type="button" class="seg-opt ${owner === 'p2' ? 'active' : ''}" data-owner="p2">${esc(p2.name)}</button>
            <button type="button" class="seg-opt ${owner === 'shared' ? 'active' : ''}" data-owner="shared">🏠 Casa</button>
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Salvar Renda Extra' : 'Adicionar Renda Extra'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger btn-block" id="btnDeleteInc" style="margin-top:8px">Excluir renda extra</button>` : ''}
      </form>
    `;

    $$('#incOwnerSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        owner = b.dataset.owner;
        $$('#incOwnerSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $('#extraIncomeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = F.round2(parseAmount($('#incAmountInput').value));
      const title = $('#incTitleInput').value.trim();
      if (amount <= 0 || !title) {
        showToast('Informe valor e descrição.');
        return;
      }

      if (isEdit) {
        Object.assign(existing, { title, amount, owner });
        closeModal();
        persist('Renda extra atualizada!');
      } else {
        ui.state.extraIncomes.push({
          id: S.uid('inc'),
          title,
          amount,
          owner,
          month: ui.monthKey,
          date: F.getTodayISO()
        });
        closeModal();
        persist('Renda extra adicionada!');
      }
    });

    const btnDel = $('#btnDeleteInc');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        ui.state.extraIncomes = ui.state.extraIncomes.filter((x) => x.id !== existing.id);
        closeModal();
        persist('Renda extra removida.');
      });
    }
  }

  // Modal de Salário (padrão ou só no mês atual)
  function openSalaryModal(personKey) {
    const person = ui.state.settings.people[personKey];
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    const monthOverride = ui.state.incomeOverrides[ui.monthKey]?.[personKey];
    const currentVal = monthOverride != null ? monthOverride : person.salary;

    openModal('Salário do Casal', `
      <form id="salaryModalForm">
        <div class="form-group">
          <label class="form-label">Salário de ${esc(p1.name)} (padrão mensal)</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="salP1Input" placeholder="0,00" value="${formatInputAmount(p1.salary)}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Salário de ${esc(p2.name)} (padrão mensal)</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="salP2Input" placeholder="0,00" value="${formatInputAmount(p2.salary)}" />
          </div>
        </div>

        <div class="divider"></div>

        <div class="form-group">
          <label class="form-label">Ajuste pontual só em ${F.formatMonthLabel(ui.monthKey)} para ${esc(person.name)} (opcional)</label>
          <input type="text" inputmode="decimal" class="input" id="salOverrideInput" placeholder="Deixe vazio para usar o padrão" value="${monthOverride != null ? formatInputAmount(currentVal) : ''}" />
        </div>

        <button type="submit" class="btn btn-primary btn-block">Salvar Salários</button>
      </form>
    `);

    $('#salaryModalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      ui.state.settings.people.p1.salary = F.round2(parseAmount($('#salP1Input').value));
      ui.state.settings.people.p2.salary = F.round2(parseAmount($('#salP2Input').value));

      const rawOver = $('#salOverrideInput').value.trim();
      if (!ui.state.incomeOverrides[ui.monthKey]) ui.state.incomeOverrides[ui.monthKey] = {};
      if (rawOver) {
        ui.state.incomeOverrides[ui.monthKey][personKey] = F.round2(parseAmount(rawOver));
      } else {
        delete ui.state.incomeOverrides[ui.monthKey][personKey];
      }

      closeModal();
      persist('Salários atualizados!');
    });
  }

  // Modal de Ajuste Mensal de Custo Fixo (ex: conta de luz veio diferente no mês)
  function openOverrideFixedModal(fixedId) {
    const fx = ui.state.fixedExpenses.find((f) => f.id === fixedId);
    if (!fx) return;
    const mState = (ui.state.fixedMonthlyState[ui.monthKey] && ui.state.fixedMonthlyState[ui.monthKey][fixedId]) || {};
    const val = mState.amount != null ? mState.amount : fx.amount;

    openModal(`Ajustar ${fx.title} (${F.formatMonthLabel(ui.monthKey, true)})`, `
      <form id="overrideFxForm">
        <p class="section-sub" style="margin-top:0">
          Altera o valor apenas em <strong>${F.formatMonthLabel(ui.monthKey)}</strong> sem mudar o valor padrão (${F.formatBRL(fx.amount)}).
        </p>
        <div class="form-group">
          <label class="form-label">Valor neste mês</label>
          <div class="amount-input-wrap">
            <span class="currency-prefix">R$</span>
            <input type="text" inputmode="decimal" class="amount-input" id="ovFxAmount" value="${formatInputAmount(val)}" required />
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Salvar valor deste mês</button>
        <button type="button" class="btn btn-secondary btn-block" id="btnResetOvFx" style="margin-top:8px">Voltar ao padrão (${F.formatBRL(fx.amount)})</button>
        <button type="button" class="btn btn-danger btn-block" id="btnSkipOvFx" style="margin-top:8px">Pular só neste mês</button>
      </form>
    `);

    $('#overrideFxForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ui.state.fixedMonthlyState[ui.monthKey]) ui.state.fixedMonthlyState[ui.monthKey] = {};
      const curr = ui.state.fixedMonthlyState[ui.monthKey][fixedId] || {};
      ui.state.fixedMonthlyState[ui.monthKey][fixedId] = {
        ...curr,
        amount: F.round2(parseAmount($('#ovFxAmount').value)),
        skipped: false
      };
      closeModal();
      persist('Valor ajustado para este mês!');
    });

    $('#btnResetOvFx').addEventListener('click', () => {
      if (ui.state.fixedMonthlyState[ui.monthKey]?.[fixedId]) {
        delete ui.state.fixedMonthlyState[ui.monthKey][fixedId].amount;
        ui.state.fixedMonthlyState[ui.monthKey][fixedId].skipped = false;
      }
      closeModal();
      persist('Valor voltou ao padrão.');
    });

    $('#btnSkipOvFx').addEventListener('click', () => {
      if (!ui.state.fixedMonthlyState[ui.monthKey]) ui.state.fixedMonthlyState[ui.monthKey] = {};
      ui.state.fixedMonthlyState[ui.monthKey][fixedId] = { skipped: true };
      closeModal();
      persist('Conta fixa pulada neste mês.');
    });
  }

  // Modal de Cartão (Criar/Editar)
  function openCardModal(cardId) {
    const existing = cardId ? getCard(cardId) : null;
    const isEdit = Boolean(existing);
    const p1 = ui.state.settings.people.p1;
    const p2 = ui.state.settings.people.p2;
    let owner = existing ? existing.owner : 'p1';
    let color = existing ? existing.color : CARD_COLORS[ui.state.cards.length % CARD_COLORS.length];

    openModal(isEdit ? 'Editar Cartão' : 'Novo Cartão', `
      <form id="cardForm">
        <div class="form-group">
          <label class="form-label">Nome do cartão</label>
          <input type="text" class="input" id="ccName" placeholder="Ex: Nubank, Itaú Black..." value="${existing ? esc(existing.name) : ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label">Titular</label>
          <div class="seg-control" id="ccOwnerSeg">
            <button type="button" class="seg-opt ${owner === 'p1' ? 'active' : ''}" data-owner="p1">${esc(p1.name)}</button>
            <button type="button" class="seg-opt ${owner === 'p2' ? 'active' : ''}" data-owner="p2">${esc(p2.name)}</button>
            <button type="button" class="seg-opt ${owner === 'shared' ? 'active' : ''}" data-owner="shared">🏠 Conjunto</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Limite total (R$)</label>
          <input type="text" inputmode="decimal" class="input" id="ccLimit" placeholder="3000,00" value="${existing ? formatInputAmount(existing.limit) : ''}" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Dia fechamento</label>
            <input type="number" min="1" max="31" class="input" id="ccClosing" value="${existing ? existing.closingDay : 5}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Dia vencimento</label>
            <input type="number" min="1" max="31" class="input" id="ccDue" value="${existing ? existing.dueDay : 12}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Cor do cartão</label>
          <div class="color-dots" id="ccColorDots">
            ${CARD_COLORS.map((hex) => `
              <button type="button" class="color-dot-btn ${color === hex ? 'active' : ''}" style="background:${hex}" data-color="${hex}"></button>
            `).join('')}
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Salvar Cartão' : 'Adicionar Cartão'}</button>
        ${isEdit && ui.state.cards.length > 1 ? `<button type="button" class="btn btn-danger btn-block" id="btnDelCard" style="margin-top:8px">Remover cartão</button>` : ''}
      </form>
    `);

    $$('#ccOwnerSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        owner = b.dataset.owner;
        $$('#ccOwnerSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $$('#ccColorDots .color-dot-btn').forEach((b) => {
      b.addEventListener('click', () => {
        color = b.dataset.color;
        $$('#ccColorDots .color-dot-btn').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $('#cardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#ccName').value.trim();
      const limit = F.round2(parseAmount($('#ccLimit').value));
      const closingDay = Math.max(1, Math.min(31, parseInt($('#ccClosing').value, 10) || 5));
      const dueDay = Math.max(1, Math.min(31, parseInt($('#ccDue').value, 10) || 12));
      if (!name) return;

      if (isEdit) {
        Object.assign(existing, { name, owner, limit, closingDay, dueDay, color });
        closeModal();
        persist('Cartão atualizado!');
      } else {
        ui.state.cards.push({
          id: S.uid('card'),
          name,
          owner,
          limit,
          closingDay,
          dueDay,
          color
        });
        closeModal();
        persist('Novo cartão adicionado!');
      }
    });

    const btnDel = $('#btnDelCard');
    if (btnDel) {
      btnDel.addEventListener('click', () => {
        if (confirm('Remover este cartão? Compras antigas nele continuarão no histórico como Pix/Débito.')) {
          ui.state.expenses.forEach((e) => {
            if (e.cardId === existing.id) {
              e.cardId = null;
              e.paymentMethod = 'cash';
            }
          });
          ui.state.fixedExpenses.forEach((f) => {
            if (f.cardId === existing.id) {
              f.cardId = null;
              f.paymentMethod = 'cash';
            }
          });
          ui.state.cards = ui.state.cards.filter((c) => c.id !== existing.id);
          closeModal();
          persist('Cartão removido.');
        }
      });
    }
  }

  // Modal Nova Categoria
  function openCategoryModal() {
    let color = '#10b981';
    let type = 'variable';

    openModal('Nova Categoria', `
      <form id="catForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nome</label>
            <input type="text" class="input" id="catName" placeholder="Ex: Viagem, Café..." required />
          </div>
          <div class="form-group">
            <label class="form-label">Emoji</label>
            <input type="text" class="input" id="catIcon" value="🏷️" maxlength="4" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Tipo principal</label>
          <div class="seg-control two" id="catTypeSeg">
            <button type="button" class="seg-opt active" data-ctype="variable">Variável / Avulso</button>
            <button type="button" class="seg-opt" data-ctype="fixed">Custo Fixo</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Cor</label>
          <div class="color-dots" id="catColorDots">
            ${CARD_COLORS.map((hex) => `
              <button type="button" class="color-dot-btn ${color === hex ? 'active' : ''}" style="background:${hex}" data-color="${hex}"></button>
            `).join('')}
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">Criar Categoria</button>
      </form>
    `);

    $$('#catTypeSeg .seg-opt').forEach((b) => {
      b.addEventListener('click', () => {
        type = b.dataset.ctype;
        $$('#catTypeSeg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $$('#catColorDots .color-dot-btn').forEach((b) => {
      b.addEventListener('click', () => {
        color = b.dataset.color;
        $$('#catColorDots .color-dot-btn').forEach((x) => x.classList.toggle('active', x === b));
      });
    });

    $('#catForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#catName').value.trim();
      const icon = $('#catIcon').value.trim() || '🏷️';
      if (!name) return;
      ui.state.categories.push({
        id: S.uid('cat'),
        name,
        icon,
        color,
        type
      });
      closeModal();
      persist('Categoria criada!');
    });
  }

  // =========================================================================
  // Inicialização Global & PWA Service Worker
  // =========================================================================
  function bindGlobalEvents() {
    $('#btnPrevMonth').addEventListener('click', () => {
      ui.monthKey = F.addMonths(ui.monthKey, -1);
      render();
    });

    $('#btnNextMonth').addEventListener('click', () => {
      ui.monthKey = F.addMonths(ui.monthKey, 1);
      render();
    });

    $('#btnCurrentMonth').addEventListener('click', () => {
      ui.monthKey = F.getCurrentMonthKey();
      render();
      showToast(`Mês atual: ${F.formatMonthLabel(ui.monthKey)}`);
    });

    $$('.scope-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.scope = btn.dataset.scope;
        render();
      });
    });

    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.tab = btn.dataset.tab;
        render();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    });

    $('#btnQuickAdd').addEventListener('click', () => openQuickModal('variable'));
    $('#btnCloseModal').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('#modalBackdrop')) closeModal();
    });

    $('#fileImportInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = S.parseImportedJSON(String(reader.result || ''));
          if (confirm('Restaurar este backup? Os dados atuais neste aparelho serão substituídos.')) {
            ui.state = imported;
            persist('Backup importado com sucesso!');
          }
        } catch (err) {
          showToast('Arquivo de backup inválido.');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    // Evento PWA de instalação (Android Chrome / Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      ui.deferredInstallPrompt = e;
      if (ui.tab === 'settings') render();
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service Worker não registrado:', err);
      });
    }
  }

  function init() {
    bindGlobalEvents();
    registerServiceWorker();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
