ART STYLE — TOP-DOWN 2D SVG

Core Visual Direction

Maintain a consistent art style using detailed, realistic, cel-shaded SVG graphics presented from an elevated three-quarter top-down perspective.

The artwork must use carefully layered SVG geometry, controlled proportions, gradients, highlights, shadows and lighting to create convincing depth and volume within a 2D game environment.

The visual style should be richly detailed, dimensional and cohesive, rather than flat, minimalist or excessively cartoonish.

Perspective and Composition

Use a consistent elevated three-quarter top-down perspective throughout the game.

The player should be able to see the upper surfaces of objects, structures and environmental features while also seeing their front-facing vertical surfaces where appropriate.

Maintain consistent viewing angles, proportions, depth and visual scale across all assets.

Avoid:

- Strict 90-degree overhead views.
- Isometric diamond-grid projection.
- Exaggerated perspective distortion.
- Pixel art.
- Minimalist flat graphics.
- Oversimplified geometry.
- Exaggerated cartoon proportions.

SVG Construction and Layering

Construct all visual assets using detailed, layered SVG geometry.

Use multiple overlapping shapes, carefully controlled gradients, highlights, shadows, recessed details and material-specific shading to create dimensional artwork.

Objects should have convincing silhouettes, visible thickness and clearly defined structural forms.

Use baked-in shading to establish volume and depth, with runtime lighting enhancing the artwork rather than replacing its existing visual definition.

Maintain consistent rendering quality across characters, environments, buildings, vegetation, props, furniture and interactive objects.

Materials and Surface Detail

Give each material distinctive visual properties appropriate to its physical characteristics.

Metals should feature controlled reflections, darker edges, subtle brushing, recessed details and restrained highlights.

Wood should display convincing grain, colour variation, edge shading and surface depth.

Stone, concrete and masonry should feature appropriate texture, structural definition, surface variation and subtle imperfections.

Glass should use controlled transparency, reflections, highlights and visible thickness where appropriate.

Fabric, leather, plastic, ceramics and other materials should use suitable textures, gradients and shading to communicate their physical qualities.

Avoid treating different materials as identical flat-coloured surfaces.

Lighting and Shadows

Use lighting to complement the existing SVG artwork and reinforce its dimensional appearance.

Apply natural highlights, controlled contrast, ambient illumination, soft shadows and restrained glows where appropriate.

Normal and specular maps may be derived from each asset's geometry to enhance surface depth and material response.

Runtime 2D lighting should supplement the baked shading already present in the SVG assets.

Use soft, appropriately positioned shadows to establish contact with the environment and reinforce object placement.

Reserve additive glows for genuinely luminous objects.

Avoid excessive bloom, harsh post-processing and lighting effects that obscure the underlying artwork.

Native Scale and Asset Quality

Author all artwork at native world scale:

1 SVG unit = 1 world pixel.

Import assets at scale 1.0 and place them at scale 1.

Never enlarge undersized artwork using sprite or layer scaling. Instead, redraw the artwork at the resolution and dimensions required for its intended appearance.

Maintain consistent proportions between characters, environmental objects, structures and interactive elements.

Preserve clear navigation routes, readable silhouettes and accurate collision footprints.

Modular Construction

Where environmental assets connect or repeat, maintain consistent proportions, alignment, material profiles and shading.

Use position-independent shading where appropriate to prevent visible discontinuities between adjacent modules.

Avoid unwanted seams, gaps, overlapping outlines and inconsistent lighting between connected assets.

Keep reflections and decorative details contained within their intended surfaces.

Larger continuous structures should appear visually unified rather than assembled from obviously disconnected pieces.

Independent Assets

Keep individual props, decorative objects, environmental details and interactive elements as separate SVG assets or scene components where appropriate.

Do not unnecessarily bake independent objects into larger structures.

This allows objects to be repositioned, animated, interacted with, replaced or reused without rebuilding the surrounding environment.

Maintain consistent native scale and perspective across all independent assets.

Overall Quality Standard

The finished game should resemble a richly illustrated, dimensional 2D world with detailed cel-shaded SVG artwork.

Prioritise:

- Strong, readable silhouettes.
- Realistic proportions within the stylised perspective.
- Detailed layered geometry.
- Convincing material differentiation.
- Carefully controlled highlights and shadows.
- Consistent depth and visual scale.
- Cohesive lighting and colour treatment.
- Clean integration between environmental assets.
- High-quality, reusable SVG artwork.

The art style must not dictate the game's setting, gameplay systems, environment layout or content.

Apply the same visual principles consistently regardless of the type of world, environment, object or character being represented.
