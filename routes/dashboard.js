const express = require('express');
const db = require('../db/database');
const { today } = require('../helpers/format');
const { loanProgress } = require('../helpers/calc');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const todayStr = today();

    const [borrowersC, activeC, activePrinR, activePayR, collAllR, collTodayR, paymentsTodayR] = await Promise.all([
      db.get('SELECT COUNT(*) AS c FROM borrowers'),
      db.get(`SELECT COUNT(*) AS c FROM loans WHERE status = 'active'`),
      db.get(`SELECT COALESCE(SUM(principal),0) AS s FROM loans WHERE status = 'active'`),
      db.get(`SELECT COALESCE(SUM(total_payable),0) AS s FROM loans WHERE status = 'active'`),
      db.get(`SELECT COALESCE(SUM(amount),0) AS s FROM payments`),
      db.get(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE payment_date = ?`, [todayStr]),
      db.get(`SELECT COUNT(*) AS c FROM payments WHERE payment_date = ?`, [todayStr])
    ]);

    const totals = {
      borrowers: Number(borrowersC.c),
      activeLoans: Number(activeC.c),
      activePrincipal: Number(activePrinR.s),
      activePayable: Number(activePayR.s),
      collectedAll: Number(collAllR.s),
      collectedToday: Number(collTodayR.s),
      paymentsToday: Number(paymentsTodayR.c)
    };

    const expectedTodayRow = await db.get(`
      SELECT COALESCE(SUM(daily_payment),0) AS expected
      FROM loans
      WHERE status = 'active' AND start_date <= ? AND end_date >= ?
    `, [todayStr, todayStr]);

    const activeLoans = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      WHERE l.status = 'active'
      ORDER BY l.created_at DESC
    `);

    const decorated = activeLoans.map(l => ({ ...l, total_paid: Number(l.total_paid), progress: loanProgress(l, Number(l.total_paid)) }));
    const overdueCount = decorated.filter(l => l.progress.overdue).length;
    const arrearsTotal = decorated.reduce((sum, l) => sum + l.progress.arrears, 0);
    const outstanding = decorated.reduce((sum, l) => sum + l.progress.balance, 0);

    const dueToday = decorated
      .filter(l => l.start_date <= todayStr && l.end_date >= todayStr)
      .sort((a, b) => b.progress.arrears - a.progress.arrears)
      .slice(0, 8);

    const recentPayments = await db.all(`
      SELECT p.*, l.id AS loan_id, b.full_name AS borrower_name
      FROM payments p
      JOIN loans l ON l.id = p.loan_id
      JOIN borrowers b ON b.id = l.borrower_id
      ORDER BY p.created_at DESC
      LIMIT 8
    `);

    res.render('dashboard', {
      title: 'Dashboard',
      totals,
      expectedToday: Number(expectedTodayRow.expected),
      overdueCount,
      arrearsTotal,
      outstanding,
      dueToday,
      recentPayments
    });
  } catch (err) { next(err); }
});

module.exports = router;
