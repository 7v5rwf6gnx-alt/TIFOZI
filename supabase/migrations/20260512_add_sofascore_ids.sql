-- Columnas para IDs externos de FotMob (sincronización de partidos, equipos y jugadores)

-- matches ya tiene fotmob_id desde la migración original; columna extra para referencia futura
ALTER TABLE matches   ADD COLUMN IF NOT EXISTS sofascore_id bigint UNIQUE;

-- teams necesita fotmob_id para poder buscar los jugadores de cada selección
ALTER TABLE teams     ADD COLUMN IF NOT EXISTS fotmob_id    bigint UNIQUE;

-- jugadores usa sofascore_id como clave externa (almacena el ID de FotMob del jugador)
ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS sofascore_id bigint UNIQUE;

CREATE INDEX IF NOT EXISTS idx_matches_sofascore_id   ON matches(sofascore_id);
CREATE INDEX IF NOT EXISTS idx_teams_fotmob_id        ON teams(fotmob_id);
CREATE INDEX IF NOT EXISTS idx_jugadores_sofascore_id ON jugadores(sofascore_id);
