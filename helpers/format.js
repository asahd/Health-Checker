const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const formatDuration = (ms) => {
  const totalMins = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return plural(mins, 'minute');
  if (mins === 0) return plural(hours, 'hour');
  return `${plural(hours, 'hour')} ${plural(mins, 'minute')}`;
};

module.exports = { formatDuration, plural };
