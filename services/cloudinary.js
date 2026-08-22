import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

let isConfigured = false;

export function getCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl || (cloudName && apiKey && apiSecret)) {
    if (!isConfigured) {
      if (cloudinaryUrl) {
        cloudinary.config({ cloudinary_url: cloudinaryUrl });
      } else {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
        });
      }
      isConfigured = true;
      console.log("[Cloudinary] Configured successfully");
    }
    return cloudinary;
  }

  return null;
}

/**
 * Upload a file buffer to Cloudinary using a stream.
 *
 * @param {Buffer} buffer - File buffer from multer
 * @param {object} options - Upload options (folder, resource_type, etc.)
 * @returns {Promise<object>} Cloudinary upload result
 */
export function uploadBufferToCloudinary(buffer, options = {}) {
  const c = getCloudinary();
  if (!c) {
    throw new Error(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment."
    );
  }

  const defaultOptions = {
    folder: "milton_college",
    resource_type: "auto",
    ...options,
  };

  return new Promise((resolve, reject) => {
    const uploadStream = c.uploader.upload_stream(
      defaultOptions,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}
