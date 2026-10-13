/** Render the personal workbench vector into desktop and macOS bundle assets. */
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const resources = fileURLToPath(new URL('../resources/', import.meta.url))
const source = await readFile(`${resources}workbench-icon.svg`)
await sharp(source).png().toFile(`${resources}icon-macos.png`)
await sharp(source).png().toFile(`${resources}icon.png`)
await writeFile(`${resources}icon-macos.svg`, source)
if (process.platform === 'darwin') {
  const iconset = `${resources}workbench.iconset`
  await mkdir(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(source).resize(size, size).png().toFile(`${iconset}/icon_${size}x${size}.png`)
    await sharp(source).resize(size * 2, size * 2).png().toFile(`${iconset}/icon_${size}x${size}@2x.png`)
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', `${resources}workbench.icns`])
}
