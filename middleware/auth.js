function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.method === 'GET') return res.redirect('/login');
  return res.status(401).json({ error: 'unauthorized' });
}

function injectUser(req, res, next) {
  res.locals.currentUser = req.session && req.session.user ? req.session.user : null;
  res.locals.flash = req.session && req.session.flash ? req.session.flash : null;
  if (req.session) req.session.flash = null;
  next();
}

module.exports = { requireAuth, injectUser };
