export const QLEVER_ENDPOINT = "https://qlever.dev/api/osm-planet";
export const PUBLIC_SERVERS = [
  { label: "overpass-api.de", url: "https://overpass-api.de/api/interpreter", engine: "overpass", shareId: 1, default: true },
  { label: "postpass.geofabrik.de", url: "https://postpass.geofabrik.de/api/interpreter", engine: "postpass", shareId: 2 },
  { label: "QLever OSM Planet (SPARQL)", url: QLEVER_ENDPOINT, engine: "postpass", shareId: 3 }
];
export const DEFAULT_ENDPOINT = PUBLIC_SERVERS.find((server) => server.default)?.url ?? PUBLIC_SERVERS[0].url;
