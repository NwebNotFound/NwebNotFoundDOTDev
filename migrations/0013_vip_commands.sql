-- VIP-Befehlsqueue. Ack über (discord_id, request_id), world_id ist eine UUID, Zeiten in Millisekunden. Rein additiv.
CREATE TABLE IF NOT EXISTS mc_vip_commands (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  world_id TEXT NOT NULL,
  actor_uuid TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  owner_uuid TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  name TEXT,
  role TEXT,
  visibility TEXT,
  info TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  acked_at INTEGER,
  ip TEXT,
  UNIQUE (discord_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_vip_cmd_status ON mc_vip_commands(status, created_at);
CREATE INDEX IF NOT EXISTS idx_vip_cmd_world ON mc_vip_commands(world_id, status);
