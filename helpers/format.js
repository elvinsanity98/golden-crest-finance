const CURRENCY_SYMBOL = '₱'; // Philippine Peso ₱
const TZ = 'Asia/Manila';

// "YYYY-MM-DD" in Manila local time. Used for storing payment dates and
// for "today" comparisons in business logic.
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function money(n) {
  const v = Number(n) || 0;
  return CURRENCY_SYMBOL + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format a date-only value (YYYY-MM-DD) for display. We anchor the
// date at noon Manila to dodge DST/timezone edge cases.
function date(d) {
  if (!d) return '';
  let dt;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    dt = new Date(d + 'T12:00:00+08:00');
  } else {
    dt = new Date(d);
  }
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-PH', {
    timeZone: TZ,
    year: 'numeric', month: 'short', day: '2-digit'
  });
}

// Format an SQLite/libSQL UTC timestamp ("YYYY-MM-DD HH:MM:SS") in Manila time.
function dateTime(d) {
  if (!d) return '';
  let dt;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
    // libSQL datetime('now') is UTC with no timezone marker — add 'Z'.
    dt = new Date(d.replace(' ', 'T') + 'Z');
  } else {
    dt = new Date(d);
  }
  if (isNaN(dt)) return d;
  return dt.toLocaleString('en-PH', {
    timeZone: TZ,
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

module.exports = { money, date, dateTime, today, CURRENCY_SYMBOL, TZ };
