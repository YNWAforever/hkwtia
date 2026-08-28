import sharp from "sharp";

/** Deterministic in-memory JPEG fixture carrying orientation, EXIF and GPS tags. */
export async function exifGpsJpegFixture(): Promise<Buffer> {
  return sharp({
    create: {width: 2, height: 3, channels: 3, background: "red"},
  }).jpeg().withMetadata({
    orientation: 6,
    exif: {
      IFD0: {Artist: "Task4 fixture"},
      IFD3: {GPSLatitudeRef: "N", GPSLongitudeRef: "E"},
    },
  }).toBuffer();
}
