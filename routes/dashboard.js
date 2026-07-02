const express = require('express');
const db = require('../db/database');
const { today } = require('../helpers/format');
const { loanProgress, daysBetween } = require('../helpers/calc');

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

    const activeLoans = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id AND p.payment_date = ?) AS paid_today
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      WHERE l.status = 'active'
      ORDER BY l.created_at DESC
    `, [todayStr]);

    const decorated = activeLoans.map(l => {
      const progress = loanProgress(l, Number(l.total_paid));
      // Installment falls due today when today is a period-end day (or the
      // final day of the term). Daily loans: every in-term day qualifies.
      let dueTodayFlag = false;
      if (l.start_date <= todayStr && l.end_date >= todayStr) {
        const d = daysBetween(l.start_date, todayStr) + 1; // Day 1 = start
        dueTodayFlag = (d % progress.intervalDays === 0) || todayStr === l.end_date;
      }
      // Collectible today = what was owed at the start of the day: everything
      // expected through today (arrears + today's installment when due) minus
      // what had been paid before today. progress.expectedPaid already counts
      // today's installment once due, so no double count.
      const paidBeforeToday = Number(l.total_paid) - Number(l.paid_today);
      const owedToday = Math.max(0, +(progress.expectedPaid - paidBeforeToday).toFixed(2));
      return { ...l, total_paid: Number(l.total_paid), paid_today: Number(l.paid_today), progress, dueTodayFlag, owedToday };
    });
    const overdueCount = decorated.filter(l => l.progress.overdue).length;
    const arrearsTotal = decorated.reduce((sum, l) => sum + l.progress.arrears, 0);
    const outstanding = decorated.reduce((sum, l) => sum + l.progress.balance, 0);

    // Expected today = total collectible today across active loans:
    // installments due today plus unpaid arrears carried in.
    const expectedToday = decorated.reduce((s, l) => s + l.owedToday, 0);

    // Collection worklist: anything collectible today.
    const dueToday = decorated
      .filter(l => l.owedToday > 0 || l.dueTodayFlag)
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
      expectedToday: +expectedToday.toFixed(2),
      overdueCount,
      arrearsTotal,
      outstanding,
      dueToday,
      recentPayments
    });
  } catch (err) { next(err); }
});

module.exports = router;
