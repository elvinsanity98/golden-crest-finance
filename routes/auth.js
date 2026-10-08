const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const demo = require('../db/demo');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  res.render('login', { layout: false, error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    // demo / demo opens the sandbox (same as the Try the Demo button).
    if (demo.enabled() && (username || '').trim().toLowerCase() === 'demo' && password === 'demo') {
      await demo.start(req);
      return res.redirect('/');
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', [(username || '').trim()]);
    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      return res.status(401).render('login', { layout: false, error: 'Invalid username or password.' });
    }
    req.session.userId = Number(user.id);
    req.session.user = { id: Number(user.id), username: user.username, fullName: user.full_name, role: user.role };
    res.redirect('/');
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
