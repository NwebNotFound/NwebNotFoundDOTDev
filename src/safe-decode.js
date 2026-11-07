// decodeURIComponent wirft bei kaputten %-Folgen (z. B. "%E0", "%ZZ") einen URIError. Ungefangen
// endet die Anfrage als Cloudflare-Fehler 1101. safeDecode gibt stattdessen null zurück; Aufrufer
// antworten dann mit 404 (Pfad) bzw. ignorieren den Wert (Cookie).
export function safeDecode(s) {
  try { return decodeURIComponent(String(s ?? "")); } catch { return null; }
}
