/**
 * Persistência local no celular (localStorage) + Backup/Restore JSON + Dados de exemplo.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'nossa_casa_fin_v1';

  const DEFAULT_CATEGORIES = [
    // Variáveis
    { id: 'mercado', name: 'Mercado', icon: '🛒', color: '#22c55e', type: 'variable' },
    { id: 'alimentacao', name: 'Delivery / Fora', icon: '🍔', color: '#f97316', type: 'variable' },
    { id: 'remedio', name: 'Remédio / Saúde', icon: '💊', color: '#ef4444', type: 'variable' },
    { id: 'lazer', name: 'Lazer', icon: '🎬', color: '#a855f7', type: 'variable' },
    { id: 'presente', name: 'Presente', icon: '🎁', color: '#ec4899', type: 'variable' },
    { id: 'transporte', name: 'Transporte', icon: '🚗', color: '#3b82f6', type: 'variable' },
    { id: 'casa', name: 'Casa / Compras', icon: '🏠', color: '#14b8a6', type: 'variable' },
    { id: 'roupas', name: 'Roupas / Beleza', icon: '🛍️', color: '#eab308', type: 'variable' },
    { id: 'pets', name: 'Pets', icon: '🐾', color: '#84cc16', type: 'variable' },
    { id: 'outros', name: 'Outros', icon: '📦', color: '#94a3b8', type: 'variable' },
    // Fixas
    { id: 'moradia', name: 'Aluguel / Cond.', icon: '🏡', color: '#0ea5e9', type: 'fixed' },
    { id: 'contas_casa', name: 'Luz / Água / Gás', icon: '⚡', color: '#f59e0b', type: 'fixed' },
    { id: 'internet', name: 'Internet / Celular', icon: '📶', color: '#6366f1', type: 'fixed' },
    { id: 'assinaturas', name: 'Assinaturas', icon: '📺', color: '#d946ef', type: 'fixed' },
    { id: 'saude_fixo', name: 'Plano / Academia', icon: '🏋️', color: '#10b981', type: 'fixed' },
    { id: 'financiamento', name: 'Parcelas / Seguro', icon: '📄', color: '#64748b', type: 'fixed' }
  ];

  const DEFAULT_CARDS = [
    { id: 'c1', name: 'Cartão 1 (Nubank)', owner: 'p1', limit: 3500, closingDay: 5, dueDay: 12, color: '#820ad1' },
    { id: 'c2', name: 'Cartão 2 (Inter)', owner: 'p1', limit: 2500, closingDay: 10, dueDay: 17, color: '#ea580c' },
    { id: 'c3', name: 'Cartão 3 (Itaú)', owner: 'p2', limit: 3000, closingDay: 8, dueDay: 15, color: '#1d4ed8' },
    { id: 'c4', name: 'Cartão 4 (C6)', owner: 'shared', limit: 2000, closingDay: 15, dueDay: 22, color: '#334155' }
  ];

  function createEmptyState() {
    return {
      version: 1,
      settings: {
        people: {
          p1: { id: 'p1', name: 'Eu', salary: 0, color: '#10b981' },
          p2: { id: 'p2', name: 'Namorada', salary: 0, color: '#a855f7' }
        },
        splitMode: 'proportional', // 'proportional' | 'equal'
        theme: 'dark'
      },
      cards: DEFAULT_CARDS.map((c) => ({ ...c })),
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      incomeOverrides: {},
      extraIncomes: [],
      fixedExpenses: [],
      fixedMonthlyState: {},
      expenses: [],
      cardBillStatus: {}
    };
  }

  function createDemoState(currentMonthKey) {
    const F = root.Finance;
    const mKey = currentMonthKey || F.getCurrentMonthKey();
    const prevMonth = F.addMonths(mKey, -1);
    const state = createEmptyState();

    state.settings.people.p1.salary = 4800;
    state.settings.people.p2.salary = 3600;
    state.settings.splitMode = 'proportional';

    state.fixedExpenses = [
      { id: 'fx1', title: 'Aluguel + Condomínio', amount: 2150, categoryId: 'moradia', owner: 'shared', paymentMethod: 'cash', cardId: null, dueDay: 10, startMonth: prevMonth, active: true },
      { id: 'fx2', title: 'Energia Elétrica', amount: 230, categoryId: 'contas_casa', owner: 'shared', paymentMethod: 'cash', cardId: null, dueDay: 12, startMonth: prevMonth, active: true },
      { id: 'fx3', title: 'Internet Fibra', amount: 119.90, categoryId: 'internet', owner: 'shared', paymentMethod: 'cash', cardId: null, dueDay: 15, startMonth: prevMonth, active: true },
      { id: 'fx4', title: 'Streaming (Netflix/Spotify)', amount: 78.80, categoryId: 'assinaturas', owner: 'shared', paymentMethod: 'card', cardId: 'c4', dueDay: 15, startMonth: prevMonth, active: true },
      { id: 'fx5', title: 'Academia', amount: 119.90, categoryId: 'saude_fixo', owner: 'p1', paymentMethod: 'card', cardId: 'c1', dueDay: 5, startMonth: prevMonth, active: true },
      { id: 'fx6', title: 'Celular Pós', amount: 69.90, categoryId: 'internet', owner: 'p2', paymentMethod: 'card', cardId: 'c3', dueDay: 8, startMonth: prevMonth, active: true }
    ];

    state.fixedMonthlyState[mKey] = {
      fx1: { paid: true },
      fx2: { paid: false, amount: 248.50 }
    };

    state.expenses = [
      { id: 'e1', title: 'Supermercado do Mês', totalAmount: 842.60, installments: 1, categoryId: 'mercado', owner: 'shared', paymentMethod: 'card', cardId: 'c4', date: `${mKey}-04`, firstBillMonth: mKey, paid: true },
      { id: 'e2', title: 'Feira e Açougue', totalAmount: 215.00, installments: 1, categoryId: 'mercado', owner: 'shared', paymentMethod: 'cash', cardId: null, date: `${mKey}-09`, firstBillMonth: mKey, paid: true },
      { id: 'e3', title: 'Farmácia (Remédios)', totalAmount: 138.40, installments: 1, categoryId: 'remedio', owner: 'shared', paymentMethod: 'card', cardId: 'c1', date: `${mKey}-03`, firstBillMonth: mKey, paid: true },
      { id: 'e4', title: 'Cinema + Jantar Sábado', totalAmount: 186.00, installments: 1, categoryId: 'lazer', owner: 'shared', paymentMethod: 'card', cardId: 'c2', date: `${mKey}-07`, firstBillMonth: mKey, paid: true },
      { id: 'e5', title: 'Presente Aniversário Mãe', totalAmount: 240.00, installments: 3, categoryId: 'presente', owner: 'p1', paymentMethod: 'card', cardId: 'c1', date: `${prevMonth}-18`, firstBillMonth: prevMonth, paid: true },
      { id: 'e6', title: 'Air Fryer Nova', totalAmount: 480.00, installments: 4, categoryId: 'casa', owner: 'shared', paymentMethod: 'card', cardId: 'c3', date: `${mKey}-02`, firstBillMonth: mKey, paid: true },
      { id: 'e7', title: 'iFood Sexta', totalAmount: 94.50, installments: 1, categoryId: 'alimentacao', owner: 'shared', paymentMethod: 'card', cardId: 'c2', date: `${mKey}-08`, firstBillMonth: mKey, paid: true },
      { id: 'e8', title: 'Salão / Cuidados', totalAmount: 160.00, installments: 2, categoryId: 'roupas', owner: 'p2', paymentMethod: 'card', cardId: 'c3', date: `${mKey}-06`, firstBillMonth: mKey, paid: true }
    ];

    return state;
  }

  function uid(prefix) {
    return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeState(raw) {
    const base = createEmptyState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      ...base,
      ...raw,
      settings: {
        ...base.settings,
        ...(raw.settings || {}),
        people: {
          p1: { ...base.settings.people.p1, ...(raw.settings?.people?.p1 || {}) },
          p2: { ...base.settings.people.p2, ...(raw.settings?.people?.p2 || {}) }
        }
      },
      cards: Array.isArray(raw.cards) && raw.cards.length ? raw.cards : base.cards,
      categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
      incomeOverrides: raw.incomeOverrides && typeof raw.incomeOverrides === 'object' ? raw.incomeOverrides : {},
      extraIncomes: Array.isArray(raw.extraIncomes) ? raw.extraIncomes : [],
      fixedExpenses: Array.isArray(raw.fixedExpenses) ? raw.fixedExpenses : [],
      fixedMonthlyState: raw.fixedMonthlyState && typeof raw.fixedMonthlyState === 'object' ? raw.fixedMonthlyState : {},
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      cardBillStatus: raw.cardBillStatus && typeof raw.cardBillStatus === 'object' ? raw.cardBillStatus : {}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyState();
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      console.error('Erro ao carregar dados locais:', err);
      return createEmptyState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Erro ao salvar dados locais:', err);
      return false;
    }
  }

  function exportJSON(state) {
    return JSON.stringify({
      app: 'NossaCasaFinanceiro',
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  }

  function parseImportedJSON(text) {
    const parsed = JSON.parse(text);
    const payload = parsed && parsed.data ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object' || !payload.settings) {
      throw new Error('Arquivo de backup inválido.');
    }
    return normalizeState(payload);
  }

  root.Store = {
    STORAGE_KEY,
    DEFAULT_CATEGORIES,
    DEFAULT_CARDS,
    createEmptyState,
    createDemoState,
    normalizeState,
    loadState,
    saveState,
    exportJSON,
    parseImportedJSON,
    uid
  };
})(window);
