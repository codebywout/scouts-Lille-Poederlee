# Vendored Terser (JS minify)

Pinned **terser@5.37.0** (BSD-2-Clause) for local minification of `assets/js/script.js`.

## Integrity

See `manifest.json` for `dist.integrity` (sha512), tarball URL, and license.

The committed `terser-5.37.0.tgz` was verified against the npm registry integrity with TLS enabled (`npm config get strict-ssl` = true). On this Windows host, Node needed `NODE_OPTIONS=--use-system-ca` so OpenSSL uses the OS certificate store (same trust as curl/PowerShell). **Do not** set `NODE_TLS_REJECT_UNAUTHORIZED=0` or `strict-ssl=false`.

## Local install (not committed)

```powershell
cd tools/vendor
$env:NODE_OPTIONS='--use-system-ca'
npm install
```

`node_modules/` is gitignored. Plesk does not need Node or this folder.
