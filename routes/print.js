const express = require('express');
const db = require('../db/database');

const router = express.Router();

const MAX_CARDS = 5;

router.get('/cards', async (req, res, next) => {
  try {
    // Pull all borrowers with their most-recent active loan attached.
    const borrowers = await db.all(`
      SELECT b.id, b.full_name, b.address,
        (SELECT l.id FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 1) AS active_loan_id,
        (SELECT l.daily_payment FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 1) AS daily_payment,
        (SELECT l.end_date FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 1) AS due_date,
        (SELECT l.start_date FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 1) AS start_date,
        (SELECT l.term_days FROM loans l WHERE l.borrower_id = b.id AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 1) AS term_days
      FROM borrowers b
      ORDER BY b.full_name
    `);

    // Decode the b1..b5 query params. Each can be:
    //   <id> = print this borrower's info
    //   "blank" = print a blank card
    //   "" or missing = skip this slot
    const slots = [];
    const raw = [];
    for (let i = 1; i <= MAX_CARDS; i++) {
      const key = 'b' + i;
      const val = req.query[key];
      raw.push(val == null ? '' : String(val));
      if (val === 'blank') {
        slots.push({ kind: 'blank' });
      } else if (!val) {
        // skip
      } else {
        const b = borrowers.find(x => String(x.id) === String(val));
        if (b) slots.push({ kind: 'borrower', data: b });
      }
    }

    const hasSelection = Object.keys(req.query).some(k => k.startsWith('b'));

    res.render('print/cards', {
      title: 'Print Payment Cards',
      borrowers,
      slots,
      raw,
      hasSelection,
      maxCards: MAX_CARDS
    });
  } catch (err) { next(err); }
});

module.exports = router;
