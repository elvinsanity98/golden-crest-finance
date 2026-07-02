const express = require('express');
const { computeLoan, addDays, FREQUENCIES } = require('../helpers/calc');
const { today } = require('../helpers/format');

const router = express.Router();

// Repeated query keys parse as arrays; take the last non-empty value.
function scalar(v) {
  if (Array.isArray(v)) v = v.filter(x => x !== '').pop() || '';
  return v || '';
}

router.get('/', (req, res) => {
  let result = null;
  let error = null;
  let schedule = null;
  const form = {
    principal: scalar(req.query.principal),
    term_days: scalar(req.query.term_days),
    monthly_rate: req.query.monthly_rate || 10,
    frequency: FREQUENCIES[req.query.frequency] ? req.query.frequency : 'daily',
    start_date: req.query.start_date || today()
  };
  if (req.query.principal && req.query.term_days) {
    try {
      result = computeLoan({
        principal: form.principal,
        termDays: form.term_days,
        monthlyRate: form.monthly_rate,
        frequency: form.frequency
      });
      const interval = FREQUENCIES[form.frequency].intervalDays;
      schedule = [];
      for (let k = 1; k <= result.periods; k++) {
        // Installment k due at the end of its period; Day 1 = start date.
        const due = k * interval >= result.termDays
          ? addDays(form.start_date, result.termDays - 1)
          : addDays(form.start_date, k * interval - 1);
        schedule.push({ day: k, date: due, amount: result.installment });
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
      monthlyRate: req.body.monthly_rate || 10,
      frequency: req.body.frequency || 'daily'
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
