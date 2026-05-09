# Verification

package name: taegukja-ts-simulator-v8-5-9-anti-saturation
package version: 8.5.9
git branch command executed: git branch -M main
verified branch before packaging: main
npm install: success
npm run build: success
zip test: OK

Data-driven fixes based on taegukja-v858-state:
- eventActivity/eventContinuity saturation was 1.0
- linkCount hit maxLinks 12000
- massBondCount 2633
- largestParticleSize 1349
- activePulseCount 259 / target 260
- v8.5.9 adds anti-saturation and local particle splitting
