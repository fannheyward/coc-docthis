# coc-docthis

`JSDoc` extension for coc.nvim that generates detailed JSDoc comments for TypeScript/JavaScript files, fork from [vscode-docthis](https://github.com/joelday/vscode-docthis).

## Install

`:CocInstall coc-docthis`

## Commands

- `docthis.documentThis`: generate document at current position

## Configurations

| configuration | description | default |
| ------------- |------------ | ------- |
| `docthis.returnsTag` | `@returns` tag | `true` |
| `docthis.includeAuthorTag` | add the `@author` tag | `false` |
| `docthis.authorName` | when `docthis.includeAuthorTag`, will add @author tag with this value | `''` |
| `docthis.includeDateTag` | add the `@date` tag in `YYYY-MM-DD` format | `false` |
| `docthis.dateTagFormat` | set date format | `YYYY-MM-DD` |
| `docthis.includeTypes` | type information is added to comment tags | `true` |
| `docthis.includeMemberOfOnClassMembers` | memberOf information is added to comment tags on class members | `true` |
| `docthis.includeMemberOfOnInterfaceMembers` | memberOf information is added to comment tags on interface members | `true` |
| `docthis.includeDescriptionTag` | JSDoc comments for functions and methods will include `@description` | `false` |
| `docthis.enableHungarianNotationEvaluation` | hungarian notation will be used as a type hint | `false` |
| `docthis.inferTypesFromNames` | use names of params & methods as type hints | `false` |
| `docthis.includeExtraLineAfterDescription` | add empty line after description and before other tags | `true` |

## License

MIT

---

> This extension is created by [create-coc-extension](https://github.com/fannheyward/create-coc-extension)
