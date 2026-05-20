const express = require('express');
const db = require('../db/database');
const { today } = require('../helpers/format');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date || today();
    const rows = await db.all(`
      SELECT p.*, l.id AS loan_id, l.daily_payment, b.full_name AS borrower_name
      FROM payments p
      JOIN loans l ON l.id = p.loan_id
      JOIN borrowers b ON b.id = l.borrower_id
      WHERE p.payment_date = ?
      ORDER BY p.created_at DESC
    `, [date]);
    const total = rows.reduce((s, p) => s + Number(p.amount), 0);
    res.render('payments/index', { title: 'Daily Collections', payments: rows, total, date });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { loan_id, amount, payment_date, method, notes } = req.body;
    if (!loan_id || !amount || Number(amount) <= 0) {
      req.session.flash = { type: 'error', message: 'Amount must be positive.' };
      return res.redirect(req.get('referer') || '/');
    }
    const loan = await db.get('SELECT * FROM loans WHERE id = ?', [loan_id]);
    if (!loan) {
      req.session.flash = { type: 'error', message: 'Loan not found.' };
      return res.redirect('/loans');
    }

    const todayStr = today();
    const pDate = payment_date || todayStr;
    if (pDate < loan.start_date) {
      req.session.flash = { type: 'error', message: `This loan's first payment date is ${loan.start_date}. Payments can't be recorded earlier.` };
      return res.redirect(req.get('referer') || `/loans/${loan_id}`);
    }
    if (pDate > todayStr) {
      req.session.flash = { type: 'error', message: 'Payment date cannot be in the future.' };
      return res.redirect(req.get('referer') || `/loans/${loan_id}`);
    }

    const collector = req.session.user ? req.session.user.fullName : null;
    await db.run(`
      INSERT INTO payments (loan_id, amount, payment_date, method, collected_by, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [loan_id, Number(amount), pDate, method || 'cash', collector, notes || null]);

    const totalPaidRow = await db.get('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE loan_id = ?', [loan_id]);
    const totalPaid = Number(totalPaidRow.t);
    if (totalPaid >= Number(loan.total_payable) && loan.status === 'active') {
      await db.run(`UPDATE loans SET status = 'completed', closed_at = datetime('now') WHERE id = ?`, [loan_id]);
      req.session.flash = { type: 'success', message: 'Payment recorded. Loan fully paid — marked as completed!' };
    } else {
      req.session.flash = { type: 'success', message: 'Payment recorded.' };
    }
    res.redirect(`/loans/${loan_id}`);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const payment = await db.get('SELECT loan_id FROM payments WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
    if (payment) {
      const loan = await db.get('SELECT * FROM loans WHERE id = ?', [payment.loan_id]);
      if (loan && loan.status === 'completed') {
        const tp = await db.get('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE loan_id = ?', [payment.loan_id]);
        if (Number(tp.t) < Number(loan.total_payable)) {
          await db.run(`UPDATE loans SET status = 'active', closed_at = NULL WHERE id = ?`, [payment.loan_id]);
        }
      }
    }
    req.session.flash = { type: 'success', message: 'Payment deleted.' };
    res.redirect(req.get('referer') || '/payments');
  } catch (err) { next(err); }
});

module.exports = router;
