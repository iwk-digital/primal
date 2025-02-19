import ns from "./namespaceManager.js";

// default relevant types and predicates for visualisation
export const relevantVis = {
  types: [
    ns.oa("Annotation"),
    ns.oa("TextualBody"),
    ns.mao("MusicalIdea"),
    ns.mao("MusicalMaterial"),
    ns.mao("Extract"),
    ns.mao("Selection"),
  ],
  predicates: [
    ns.oa("hasTarget"),
    ns.oa("hasBody"),
    ns.mao("setting"),
    ns.mao("settingOf"),
    ns.frbr("embodiment"),
    ns.frbr("realization"),
    ns.frbr("part"),
  ],
};
