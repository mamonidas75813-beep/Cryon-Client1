/** Sort live Minecraft servers: online first, then highest player count; offline last. */
export function sortPartnerServersByLiveStatus(servers, statusById = {}) {
  const statusRank = server => {
    const status = statusById?.[server.id];
    if (status?.online === true) return 0;
    if (status?.online === false) return 2;
    return 1; // Keep still-checking servers between confirmed online and offline.
  };
  return [...servers].sort((a, b) => {
    const availability = statusRank(a) - statusRank(b);
    if (availability) return availability;
    const aOnline = statusById?.[a.id]?.online === true;
    const bOnline = statusById?.[b.id]?.online === true;
    if (aOnline && bOnline) {
      const players = (Number(statusById?.[b.id]?.playersOnline) || 0) - (Number(statusById?.[a.id]?.playersOnline) || 0);
      if (players) return players;
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}
