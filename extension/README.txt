ZTally Bridge: optional browser extension
==========================================

Without the extension, ZTally guesses the site from the tab title (e.g. "... - YouTube").
With it, ZTally sees the real domain of the active tab. The extension only talks to
http://127.0.0.1:47631 on your own machine. Nothing is sent anywhere else.

Chrome / Chromium / Edge / Brave / Vivaldi / Opera
  1. Open chrome://extensions (edge://extensions, brave://extensions, ...)
  2. Turn on "Developer mode"
  3. Click "Load unpacked" and pick this folder

Firefox (121+)
  1. Open about:debugging#/runtime/this-firefox
  2. Click "Load Temporary Add-on..." and pick manifest.json in this folder
  Note: temporary add-ons are removed when Firefox restarts. For a permanent install use
  Firefox Developer Edition / Nightly with xpinstall.signatures.required = false, or a
  signed build of the extension.
