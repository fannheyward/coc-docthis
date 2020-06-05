import { commands, EditerState, OutputChannel, workspace } from 'coc.nvim';
import ts from 'typescript';
import { Disposable, Position, Range, TextDocument, TextEdit } from 'vscode-languageserver-protocol';
import { Config } from './config';
import { LanguageServiceHost } from './languageServiceHost';
import * as utils from './utilities';

export class Documenter implements Disposable {
  private _config: Config;
  private _languageServiceHost: LanguageServiceHost;
  private _services: ts.LanguageService;
  private _outputChannel: OutputChannel;

  constructor() {
    this._config = new Config();
    this._languageServiceHost = new LanguageServiceHost();
    this._services = ts.createLanguageService(this._languageServiceHost, ts.createDocumentRegistry());
    this._outputChannel = workspace.createOutputChannel('TypeScript Syntax Node Trace');
  }

  async documentThis(state: EditerState, commandName: string, forCompletion: boolean) {
    const sourceFile = this._getSourceFile(state.document);
    if (!sourceFile) return;

    const position = ts.getPositionOfLineAndCharacter(sourceFile, state.position.line, state.position.character);
    const node = utils.findChildForPosition(sourceFile, position);
    const documentNode = utils.nodeIsOfKind(node) ? node : utils.findFirstParent(node);

    if (!documentNode) {
      return workspace.showMessage(`Sorry! '${commandName}' wasn't able to produce documentation at the current position.`, 'error');
    }

    const sb = new utils.SnippetStringBuilder();

    const docLocation = this._documentNode(sb, documentNode, sourceFile);
    if (!docLocation) {
      return workspace.showMessage(`Sorry! '${commandName}' wasn't able to produce documentation at the current position.`, 'error');
    }

    this._insertDocumentation(sb, docLocation, forCompletion);
  }

  async traceNode(state: EditerState) {
    const sourceFile = this._getSourceFile(state.document);
    if (!sourceFile) return;

    const position = ts.getPositionOfLineAndCharacter(sourceFile, state.position.line, state.position.character);
    const node = utils.findChildForPosition(sourceFile, position);

    const nodes: string[] = [];

    let parent = node;
    while (parent) {
      nodes.push(this._printNodeInfo(parent, sourceFile));
      parent = parent.parent;
    }

    const sb = new utils.StringBuilder();
    nodes.reverse().forEach((n) => {
      sb.appendLine(n);
    });

    this._outputChannel.show();
    this._outputChannel.appendLine(sb.toString());
  }

  private _printNodeInfo(node: ts.Node, sourceFile: ts.SourceFile) {
    const sb = new utils.StringBuilder();
    sb.append(`${node.getStart()} to ${node.getEnd()} --- (${node.kind}) ${(<any>ts).SyntaxKind[node.kind]}`);

    if (node.parent) {
      const nodeIndex = node.parent.getChildren().indexOf(node);

      if (nodeIndex !== -1) {
        sb.append(` - Index of parent: ${nodeIndex}`);
      }
    }

    sb.appendLine();

    const column = sourceFile.getLineAndCharacterOfPosition(node.getStart()).character;
    for (let i = 0; i < column; i++) {
      sb.append(' ');
    }

    sb.appendLine(node.getText());

    return sb.toString();
  }

  private async _insertDocumentation(sb: utils.SnippetStringBuilder, location: ts.LineAndCharacter, forCompletion: boolean) {
    const startPosition = Position.create(forCompletion ? location.line - 1 : location.line, location.character);
    const endPosition = Position.create(location.line, location.character);

    const snip = TextEdit.replace(Range.create(startPosition, endPosition), sb.toCommentValue());
    await commands.executeCommand('editor.action.insertSnippet', snip);
  }

  private _getSourceFile(document: TextDocument) {
    const fileText = document.getText();
    const canonicalFileName = utils.getDocumentFileName(document);
    this._languageServiceHost.updateCurrentFile(canonicalFileName, fileText);

    this._services.getSyntacticDiagnostics(canonicalFileName);

    const sourceFile = this._services.getProgram()?.getSourceFile(canonicalFileName);
    if (!sourceFile) return;

    const newText = document.getText();
    sourceFile.update(newText, <ts.TextChangeRange>{
      newLength: newText.length,
      span: <ts.TextSpan>{
        start: 0,
        length: newText.length,
      },
    });

    return sourceFile;
  }

