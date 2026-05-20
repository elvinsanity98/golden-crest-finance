const express = require('express');
const db = require('../db/database');
const { loanProgress } = require('../helpers/calc');
const { today } = require('../helpers/format');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const from = req.query.from || addMonths(today(), -1);
    const to = req.query.to || today();

    const collections = await db.all(`
      SELECT payment_date AS date, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
      FROM payments
      WHERE payment_date BETWEEN ? AND ?
      GROUP BY payment_date
      ORDER BY payment_date DESC
    `, [from, to]);

    const [pd, tc, lc, lcomp] = await Promise.all([
      db.get(`SELECT COALESCE(SUM(principal),0) AS s FROM loans WHERE start_date BETWEEN ? AND ?`, [from, to]),
      db.get(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE payment_date BETWEEN ? AND ?`, [from, to]),
      db.get(`SELECT COUNT(*) AS c FROM loans WHERE start_date BETWEEN ? AND ?`, [from, to]),
      db.get(`SELECT COUNT(*) AS c FROM loans WHERE closed_at IS NOT NULL AND date(closed_at) BETWEEN ? AND ? AND status = 'completed'`, [from, to])
    ]);
    const summary = {
      principalDisbursed: Number(pd.s),
      totalCollected: Number(tc.s),
      loansCreated: Number(lc.c),
      loansCompleted: Number(lcomp.c)
    };

    const activeLoans = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      WHERE l.status = 'active'
    `);
    const decorated = activeLoans.map(l => ({ ...l, total_paid: Number(l.total_paid), progress: loanProgress(l, Number(l.total_paid)) }));
    const portfolio = {
      activeCount: decorated.length,
      outstanding: decorated.reduce((s, l) => s + l.progress.balance, 0),
      arrears: decorated.reduce((s, l) => s + l.progress.arrears, 0),
      overdueCount: decorated.filter(l => l.progress.overdue).length
    };

    res.render('reports', {
      title: 'Reports',
      from, to,
      collections: collections.map(c => ({ ...c, count: Number(c.count), total: Number(c.total) })),
      summary,
      portfolio,
      activeLoans: decorated
    });
  } catch (err) { next(err); }
});

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
