-- API-Football player/team IDs for photo resolution
-- Photo URL: https://media.api-sports.io/football/players/{api_football_id}.png (public, no auth)

ALTER TABLE teams     ADD COLUMN IF NOT EXISTS api_football_id integer UNIQUE;
ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS api_football_id integer UNIQUE;
ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS foto_url       text;

CREATE INDEX IF NOT EXISTS idx_teams_api_football_id     ON teams(api_football_id);
CREATE INDEX IF NOT EXISTS idx_jugadores_api_football_id ON jugadores(api_football_id);