  private _documentNode(sb: utils.SnippetStringBuilder, node: ts.Node, sourceFile: ts.SourceFile): ts.LineAndCharacter {
    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        this._emitClassDeclaration(sb, <ts.ClassDeclaration>node);
        break;
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
        this._emitPropertyDeclaration(sb, <ts.AccessorDeclaration>node);
        break;
      case ts.SyntaxKind.InterfaceDeclaration:
        this._emitInterfaceDeclaration(sb, <ts.InterfaceDeclaration>node);
        break;
      case ts.SyntaxKind.EnumDeclaration:
        this._emitEnumDeclaration(sb, <ts.EnumDeclaration>node);
        break;
      case ts.SyntaxKind.EnumMember:
        sb.appendLine();
        break;
      case ts.SyntaxKind.CallSignature:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.MethodSignature:
        this._emitMethodDeclaration(sb, <ts.MethodDeclaration>node);
        break;
      case ts.SyntaxKind.Constructor:
        this._emitConstructorDeclaration(sb, <ts.ConstructorDeclaration>node);
        break;
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
        return this._emitFunctionExpression(sb, <ts.FunctionExpression>node, sourceFile);
      case ts.SyntaxKind.VariableDeclaration:
        return this._emitVariableDeclaration(sb, <ts.VariableDeclaration>node, sourceFile)!; // FIXME !
      default:
      // FIXME
      // return;
    }

