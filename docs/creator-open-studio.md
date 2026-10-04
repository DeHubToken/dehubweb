# Published studio presets

The studio adds all 24 starter recipes from [the repository linked by Higgsfield’s team](https://github.com/wide-trace/open-higgsfield), pinned to commit `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`, `src/openhiggsfield/data.ts`. The release invitation is [the September 16 team post](https://x.com/gpumaxxer/status/2100307886408912985).

The catalog contains 12 image and 12 video recipes. With an empty subject, every recipe reproduces the published prompt verbatim. A supplied subject replaces only the subject span, retaining the lighting, lens, composition and camera instructions. Existing DeHub models, payments, generation history and reference handling run the recipes. Generation through Higgsfield itself requires an API integration and account credentials.

`src/lib/creator/openStudioPresets.ts` and mobile’s `libs/openStudioPresets.ts` carry identical records. The image/video catalogs include every record; search matches translated names, hints, categories and prompt contents. English and French labels ship with this import. Mobile sends the selected preset’s aspect ratio and video negative prompt through its generation request.

## Full live preset catalog

The linked repository publishes starter prompts and model mappings. Production Marketing Studio presets are fetched separately through the [documented catalog](https://open.higgsfield.ai/models/workflows/product-shots/api-reference):

`GET https://api.higgsfield.ai/marketing-studio/image/presets?size=50`

Use server-side `Authorization: Key <complete copied API key>`. Consume every non-null cursor; the response contains `total`, `cursor` and `items`. Keep the returned preset IDs rather than inventing replacements or copying example UUIDs. Visibility changes in the CMS, so the generation picker must use the current catalog. Enhanced generation posts `preset_id`, `enhance_prompt: true` and a product image to `marketing-studio/image`. A second reference image supplies the optional model.

Access to that authenticated catalog and Higgsfield generation has not been verified. The 24 studio recipes do not imply that the full proprietary preset catalog or preset enhancement logic is bundled here.
