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
    NS.tl("Interval"),
    NS.mo("Signal"),
    NS.mo("Track"),
  ],
  predicates: [
    NS.oa("hasTarget"),
    NS.oa("hasBody"),
    NS.mao("setting"),
    NS.mao("settingOf"),
    NS.frbr("embodiment"),
    NS.frbr("realization"),
    NS.frbr("part"),
    NS.tl("onTimeLine"),
    NS.mo("published_as"),
    NS.mo("musicbrainz"),
    NS.rdf("value"),
  ],
};

export const vrvOptions = {
  breaks: "encoded",
  svgHtml5: true,
  svgViewBox: true,
  footer: "none",
  adjustPageHeight: true,
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
    dc: "http://purl.org/dc/terms/",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    mo: "http://purl.org/ontology/mo/",
    tl: "http://purl.org/NET/c4dm/timeline.owl#",
    ssv: "https://w3id.org/ssv/vocab#",
  },
};
