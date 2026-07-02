const express = require('express');
const db = require('../db/database');
const { computeLoan, addDays, loanProgress, buildSchedule, FREQUENCIES } = require('../helpers/calc');
const { today } = require('../helpers/format');

const router = express.Router();

const TERM_UNITS = { days: 1, weeks: 7, months: 30 };

// Convert (term_value, term_unit) form input into term days.
function termToDays(termValue, termUnit) {
  const v = Number(termValue);
  const mult = TERM_UNITS[termUnit] || 1;
  if (!(v > 0)) throw new Error('Term must be a positive number.');
  return Math.round(v * mult);
}

// Best display unit for an existing term_days (for the edit form).
function termFromDays(termDays) {
  const d = Number(termDays);
  if (d % 30 === 0) return { value: d / 30, unit: 'months' };
  if (d % 7 === 0) return { value: d / 7, unit: 'weeks' };
  return { value: d, unit: 'days' };
}

function validFrequency(f) {
  return FREQUENCIES[f] ? f : 'daily';
}

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const validStatus = ['active', 'completed', 'defaulted', 'all'].includes(status) ? status : 'active';
    const q = (req.query.q || '').trim();

    const clauses = [];
    const args = [];
    if (validStatus !== 'all') {
      clauses.push('l.status = ?');
      args.push(validStatus);
    }
    if (q) {
      // Match borrower name, loan id, or purpose.
      clauses.push('(b.full_name LIKE ? OR CAST(l.id AS TEXT) = ? OR l.purpose LIKE ?)');
      args.push(`%${q}%`, q.replace(/^#/, ''), `%${q}%`);
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    const rows = await db.all(`
      SELECT l.*, b.full_name AS borrower_name,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      JOIN borrowers b ON b.id = l.borrower_id
      ${where}
      ORDER BY l.created_at DESC
    `, args);
    const decorated = rows.map(l => ({ ...l, total_paid: Number(l.total_paid), progress: loanProgress(l, Number(l.total_paid)) }));
    res.render('loans/index', { title: 'Loans', loans: decorated, status: validStatus, q });
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
      form: { monthly_interest_rate: 10, start_date: today(), term_value: 30, term_unit: 'days', payment_frequency: 'daily' }
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { borrower_id, principal, term_value, term_unit, payment_frequency, monthly_interest_rate, start_date, purpose, notes } = req.body;
  try {
    if (!borrower_id) throw new Error('Please select a borrower.');
    const frequency = validFrequency(payment_frequency);
    const termDays = termToDays(term_value, term_unit);
    const calc = computeLoan({
      principal,
      termDays,
      monthlyRate: monthly_interest_rate || 10,
      frequency
    });
    const sDate = start_date || today();
    // Day 1 = start_date, Day N = start_date + (N-1) days. So end_date = start + termDays - 1.
    const eDate = addDays(sDate, calc.termDays - 1);
    const info = await db.run(`
      INSERT INTO loans
        (borrower_id, principal, monthly_interest_rate, term_days, start_date, end_date,
         total_interest, total_payable, daily_payment, payment_frequency, purpose, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      borrower_id, calc.principal, calc.monthlyRate, calc.termDays, sDate, eDate,
      calc.totalInterest, calc.totalPayable, calc.installment, frequency, purpose || null, notes || null
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

    const paymentsByDate = {};
    payments.forEach(p => {
      paymentsByDate[p.payment_date] = (paymentsByDate[p.payment_date] || 0) + Number(p.amount);
    });
    // Per-period schedule (period = day / week / month by loan frequency),
    // with cumulative coverage so advance payments roll forward.
    const schedule = buildSchedule(loan, paymentsByDate);

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

router.get('/:id/edit', async (req, res, next) => {
  try {
    const loan = await db.get(`
      SELECT l.*, b.full_name AS borrower_name
      FROM loans l JOIN borrowers b ON b.id = l.borrower_id
      WHERE l.id = ?
    `, [req.params.id]);
    if (!loan) return res.status(404).render('404', { title: 'Not Found' });
    const paidRow = await db.get('SELECT COALESCE(SUM(amount),0) AS t, COUNT(*) AS c FROM payments WHERE loan_id = ?', [req.params.id]);
    const term = termFromDays(loan.term_days);
    res.render('loans/edit', {
      title: `Edit Loan #${loan.id}`,
      loan,
      totalPaid: Number(paidRow.t),
      paymentCount: Number(paidRow.c),
      errors: null,
      form: {
        principal: loan.principal,
        monthly_interest_rate: loan.monthly_interest_rate,
        term_value: term.value,
        term_unit: term.unit,
        payment_frequency: loan.payment_frequency || 'daily',
        start_date: loan.start_date,
        purpose: loan.purpose || '',
        notes: loan.notes || ''
      }
    });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  const { principal, term_value, term_unit, payment_frequency, monthly_interest_rate, start_date, purpose, notes } = req.body;
  try {
    const loan = await db.get('SELECT * FROM loans WHERE id = ?', [req.params.id]);
    if (!loan) return res.status(404).render('404', { title: 'Not Found' });

    const frequency = validFrequency(payment_frequency);
    const termDays = termToDays(term_value, term_unit);
    const calc = computeLoan({
      principal,
      termDays,
      monthlyRate: monthly_interest_rate || 10,
      frequency
    });
    const sDate = start_date || loan.start_date;
    const eDate = addDays(sDate, calc.termDays - 1);

    await db.run(`
      UPDATE loans SET
        principal = ?, monthly_interest_rate = ?, term_days = ?, start_date = ?, end_date = ?,
        total_interest = ?, total_payable = ?, daily_payment = ?, payment_frequency = ?,
        purpose = ?, notes = ?
      WHERE id = ?
    `, [
      calc.principal, calc.monthlyRate, calc.termDays, sDate, eDate,
      calc.totalInterest, calc.totalPayable, calc.installment, frequency,
      purpose || null, notes || null, req.params.id
    ]);

    // Re-evaluate completion state against the new total.
    const paidRow = await db.get('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE loan_id = ?', [req.params.id]);
    const paid = Number(paidRow.t);
    if (paid >= calc.totalPayable && loan.status === 'active') {
      await db.run(`UPDATE loans SET status = 'completed', closed_at = datetime('now') WHERE id = ?`, [req.params.id]);
      req.session.flash = { type: 'success', message: 'Loan terms updated — payments already cover the new total, so the loan is marked completed.' };
    } else if (paid < calc.totalPayable && loan.status === 'completed') {
      await db.run(`UPDATE loans SET status = 'active', closed_at = NULL WHERE id = ?`, [req.params.id]);
      req.session.flash = { type: 'success', message: 'Loan terms updated — balance remains under the new total, so the loan was reopened.' };
    } else {
      req.session.flash = { type: 'success', message: 'Loan terms updated.' };
    }
    res.redirect(`/loans/${req.params.id}`);
  } catch (err) {
    try {
      const loan = await db.get(`
        SELECT l.*, b.full_name AS borrower_name
        FROM loans l JOIN borrowers b ON b.id = l.borrower_id
        WHERE l.id = ?
      `, [req.params.id]);
      const paidRow = await db.get('SELECT COALESCE(SUM(amount),0) AS t, COUNT(*) AS c FROM payments WHERE loan_id = ?', [req.params.id]);
      res.status(400).render('loans/edit', {
        title: `Edit Loan #${loan.id}`,
        loan,
        totalPaid: Number(paidRow.t),
        paymentCount: Number(paidRow.c),
        errors: err.message,
        form: req.body
      });
    } catch (err2) { next(err2); }
  }
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
