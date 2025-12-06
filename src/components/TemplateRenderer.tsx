import { Design, Template } from '../lib/supabase';

export function TemplateRenderer({
  template,
  design,
}: {
  template: Template;
  design: Design;
}) {
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

  if (template.type === 'web_hero' && template.style.layout === 'split') {
    return (
      <div
        data-template-renderer
        className="relative w-full aspect-video"
        style={{ backgroundColor: getColor(template.style.background as string) }}
      >
        <div className="absolute inset-0 grid grid-cols-2 items-center">
          <div className="px-16 py-12">
            {design.slots.logo && (
              <img
                src={design.slots.logo}
                alt="Logo"
                className="h-10 mb-8 object-contain object-left"
              />
            )}
            <h1
              className="text-5xl font-bold mb-6 leading-tight"
              style={{
                color: getColor(template.style.headline_color as string),
                fontFamily: getFont('fonts.heading'),
              }}
            >
              {design.slots.headline || 'Your Headline'}
            </h1>
            {design.slots.subheadline && (
              <p
                className="text-xl mb-4"
                style={{
                  color: getColor(template.style.subheadline_color as string),
                  fontFamily: getFont('fonts.body'),
                }}
              >
                {design.slots.subheadline}
              </p>
            )}
            {design.slots.body && (
              <p
                className="text-lg mb-8 opacity-80"
                style={{
                  color: getColor(template.style.body_color as string),
                  fontFamily: getFont('fonts.body'),
                }}
              >
                {design.slots.body}
              </p>
            )}
            <button
              className="px-8 py-4 rounded-lg font-semibold text-lg transition-transform hover:scale-105"
              style={{
                backgroundColor: getColor(template.style.cta_bg as string),
                color: getColor(template.style.cta_text as string),
              }}
            >
              {design.slots.cta_text || 'Get Started'}
            </button>
          </div>
          <div className="h-full flex items-center justify-center p-8">
            {design.slots.image_primary ? (
              <img
                src={design.slots.image_primary}
                alt="Hero"
                className="w-full h-full object-cover rounded-2xl shadow-2xl"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl flex items-center justify-center text-slate-500">
                Image Placeholder
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (template.type === 'web_hero' && template.style.layout === 'centered') {
    return (
      <div
        data-template-renderer
        className="relative w-full aspect-video"
        style={{ backgroundColor: getColor(template.style.background as string) }}
      >
        {design.slots.image_primary && (
          <div className="absolute inset-0 opacity-20">
            <img
              src={design.slots.image_primary}
              alt="Background"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-16 py-12">
          {design.slots.logo && (
            <img
              src={design.slots.logo}
              alt="Logo"
              className="h-12 mb-8 object-contain"
            />
          )}
          <h1
            className="text-6xl font-bold mb-6 max-w-4xl leading-tight"
            style={{
              color: getColor(template.style.headline_color as string),
              fontFamily: getFont('fonts.heading'),
            }}
          >
            {design.slots.headline || 'Your Headline'}
          </h1>
          {design.slots.subheadline && (
            <p
              className="text-2xl mb-10 max-w-2xl"
              style={{
                color: getColor(template.style.subheadline_color as string),
                fontFamily: getFont('fonts.body'),
              }}
            >
              {design.slots.subheadline}
            </p>
          )}
          <button
            className="px-10 py-5 rounded-xl font-semibold text-xl transition-transform hover:scale-105"
            style={{
              backgroundColor: getColor(template.style.cta_bg as string),
              color: getColor(template.style.cta_text as string),
            }}
          >
            {design.slots.cta_text || 'Get Started'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-slate-100 flex items-center justify-center text-slate-500">
      Template renderer not implemented for {template.type}
    </div>
  );
}
