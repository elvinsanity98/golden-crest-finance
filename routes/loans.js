const express = require('express');
const db = require('../db/database');
const { computeLoan, addDays, loanProgress } = require('../helpers/calc');
const { today } = require('../helpers/format');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const validStatus = ['active', 'completed', 'defaulted', 'all'].includes(status) ? status : 'active';
    const where = validStatus === 'all' ? '' : 'WHERE l.status = ?';
    const args = validStatus === 'all' ? [] : [validStatus];
    const rows = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      ${where}
      ORDER BY l.created_at DESC
    `, args);
    const decorated = rows.map(l => ({ ...l, total_paid: Number(l.total_paid), progress: loanProgress(l, Number(l.total_paid)) }));
    res.render('loans/index', { title: 'Loans', loans: decorated, status: validStatus });
  } catch (err) { next(err); }
});

router.get('/new', async (req, res, next) => {
  try {
    const borrowers = await db.all('SELECT id, full_name FROM borrowers ORDER BY full_name');
    res.render('loans/new', {
      title: 'New Loan',
      borrowers,
      selectedBorrowerId: req.query.borrower_id || '',
      errors: null,
      form: { monthly_interest_rate: 10, start_date: today(), term_days: 30 }
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { borrower_id, principal, term_days, monthly_interest_rate, start_date, purpose, notes } = req.body;
  try {
    const borrowers = await db.all('SELECT id, full_name FROM borrowers ORDER BY full_name');
    if (!borrower_id) throw new Error('Please select a borrower.');
    const calc = computeLoan({
      principal,
      termDays: term_days,
      monthlyRate: monthly_interest_rate || 10
    });
    const sDate = start_date || today();
    // Day 1 = start_date, Day N = start_date + (N-1) days. So end_date = start + termDays - 1.
    const eDate = addDays(sDate, calc.termDays - 1);
    const info = await db.run(`
      INSERT INTO loans
        (borrower_id, principal, monthly_interest_rate, term_days, start_date, end_date,
         total_interest, total_payable, daily_payment, purpose, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      borrower_id, calc.principal, calc.monthlyRate, calc.termDays, sDate, eDate,
      calc.totalInterest, calc.totalPayable, calc.dailyPayment, purpose || null, notes || null
    ]);
    req.session.flash = { type: 'success', message: 'Loan created successfully.' };
    res.redirect(`/loans/${info.lastInsertRowid}`);
  } catch (err) {
    try {
      const borrowers = await db.all('SELECT id, full_name FROM borrowers ORDER BY full_name');
      res.status(400).render('loans/new', {
        title: 'New Loan',
        borrowers,
        selectedBorrowerId: borrower_id || '',
        errors: err.message,
        form: req.body
      });
    } catch (err2) { next(err2); }
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const loan = await db.get(`
      SELECT l.*, b.full_name AS borrower_name, b.phone AS borrower_phone, b.address AS borrower_address
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      WHERE l.id = ?
    `, [req.params.id]);
    if (!loan) return res.status(404).render('404', { title: 'Not Found' });

    const payments = await db.all(`
      SELECT * FROM payments WHERE loan_id = ? ORDER BY payment_date DESC, id DESC
    `, [req.params.id]);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const progress = loanProgress(loan, totalPaid);

    const schedule = [];
    const dailyPaidByDate = {};
    payments.forEach(p => {
      dailyPaidByDate[p.payment_date] = (dailyPaidByDate[p.payment_date] || 0) + Number(p.amount);
    });
    // Walk day-by-day in order so we can carry advance/surplus payments forward.
    // A day counts as "covered" when the cumulative paid through that day
    // is >= the cumulative expected through that day.
    const daily = Number(loan.daily_payment);
    let cumPaid = 0;
    let cumExpected = 0;
    for (let i = 0; i < Number(loan.term_days); i++) {
      // Day 1 = start_date itself; Day N = start_date + (N-1) days.
      const dateStr = addDays(loan.start_date, i);
      const todaysPay = dailyPaidByDate[dateStr] || 0;
      const prevCumExpected = cumExpected; // cumExpected through yesterday
      cumPaid += todaysPay;
      cumExpected += daily;
      const covered = cumPaid + 0.005 >= cumExpected;
      // Partial = some credit applied to this day (either an actual payment
      // recorded today, or surplus rolling forward from earlier days), but
      // not enough to fully cover today.
      const partial = !covered && (todaysPay > 0.005 || cumPaid > prevCumExpected + 0.005);
      schedule.push({
        day: i + 1,
        date: dateStr,
        expected: daily,
        paid: todaysPay,
        cumPaid: +cumPaid.toFixed(2),
        cumExpected: +cumExpected.toFixed(2),
        covered,
        partial,
        credit: +Math.max(0, Math.min(daily, cumPaid - prevCumExpected)).toFixed(2)
      });
    }

    res.render('loans/show', {
      title: `Loan #${loan.id}`,
      loan,
      payments,
      totalPaid,
      progress,
      schedule,
      todayStr: today()
    });
  } catch (err) { next(err); }
});

router.post('/:id/close', async (req, res, next) => {
  try {
    const status = req.body.status === 'defaulted' ? 'defaulted' : 'completed';
    await db.run(`UPDATE loans SET status = ?, closed_at = datetime('now') WHERE id = ?`, [status, req.params.id]);
    req.session.flash = { type: 'success', message: `Loan marked as ${status}.` };
    res.redirect(`/loans/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/reopen', async (req, res, next) => {
  try {
    await db.run(`UPDATE loans SET status = 'active', closed_at = NULL WHERE id = ?`, [req.params.id]);
    req.session.flash = { type: 'success', message: 'Loan reopened.' };
    res.redirect(`/loans/${req.params.id}`);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.run('DELETE FROM loans WHERE id = ?', [req.params.id]);
    req.session.flash = { type: 'success', message: 'Loan deleted.' };
    res.redirect('/loans');
  } catch (err) { next(err); }
});

module.exports = router;
