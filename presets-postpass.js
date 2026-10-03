export const POSTPASS_PRESETS = [
  {
    title: "Elementos con automatic en el mapa",
    description: "Busca nodos, vías y relaciones con la etiqueta automatic dentro del área visible del mapa.",
    query: `SELECT osm_id, osm_type, tags, geom
FROM postpass_pointlinepolygon
WHERE tags ? 'automatic'
AND geom && {{bbox}}`
  },
  {
    title: "Candidatos a nohousenumber=yes",
    description: "Busca en España elementos con addr:housenumber que parecen representar variantes de s/n, s/nº o similares y devuelve un punto representativo de cada candidato para visualizarlo en el mapa.",
    query: `WITH area AS (
    SELECT geom
    FROM postpass_polygon
    WHERE osm_type = 'R' AND osm_id = 1311341
)
SELECT
    e.osm_type,
    e.osm_id,
    e.tags,
    CASE
        WHEN e.osm_type = 'N' THEN e.geom
        ELSE ST_Centroid(ST_Envelope(e.geom))
    END AS geom
FROM postpass_pointpolygon e
CROSS JOIN area a
WHERE (
       e.geom && ST_MakeEnvelope(-9.6,35.1,4.5,43.9,4326)
    OR e.geom && ST_MakeEnvelope(-18.3,27.5,-13.2,29.6,4326)
)
AND e.tags ? 'addr:housenumber'
AND e.tags->>'addr:housenumber' ~ '^[^A-Za-z]*[sSzZ].*[nNpPgG][.oOº]?$'
AND ST_Intersects(
    a.geom,
    CASE
        WHEN e.osm_type = 'N' THEN e.geom
        ELSE ST_PointOnSurface(e.geom)
    END
)`
  },
  {
    title: "Piscinas nodo dentro de piscinas área",
    description: "Busca piscinas mapeadas como nodos que se encuentran completamente dentro de otra piscina representada como área, limitado al área visible del mapa.",
    query: `WITH polygons AS MATERIALIZED (
  SELECT geom
  FROM postpass_polygon
  WHERE tags @> '{"leisure":"swimming_pool"}'::jsonb
  AND geom && {{bbox}}
)
SELECT
  p.tags,
  p.geom,
  p.osm_type,
  p.osm_id,
  'https://osm.org/' ||
    CASE p.osm_type
      WHEN 'N' THEN 'node'
      WHEN 'W' THEN 'way'
      WHEN 'R' THEN 'relation'
    END || '/' || p.osm_id AS osm_url
FROM polygons a
CROSS JOIN LATERAL (
  SELECT
    x.tags,
    x.geom,
    x.osm_type,
    x.osm_id
  FROM postpass_point x
  WHERE x.tags @> '{"leisure":"swimming_pool"}'::jsonb
  AND x.geom && {{bbox}}
  AND x.geom && a.geom
  AND ST_Contains(a.geom, x.geom)
) p`
  },
  {
    title: "Elementos solo con distance en España",
    description: "Busca en España elementos cuyo único tag sea distance, sin ninguna otra etiqueta adicional.",
    query: `WITH spain AS (
SELECT geom
FROM postpass_polygon
WHERE tags->>'ISO3166-1'='ES'
)
SELECT o.osm_id, o.osm_type, o.tags, o.geom
FROM postpass_pointlinepolygon o
CROSS JOIN spain s
WHERE o.tags ? 'distance'
AND o.tags = jsonb_build_object('distance',o.tags->'distance')
AND o.geom && s.geom
AND ST_Intersects(o.geom,s.geom)`
  }
];
