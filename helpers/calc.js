function computeLoan({ principal, termDays, monthlyRate = 10 }) {
  const p = Number(principal);
  const days = Number(termDays);
  const rate = Number(monthlyRate) / 100;
  if (!(p > 0) || !(days > 0)) {
    throw new Error('Principal and term days must be positive numbers');
  }
  const totalInterest = +(p * rate * (days / 30)).toFixed(2);
  const totalPayable = +(p + totalInterest).toFixed(2);
  const dailyPayment = +(totalPayable / days).toFixed(2);
  return { principal: p, termDays: days, monthlyRate: monthlyRate, totalInterest, totalPayable, dailyPayment };
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

function loanProgress(loan, totalPaid) {
  const balance = +(loan.total_payable - totalPaid).toFixed(2);
  // Today in Manila local time (Asia/Manila).
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  // Day 1 = start_date. Today counts as a full day in the term.
  const scheduled = today < loan.start_date;
  const elapsed = scheduled
    ? 0
    : Math.min(Number(loan.term_days), daysBetween(loan.start_date, today) + 1);
  const expectedPaid = +(Number(loan.daily_payment) * elapsed).toFixed(2);
  const arrears = Math.max(0, +(expectedPaid - totalPaid).toFixed(2));
  const percentPaid = loan.total_payable > 0 ? Math.min(100, (totalPaid / loan.total_payable) * 100) : 0;
  const daysRemaining = Math.max(0, Number(loan.term_days) - elapsed);
  const overdue = today > loan.end_date && balance > 0;
  return { balance, expectedPaid, arrears, percentPaid, daysRemaining, elapsed, overdue, scheduled };
}

module.exports = { computeLoan, addDays, daysBetween, loanProgress };
