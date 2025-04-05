import NS from "./namespaceManager.js";
NS.init();
// default relevant types and predicates for visualisation
export const relevantVis = {
  types: [
    NS.oa("Annotation"),
    NS.oa("TextualBody"),
    NS.mao("MusicalIdea"),
    NS.mao("MusicalMaterial"),
    NS.mao("Extract"),
    NS.mao("Selection"),
  ],
  predicates: [
    NS.oa("hasTarget"),
    NS.oa("hasBody"),
    NS.mao("setting"),
    NS.mao("settingOf"),
    NS.frbr("embodiment"),
    NS.frbr("realization"),
    NS.frbr("part"),
  ],
};

export const vrvOptions = {
  scale: 30,
  adjustPageHeight: true,
  breaks: "line",
};

export const contentTypesToTraverse = [
  "application/ld+json",
  "application/json",
  "text/turtle",
  "application/rdf+xml",
  "text/n3",
  "application/n-triples",
];

export const defaultContext = {
  "@context": {
    "@vocab": "http://www.w3.org/ns/oa#",
    oa: "http://www.w3.org/ns/oa#",
    mao: "https://domestic-beethoven.eu/ontology/1.0/music-annotation-ontology.ttl#",
    frbr: "http://purl.org/vocab/frbr/core#",
    dcterms: "http://purl.org/dc/terms/",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  },
};
