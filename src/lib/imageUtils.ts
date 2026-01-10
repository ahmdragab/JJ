/**
 * Convert an SVG file to a PNG file using Canvas API
 * @param svgFile - The SVG file to convert
 * @param options - Conversion options
 * @returns Promise<File> - The converted PNG file
 */
export async function convertSvgToPng(
  svgFile: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    backgroundColor?: string;
  } = {}
): Promise<File> {
  const { maxWidth = 1024, maxHeight = 1024, backgroundColor = 'transparent' } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const svgText = e.target?.result as string;

        // Create an image from the SVG
        const img = new Image();
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
          try {
            // Calculate dimensions while maintaining aspect ratio
            let width = img.naturalWidth || 512;
            let height = img.naturalHeight || 512;

            // If SVG has no intrinsic size, use defaults
            if (width === 0 || height === 0) {
              width = 512;
              height = 512;
            }

            // Scale down if needed while maintaining aspect ratio
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            // Create canvas and draw the SVG
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(url);
              reject(new Error('Could not get canvas context'));
              return;
            }

            // Fill background if not transparent
            if (backgroundColor !== 'transparent') {
              ctx.fillStyle = backgroundColor;
              ctx.fillRect(0, 0, width, height);
            }

            // Draw the SVG image
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to PNG blob
            canvas.toBlob(
              (blob) => {
                URL.revokeObjectURL(url);

                if (!blob) {
                  reject(new Error('Failed to convert SVG to PNG'));
                  return;
                }

                // Create a new File with PNG extension
                const baseName = svgFile.name.replace(/\.svg$/i, '');
                const pngFile = new File([blob], `${baseName}.png`, {
                  type: 'image/png',
                });

                resolve(pngFile);
              },
              'image/png',
              1.0
            );
          } catch (err) {
            URL.revokeObjectURL(url);
            reject(err);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG as image'));
        };

        img.src = url;
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read SVG file'));
    };

    reader.readAsText(svgFile);
  });
}

/**
 * Check if a file is an SVG
 */
export function isSvgFile(file: File): boolean {
  return (
    file.type === 'image/svg+xml' ||
    file.name.toLowerCase().endsWith('.svg')
  );
}
