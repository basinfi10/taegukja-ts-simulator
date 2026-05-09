# Verification

package name: taegukja-ts-simulator-v8-6-stable-verifier
package version: 8.6.0
git branch command executed: git branch -M main
verified branch before packaging: main
npm install: success
npm run build: success
zip test: OK

v8.6 stable verifier:
- ParticleHistoryRecord
- ParticleTransitionEvent
- StableVerifierMetrics
- updateStableVerifier()
- matchParticleHistory()
- computeParticleBondRatios()
- stable = survival + crossing progress + cycle continuity + internal bond + low external bond
- JSON export now includes particleHistories, particleTransitions, stableVerifierMetrics
