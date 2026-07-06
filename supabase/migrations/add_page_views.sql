-- Self-hosted page-view tracking for the admin analytics dashboard.
-- Written only by the service-role client via /api/track. RLS is enabled
-- with NO policies, so anon/authenticated clients have no access at all.
CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  club_slug TEXT NOT NULL,
  list_slug TEXT,
  path TEXT NOT NULL,
  referrer TEXT,
  visitor_hash TEXT NOT NULL
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at);
CREATE INDEX IF NOT EXISTS page_views_club_slug_idx ON page_views (club_slug);
