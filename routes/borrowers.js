const express = require('express');
const db = require('../db/database');
const { loanProgress } = require('../helpers/calc');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE b.full_name LIKE ? OR b.phone LIKE ? OR b.id_number LIKE ?';
      const pat = `%${q}%`;
      params.push(pat, pat, pat);
    }
    const rows = await db.all(`
      SELECT b.*,
        (SELECT COUNT(*) FROM loans l WHERE l.borrower_id = b.id) AS loan_count,
        (SELECT COUNT(*) FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active') AS active_count
      FROM borrowers b
      ${where}
      ORDER BY b.full_name ASC
    `, params);
    res.render('borrowers/index', { title: 'Borrowers', borrowers: rows, q });
  } catch (err) { next(err); }
});

router.get('/new', (req, res) => {
  res.render('borrowers/new', { title: 'New Borrower', errors: null, form: {} });
});

router.post('/', async (req, res, next) => {
  try {
    const { full_name, phone, email, address, id_number, occupation, notes } = req.body;
    if (!full_name || !full_name.trim()) {
      return res.status(400).render('borrowers/new', { title: 'New Borrower', errors: 'Full name is required.', form: req.body });
    }
    const info = await db.run(`
      INSERT INTO borrowers (full_name, phone, email, address, id_number, occupation, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [full_name.trim(), phone || null, email || null, address || null, id_number || null, occupation || null, notes || null]);
    req.session.flash = { type: 'success', message: 'Borrower added successfully.' };
    res.redirect(`/borrowers/${info.lastInsertRowid}`);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const borrower = await db.get('SELECT * FROM borrowers WHERE id = ?', [req.params.id]);
    if (!borrower) return res.status(404).render('404', { title: 'Not Found' });
    const loans = await db.all(`
      SELECT l.*,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.loan_id = l.id) AS total_paid
      FROM loans l
      WHERE l.borrower_id = ?
      ORDER BY l.created_at DESC
    `, [req.params.id]);
    const decorated = loans.map(l => ({ ...l, total_paid: Number(l.total_paid), progress: loanProgress(l, Number(l.total_paid)) }));
    res.render('borrowers/show', { title: borrower.full_name, borrower, loans: decorated });
  } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const borrower = await db.get('SELECT * FROM borrowers WHERE id = ?', [req.params.id]);
    if (!borrower) return res.status(404).render('404', { title: 'Not Found' });
    res.render('borrowers/edit', { title: 'Edit Borrower', borrower, errors: null });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { full_name, phone, email, address, id_number, occupation, notes } = req.body;
    if (!full_name || !full_name.trim()) {
      const borrower = await db.get('SELECT * FROM borrowers WHERE id = ?', [req.params.id]);
      return res.status(400).render('borrowers/edit', { title: 'Edit Borrower', borrower: { ...borrower, ...req.body }, errors: 'Full name is required.' });
    }
    await db.run(`
      UPDATE borrowers
      SET full_name = ?, phone = ?, email = ?, address = ?, id_number = ?, occupation = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [full_name.trim(), phone || null, email || null, address || null, id_number || null, occupation || null, notes || null, req.params.id]);
    req.session.flash = { type: 'success', message: 'Borrower updated.' };
    res.redirect(`/borrowers/${req.params.id}`);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const hasActive = await db.get(`SELECT COUNT(*) AS c FROM loans WHERE borrower_id = ? AND status = 'active'`, [req.params.id]);
    if (Number(hasActive.c) > 0) {
      req.session.flash = { type: 'error', message: 'Cannot delete: borrower has active loans.' };
      return res.redirect(`/borrowers/${req.params.id}`);
    }
    await db.run('DELETE FROM borrowers WHERE id = ?', [req.params.id]);
    req.session.flash = { type: 'success', message: 'Borrower deleted.' };
    res.redirect('/borrowers');
  } catch (err) { next(err); }
});

module.exports = router;
