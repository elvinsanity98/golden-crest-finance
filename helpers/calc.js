// Payment frequencies. intervalDays drives due dates, arrears, and the
// schedule grid. Installment k is due at start_date + k*intervalDays - 1
// (period end), so for daily loans Day 1 = start_date — same as before.
const FREQUENCIES = {
  daily:   { intervalDays: 1,  label: 'day',   adverb: 'Daily' },
  weekly:  { intervalDays: 7,  label: 'week',  adverb: 'Weekly' },
  monthly: { intervalDays: 30, label: 'month', adverb: 'Monthly' }
};

function freqOf(frequency) {
  return FREQUENCIES[frequency] || FREQUENCIES.daily;
}

function computeLoan({ principal, termDays, monthlyRate = 10, frequency = 'daily' }) {
  const p = Number(principal);
  const days = Number(termDays);
  const rate = Number(monthlyRate) / 100;
  if (!(p > 0) || !(days > 0)) {
    throw new Error('Principal and term must be positive numbers');
  }
  const freq = freqOf(frequency);
  // Interest math unchanged regardless of frequency: monthly rate prorated by days.
  const totalInterest = +(p * rate * (days / 30)).toFixed(2);
  const totalPayable = +(p + totalInterest).toFixed(2);
  const periods = Math.max(1, Math.ceil(days / freq.intervalDays));
  const installment = +(totalPayable / periods).toFixed(2);
  return {
    principal: p,
    termDays: days,
    monthlyRate: monthlyRate,
    frequency: freq === FREQUENCIES.daily && frequency !== 'daily' ? 'daily' : (FREQUENCIES[frequency] ? frequency : 'daily'),
    totalInterest,
    totalPayable,
    periods,
    installment,
    // kept for backwards compatibility — daily_payment column stores the installment
    dailyPayment: installment
  };
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function loanProgress(loan, totalPaid) {
  const balance = +(loan.total_payable - totalPaid).toFixed(2);
  const today = manilaToday();
  const freq = freqOf(loan.payment_frequency);
  const interval = freq.intervalDays;
  const termDays = Number(loan.term_days);
  const periods = Math.max(1, Math.ceil(termDays / interval));
  const installment = Number(loan.daily_payment); // per-installment amount

  const scheduled = today < loan.start_date;
  // Days elapsed inside the term. Day 1 = start_date.
  const elapsedDays = scheduled ? 0 : Math.min(termDays, daysBetween(loan.start_date, today) + 1);
  // Installments due so far: period k is due once its final day has been reached.
  let periodsDue;
  if (scheduled) periodsDue = 0;
  else if (elapsedDays >= termDays) periodsDue = periods;
  else periodsDue = Math.min(periods, Math.floor(elapsedDays / interval));

  // Cap at total_payable: installment is rounded to centavos, so
  // installment × periodsDue can drift a few cents above the true total.
  const expectedPaid = periodsDue >= periods
    ? Number(loan.total_payable)
    : Math.min(Number(loan.total_payable), +(installment * periodsDue).toFixed(2));
  const arrears = Math.max(0, +(expectedPaid - totalPaid).toFixed(2));
  const installmentsBehind = arrears > 0 ? Math.ceil(arrears / installment - 0.01) : 0;
  const percentPaid = loan.total_payable > 0 ? Math.min(100, (totalPaid / loan.total_payable) * 100) : 0;
  const daysRemaining = Math.max(0, termDays - elapsedDays);
  const overdue = today > loan.end_date && balance > 0;
  // Current period number (1-based) for display.
  const currentPeriod = scheduled ? 0 : Math.min(periods, Math.floor((elapsedDays - 1) / interval) + 1);

  return {
    balance, expectedPaid, arrears, percentPaid, daysRemaining, overdue, scheduled,
    elapsed: elapsedDays,          // days elapsed (legacy consumers)
    periods, periodsDue, installment, installmentsBehind, currentPeriod,
    frequency: FREQUENCIES[loan.payment_frequency] ? loan.payment_frequency : 'daily',
    freqLabel: freq.label, freqAdverb: freq.adverb, intervalDays: interval
  };
}

// Lender income for a single loan, recognized on a cash basis.
// Each peso collected is part principal, part interest in the same ratio as
// the loan as a whole (interest / total payable). So a loan that is X% paid
// has earned X% of its interest.
function loanIncome(loan, totalPaid) {
  const totalPayable = Number(loan.total_payable) || 0;
  const totalInterest = Number(loan.total_interest) || 0;
  const paid = Number(totalPaid) || 0;
  const interestRatio = totalPayable > 0 ? totalInterest / totalPayable : 0;
  const realizedInterest = +(paid * interestRatio).toFixed(2);
  const principalRecovered = +(paid * (1 - interestRatio)).toFixed(2);
  const outstandingInterest = +Math.max(0, totalInterest - realizedInterest).toFixed(2);
  return { interestRatio, realizedInterest, principalRecovered, outstandingInterest, totalInterest };
}

// Build the per-period schedule for a loan, with cumulative coverage so
// advance payments roll forward. paymentsByDate: { 'YYYY-MM-DD': amount }.
function buildSchedule(loan, paymentsByDate) {
  const freq = freqOf(loan.payment_frequency);
  const interval = freq.intervalDays;
  const termDays = Number(loan.term_days);
  const periods = Math.max(1, Math.ceil(termDays / interval));
  const installment = Number(loan.daily_payment);
  const totalPayable = Number(loan.total_payable);

  const schedule = [];
  let cumPaid = 0;
  let cumExpected = 0;
  for (let k = 1; k <= periods; k++) {
    const periodStart = addDays(loan.start_date, (k - 1) * interval);
    const dueDate = k === periods
      ? loan.end_date
      : addDays(loan.start_date, k * interval - 1);
    // Sum payments dated inside this period window.
    let paidInPeriod = 0;
    for (let d = 0; d < interval; d++) {
      const ds = addDays(periodStart, d);
      if (ds > loan.end_date && k === periods) break;
      if (paymentsByDate[ds]) paidInPeriod += paymentsByDate[ds];
    }
    const prevCumExpected = cumExpected;
    cumPaid += paidInPeriod;
    cumExpected = k === periods ? totalPayable : +(cumExpected + installment).toFixed(2);
    const expected = k === periods ? +(totalPayable - prevCumExpected).toFixed(2) : installment;
    const covered = cumPaid + 0.005 >= cumExpected;
    const partial = !covered && (paidInPeriod > 0.005 || cumPaid > prevCumExpected + 0.005);
    schedule.push({
      period: k,
      periodStart,
      date: dueDate,           // due date shown in the grid
      expected,
      paid: +paidInPeriod.toFixed(2),
      cumPaid: +cumPaid.toFixed(2),
      cumExpected: +cumExpected.toFixed(2),
      covered,
      partial,
      credit: +Math.max(0, Math.min(expected, cumPaid - prevCumExpected)).toFixed(2)
    });
  }
  return schedule;
}

module.exports = { computeLoan, addDays, daysBetween, loanProgress, loanIncome, buildSchedule, FREQUENCIES, freqOf, manilaToday };
