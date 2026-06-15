const express = require('express');
const db = require('../db/database');
const { loanIncome } = require('../helpers/calc');
const { today, TZ } = require('../helpers/format');

const router = express.Router();

// Shared loader: computes per-loan income + all the portfolio aggregates.
async function buildIncome(from, to) {
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
  let capitalLost = 0;     // unrecovered principal on defaulted loans
  let defaultedCount = 0;

  const decorated = loans.map(l => {
    const tp = Number(l.total_paid);
    const inc = loanIncome(l, tp);
    realizedAll += inc.realizedInterest;
    principalDisbursed += Number(l.principal);
    principalRecovered += inc.principalRecovered;
    if (l.status === 'active' || l.status === 'completed') projected += inc.totalInterest;
    if (l.status === 'completed') lockedIn += inc.totalInterest;
    if (l.status === 'active') outstandingInterest += inc.outstandingInterest;
    let lostHere = 0;
    if (l.status === 'defaulted') {
      defaultedCount += 1;
      lostHere = +Math.max(0, Number(l.principal) - inc.principalRecovered).toFixed(2);
      capitalLost += lostHere;
    }
    return { ...l, total_paid: tp, income: inc, capitalLost: lostHere };
  });

  // Capital still out on active loans (not yet recovered, not lost).
  const principalOutstanding = decorated
    .filter(l => l.status === 'active')
    .reduce((s, l) => s + Math.max(0, Number(l.principal) - l.income.principalRecovered), 0);

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

  const totals = {
    realizedAll: +realizedAll.toFixed(2),
    projected: +projected.toFixed(2),
    lockedIn: +lockedIn.toFixed(2),
    outstandingInterest: +outstandingInterest.toFixed(2),
    principalDisbursed: +principalDisbursed.toFixed(2),
    principalRecovered: +principalRecovered.toFixed(2),
    principalOutstanding: +principalOutstanding.toFixed(2),
    capitalLost: +capitalLost.toFixed(2),
    defaultedCount,
    netProfit: +(realizedAll - capitalLost).toFixed(2)
  };

  return { loans: decorated, totals, months, periodIncome: +periodIncome.toFixed(2), periodCollected: +periodCollected.toFixed(2) };
}

router.get('/', async (req, res, next) => {
  try {
    const from = req.query.from || addMonths(today(), -6);
    const to = req.query.to || today();
    const data = await buildIncome(from, to);
    res.render('income', { title: 'Income', from, to, ...data });
  } catch (err) { next(err); }
});

// Read-only CSV export of the per-loan income breakdown + summary.
router.get('/export.csv', async (req, res, next) => {
  try {
    const from = req.query.from || addMonths(today(), -6);
    const to = req.query.to || today();
    const { loans, totals } = await buildIncome(from, to);

    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [];
    rows.push(['Loan #', 'Borrower', 'Status', 'Principal', 'Interest', 'Total Payable', 'Collected', 'Realized Income', 'Outstanding Interest', 'Capital Lost'].join(','));
    loans.forEach(l => {
      rows.push([
        l.id, esc(l.borrower_name), l.status,
        Number(l.principal).toFixed(2),
        Number(l.total_interest).toFixed(2),
        Number(l.total_payable).toFixed(2),
        Number(l.total_paid).toFixed(2),
        l.income.realizedInterest.toFixed(2),
        l.income.outstandingInterest.toFixed(2),
        Number(l.capitalLost).toFixed(2)
      ].join(','));
    });
    rows.push('');
    rows.push(['Summary'].join(','));
    rows.push(['Realized Income', totals.realizedAll.toFixed(2)].join(','));
    rows.push(['Net Profit (after defaults)', totals.netProfit.toFixed(2)].join(','));
    rows.push(['Projected Income', totals.projected.toFixed(2)].join(','));
    rows.push(['Locked-in Income', totals.lockedIn.toFixed(2)].join(','));
    rows.push(['Outstanding Interest', totals.outstandingInterest.toFixed(2)].join(','));
    rows.push(['Principal Disbursed', totals.principalDisbursed.toFixed(2)].join(','));
    rows.push(['Principal Recovered', totals.principalRecovered.toFixed(2)].join(','));
    rows.push(['Capital Lost (defaults)', totals.capitalLost.toFixed(2)].join(','));
    rows.push(['Defaulted Loans', totals.defaultedCount].join(','));

    const csv = '﻿' + rows.join('\r\n'); // BOM so Excel reads ₱/UTF-8 correctly
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="golden-crest-income-${today()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
