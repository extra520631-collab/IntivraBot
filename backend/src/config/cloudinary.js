import { v2 as cloudinary } from 'cloudinary'
import { env } from './env.js'

// The SDK reads CLOUDINARY_URL from the environment automatically; calling
// config() wires it up and lets us force https URLs back.
export const cloudinaryEnabled = Boolean(env.cloudinaryUrl)
if (cloudinaryEnabled) cloudinary.config({ secure: true })

// Upload an in-memory buffer (from multer) via a stream.
export function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) =>
      err ? reject(err) : resolve(result)
    )
    stream.end(buffer)
  })
}

// Cloudinary accounts block PDF/ZIP delivery over the CDN by default, and
// signed delivery URLs don't bypass it — the authenticated download API does.
// Used to stream a CV back through our own server.
export function privateDownloadUrl(publicId, format) {
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: 'raw',
    type: 'upload',
  })
}

export default cloudinary
