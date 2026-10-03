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
    description: "Busca objetos con addr:housenumber que contiene variantes de sin número dentro del área definida, devolviendo su posición o un centroide representativo para revisar posibles candidatos a nohousenumber=yes.",
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
    title: "Piscinas como nodo dentro de otra piscina",
    description: "Busca nodos leisure=swimming_pool situados dentro de polígonos que también están etiquetados como leisure=swimming_pool dentro del área visible.",
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
  p.osm_id
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
  },
  {
    title: "Ways con highway con ángulos agudos",
    description: "Busca vías con la etiqueta highway que contengan algún vértice con un ángulo inferior al umbral configurable. Permite configurar fácilmente el ángulo, la key y opcionalmente un valor concreto.",
    query: `WITH params AS (
  SELECT
    5::float AS angle_threshold,
    'highway'::text AS tag_key,
    NULL::text AS tag_value
)
SELECT
  jsonb_build_object(
    'way_id', l.osm_id,
    'angle_deg', round(p.angle::numeric, 1),
    'tag', prms.tag_key || COALESCE('=' || prms.tag_value, '')
  ) AS tags,
  p.geom
FROM postpass_line l,
params prms,
LATERAL (
  SELECT
    st_makepoint(
      st_x(dp.geom),
      st_y(dp.geom)
    ) AS geom,
    degrees(abs(st_angle(dp.prev, dp.geom, dp.nxt))) AS angle
  FROM (
    SELECT
      (dp).path[1] AS i,
      lag((dp).geom) OVER () AS prev,
      (dp).geom AS geom,
      lead((dp).geom) OVER () AS nxt
    FROM (
      SELECT st_dumppoints(l.geom) AS dp
    ) AS pts
  ) AS dp
  WHERE dp.prev IS NOT NULL
    AND dp.nxt IS NOT NULL
    AND degrees(abs(st_angle(dp.prev, dp.geom, dp.nxt))) < prms.angle_threshold
) AS p
WHERE (
  prms.tag_value IS NULL
  AND l.tags ? prms.tag_key
  OR prms.tag_value IS NOT NULL
  AND l.tags ->> prms.tag_key = prms.tag_value
)
AND l.geom && {{bbox}}`
  },
  {
    title: "Municipios con Carrer de València en zonas catalanohablantes",
    description: "Busca municipios de nivel administrativo 8 dentro de varias zonas catalanohablantes donde exista una vía llamada Carrer de València. Devuelve las zonas de búsqueda y, para cada municipio encontrado, el número de coincidencias y la vía coincidente más larga.",
    query: `WITH params AS (
  SELECT 'Carrer de València'::text AS street_name,ARRAY['residential','footway','tertiary','secondary','living_street','pedestrian','service','primary','steps','trunk','unclassified']::text[] AS highway_values
),
admin_regions(region_name,admin_level) AS (
  VALUES ('Catalunya','4'),('Comunitat Valenciana','4'),('Illes Balears','4'),('Andorra','2'),('Pyrénées-Orientales','6'),('l''Alguer/Alghero','8')
),
special_regions(region_name,political_division) AS (
  VALUES ('Franja de Ponent','linguistic_community')
),
zones AS (
  SELECT r.region_name,p.tags AS zone_tags,p.geom AS zone_geom,p.osm_type AS zone_osm_type,p.osm_id AS zone_osm_id
  FROM postpass_polygon p
  JOIN admin_regions r ON p.tags->>'boundary'='administrative' AND p.tags->>'admin_level'=r.admin_level AND p.tags->>'name'=r.region_name
),
special_zones AS (
  SELECT s.region_name,p.tags AS zone_tags,p.geom AS zone_geom,p.osm_type AS zone_osm_type,p.osm_id AS zone_osm_id
  FROM postpass_polygon p
  JOIN special_regions s ON p.tags->>'name'=s.region_name AND p.tags->>'political_division'=s.political_division
),
admin_region_union AS (
  SELECT st_union(zone_geom) AS region_geom,st_envelope(st_union(zone_geom)) AS region_bbox FROM zones
),
special_region_union AS (
  SELECT st_union(zone_geom) AS region_geom,st_envelope(st_union(zone_geom)) AS region_bbox FROM special_zones
),
muni AS (
  SELECT p.tags->>'name' AS muni_name,p.osm_type AS muni_osm_type,p.osm_id AS muni_osm_id,p.geom AS muni_geom
  FROM postpass_polygon p
  WHERE p.tags->>'boundary'='administrative'
    AND p.tags->>'admin_level'='8'
    AND (
      EXISTS (SELECT 1 FROM admin_region_union r WHERE st_intersects(st_pointonsurface(p.geom),r.region_geom))
      OR EXISTS (SELECT 1 FROM special_region_union r WHERE st_intersects(st_pointonsurface(p.geom),r.region_geom))
    )
),
matches AS (
  SELECT m.muni_name,m.muni_osm_type,m.muni_osm_id,m.muni_geom,l.osm_type AS line_osm_type,l.osm_id AS line_osm_id,l.tags AS line_tags,l.tags->>'highway' AS highway,l.geom AS line_geom,st_length(l.geom::geography) AS len_m
  FROM muni m
  CROSS JOIN params p
  JOIN postpass_line l ON l.tags->>'name'=p.street_name AND l.tags->>'highway'=ANY(p.highway_values) AND st_intersects(l.geom,m.muni_geom)
  WHERE EXISTS (SELECT 1 FROM admin_region_union r WHERE l.geom && r.region_bbox)
     OR EXISTS (SELECT 1 FROM special_region_union r WHERE l.geom && r.region_bbox)
),
top_per_muni AS (
  SELECT DISTINCT ON (muni_osm_type,muni_osm_id)
    muni_name,muni_osm_type,muni_osm_id,muni_geom,line_osm_type AS top_line_osm_type,line_osm_id AS top_line_osm_id,highway,len_m
  FROM matches
  ORDER BY muni_osm_type,muni_osm_id,len_m DESC,line_osm_type,line_osm_id
),
counts AS (
  SELECT muni_osm_type,muni_osm_id,count(DISTINCT (line_osm_type,line_osm_id)) AS matches
  FROM matches
  GROUP BY muni_osm_type,muni_osm_id
),
results AS (
  SELECT jsonb_build_object('feature','result','muni_name',t.muni_name,'matches',c.matches,'highway_top',t.highway,'top_osm_type',t.top_line_osm_type,'top_way_id',t.top_line_osm_id) AS tags,st_pointonsurface(t.muni_geom) AS geom,t.muni_osm_type AS osm_type,t.muni_osm_id AS osm_id,t.top_line_osm_id AS top_way_id,t.highway,t.muni_name,c.matches
  FROM top_per_muni t
  JOIN counts c USING (muni_osm_type,muni_osm_id)
),
muni_boundaries AS (
  SELECT jsonb_build_object('feature','municipality_boundary','muni_name',t.muni_name,'matches',c.matches) AS tags,st_boundary(t.muni_geom) AS geom,t.muni_osm_type AS osm_type,t.muni_osm_id AS osm_id,t.top_line_osm_id AS top_way_id,t.highway,t.muni_name,c.matches
  FROM top_per_muni t
  JOIN counts c USING (muni_osm_type,muni_osm_id)
),
match_results AS (
  SELECT coalesce(line_tags,'{}'::jsonb)||jsonb_build_object('feature','match','muni_name',muni_name) AS tags,line_geom AS geom,line_osm_type AS osm_type,line_osm_id AS osm_id,line_osm_id AS top_way_id,highway,muni_name,NULL::bigint AS matches
  FROM matches
),
all_zones AS (
  SELECT * FROM zones
  UNION ALL
  SELECT * FROM special_zones
),
combined AS (
  SELECT jsonb_set(coalesce(zone_tags,'{}'::jsonb),'{feature}',to_jsonb('search_zone'::text),true)||jsonb_build_object('search_zone',region_name) AS tags,st_boundary(zone_geom) AS geom,zone_osm_type AS osm_type,zone_osm_id AS osm_id,NULL::bigint AS top_way_id,NULL::text AS highway,NULL::text AS muni_name,NULL::bigint AS matches
  FROM all_zones
  UNION ALL
  SELECT tags,geom,osm_type,osm_id,top_way_id,highway,muni_name,matches FROM muni_boundaries
  UNION ALL
  SELECT tags,geom,osm_type,osm_id,top_way_id,highway,muni_name,matches FROM match_results
  UNION ALL
  SELECT tags,geom,osm_type,osm_id,top_way_id,highway,muni_name,matches FROM results
)
SELECT tags,geom,osm_type,osm_id,top_way_id,highway,muni_name,matches
FROM combined
ORDER BY
  CASE tags->>'feature'
    WHEN 'search_zone' THEN 0
    WHEN 'municipality_boundary' THEN 1
    WHEN 'match' THEN 2
    ELSE 3
  END,
  tags->>'search_zone' NULLS LAST,
  matches DESC NULLS LAST,
  muni_name NULLS LAST`
  },
  {
    title: "Candidatos a falta de restricciones de giro en Catalunya",
    description: "Busca pares de vías highway=primary y oneway=yes en Catalunya, de hasta 500 metros, conectadas con un ángulo inferior a 70 grados, y excluye pares que ya tienen una relación restriction o que participan en determinadas restricciones de giro.",
    query: `WITH area_geom AS (
  SELECT geom FROM postpass_polygon WHERE tags @> '{"boundary":"administrative","admin_level":"4","name":"Catalunya"}'::jsonb
),
area_bbox AS (
  SELECT ST_Envelope(ST_Extent(geom))::geometry AS geom FROM area_geom
),
candidate_lines AS (
  SELECT l.osm_id,l.osm_type,l.tags,l.geom,ST_PointOnSurface(l.geom) AS rep_pt
  FROM postpass_line l CROSS JOIN area_bbox b
  WHERE l.osm_type='W' AND l.tags @> '{"highway":"primary","oneway":"yes"}'::jsonb AND l.geom && b.geom
),
spatial_lines AS (
  SELECT l.osm_id,l.osm_type,l.tags,l.geom
  FROM candidate_lines l
  WHERE ST_Length(l.geom::geography)<=500
    AND EXISTS (SELECT 1 FROM area_geom a WHERE l.rep_pt && a.geom AND ST_Intersects(l.rep_pt,a.geom))
),
prepared AS (
  SELECT l.osm_id,l.osm_type,l.tags,ST_LineMerge(l.geom) AS geom,w.nodes[1] AS start_node,w.nodes[array_length(w.nodes,1)] AS end_node
  FROM spatial_lines l
  JOIN planet_osm_ways w ON w.id=l.osm_id
  WHERE GeometryType(ST_LineMerge(l.geom))='LINESTRING' AND ST_NPoints(ST_LineMerge(l.geom))>=2
),
acute_pairs AS (
  SELECT a.osm_id AS osm_id_a,a.osm_type AS osm_type_a,a.tags AS tags_a,b.osm_id AS osm_id_b,b.osm_type AS osm_type_b,b.tags AS tags_b,ST_EndPoint(a.geom) AS geom,
    abs(atan2(
      sin(ST_Azimuth(ST_EndPoint(a.geom),ST_PointN(a.geom,ST_NPoints(a.geom)-1))-ST_Azimuth(ST_StartPoint(b.geom),ST_PointN(b.geom,2))),
      cos(ST_Azimuth(ST_EndPoint(a.geom),ST_PointN(a.geom,ST_NPoints(a.geom)-1))-ST_Azimuth(ST_StartPoint(b.geom),ST_PointN(b.geom,2)))
    )) AS angle_rad
  FROM prepared a
  JOIN prepared b ON a.end_node=b.start_node AND a.osm_id<>b.osm_id
  WHERE abs(atan2(
    sin(ST_Azimuth(ST_EndPoint(a.geom),ST_PointN(a.geom,ST_NPoints(a.geom)-1))-ST_Azimuth(ST_StartPoint(b.geom),ST_PointN(b.geom,2))),
    cos(ST_Azimuth(ST_EndPoint(a.geom),ST_PointN(a.geom,ST_NPoints(a.geom)-1))-ST_Azimuth(ST_StartPoint(b.geom),ST_PointN(b.geom,2)))
  ))<radians(70)
),
candidate_way_ids AS (
  SELECT osm_id_a AS osm_id FROM acute_pairs UNION SELECT osm_id_b FROM acute_pairs
),
restriction_members AS (
  SELECT r.id,r.tags,r.members,(m.m->>'ref')::bigint AS way_id
  FROM planet_osm_rels r
  JOIN LATERAL jsonb_array_elements(r.members) m(m) ON m.m->>'type'='W'
  JOIN candidate_way_ids c ON (m.m->>'ref')::bigint=c.osm_id
  WHERE r.tags @> '{"type":"restriction"}'::jsonb AND r.tags?'restriction'
),
restricted_pairs AS (
  SELECT max(CASE WHEN m.m->>'role'='from' AND m.m->>'type'='W' THEN (m.m->>'ref')::bigint END) AS osm_id_a,max(CASE WHEN m.m->>'role'='to' AND m.m->>'type'='W' THEN (m.m->>'ref')::bigint END) AS osm_id_b
  FROM (SELECT DISTINCT id,members FROM restriction_members) r
  JOIN LATERAL jsonb_array_elements(r.members) m(m) ON TRUE
  GROUP BY r.id
  HAVING max(CASE WHEN m.m->>'role'='from' AND m.m->>'type'='W' THEN 1 ELSE 0 END)=1
     AND max(CASE WHEN m.m->>'role'='to' AND m.m->>'type'='W' THEN 1 ELSE 0 END)=1
),
excluded_way_ids AS (
  SELECT DISTINCT way_id AS osm_id FROM restriction_members WHERE tags->>'restriction' IN ('only_straight_on','only_right_turn')
)
SELECT
  jsonb_build_object(
    'feature','acute_turn',
    'angle_deg',round(degrees(p.angle_rad)::numeric,2),
    'osm_id_a',p.osm_id_a,
    'osm_id_b',p.osm_id_b,
    'way_a',p.tags_a,
    'way_b',p.tags_b
  ) AS tags,
  p.geom,
  p.osm_type_a AS osm_type,
  p.osm_id_a AS osm_id,
  p.osm_type_a,
  p.osm_id_a,
  p.osm_type_b,
  p.osm_id_b,
  degrees(p.angle_rad) AS angle_deg
FROM acute_pairs p
LEFT JOIN restricted_pairs r ON r.osm_id_a=p.osm_id_a AND r.osm_id_b=p.osm_id_b
LEFT JOIN excluded_way_ids x1 ON x1.osm_id=p.osm_id_a
LEFT JOIN excluded_way_ids x2 ON x2.osm_id=p.osm_id_b
WHERE r.osm_id_a IS NULL AND x1.osm_id IS NULL AND x2.osm_id IS NULL`
  },
  {
    title: "Elementos cuyo ID aparece como valor de uno de sus tags",
    description: "Busca nodos, vías y relaciones dentro del área visible cuyo osm_id coincide exactamente con el valor de alguna de sus etiquetas.",
    query: `SELECT
  tags,
  geom,
  osm_type,
  osm_id
FROM postpass_pointlinepolygon
WHERE geom && {{bbox}}
AND jsonb_path_query_first(
  tags,
  '$.* ? (@ == $id)'::jsonpath,
  jsonb_build_object('id', osm_id::text)
) IS NOT NULL`
  },
  {
    title: "Posibles castellanizaciones en name",
    description: "Busca elementos dentro de las áreas definidas cuyo name comienza por determinados términos genéricos en castellano, para detectar posibles nombres que convenga revisar.",
    query: `WITH areas AS MATERIALIZED (
  SELECT geom
  FROM postpass_polygon
  WHERE osm_type = 'R'
  AND osm_id IN (9407,348981,349053)
)
SELECT
  CASE e.osm_type
    WHEN 'N' THEN 'node'
    WHEN 'W' THEN 'way'
    WHEN 'R' THEN 'relation'
  END AS type,
  e.osm_id AS id,
  e.tags->>'name' AS name,
  ST_PointOnSurface(e.geom) AS geom
FROM areas a
CROSS JOIN LATERAL (
  SELECT osm_type,osm_id,tags,geom
  FROM postpass_pointlinepolygon
  WHERE (
    geom && ST_MakeEnvelope(0.1,40.45,3.4,42.9,4326)
    OR geom && ST_MakeEnvelope(1.1,38.6,4.4,40.2,4326)
  )
  AND geom && a.geom
  AND tags->>'name' ~* '^(iglesias?|cru(?:z|ces?)|gasolineras?|estaci(?:[óo]n|ones)|pasajes?|calles?|avenidas?|plazas?|callej(?:[óo]n|ones)|callejuelas?|torrentes?|arroyos?|fuentes?|r[ií]os?|acequias?|caminos?|senderos?|escaleras?|centros?|cerros?|picos?|cimas?|barranc[oa]s?|altos?|montes?|lomas?|colegios?|paseos?|ayuntamientos?|collados?|sierras?|playas?|cabezos?|puertos?|barrios?|campos?|cementerios?|cuestas?|urbanizaci(?:[óo]n|ones)|a[qc]ueductos?|parques?)([^a-z]|$)'
) e
WHERE ST_Intersects(a.geom,ST_PointOnSurface(e.geom))`
  }
];
