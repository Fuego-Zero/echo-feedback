# @echo-feedback/sdk

[简体中文](README.md)

A framework-independent anonymous feedback form with built-in Simplified Chinese and English. It does not require React or a host login. Use a built package containing this feature; a source change does not mean the existing npm release has been updated.

```ts
import { init } from "@echo-feedback/sdk";

const feedback = init({
  serverUrl: "https://feedback.example.com",
  ak: "REPLACE_WITH_THE_PROJECT_AK",
  locale: "auto",
  showTrigger: false,
  theme: "system",
  uiStyle: "paper",
});
feedback.open({ locale: "en", userId: "optional-host-user-id", projectVersion: "1.0" });
feedback.setLocale("zh-CN");
feedback.destroy();
```

`serverUrl` must be a complete HTTP(S) origin without a path, credentials, query or fragment. Obtain the public project AK and the exact script URL from your administrator. AK is a public identifier, not an administrator credential. Browser extensions should bundle the ESM package locally instead of loading a remote script. The IIFE build provides the same API through `EchoFeedback.init(options)`.

## Language selection

`locale` accepts `"auto"` (default), `"zh-CN"`, or `"en"`. Each time a closed form opens, it resolves language in this order:

1. `open({ locale })` for this opening only.
2. The instance preference set by `init()` or `setLocale()`.
3. The host document's `<html lang>`.
4. The first supported language in the browser's language preferences.
5. Simplified Chinese.

An explicit `"auto"` override skips a fixed instance preference for that opening. Regional English tags normalize to English; Chinese tags normalize to Simplified Chinese. Traditional Chinese translations are not included. Unknown runtime values fall back to automatic selection.

Pass your application's current language to every `open()` call. If you use the built-in floating button, call `setLocale()` whenever the host application changes its language. Language changes in the host document or browser do not automatically change an already open form.

`setLocale()` updates the existing form, including its current status and image labels. It preserves the draft, contact details, images, focus, in-flight request and frozen retry snapshot. After an uncertain response, retries keep the original payload and idempotency key. Do not destroy and recreate an instance to change language or retry.

Translations are bundled with the SDK. There are no language-resource requests, SDK language cookies or persistent language preferences. The SDK does not change the host document's language or include its locale in submitted feedback. The operating system file picker uses the device's language. Calls on an SSR empty instance or a destroyed instance are safe no-ops.

## Form and lifecycle

Feedback text is required; contact information and images are optional. Up to three static JPG, PNG or WebP images are accepted, each up to 5 MiB. Drafts remain only in instance memory. The source URL omits query and fragment; the host-provided user identifier is unverified. Requests omit credentials and referrers. The SDK does not collect cookies, tokens, logs, page titles or screenshots.

Call `init()` after the DOM is available and `destroy()` when the host component unmounts. Repeated `open()` calls do not stack dialogs; repeated `destroy()` calls are safe. CSP must permit the feedback server in `connect-src`, image previews through `img-src blob:`, and an existing nonce through the `nonce` option when required. Styles stay inside Shadow DOM.

Themes are `light`, `dark`, or `system`; styles are `paper`, `classic`, `celadon`, `gilded`, `cyber`, `freedom`, and `justice`. Optional `primaryColor` accepts a six-digit hex color. `mountTarget`, `nonce`, `onOpen`, `onClose`, and `onError` are supported. Unknown styles fall back to `paper`; the legacy `orbital` style maps to `justice`.

The default language now follows the host and browser. To retain the earlier fixed Chinese behavior, explicitly configure `locale: "zh-CN"`.
