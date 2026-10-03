export const OVERPASS_PRESETS = [
  {
    title: "Objetos con automatic en España",
    description: "Busca nodos, vías y relaciones de España que tengan la etiqueta automatic y devuelve su geometría central cuando corresponda.",
    query: `[out:xml][timeout:32][maxsize:16Mi];
{{geocodeArea:spain}}->.sA;
nwr["automatic"](area.sA);
out center;`
  },
  {
    title: "Nodos huérfanos por ID",
    description: "Comprueba una lista concreta de nodos sin etiquetas y devuelve únicamente los que no pertenecen a ninguna vía ni relación.",
    query: `[out:xml][timeout:32][maxsize:16Mi];
node(id:13748246304,13748246305)(if:count_tags()==0)->.n;
way(bn.n)->.w;
rel(bn.n)->.r;
(.w;>;)->.wn;
(.r;>;)->.rn;
(.n; - (.wn;.rn;););
out meta;`
  },
  {
    title: "Elementos con un solo tag",
    description: "Busca en España elementos con la etiqueta distance cuyo único tag sea distance, e incluye los elementos necesarios para completar su geometría.",
    query: `[out:xml][timeout:48][maxsize:16Mi];
{{geocodeArea:spain}}->.sA;
(
  nwr[distance](if: count_tags() == 1)(area.sA);
);
(._;>;);
out meta;`
  }
];
