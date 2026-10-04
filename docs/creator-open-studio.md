# Published studio presets

The studio adds all 24 starter recipes from [the repository linked by Higgsfield’s team](https://github.com/wide-trace/open-higgsfield), pinned to commit `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`, `src/openhiggsfield/data.ts`. The release invitation is [the September 16 team post](https://x.com/gpumaxxer/status/2100307886408912985).

The catalog contains 12 image and 12 video recipes. With an empty subject, every recipe reproduces the published prompt verbatim. A supplied subject replaces only the subject span, retaining the lighting, lens, composition and camera instructions. Existing DeHub models, payments, generation history and reference handling run the recipes. Generation through Higgsfield itself requires an API integration and account credentials.

`src/lib/creator/openStudioPresets.ts` and mobile’s `libs/openStudioPresets.ts` carry identical records. The image/video catalogs include every record; search matches translated names, hints, categories and prompt contents. English and French labels ship with this import. Mobile sends the selected preset’s aspect ratio and video negative prompt through its generation request.

## Native studio parity

The Android Creator entry points open the native studio for image, video, audio and 3D generation. Both clients use the same server payment and generation endpoints and the same 24 released starter presets. Mobile exposes model selection, reference images, aspect ratio, supported video duration and resolution, and mesh texture quality. Video quotes and requests use the same duration, and retry records retain the original settings. Queued video, audio and mesh jobs resume after reopening the app.

The native video limits are taken from `src/constants/video-models.constants.ts`; mobile mesh metadata mirrors `src/constants/model3d-models.constants.ts`. When updating provider constraints, update both catalogs. `/creator?mode=image|video|audio|3d` opens the corresponding native studio through the app link.

## Full live preset catalog

The DeHub Creator credential is configured on the backend as `HIGGSFIELD_API_KEY`. This release continues using DeHub’s existing generation providers. The full authenticated Higgsfield preset catalog and generation through that provider remain unverified; credentials must stay on the server.

The linked repository publishes starter prompts and model mappings. Production Marketing Studio presets are fetched separately through the [documented catalog](https://open.higgsfield.ai/models/workflows/product-shots/api-reference):

`GET https://api.higgsfield.ai/marketing-studio/image/presets?size=50`

Use server-side `Authorization: Key <complete copied API key>`. Consume every non-null cursor; the response contains `total`, `cursor` and `items`. Keep the returned preset IDs rather than inventing replacements or copying example UUIDs. Visibility changes in the CMS, so the generation picker must use the current catalog. Enhanced generation posts `preset_id`, `enhance_prompt: true` and a product image to `marketing-studio/image`. A second reference image supplies the optional model.

Access to that authenticated catalog and Higgsfield generation has not been verified. The 24 studio recipes do not imply that the full proprietary preset catalog or preset enhancement logic is bundled here.

## Expanded original recipes

The shared image/video catalog adds 100 original DeHub recipes: 60 image looks and 40 video shots. These additions live in expandedStudioPresets.ts in each client and are separate from the 24 published Higgsfield starter recipes. The shared catalog now has 103 image and 79 video presets.

The new image recipes default to Nano Banana 2 and the video shots to Kling 2.5 Turbo, with explicit aspect ratios. Six reference-animation shots require an attached image; the other 94 can start from a text subject or their sample. English and French names and hints match across both clients. Search covers labels, categories, shot directions and samples.