    return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
  }

  private _emitDescriptionHeader(sb: utils.SnippetStringBuilder) {
    if (this._config.includeDescriptionTag) {
      sb.append('@description');
      sb.appendSnippetTabstop();
      sb.appendLine();
    } else {
      // We don't want description tag, probably because we want to free type the description. So add space for that.
      sb.appendSnippetTabstop();
      sb.appendLine();

      // Jump a line after description free-type area before showing other tags
      if (this._config.includeExtraLineAfterDescription) {
        sb.appendLine();
      }
    }
  }

  private _emitAuthor(sb: utils.SnippetStringBuilder) {
    if (this._config.includeAuthorTag) {
      sb.append('@author ' + this._config.authorName);
      sb.appendSnippetTabstop();
      sb.appendLine();
    }
  }

  private _emitDate(sb: utils.SnippetStringBuilder) {
    if (this._config.includeDateTag) {
      sb.append('@date ' + utils.getCurrentDate());
      sb.appendSnippetTabstop();
      sb.appendLine();
    }
  }

  private _emitVariableDeclaration(sb: utils.SnippetStringBuilder, node: ts.VariableDeclaration, sourceFile: ts.SourceFile) {
    for (const child of node.getChildren()) {
      const result = this._documentNode(sb, child, sourceFile);
      if (result) {
        return result;
      }
    }

    return;
  }

  private _emitFunctionExpression(sb: utils.SnippetStringBuilder, node: ts.FunctionExpression | ts.ArrowFunction, sourceFile: ts.SourceFile) {
    let targetNode = node.parent;

    if (node.parent.kind !== ts.SyntaxKind.PropertyAssignment && node.parent.kind !== ts.SyntaxKind.BinaryExpression && node.parent.kind !== ts.SyntaxKind.PropertyDeclaration) {
      const tmpTargetNode = utils.findFirstParent(targetNode, [ts.SyntaxKind.VariableDeclarationList, ts.SyntaxKind.VariableDeclaration]);
      if (tmpTargetNode) {
        targetNode = tmpTargetNode;
      }
    }

    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);
    this._emitTypeParameters(sb, node);
    this._emitParameters(sb, node);
    this._emitReturns(sb, node);
    this._emitMemberOf(sb, node.parent);

    return ts.getLineAndCharacterOfPosition(sourceFile, targetNode.getStart());
  }

  private _emitClassDeclaration(sb: utils.SnippetStringBuilder, node: ts.ClassDeclaration) {
    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);

    this._emitModifiers(sb, node);

    sb.append('@class');

    if (node.name) {
      sb.append(` ${node.name.getText()}`);
    }

    sb.appendLine();

    this._emitHeritageClauses(sb, node);
    this._emitTypeParameters(sb, node);
  }

  private _emitPropertyDeclaration(sb: utils.SnippetStringBuilder, node: ts.PropertyDeclaration | ts.AccessorDeclaration) {
    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);

    if (node.kind === ts.SyntaxKind.GetAccessor) {
      const name = utils.findFirstChildOfKindDepthFirst(node, [ts.SyntaxKind.Identifier]).getText();
      const parentClass = <ts.ClassDeclaration>node.parent;

      const hasSetter = !!parentClass.members.find(
        (c) => c.kind === ts.SyntaxKind.SetAccessor && utils.findFirstChildOfKindDepthFirst(c, [ts.SyntaxKind.Identifier]).getText() === name
      );

      if (!hasSetter) {
        sb.appendLine('@readonly');
      }
    }

    this._emitModifiers(sb, node);

    if (node.kind === ts.SyntaxKind.PropertyDeclaration) {
      this._emitParameters(sb, node);
    }

    // JSDoc fails to emit documentation for arrow function syntax. (https://github.com/jsdoc3/jsdoc/issues/1100)
    if (this._config.includeTypes) {
      if (node.type && node.type.getText().indexOf('=>') === -1) {
        sb.appendLine(`@type ${utils.formatTypeName(node.type.getText())}`);
      } else if (this._config.enableHungarianNotationEvaluation && this._isHungarianNotation(node.name.getText())) {
        sb.appendLine(`@type ${this._getHungarianNotationType(node.name.getText())}`);
      }
    }

    this._emitMemberOf(sb, node.parent);
  }

  private _emitInterfaceDeclaration(sb: utils.SnippetStringBuilder, node: ts.InterfaceDeclaration) {
    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);

    this._emitModifiers(sb, node);

    sb.appendLine(`@interface ${node.name.getText()}`);

    this._emitHeritageClauses(sb, node);
    this._emitTypeParameters(sb, node);
  }

  private _emitEnumDeclaration(sb: utils.SnippetStringBuilder, node: ts.EnumDeclaration) {
    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);

    this._emitModifiers(sb, node);

    sb.appendLine(`@enum {number}`);
  }

  private _emitMethodDeclaration(sb: utils.SnippetStringBuilder, node: ts.MethodDeclaration | ts.FunctionDeclaration) {
    this._emitDescriptionHeader(sb);
    this._emitAuthor(sb);
    this._emitDate(sb);

    this._emitModifiers(sb, node);
    this._emitTypeParameters(sb, node);
    this._emitParameters(sb, node);
    this._emitReturns(sb, node);
    this._emitMemberOf(sb, node.parent);
  }

  private _emitMemberOf(sb: utils.SnippetStringBuilder, parent: ts.Node) {
    const enabledForClasses = parent.kind === ts.SyntaxKind.ClassDeclaration && this._config.includeMemberOfOnClassMembers;
    const enabledForInterfaces = parent.kind === ts.SyntaxKind.InterfaceDeclaration && this._config.includeMemberOfOnInterfaceMembers;
    if (parent && (<any>parent)['name'] && (enabledForClasses || enabledForInterfaces)) {
      sb.appendLine('@memberof ' + (<any>parent)['name'].text);
    }
  }

  private _isNameBooleanLike(name: string): boolean {
    return /(?:is|has|can)[A-Z_]/.test(name);
  }

  private _isNameFunctionLike(name: string): boolean {
    const fnNames = ['cb', 'callback', 'done', 'next', 'fn'];
    return fnNames.indexOf(name) !== -1;
  }

  private _inferReturnTypeFromName(name: string): string {
    if (this._isNameBooleanLike(name)) {
      return '{boolean}';
    }

    return '';
  }

  private _emitReturns(sb: utils.SnippetStringBuilder, node: ts.MethodDeclaration | ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction) {
    if (utils.findNonVoidReturnInCurrentScope(node) || (node.type && node.type.getText() !== 'void')) {
      if (this._config.returnsTag) {
        sb.append('@returns ');
      } else {
        sb.append('@return ');
      }

      if (this._config.includeTypes && node.type) {
        sb.append(' ' + utils.formatTypeName(node.type.getText()));
      } else if (this._config.includeTypes && this._config.inferTypesFromNames) {
        sb.append(' ' + this._inferReturnTypeFromName(node.name!.getText()));
      }

      sb.appendSnippetTabstop();

      sb.appendLine();
    }
  }

  private _inferParamTypeFromName(name: string): string {
    if (this._isNameFunctionLike(name)) {
      return '{function}';
    }

    if (this._isNameBooleanLike(name)) {
      return '{boolean}';
    }

    return '{*}';
  }

  private _emitParameters(
    sb: utils.SnippetStringBuilder,
    node: ts.MethodDeclaration | ts.FunctionDeclaration | ts.ConstructorDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.PropertyDeclaration
  ) {
    if (node.kind === ts.SyntaxKind.PropertyDeclaration) {
      const propertyChildren: ts.Node[] = node.getChildren();

      const arrowFunction = propertyChildren.find((child: ts.Node) => {
        return child.kind === ts.SyntaxKind.ArrowFunction;
      });

      if (!arrowFunction) {
        return;
      }

      const isArrowFunction: boolean = ts.isArrowFunction(arrowFunction);

      if (!isArrowFunction) {
        return;
      }

      this._generateParameters(sb, arrowFunction as ts.ArrowFunction);
    } else {
      if (!node.parameters) {
        return;
      }

      this._generateParameters(sb, node);
    }
  }

  private _generateParameters(
    sb: utils.SnippetStringBuilder,
    node: ts.MethodDeclaration | ts.FunctionDeclaration | ts.ConstructorDeclaration | ts.FunctionExpression | ts.ArrowFunction
  ): void {
    node.parameters.forEach((parameter) => {
      const name = parameter.name.getText();
      const isOptional = parameter.questionToken || parameter.initializer;
      const isArgs = !!parameter.dotDotDotToken;
      const initializerValue = parameter.initializer ? parameter.initializer.getText() : ''; // FIXME empty

      let typeName = '{*}';

      if (this._config.includeTypes) {
        if (parameter.initializer && !parameter.type) {
          if (/^[0-9]/.test(initializerValue)) {
            typeName = '{number}';
          } else if (initializerValue.indexOf('"') !== -1 || initializerValue.indexOf("'") !== -1 || initializerValue.indexOf('`') !== -1) {
            typeName = '{string}';
          } else if (initializerValue.indexOf('true') !== -1 || initializerValue.indexOf('false') !== -1) {
            typeName = '{boolean}';
          }
        } else if (parameter.type) {
          typeName = utils.formatTypeName((isArgs ? '...' : '') + parameter.type.getFullText().trim());
        } else if (this._config.enableHungarianNotationEvaluation && this._isHungarianNotation(name)) {
          typeName = this._getHungarianNotationType(name);
        } else if (this._config.inferTypesFromNames) {
          typeName = this._inferParamTypeFromName(name);
        }
      }

      sb.append('@param ');

      if (this._config.includeTypes) {
        sb.append(typeName + ' ');
      }

      if (isOptional) {
        sb.append('[');
      }

      sb.append(name);

      if (parameter.initializer && typeName) {
        sb.append('=' + parameter.initializer.getText());
      }

      if (isOptional) {
        sb.append(']');
      }

      sb.appendSnippetTabstop();

      sb.appendLine();
    });
  }

  private _isHungarianNotation(name: string): boolean {
    return /^[abefimos][A-Z]/.test(name);
  }

  private _getHungarianNotationType(name: string): string {
    switch (name.charAt(0)) {
      case 'a':
        return '{Array}';
      case 'b':
        return '{boolean}';
      case 'e':
        return '{Object}'; // Enumeration
      case 'f':
        return '{function}';
      case 'i':
        return '{number}';
      case 'm':
        return '{Object}'; // Map
      case 'o':
        return '{Object}';
      case 's':
        return '{string}';
      default:
        return '{*}';
    }
  }

  private _emitConstructorDeclaration(sb: utils.SnippetStringBuilder, node: ts.ConstructorDeclaration) {
    sb.appendSnippetPlaceholder(
      // ` Creates an instance of ${(<ts.ClassDeclaration>(
      //   node.parent!
      // )).name.getText()}.`
      // FIXME
      ` Creates sss`
    );
    sb.appendLine();
    this._emitAuthor(sb);
    this._emitDate(sb);

    this._emitParameters(sb, node);
    this._emitMemberOf(sb, node.parent);
  }

  private _emitTypeParameters(
    sb: utils.SnippetStringBuilder,
    node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration | ts.MethodDeclaration | ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction
  ) {
    if (!node.typeParameters) {
      return;
    }

    node.typeParameters.forEach((parameter) => {
      sb.append(`@template ${parameter.name.getText()}`);
      sb.appendSnippetTabstop();
      sb.appendLine();
    });
  }

  private _emitHeritageClauses(sb: utils.SnippetStringBuilder, node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration) {
    if (!node.heritageClauses || !this._config.includeTypes) {
      return;
    }

    node.heritageClauses.forEach((clause) => {
      const heritageType = clause.token === ts.SyntaxKind.ExtendsKeyword ? '@extends' : '@implements';

      clause.types.forEach((t) => {
        let tn = t.expression.getText();
        if (t.typeArguments) {
          tn += '<';
          tn += t.typeArguments.map((a) => a.getText()).join(', ');
          tn += '>';
        }

        sb.append(`${heritageType} ${utils.formatTypeName(tn)}`);
        sb.appendLine();
      });
    });
  }

  private _emitModifiers(sb: utils.SnippetStringBuilder, node: ts.Node) {
    if (!node.modifiers) {
      return;
    }

    node.modifiers.forEach((modifier) => {
      switch (modifier.kind) {
        case ts.SyntaxKind.ExportKeyword:
          sb.appendLine('@export');
          return;
        case ts.SyntaxKind.AbstractKeyword:
          sb.appendLine('@abstract');
          return;
        case ts.SyntaxKind.ProtectedKeyword:
          sb.appendLine('@protected');
          return;
        case ts.SyntaxKind.PrivateKeyword:
          sb.appendLine('@private');
          return;
        case ts.SyntaxKind.StaticKeyword:
          sb.appendLine('@static');
          return;
      }
    });
  }

  dispose() {
    if (this._outputChannel) {
      this._outputChannel.dispose();
    }

    this._services.dispose();
  }
}
