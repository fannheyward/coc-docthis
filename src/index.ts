import { commands, CompletionItem, CompletionItemKind, CompletionItemProvider, ExtensionContext, languages, Position, Range, TextDocument, window, workspace } from 'coc.nvim';
import { Documenter } from './documenter';

const langs = ['javascript', 'typescript', 'vue', 'javascriptreact', 'typescriptreact'];

let documenter: Documenter;

function verifyLanguageSupport(document: TextDocument, commandName: string) {
  if (!langs.includes(document.languageId)) {
    window.showMessage(`Sorry! ${commandName} currently only supports JavaScript and TypeScript`);
    return false;
  }

  return true;
}

function runCommand(commandName: string, document: TextDocument, implFunc: () => void) {
  if (!verifyLanguageSupport(document, commandName)) {
    return;
  }

  try {
    if (!documenter) documenter = new Documenter();

    implFunc();
  } catch (e) {
    console.error(e);
  }
}

class DocThisCompletionItemProvider implements CompletionItemProvider {
  async provideCompletionItems(document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const items: CompletionItem[] = [];
    const line = await workspace.getLine(document.uri, position.line);
    const prefix = line.slice(0, position.character);

    if (prefix.match(/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/)) {
      const item: CompletionItem = {
        label: '/** Document This */',
        kind: CompletionItemKind.Snippet,
        insertText: '',
        sortText: '\0',
      };

      const prefixMatches = line.slice(0, position.character).match(/\/\**\s*$/);
      const suffixMatches = line.slice(position.character).match(/^\s*\**\//)!;
      const start = Position.create(position.line, position.character + (prefixMatches ? -prefixMatches[0].length : 0));
      const end = Position.create(position.line, position.character + (suffixMatches ? suffixMatches[0].length : 0));
      item.textEdit = {
        range: Range.create(start, end),
        newText: '',
      };

      item.command = {
        title: 'Document This',
        command: 'docthis.documentThis',
        arguments: [true],
      };

      items.push(item);
    }

    return items;
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  const provider = new DocThisCompletionItemProvider();
  context.subscriptions.push(
    languages.registerCompletionItemProvider('docthis', 'docthis', langs, provider, ['/', '*']),

    commands.registerCommand('docthis.documentThis', async (forCompletion: boolean) => {
      const commandName = 'Document This';

      const editerState = await workspace.getCurrentState();
      runCommand(commandName, editerState.document, () => {
        documenter.documentThis(editerState, commandName, forCompletion);
      });
    })

    // commands.registerCommand('docthis.traceTypeScriptSyntaxNode', async () => {
    //   const commandName = 'Trace TypeScript Syntax Node';

    //   const editerState = await workspace.getCurrentState();
    //   runCommand(commandName, editerState.document, () => {
    //     documenter.traceNode(editerState);
    //   });
    // })
  );
}
