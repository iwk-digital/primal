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
