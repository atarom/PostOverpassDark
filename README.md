<div align="center">
  <img src="PODlogo.png" alt="Logo de PostOverpassDark" width="200">
  <h1>PostOverpassDark</h1>
  <p>
    <a href="https://atarom.github.io/PostOverpassDark/">
      <strong>Abrir la aplicación ↗</strong>
    </a>
  </p>
</div>

---

## Funciones

- Consultas mediante **Overpass** y **Postpass**.
- Editor con resaltado, autocompletado y presets de ejemplo.
- Variables compatibles con consultas como `{{bbox}}`, `{{center}}`, `{{geocodeArea:...}}`...
- Visualización normal o como mapa de calor.
- Conteo de keys y valores de los tags devueltos.
- Filtro por regex sobre la key seleccionada, con colores configurables.
- Filtro numérico por key con rango mínimo/máximo y visualización opcional de valores fuera de rango.
- Inspección de la consulta enviada, respuesta original y GeoJSON generado.
- Acceso directo desde los resultados a OpenStreetMap y distintos editores OSM.
- Envío directo a JOSM de objetos encontrados con Overpass o Postpass mediante Remote Control.

## Enviar resultados Overpass o Postpass a JOSM

En JOSM activa **Preferencias → Control remoto → Habilitar control remoto**. Ejecuta una consulta Overpass con salida OSM XML o JSON, o una consulta Postpass que devuelva `osm_type`, `osm_id` y `geom`. El botón **Enviar a JOSM** recoge únicamente los IDs OSM originales devueltos en el resultado y permite que JOSM descargue los objetos actuales y miembros de las relaciones desde la API oficial de OpenStreetMap. Las salidas tabulares o derivadas sin IDs originales no son enviables.

Se deduplican los identificadores en ambos modos, incluidas las representaciones geométricas múltiples de Postpass. Los envíos grandes se dividen automáticamente en solicitudes más pequeñas para respetar la longitud de las URL de JOSM.

## Compartir consultas

El botón **Compartir** genera un enlace autocontenido con la consulta completa, el servidor, el centro y zoom del mapa y la configuración de mapa de calor. Los parámetros visuales con valores predeterminados se omiten del enlace. Se utiliza compresión DEFLATE sin cabeceras cuando acorta el resultado, y codificación directa si resulta más compacta. Los datos van en el fragmento `#s=` de la URL.

## Áreas por nombre en Postpass

`{{geocodeArea:nombre}}` utiliza Nominatim para obtener el ID original de una relación OSM y lo inserta como número en el SQL. Para evitar la búsqueda puedes escribir `{{geocodeArea:11739086}}`, `{{geocodeArea:R11739086}}` o `{{geocodeArea:relation/11739086}}`. En Overpass, la misma macro conserva el formato `area(3600000000 + ID)`.

```sql
WITH zona AS (
  SELECT geom
  FROM postpass_polygon
  WHERE osm_type = 'R'
    AND osm_id = {{geocodeArea:Municipis de Predomini Lingüístic Valencià}}
)
SELECT p.osm_id, p.osm_type, p.tags, p.geom
FROM postpass_pointlinepolygon p
WHERE p.tags->>'place' = 'square'
  AND p.tags->>'name' ~ '^Plaza'
  AND EXISTS (
    SELECT 1 FROM zona a
    WHERE p.geom && a.geom
      AND ST_Intersects(p.geom, a.geom)
  )
```

La consulta necesita que la relación tenga geometría poligonal en Postpass. `ST_Intersects` representa la intersección espacial y no es exactamente igual al filtro `area` de Overpass.

## Tecnologías y datos

- [OpenLayers](https://openlayers.org/) — renderización WebGL, filtros dinámicos y navegación del mapa.
- [OpenStreetMap](https://www.openstreetmap.org/) — teselas del mapa base.
- [Overpass API](https://overpass-api.de/) — consultas Overpass QL.
- [Postpass](https://postpass.geofabrik.de/) — consultas SQL/PostGIS.
- [CodeMirror](https://codemirror.net/) — editor de consultas.
- [osmtogeojson](https://github.com/tyrasd/osmtogeojson) — conversión de respuestas OSM a GeoJSON.
- [Nominatim](https://nominatim.org/) — resolución de áreas para `{{geocodeArea:...}}`.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) — datos.
