import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export function uploadAudioBuffer(buffer, { folder, publicId, mimeType }) {
  return new Promise((resolve, reject) => {
    try {
      if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
        return reject(new Error("Cloudinary credentials missing"));
      }

      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          // Cloudinary handles audio uploads under the "video" resource type.
          resource_type: "video",
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
