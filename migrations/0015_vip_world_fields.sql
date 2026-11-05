-- VIP-Panel v2: create braucht die Weltart, settings traegt die Teilmenge der Weltregeln.
-- Rein additiv: zwei nullable Spalten, keine bestehende Zeile wird geaendert oder geloescht.
-- world_type ist normal|flat|void, settings ist ein JSON-Objekt nach docs/vip-api.md.
ALTER TABLE mc_vip_commands ADD COLUMN world_type TEXT;
ALTER TABLE mc_vip_commands ADD COLUMN settings TEXT;
