# Palette and icon sources

Presets map source colors to semantic UI roles. Foreground tones are adjusted where
necessary for text/control contrast; saved content colors are not rewritten.
Light/Dark/System selection is independent of the palette.

| Preset                  | Source / variants                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Gruvbox                 | [morhetz/gruvbox](https://github.com/morhetz/gruvbox), light/dark                                                     |
| Nord                    | [Nord](https://github.com/nordtheme/nord), adapted light / Polar Night                                                |
| Catppuccin              | [Palette](https://github.com/catppuccin/palette), Latte/Mocha                                                         |
| Monokai                 | [VS Code Monokai](https://github.com/microsoft/vscode/tree/main/extensions/theme-monokai), adapted light/classic dark |
| Solarized               | [Solarized](https://github.com/altercation/solarized), light/dark                                                     |
| VS Code                 | [Default themes](https://github.com/microsoft/vscode/tree/main/extensions/theme-defaults), Light+/Dark+ inspired      |
| Tokyo Night             | [Tokyo Night](https://github.com/folke/tokyonight.nvim), Day/Night                                                    |
| Dracula                 | [Dracula](https://github.com/dracula/dracula-theme), adapted light/classic dark                                       |
| One Dark                | [Atom One Dark](https://github.com/atom/one-dark-syntax), One Light/One Dark inspired                                 |
| Gemini, ChatGPT, Claude | Application-inspired mappings, not official theme specifications or endorsements                                      |

Provider marks use vetted static paths from [Lobe Icons](https://github.com/lobehub/lobe-icons).
Only paths are compiled into the application; no third-party image requests, SVG
scripts, external references or runtime HTML injection are used. Unknown/custom
providers use a bundled Lucide fallback. OpenRouter/Groq identify the routing
provider, not the author of the underlying model.

## Lobe Icons license

MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
