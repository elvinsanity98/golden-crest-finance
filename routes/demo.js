const express = require('express');
const demo = require('../db/demo');

const router = express.Router();

// Everything under /demo 404s when the demo is switched off (DEMO_MODE=off).
router.use((req, res, next) => {
  if (!demo.enabled()) return res.status(404).render('404', { title: 'Not Found' });
  next();
});

// One-click entry: /demo is a shareable link, the login page posts here too.
async function enter(req, res, next) {
  try {
    await demo.start(req);
    res.redirect('/');
  } catch (err) { next(err); }
}
router.get('/', enter);
router.post('/login', enter);

// Wipe the sandbox back to the fresh sample data. Demo sessions only.
router.post('/reset', async (req, res, next) => {
  try {
    if (!demo.isDemoSession(req.session)) return res.redirect('/login');
    await demo.reseed();
    req.session.flash = { type: 'success', message: 'Demo data has been reset to the fresh sample set.' };
    res.redirect('/');
  } catch (err) { next(err); }
});

module.exports = router;
