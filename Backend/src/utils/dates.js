/** Monday-to-Friday days between two 'YYYY-MM-DD' dates, inclusive. */
function workingDays(start, end) {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  let count = 0;
  for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD'. */
function lastDayOfMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

module.exports = { workingDays, lastDayOfMonth };
