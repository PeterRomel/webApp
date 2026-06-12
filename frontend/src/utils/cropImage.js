// A standard helper function to extract the cropped pixels from the image
export const getCroppedImg = async (imageSrc, pixelCrop) => {
  // Guard clause in case the user clicks 'Save' before the cropper initializes
  if (!pixelCrop) throw new Error("Please wait for the image to load.");

  const image = new Image();
  image.src = imageSrc;

  // We have to wait for the image to load in the browser memory
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // --- THE FIX: ENFORCE A MAXIMUM OUTPUT RESOLUTION ---
  // 800x800 is HD quality for an avatar, but uses 90% less browser memory!
  const MAX_SIZE = 800;

  // Calculate a safe scale.
  // If the user's crop is 3000px, scale is ~0.26. If their crop is 400px, scale is 1.
  const scale = Math.min(
    MAX_SIZE / pixelCrop.width,
    MAX_SIZE / pixelCrop.height,
    1,
  );

  // Round the numbers to prevent canvas sub-pixel blurring issues
  canvas.width = Math.round(pixelCrop.width * scale);
  canvas.height = Math.round(pixelCrop.height * scale);

  // Draw the massive original image into our safely-sized 800x800 canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0, // x on canvas
    0, // y on canvas
    canvas.width,
    canvas.height,
  );

  // Convert the canvas to a Blob (a file object we can send to FastAPI)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (file) => {
        if (!file) {
          reject(
            new Error(
              "Browser failed to process the image. Try a smaller file.",
            ),
          );
          return;
        }
        resolve(file);
      },
      "image/jpeg",
      0.95, // 95% JPEG quality
    );
  });
};
