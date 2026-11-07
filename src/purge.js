// Eigenes Modul: das Worker-Hauptmodul darf nur Funktionen/Handler exportieren (workerd lehnt
// z. B. eine exportierte Zahl als Entrypoint ab).
// Geplante Aufräumarbeit (Cron-Trigger in wrangler.jsonc, stündlich):
//  - IP-Daten (ip_hash und Alt-Klartext-ip) in den Warteschlangen werden nur für das 1-h-Fenster der
//    Rate-Limits gebraucht → nach 2 h löschen. Deckt auch Altzeilen von vor Migration 0014 ab.
//  - abgelaufene Sessions löschen (sonst bleiben Discord-ID, Name und Avatar jedes Logins für immer).
export const IP_RETENTION_MS = 2 * 3600000;
export async function purge(env, now = Date.now()) {
  const cut = now - IP_RETENTION_MS;
  const st = ["mc_bids_pending", "mc_shop_orders_pending", "mc_vip_commands"].map((t) => env.DB.prepare(`UPDATE ${t} SET ip = NULL, ip_hash = NULL WHERE created_at < ? AND (ip IS NOT NULL OR ip_hash IS NOT NULL)`).bind(cut));
  st.push(env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"));
  const res = await env.DB.batch(st);
  const n = res.map((r) => r.meta?.changes || 0);
  return { bids: n[0], orders: n[1], vip: n[2], sessions: n[3] };
}
