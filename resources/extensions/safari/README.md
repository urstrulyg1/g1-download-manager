# G1DM Safari Web Extension

This package contains the Safari Web Extension source for G1DM.

## Packaging into macOS Safari App Extension Container

On macOS with Xcode installed:

```bash
xcrun safari-web-extension-converter resources/extensions/safari --app-name "G1DM Safari Companion"
```

Then open the generated Xcode project and build/run with Signing to enable in Safari Preferences -> Extensions.
