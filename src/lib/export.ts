import { Design, Template } from './supabase';

export async function exportToHTML(design: Design, template: Template): Promise<void> {
  const tokens = design.tokens as {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
  };

  const getColor = (path: string) => {
    const parts = path.split('.');
    if (parts[0] === 'colors' && tokens.colors) {
      return tokens.colors[parts[1]] || '#000000';
    }
    return '#000000';
  };

  const getFont = (path: string) => {
    const parts = path.split('.');
    if (parts[0] === 'fonts' && tokens.fonts) {
      return tokens.fonts[parts[1]] || 'Inter, sans-serif';
    }
    return 'Inter, sans-serif';
  };

  let html = '';

  // Early return if style is not defined
  if (!template.style) {
    throw new Error('Template style is not configured');
  }

  if (template.type === 'web_hero' && template.style.layout === 'split') {
    html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${design.slots.headline || 'Design Export'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${getFont('fonts.body')}; }
    .hero {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 100vh;
      align-items: center;
      background-color: ${getColor(template.style.background as string)};
    }
    .hero-content {
      padding: 4rem;
    }
    .logo {
      height: 2.5rem;
      margin-bottom: 2rem;
      object-fit: contain;
      object-position: left;
    }
    .headline {
      font-size: 3rem;
      font-weight: bold;
      margin-bottom: 1.5rem;
      line-height: 1.2;
      color: ${getColor(template.style.headline_color as string)};
      font-family: ${getFont('fonts.heading')};
    }
    .subheadline {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: ${getColor(template.style.subheadline_color as string)};
    }
    .body {
      font-size: 1.125rem;
      margin-bottom: 2rem;
      opacity: 0.8;
      color: ${getColor(template.style.body_color as string)};
    }
    .cta {
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 1.125rem;
      border: none;
      cursor: pointer;
      background-color: ${getColor(template.style.cta_bg as string)};
      color: ${getColor(template.style.cta_text as string)};
    }
    .hero-image-container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 1rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-content">
      ${design.slots.logo ? `<img src="${design.slots.logo}" alt="Logo" class="logo">` : ''}
      <h1 class="headline">${design.slots.headline || 'Your Headline'}</h1>
      ${design.slots.subheadline ? `<p class="subheadline">${design.slots.subheadline}</p>` : ''}
      ${design.slots.body ? `<p class="body">${design.slots.body}</p>` : ''}
      <button class="cta">${design.slots.cta_text || 'Get Started'}</button>
    </div>
    <div class="hero-image-container">
      ${design.slots.image_primary ? `<img src="${design.slots.image_primary}" alt="Hero" class="hero-image">` : ''}
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `design-${design.id}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToPNG(design: Design, template: Template): Promise<void> {
  const renderElement = document.querySelector('[data-template-renderer]') as HTMLElement;

  if (!renderElement) {
    throw new Error('Unable to find design to export');
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    const scale = 2;
    canvas.width = 1920 * scale;
    canvas.height = 1080 * scale;
    ctx.scale(scale, scale);

    const tokens = design.tokens as {
      colors?: Record<string, string>;
      fonts?: Record<string, string>;
    };

    const getColor = (path: string) => {
      const parts = path.split('.');
      if (parts[0] === 'colors' && tokens.colors) {
        return tokens.colors[parts[1]] || '#000000';
      }
      return '#000000';
    };

    ctx.fillStyle = template.style ? getColor(template.style.background as string) : '#ffffff';
    ctx.fillRect(0, 0, 1920, 1080);

    ctx.fillStyle = template.style ? getColor(template.style.headline_color as string) : '#000000';
    ctx.font = 'bold 60px Inter';
    ctx.fillText(design.slots.headline || 'Your Headline', 100, 300, 800);

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-${design.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export PNG:', error);
    throw new Error('Failed to export PNG. Please try again.');
  }
}
