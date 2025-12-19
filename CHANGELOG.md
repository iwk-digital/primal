# Platform for Review and Interaction with Music Annotation Linked-data CHANGELOG

## 0.10.0 - 18 December 2025
* Fix and improve styling on mobile devices
* Add touch support for Mermaid graph modal
* Incorporate textual body into Mermaid graph

## 0.9.0 - 16 December 2025
* Scale score rendering to available space
* Optimize traversal to improve load times
* Improve input validation to prevent XSS-style vulnerabilities

## 0.8.0 - 10 October 2025
* Add comprehensive audio file metadata display in metadata container
* Include mo:Signal and mo:Track objects in registry traversal for complete metadata extraction
* Enhanced audio selections section with track labels and direct MusicBrainz links
* Add visual icons and improved styling for different link types

## 0.7.0 - 6 October 2025
* Correct peaks-duration calculation to fix positioning of regions
* Add robust error handling around peaks data

## 0.6.0 - 5 October 2025
* Implement graph modal view feature with zoom and panning
* Add funding acknowledgement to footer and improve styling
* Add loading spinners
* Handle errors more gracefully

## 0.5.0 - 3 October 2025
* Display time interval information in waveform labels

### 0.4.1 - 15 July 2025
* Vocab namespace fix

### 0.4.0 - 1 July 2025
* Add splash screen when arriving without ?obj parameter
* Handle large graph visualisations (make graphs scrollable) without shrinking them

### 0.3.3 - 26  May 2025
* Display peaks visualisation if audio not available (and precalculated peaks available)

### 0.3.2 - 15 May 2025
* Display creator metadata if available

### 0.3.1 - 30 Apr 2025
* Add support for audio recordings using wavesurfer.js

### 0.3.0 - 29 Apr 2025
* Rename from OMAnnO to PRIMAL
* Restructure code to remove Flask dependency

### 0.2.0 - 6 Apr 2025
* Implement navigation bar
* Implement styling

### 0.1.0 - 5 Apr 2025
* Visualisation of MAO as well as OA
* Add navigation to visualisation
* Add JSON listing
* Add Verovio score with target highlight

### 0.0.2 - 20 Feb 2025
* Ugly but functional visualisation of OA using Mermaid.js

### 0.0.1 - 19 Feb 2025
* Initial codebase architecture
* Read and ingest OA and MAO structures
* Manage namespaces
