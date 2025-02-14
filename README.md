# Globalseo.ai Integration Guide

## Table of Contents
1. [About the Integration](#about-the-integration)
2. [Script Tag Example](#script-tag-example)
3. [Optional Configuration](#optional-configuration)
4. [Server-Side Rendering Configuration](#server-side-rendering-configuration)
5. [Excluding Text from Translation](#excluding-text-from-translation)
6. [Directing Users to a Specific Language Version](#directing-users-to-a-specific-language-version)
7. [Advanced Configuration](#advanced-configuration)

## About the Integration
To set up Globalseo, follow these steps:
1. **Sign Up**: Go to [Globalseo](https://app.globalseo.ai) and sign up.
2. **Create a Project**: Select the languages you want to translate your website into.
3. **Select Integration Mode**: Choose how you want your website to be translated. Then click "Save" and follow the integration steps on the website.

## Script Tag Example
Below is a script tag example with all possible configurations:

```html
<script
    src="https://cdn.globalseo.ai/translate.js"
    data-use-browser-language="true"
    data-exclude-classes="chatbot,no-translate"
    data-exclude-ids="user-comment,code-snippet"
    data-exclude-paths="/admin,/blog"
    data-translation-mode="subdomain"
    data-translate-attributes="true"
    data-lang-parameter="lang"
    data-timeout="3000"
    data-replace-links="true"
    data-custom-language-code="kk=kz"
    data-exclude-contents="{{regex1}} {{regex2}}"
    data-translate-form-placeholder="true"
    data-dynamic-translation="true"
    data-translate-select-options="true">
</script>
```

## Optional Configuration
- **data-use-browser-language**: Automatically sets the language based on the user's browser language. Set to `false` to disable.
- **data-exclude-classes**: List CSS class names to exclude from translation, separated by commas (e.g., `chatbot, no-translate`).
- **data-exclude-ids**: List IDs to exclude from translation, separated by commas (e.g., `user-comment, code-snippet`).
- **data-exclude-paths**: List URL paths to exclude from translation, separated by commas (e.g., `/admin, /blog`). Note: Each path should start with a `/`.

## Server-Side Rendering Configuration
- **data-translation-mode**: Modifies the translated pages logic. Set to `subdomain` (e.g., `de.domain.com`) or `subdirectory` (e.g., `domain.com/de`). *Do not use* this option unless using SSR (available in higher plans).

## Excluding Text from Translation
To prevent translation of specific content, add the class `globalseo-exclude` to elements, such as chat pop-ups or user-generated text.

**Note:** Input fields and iframes are ignored by default.

## Directing Users to a Specific Language Version
Direct users to a specific language version using the `/?lang=LANGUAGE_CODE` URL parameter.

**Example:** `example.com/?lang=ru` will automatically translate the page into Russian.

## Advanced Configuration
- **data-translate-attributes**: Translates `title` & `alt` attributes of images and links for improved SEO and accessibility. Set to `true` to enable.
- **data-lang-parameter**: Custom URL parameter for setting the language (default: `lang`).
- **data-timeout**: Delay (in milliseconds) before the translation service activates, ensuring full page load.
- **data-replace-links**: Replaces links with translated URLs by appending the language code. Set to `false` to disable.
- **data-custom-language-code**: Custom language code mapping (e.g., `kk=kz` for "KZ" instead of "KK").
- **data-exclude-contents**: Excludes specific text from translation using regular expressions (`{{regex1}} {{regex2}}`).
- **data-translate-form-placeholder**: Translates form placeholders. Set to `true` to enable.
- **data-dynamic-translation**: Allows automatic generation of new translations. Set to `false` to disable. If quota is reached, setting this to `false` prevents error messages from appearing on your site.
- **data-translate-select-options**: Translates options inside `<select>` elements. Set to `true` to enable. The `globalseo-exclude` class is still respected.

