const { execFileSync } = require('child_process')
const path = require('path')

// electron-builder finds no valid "Developer ID Application" identity on this
// machine, so mac builds ship with zero code signature. On Apple Silicon, an
// unsigned app downloaded via a browser (quarantined) gets blocked by Gatekeeper
// as "is damaged" rather than the milder "unidentified developer" warning.
// Ad-hoc signing (identity "-") doesn't remove Gatekeeper's warning entirely, but
// fixes that hard block so the app can be opened via right-click > Open instead.
exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)

  console.log(`[afterSign] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
