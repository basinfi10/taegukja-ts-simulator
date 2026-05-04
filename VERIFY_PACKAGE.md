# Verification

package name: taegukja-ts-simulator-v8-5-4-performance
package version: 8.5.4
git branch command executed: git branch -M main
verified branch before packaging: main
npm install: success
npm run build: success
zip test: OK

Performance changes:
- snapshot throttling: renderSnapshotFps
- edge render budget: maxRenderedEdges
- node render budget: maxRenderedNodes
- default forceView: event
- cached samplePathStats
- interval scheduling for particle/cycle/coarse field updates
- removed per-step coarseField reset
