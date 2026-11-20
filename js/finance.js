/**
 * Motor financeiro puro da aplicação "Nossa Casa".
 * Funciona tanto no navegador (global window.Finance) quanto em Node.js (para testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Finance = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const MONTH_SHORT = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getCurrentMonthKey(dateObj) {
    const d = dateObj || new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function getTodayISO(dateObj) {
    const d = dateObj || new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseMonthKey(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return { year: y, month: m };
  }

  function addMonths(monthKey, delta) {
    const { year, month } = parseMonthKey(monthKey);
    const total = (year * 12 + (month - 1)) + delta;
    const ny = Math.floor(total / 12);
    const nm = (total % 12 + 12) % 12 + 1;
    return `${ny}-${pad2(nm)}`;
  }

  function diffMonths(fromMonthKey, toMonthKey) {
    const a = parseMonthKey(fromMonthKey);
    const b = parseMonthKey(toMonthKey);
    return (b.year * 12 + b.month) - (a.year * 12 + a.month);
  }

  function formatMonthLabel(monthKey, short) {
    const { year, month } = parseMonthKey(monthKey);
    const name = short ? MONTH_SHORT[month - 1] : MONTH_NAMES[month - 1];
    return short ? `${name}/${String(year).slice(2)}` : `${name} ${year}`;
  }

  function formatBRL(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function suggestCardBillMonth(purchaseDateISO, closingDay) {
    if (!purchaseDateISO) return getCurrentMonthKey();
    const parts = purchaseDateISO.split('-').map(Number);
    if (parts.length !== 3) return getCurrentMonthKey();
    const [year, month, day] = parts;
    const baseMonth = `${year}-${pad2(month)}`;
    const close = Math.max(1, Math.min(31, Number(closingDay) || 1));
    return day >= close ? addMonths(baseMonth, 1) : baseMonth;
  }

  function getInstallmentAmount(totalAmount, installments, installmentIndex) {
    const totalCents = Math.round((Number(totalAmount) || 0) * 100);
    const count = Math.max(1, Math.floor(Number(installments) || 1));
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - baseCents * count;
    // A primeira parcela absorve a diferença de centavos
    const cents = installmentIndex === 1 ? baseCents + remainder : baseCents;
    return cents / 100;
  }

  function getMonthIncomes(state, monthKey) {
    const p1Base = Number(state.settings?.people?.p1?.salary) || 0;
    const p2Base = Number(state.settings?.people?.p2?.salary) || 0;
    const overrides = (state.incomeOverrides && state.incomeOverrides[monthKey]) || {};

    const p1Salary = overrides.p1 !== undefined && overrides.p1 !== null ? Number(overrides.p1) : p1Base;
    const p2Salary = overrides.p2 !== undefined && overrides.p2 !== null ? Number(overrides.p2) : p2Base;

    const extras = (state.extraIncomes || []).filter((e) => e.month === monthKey);
    let p1Extra = 0;
    let p2Extra = 0;
    let sharedExtra = 0;

    for (const item of extras) {
      const val = Number(item.amount) || 0;
      if (item.owner === 'p1') p1Extra += val;
      else if (item.owner === 'p2') p2Extra += val;
      else sharedExtra += val;
    }

    const p1BaseTotal = round2(p1Salary + p1Extra);
    const p2BaseTotal = round2(p2Salary + p2Extra);

    // Razão de divisão (baseada nas rendas individuais do mês)
    let ratioP1 = 0.5;
    let ratioP2 = 0.5;
    if (state.settings?.splitMode === 'proportional') {
      const sumIndividual = p1BaseTotal + p2BaseTotal;
      if (sumIndividual > 0) {
        ratioP1 = p1BaseTotal / sumIndividual;
        ratioP2 = p2BaseTotal / sumIndividual;
      }
    }

    const p1SharedExtra = round2(sharedExtra * ratioP1);
    const p2SharedExtra = round2(sharedExtra - p1SharedExtra);

    const p1Total = round2(p1BaseTotal + p1SharedExtra);
    const p2Total = round2(p2BaseTotal + p2SharedExtra);
    const houseTotal = round2(p1Total + p2Total);

    return {
      p1Salary: round2(p1Salary),
      p2Salary: round2(p2Salary),
      p1Extra: round2(p1Extra),
      p2Extra: round2(p2Extra),
      sharedExtra: round2(sharedExtra),
      p1Total,
      p2Total,
      houseTotal,
      ratioP1,
      ratioP2,
      extras
    };
  }

  function splitAmountForOwner(amount, owner, ratioP1) {
    const val = round2(amount);
    if (owner === 'p1') return { p1: val, p2: 0 };
    if (owner === 'p2') return { p1: 0, p2: val };
    const p1 = round2(val * ratioP1);
    const p2 = round2(val - p1);
    return { p1, p2 };
  }

  function isCardBillPaid(state, monthKey, cardId) {
    return Boolean(
      state.cardBillStatus &&
      state.cardBillStatus[monthKey] &&
      state.cardBillStatus[monthKey][cardId] &&
      state.cardBillStatus[monthKey][cardId].paid
    );
  }

  function getMonthItems(state, monthKey, incomes) {
    const inc = incomes || getMonthIncomes(state, monthKey);
    const items = [];
    const fixedStateMap = (state.fixedMonthlyState && state.fixedMonthlyState[monthKey]) || {};

    // 1. Custos fixos ativos no mês
    for (const fx of (state.fixedExpenses || [])) {
      if (fx.active === false) continue;
      if (fx.startMonth && diffMonths(fx.startMonth, monthKey) < 0) continue;
      if (fx.endMonth && diffMonths(monthKey, fx.endMonth) < 0) continue;

      const mState = fixedStateMap[fx.id] || {};
      if (mState.skipped) continue;

      const amount = mState.amount !== undefined && mState.amount !== null
        ? round2(mState.amount)
        : round2(fx.amount);

      const isCard = fx.paymentMethod === 'card' && Boolean(fx.cardId);
      const paid = isCard
        ? isCardBillPaid(state, monthKey, fx.cardId)
        : Boolean(mState.paid);

      const share = splitAmountForOwner(amount, fx.owner || 'shared', inc.ratioP1);

      items.push({
        id: `fixed:${fx.id}`,
        sourceId: fx.id,
        kind: 'fixed',
        title: fx.title,
        amount,
        defaultAmount: round2(fx.amount),
        isOverridden: mState.amount !== undefined && mState.amount !== null,
        categoryId: fx.categoryId || 'contas_casa',
        owner: fx.owner || 'shared',
        p1Share: share.p1,
        p2Share: share.p2,
        paymentMethod: isCard ? 'card' : 'cash',
        cardId: isCard ? fx.cardId : null,
        dueDay: fx.dueDay || 10,
        date: `${monthKey}-${pad2(Math.min(28, Number(fx.dueDay) || 10))}`,
        paid,
        installmentNumber: 1,
        installments: 1
      });
    }

    // 2. Compras variáveis / avulsas e parcelas que caem neste mês
    for (const exp of (state.expenses || [])) {
      const installments = Math.max(1, Math.floor(Number(exp.installments) || 1));
      const firstMonth = exp.firstBillMonth || (exp.date ? exp.date.slice(0, 7) : monthKey);
      const offset = diffMonths(firstMonth, monthKey);
      if (offset < 0 || offset >= installments) continue;

      const instNum = offset + 1;
      const amount = getInstallmentAmount(exp.totalAmount, installments, instNum);
      const isCard = exp.paymentMethod === 'card' && Boolean(exp.cardId);
      const paid = isCard
        ? isCardBillPaid(state, monthKey, exp.cardId)
        : exp.paid !== false;

      const share = splitAmountForOwner(amount, exp.owner || 'shared', inc.ratioP1);

      items.push({
        id: `exp:${exp.id}:${instNum}`,
        sourceId: exp.id,
        kind: 'variable',
        title: exp.title,
        amount,
        totalAmount: round2(exp.totalAmount),
        categoryId: exp.categoryId || 'outros',
        owner: exp.owner || 'shared',
        paidBy: exp.paidBy || null,
        p1Share: share.p1,
        p2Share: share.p2,
        paymentMethod: isCard ? 'card' : 'cash',
        cardId: isCard ? exp.cardId : null,
        date: exp.date || `${monthKey}-01`,
        firstBillMonth: firstMonth,
        paid,
        installmentNumber: instNum,
        installments
      });
    }

    return items;
  }

  function getCardCommittedTotal(state, cardId, fromMonthKey) {
    // Soma fatura atual não paga + todas as parcelas futuras a partir de fromMonthKey
    let committed = 0;
    const currentBillPaid = isCardBillPaid(state, fromMonthKey, cardId);

    // Fixos no cartão contam no mês atual se a fatura atual não estiver paga
    if (!currentBillPaid) {
      const fixedStateMap = (state.fixedMonthlyState && state.fixedMonthlyState[fromMonthKey]) || {};
      for (const fx of (state.fixedExpenses || [])) {
        if (fx.active === false) continue;
        if (fx.paymentMethod !== 'card' || fx.cardId !== cardId) continue;
        if (fx.startMonth && diffMonths(fx.startMonth, fromMonthKey) < 0) continue;
        if (fx.endMonth && diffMonths(fromMonthKey, fx.endMonth) < 0) continue;
        const mState = fixedStateMap[fx.id] || {};
        if (mState.skipped) continue;
        committed += mState.amount !== undefined && mState.amount !== null ? Number(mState.amount) : Number(fx.amount);
      }
    }

    for (const exp of (state.expenses || [])) {
      if (exp.paymentMethod !== 'card' || exp.cardId !== cardId) continue;
      const installments = Math.max(1, Math.floor(Number(exp.installments) || 1));
      const firstMonth = exp.firstBillMonth || (exp.date ? exp.date.slice(0, 7) : fromMonthKey);
      for (let i = 1; i <= installments; i++) {
        const mKey = addMonths(firstMonth, i - 1);
        const diff = diffMonths(fromMonthKey, mKey);
        if (diff < 0) continue;
        if (diff === 0 && currentBillPaid) continue;
        if (isCardBillPaid(state, mKey, cardId)) continue;
        committed += getInstallmentAmount(exp.totalAmount, installments, i);
      }
    }
    return round2(committed);
  }

  function getMonthSummary(state, monthKey, scope) {
    const viewScope = scope || 'house'; // 'house' | 'p1' | 'p2'
    const incomes = getMonthIncomes(state, monthKey);
    const allItems = getMonthItems(state, monthKey, incomes);

    function amountForScope(item) {
      if (viewScope === 'p1') return item.p1Share;
      if (viewScope === 'p2') return item.p2Share;
      return item.amount;
    }

    let fixedTotal = 0;
    let variableTotal = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    let cashTotal = 0;
    let cardsTotal = 0;

    // Totais por pessoa (sempre calculados completos para exibir no resumo do casal)
    const peopleTotals = {
      p1: { income: incomes.p1Total, individual: 0, shared: 0, fixed: 0, variable: 0, total: 0, paid: 0, unpaid: 0, forecast: 0 },
      p2: { income: incomes.p2Total, individual: 0, shared: 0, fixed: 0, variable: 0, total: 0, paid: 0, unpaid: 0, forecast: 0 }
    };

    const byCategoryMap = {};
    const cardsMap = {};
    for (const card of (state.cards || [])) {
      cardsMap[card.id] = {
        card,
        billTotal: 0,
        scopeBillTotal: 0,
        paid: isCardBillPaid(state, monthKey, card.id),
        committedLimit: getCardCommittedTotal(state, card.id, monthKey),
        items: []
      };
    }

    const scopedItems = [];

    for (const item of allItems) {
      const sVal = amountForScope(item);

      // Estatísticas individuais sempre computadas
      if (item.owner === 'p1') peopleTotals.p1.individual += item.p1Share;
      else if (item.owner === 'p2') peopleTotals.p2.individual += item.p2Share;
      else {
        peopleTotals.p1.shared += item.p1Share;
        peopleTotals.p2.shared += item.p2Share;
      }

      if (item.kind === 'fixed') {
        peopleTotals.p1.fixed += item.p1Share;
        peopleTotals.p2.fixed += item.p2Share;
      } else {
        peopleTotals.p1.variable += item.p1Share;
        peopleTotals.p2.variable += item.p2Share;
      }

      peopleTotals.p1.total += item.p1Share;
      peopleTotals.p2.total += item.p2Share;

      if (item.paid) {
        peopleTotals.p1.paid += item.p1Share;
        peopleTotals.p2.paid += item.p2Share;
      } else {
        peopleTotals.p1.unpaid += item.p1Share;
        peopleTotals.p2.unpaid += item.p2Share;
      }

      if (item.paymentMethod === 'card' && item.cardId && cardsMap[item.cardId]) {
        cardsMap[item.cardId].billTotal = round2(cardsMap[item.cardId].billTotal + item.amount);
        cardsMap[item.cardId].scopeBillTotal = round2(cardsMap[item.cardId].scopeBillTotal + sVal);
        if (sVal > 0) {
          cardsMap[item.cardId].items.push({ ...item, scopedAmount: sVal });
        }
      }

      if (sVal <= 0) continue;

      scopedItems.push({ ...item, scopedAmount: sVal });

      if (item.kind === 'fixed') fixedTotal += sVal;
      else variableTotal += sVal;

      if (item.paid) paidTotal += sVal;
      else unpaidTotal += sVal;

      if (item.paymentMethod === 'card') cardsTotal += sVal;
      else cashTotal += sVal;

      const catKey = item.categoryId || 'outros';
      if (!byCategoryMap[catKey]) {
        byCategoryMap[catKey] = {
          categoryId: catKey,
          total: 0,
          fixed: 0,
          variable: 0,
          count: 0
        };
      }
      byCategoryMap[catKey].total = round2(byCategoryMap[catKey].total + sVal);
      if (item.kind === 'fixed') byCategoryMap[catKey].fixed = round2(byCategoryMap[catKey].fixed + sVal);
      else byCategoryMap[catKey].variable = round2(byCategoryMap[catKey].variable + sVal);
      byCategoryMap[catKey].count += 1;
    }

    for (const k of ['p1', 'p2']) {
      const pt = peopleTotals[k];
      pt.individual = round2(pt.individual);
      pt.shared = round2(pt.shared);
      pt.fixed = round2(pt.fixed);
      pt.variable = round2(pt.variable);
      pt.total = round2(pt.total);
      pt.paid = round2(pt.paid);
      pt.unpaid = round2(pt.unpaid);
      pt.forecast = round2(pt.income - pt.total);
    }

    fixedTotal = round2(fixedTotal);
    variableTotal = round2(variableTotal);
    const expensesTotal = round2(fixedTotal + variableTotal);
    paidTotal = round2(paidTotal);
    unpaidTotal = round2(unpaidTotal);
    cashTotal = round2(cashTotal);
    cardsTotal = round2(cardsTotal);

    const incomeTotal = viewScope === 'p1'
      ? incomes.p1Total
      : viewScope === 'p2'
        ? incomes.p2Total
        : incomes.houseTotal;

    const forecastBalance = round2(incomeTotal - expensesTotal);
    const commitmentPct = incomeTotal > 0 ? Math.round((expensesTotal / incomeTotal) * 100) : (expensesTotal > 0 ? 100 : 0);

    const categoriesBreakdown = Object.values(byCategoryMap)
      .sort((a, b) => b.total - a.total)
      .map((entry) => ({
        ...entry,
        pct: expensesTotal > 0 ? Math.round((entry.total / expensesTotal) * 100) : 0
      }));

    return {
      monthKey,
      scope: viewScope,
      incomes,
      incomeTotal,
      fixedTotal,
      variableTotal,
      expensesTotal,
      paidTotal,
      unpaidTotal,
      cashTotal,
      cardsTotal,
      forecastBalance,
      commitmentPct,
      peopleTotals,
      categoriesBreakdown,
      cards: Object.values(cardsMap),
      items: scopedItems,
      allItems
    };
  }

  function getFutureProjection(state, startMonthKey, monthsCount, scope) {
    const count = monthsCount || 4;
    const out = [];
    for (let i = 0; i < count; i++) {
      const mKey = addMonths(startMonthKey, i);
      const s = getMonthSummary(state, mKey, scope);
      out.push({
        monthKey: mKey,
        label: formatMonthLabel(mKey, true),
        incomeTotal: s.incomeTotal,
        fixedTotal: s.fixedTotal,
        variableTotal: s.variableTotal,
        cardsTotal: s.cardsTotal,
        expensesTotal: s.expensesTotal,
        forecastBalance: s.forecastBalance
      });
    }
    return out;
  }

  return {
    MONTH_NAMES,
    MONTH_SHORT,
    round2,
    pad2,
    getCurrentMonthKey,
    getTodayISO,
    parseMonthKey,
    addMonths,
    diffMonths,
    formatMonthLabel,
    formatBRL,
    suggestCardBillMonth,
    getInstallmentAmount,
    getMonthIncomes,
    getMonthItems,
    getCardCommittedTotal,
    getMonthSummary,
    getFutureProjection
  };
});
