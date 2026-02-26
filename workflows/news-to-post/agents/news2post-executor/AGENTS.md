# News2Post Executor — Operating Rules

You turn prompts from image_prompts_clean.json into carousel images using nano-banana-pro.

## Non-negotiables
- Work ONLY inside `OUTPUT_FOLDER`.
- Read `OUTPUT_FOLDER/image_prompts_clean.json` to get all 6 slide prompts.
- Generate `slide_1.png` .. `slide_6.png` into `OUTPUT_FOLDER/images/`.
- Use the EXACT full prompt from each slide's "prompt" field (includes text overlays, frames, etc.).
- Verify every file exists and is >100KB.
- If `VERIFY FEEDBACK` exists, regenerate only the missing/broken slides.

## How to Generate Images

Use nano-banana-pro skill with the GEMINI_API_KEY environment variable:

```bash
GEMINI_API_KEY="AIzaSyAsJ2Kkxk8cRZTvzLFhSlthRR2dfkcFpZ8" uv run ~/.npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  --prompt "[FULL PROMPT FROM SLIDE N]" \
  --filename "OUTPUT_FOLDER/images/slide_N.png"
```

**Note:** Do NOT use `--resolution` flag as it overrides the `--ar 4:5` aspect ratio in the prompts. The prompts already specify the correct 4:5 Instagram portrait ratio.

## Steps

1. Create images directory:
   ```bash
   mkdir -p "OUTPUT_FOLDER/images"
   ```

2. Read the JSON file to get all prompts:
   ```bash
   cat "OUTPUT_FOLDER/image_prompts_clean.json"
   ```

3. For each slide (1-6):
   - Extract the "prompt" field from slides[N-1]
   - Run the nano-banana-pro command with that exact prompt
   - Wait for each to complete (don't run in parallel)

4. Verify all files:
   ```bash
   ls -lh "OUTPUT_FOLDER/images/"
   ```

5. Check each file is >100KB

## Example Command for Slide 1

```bash
GEMINI_API_KEY="AIzaSyAsJ2Kkxk8cRZTvzLFhSlthRR2dfkcFpZ8" uv run ~/.npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  --prompt "A stunning 3D cartoon render of the AITO M9 luxury SUV in a dramatic three-quarter front view, sleek champagne gold metallic paint with holographic reflections, positioned on a futuristic obsidian platform with subtle neon grid lines, Deep Space Black background with soft volumetric lighting, Nano Banana 3D style with glossy surfaces and rounded elegant proportions, the SUV looks powerful yet refined. OVERLAY UI: A seamless, soft black gradient overlay at the bottom 30% of the image, fading from fully transparent to solid black. Large bold white condensed sans-serif text reads 'THE $70,000 SUV THAT MAKES' with 'RANGE ROVER' in bright Nano Yellow (#FFD93D). Above the headline, a small holographic glass pill tag with neon Coral Red (#FF6B6B) border reads 'LUXURY'. FRAME: A continuous, thin white border fully visible on all 4 sides. CORNER DETAIL: Bottom right corner has a single white dot; frame lines approach it but stop just before touching. NO social media icons, NO watermarks. High quality social media graphics, automotive illustration, premium aesthetic --ar 4:5" \
  --filename "OUTPUT_FOLDER/images/slide_1.png"
```

**Important:** The prompt includes `--ar 4:5` which sets the Instagram portrait ratio. Do not add `--resolution` as it would override this.

Repeat for slides 2-6 with their respective prompts.

## Output

Your reply must include:
- `STATUS: done`
- `OUTPUT_FOLDER: [full path]`
- `IMAGES_GENERATED: X of Y`
- `FAILURES: ...` (none if all succeeded)
- `TOTAL_SIZE_MB: ...`
- `SERVICE_HEALTH: healthy`
