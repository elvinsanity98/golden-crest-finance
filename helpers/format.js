const CURRENCY_SYMBOL = '₱'; // Philippine Peso ₱

function money(n) {
  const v = Number(n) || 0;
  return CURRENCY_SYMBOL + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function dateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { money, date, dateTime, today, CURRENCY_SYMBOL };
