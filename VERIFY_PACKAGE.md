# Verification

package name: taegukja-ts-simulator-v8-4-1-resonance-priority
package version: 8.4.1
git branch command executed: git branch -M main
verified branch before packaging: main
build command: npm run build
build result: success

User-side checks:

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
git init
git branch -M main
git branch --show-current
npm install
npm run build
```
