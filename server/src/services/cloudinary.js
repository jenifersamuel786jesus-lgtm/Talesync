import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export function uploadAudioBuffer(buffer, { folder, publicId }) {
  return new Promise((resolve, reject) => {
    try {
      if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
        return reject(new Error("Cloudinary credentials missing"));
      }

      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "video",
          type: "authenticated",
          overwrite: true
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        }
      );

      stream.end(buffer);
    } catch (err) {
      return reject(err);
    }
  });
}

export function getSignedCloudinaryAudioUrl(publicId, ttlSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return cloudinary.url(publicId, {
    resource_type: "video",
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: expiresAt
  });
}
