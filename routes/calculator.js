const express = require('express');
const { computeLoan, addDays } = require('../helpers/calc');
const { today } = require('../helpers/format');

const router = express.Router();

router.get('/', (req, res) => {
  let result = null;
  let error = null;
  let schedule = null;
  const form = {
    principal: req.query.principal || '',
    term_days: req.query.term_days || '',
    monthly_rate: req.query.monthly_rate || 10,
    start_date: req.query.start_date || today()
  };
  if (req.query.principal && req.query.term_days) {
    try {
      result = computeLoan({
        principal: form.principal,
        termDays: form.term_days,
        monthlyRate: form.monthly_rate
      });
      schedule = [];
      for (let i = 0; i < result.termDays; i++) {
        schedule.push({ day: i + 1, date: addDays(form.start_date, i + 1), amount: result.dailyPayment });
      }
    } catch (e) {
      error = e.message;
    }
  }
  res.render('calculator', { title: 'Loan Calculator', result, error, schedule, form });
});

router.post('/api', (req, res) => {
  try {
    const result = computeLoan({
      principal: req.body.principal,
      termDays: req.body.term_days,
      monthlyRate: req.body.monthly_rate || 10
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
