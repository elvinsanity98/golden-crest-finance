const express = require('express');
const db = require('../db/database');
const { loanIncome } = require('../helpers/calc');
const { today, TZ } = require('../helpers/format');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const from = req.query.from || addMonths(today(), -6);
    const to = req.query.to || today();

    const loans = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      ORDER BY l.created_at DESC
    `);

    let realizedAll = 0;     // interest actually collected, all loans
    let projected = 0;       // full interest on loans we still expect to finish (active + completed)
    let lockedIn = 0;        // interest from completed (fully paid) loans
    let principalDisbursed = 0;
    let principalRecovered = 0;
    let outstandingInterest = 0;

    const decorated = loans.map(l => {
      const tp = Number(l.total_paid);
      const inc = loanIncome(l, tp);
      realizedAll += inc.realizedInterest;
      principalDisbursed += Number(l.principal);
      principalRecovered += inc.principalRecovered;
      if (l.status === 'active' || l.status === 'completed') projected += inc.totalInterest;
      if (l.status === 'completed') lockedIn += inc.totalInterest;
      if (l.status === 'active') outstandingInterest += inc.outstandingInterest;
      return { ...l, total_paid: tp, income: inc };
    });

    // Income collected within the date range (cash basis), grouped by month.
    const payments = await db.all(`
      SELECT p.amount, p.payment_date, l.total_interest, l.total_payable
      FROM payments p JOIN loans l ON l.id = p.loan_id
      WHERE p.payment_date BETWEEN ? AND ?
    `, [from, to]);

    let periodIncome = 0;
    let periodCollected = 0;
    const byMonth = {};
    payments.forEach(p => {
      const payable = Number(p.total_payable) || 0;
      const ratio = payable > 0 ? Number(p.total_interest) / payable : 0;
      const inc = Number(p.amount) * ratio;
      periodIncome += inc;
      periodCollected += Number(p.amount);
      const m = String(p.payment_date).slice(0, 7); // YYYY-MM
      byMonth[m] = (byMonth[m] || 0) + inc;
    });

    const months = Object.keys(byMonth).sort().map(m => {
      const d = new Date(m + '-01T12:00:00+08:00');
      const label = d.toLocaleDateString('en-PH', { timeZone: TZ, month: 'short', year: 'numeric' });
      return { month: m, label, income: +byMonth[m].toFixed(2) };
    });

    res.render('income', {
      title: 'Income',
      from, to,
      totals: {
        realizedAll: +realizedAll.toFixed(2),
        projected: +projected.toFixed(2),
        lockedIn: +lockedIn.toFixed(2),
        outstandingInterest: +outstandingInterest.toFixed(2),
        principalDisbursed: +principalDisbursed.toFixed(2),
        principalRecovered: +principalRecovered.toFixed(2)
      },
      periodIncome: +periodIncome.toFixed(2),
      periodCollected: +periodCollected.toFixed(2),
      months,
      loans: decorated
    });
  } catch (err) { next(err); }
});

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
